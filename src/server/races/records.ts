import type { FinalField } from '../../shared/finals.js';
import { raceFinishedLine,stepBlocker,stepStatus,stepsOf,type RaceSummary,type StepMeta } from '../../shared/race-flow.js';
import { raceRecording } from '../../shared/recording.js';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import { isTeamEntry,raceLabel,type RaceEntry,type RacePartName,type RaceRead } from '../../shared/races.js';
import { raceRefusal,type RaceAction } from '../../shared/race-status.js';
import { stagesOf } from '../../shared/event-phase.js';
import { stageDone,stageForRace } from '../../shared/stage-lock.js';
import { newDay, Refusal, signedOut } from '../access/permissions.js';
import { dayChanged } from '../live/changes.js';
export type StoredRace=Omit<RaceRead,'final'> & {final?:FinalField};
/** Jobs receive attendance only; heat ranking and provenance stay within Lead reads. */
export function jobRace(race:StoredRace):RaceRead {
  const {final,...rest}=race,runners=race.parts.runners.value||[];
  // A line-up entry reads as it is in the race now, else as it was when last there (an Absent one): a child's wristband, or a team with its children.
  const named=(id:string,copy:RaceEntry|undefined,heatWristband:number|null)=>{
    const entry=runners.find(current=>current.id===id)??copy;
    return entry && isTeamEntry(entry)?{wristband:null,team:entry.team,legs:entry.legs}:{wristband:entry?.wristband??heatWristband};
  };
  return {...rest,...(final?{final:{generation:final.generation,hasRun:final.hasRun,heatsComplete:final.heatsComplete,entries:[...final.entries.map(({finalEntryId,heatWristband,seed,absent,runner,kind})=>({finalEntryId,...named(finalEntryId,runner,heatWristband),seed,absent,calledUp:kind==='call-up'})),...(final.additionalEntries||[]).map(({runner,absent})=>({finalEntryId:runner.id,...named(runner.id,runner,null),seed:null,absent,calledUp:false}))]}}:{})};
}
export type Database=pg.Pool|pg.PoolClient;
/** The SQL that keeps a day's race rows (`r`) to one event when one is given, with its parameters. */
export const eventScope=(dayId:string,eventId?:string):[string,string[]]=>eventId?[' AND r.event_id=$2',[dayId,eventId]]:['',[dayId]];
const raceRowsQuery=`SELECT r.*,e.code,e.name,e.section,e.format,e.enabled,e.type,(e.type='relays') AS relay,e.phase FROM races r JOIN events e ON e.id=r.event_id`;
const finalRowsQuery='SELECT f.race_id,f.entries,f.additional_entries,f.generation FROM race_finals f JOIN races r ON r.id=f.race_id';
/** The day's races, or only one event's when `eventId` is given (a race page or an event's results reads no other). */
export async function listRaces(db:Database,dayId:string,eventId?:string):Promise<StoredRace[]> {
  const [scope,params]=eventScope(dayId,eventId);
  const rows=(await db.query(`${raceRowsQuery} WHERE r.day_id=$1 AND NOT r.deleted${scope} ORDER BY r.checked_in_at,r.id`,params)).rows;
  if(!rows.length) return [];
  const partRows=(await db.query(`SELECT p.race_id,p.part,p.version,p.value FROM race_parts p JOIN races r ON r.id=p.race_id WHERE r.day_id=$1 AND NOT r.deleted${scope}`,params)).rows;
  const finalRows=(await db.query(`${finalRowsQuery} WHERE r.day_id=$1 AND NOT r.deleted AND r.kind='final'${scope}`,params)).rows;
  const parts=new Map<string,pg.QueryResultRow[]>();
  for(const row of partRows) {const group=parts.get(row.race_id)||[];group.push(row);parts.set(row.race_id,group);}
  const finals=new Map(finalRows.map(row=>[row.race_id,row]));
  return rows.map(row=>storedRace(row,parts.get(row.id)||[],finals.get(row.id)));
}
/** Refuses an action a race's state does not allow (`raceRefusal`), in that rule's words. */
export function requireRace(race:StoredRace,action:RaceAction,holdsStartedFinal=false) {
  const refusal=raceRefusal(race,action,holdsStartedFinal);
  if(refusal) throw new Refusal(409,refusal);
}
export function requireStageOpen(race:Pick<RaceRead,'stageComplete'|'kind'> & {event:Pick<RaceRead['event'],'section'>}) {
  if(race.stageComplete) throw new Refusal(409,raceFinishedLine(race));
}
/** One race of the day, deleted or not. A race not found is `gone` (removed for good), unlike one in Deleted races. */
export async function readRace(db:Database,dayId:string,id:string):Promise<StoredRace> {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) throw new Refusal(404,'Race not found',{gone:true});
  const row=(await db.query(`${raceRowsQuery} WHERE r.day_id=$1 AND r.id=$2`,[dayId,id])).rows[0];
  if (!row) throw new Refusal(404,'Race not found',{gone:true});
  const rows=(await db.query('SELECT part,version,value FROM race_parts WHERE race_id=$1',[id])).rows;
  const finalRow=row.kind==='final'?(await db.query(`${finalRowsQuery} WHERE f.race_id=$1`,[id])).rows[0]:undefined;
  return storedRace(row,rows,finalRow);
}
/** Lead reads of a race replaced by a re-run name the replacing race from the re-run's audit note, or null once that race is gone. */
export async function withReplacement<T extends StoredRace>(db:Database,dayId:string,race:T):Promise<T> {
  if(!race.deleted || race.deleteReason!=='re-run') return race;
  const row=(await db.query(`SELECT r.kind,r.number FROM audit_notes n LEFT JOIN races r ON r.day_id=n.day_id AND r.id::text=n.touches->1->>'raceId' WHERE n.day_id=$1 AND n.action='re-run' AND n.touches->0->>'raceId'=$2 ORDER BY n.sequence_number DESC LIMIT 1`,[dayId,race.id])).rows[0];
  return {...race,replacedBy:row?.kind?raceLabel(row):null};
}
function storedRace(row:pg.QueryResultRow,rows:pg.QueryResultRow[],finalRow?:pg.QueryResultRow):StoredRace {
  const parts=Object.fromEntries(rows.map(row=>[row.part,{version:row.version,value:row.value}]));
  // The stages complete in the event's phase, read by the one stage rule.
  const stages=stagesOf(row.phase,row.format).map(stage=>({eventId:row.event_id as string,stage}));
  const stageComplete=stageDone(row.event_id,stageForRace({kind:row.kind,event:{format:row.format}}),stages);
  // A final has run once it is saved. Its heatsComplete is Heats complete itself, which opens its line-up to call-ups
  // and added teams: Results without a final never does, and leaves no final in the event.
  const final=finalRow?{generation:finalRow.generation,entries:finalRow.entries,additionalEntries:finalRow.additional_entries,hasRun:row.state==='saved',heatsComplete:stages.some(item=>item.stage==='heats')}:undefined;
  const race={...(final?{final}:{}),id:row.id,event:{id:row.event_id,code:row.code,name:row.name,section:row.section,format:row.format,enabled:row.enabled,type:row.type,relay:row.relay},kind:row.kind,number:row.number,checkedInAt:row.checked_in_at.toISOString(),deleted:row.deleted,deletedAt:row.deleted_at?.toISOString()??null,state:row.state,stageComplete,deleteReason:row.delete_reason,parts:parts as RaceRead['parts']};
  return {...race,recording:raceRecording(race)};
}
export async function raceChange<T>(pool:pg.Pool,phone:Phone,change:(client:pg.PoolClient,unchanged:()=>void)=>Promise<T>) {
  const client=await pool.connect();
  let failure:Error|boolean|undefined;
  try {
    await client.query('BEGIN');
    const day=await client.query('SELECT id FROM olympics_days WHERE id=$1 AND active FOR UPDATE',[phone.dayId]);
    if (!day.rowCount) throw newDay();
    const signedIn=await client.query('SELECT id FROM sign_ins WHERE id=$1 AND day_id=$2 AND NOT signed_out FOR SHARE',[phone.id,phone.dayId]);
    if (!signedIn.rowCount) throw signedOut();
    let changed=true;
    const result=await change(client,()=>{changed=false;});
    if(changed) await client.query('UPDATE olympics_days SET revision=revision+1 WHERE id=$1',[phone.dayId]);
    await client.query('COMMIT');
    if(changed) dayChanged(phone.dayId);
    return result;
  } catch(error) {
    failure=error instanceof Error?error:true;
    try {await client.query('ROLLBACK');} catch { /* Preserve the original transaction error. */ }
    throw error;
  } finally {client.release(failure);}
}
/** Who last changed each part of each race of the day and who marked it done, by race id and part. */
export async function readStepMeta(db:Database,dayId:string,eventId?:string) {
  const [scope,params]=eventScope(dayId,eventId);
  const rows=(await db.query(`SELECT p.race_id,p.part,p.version,p.saved_at,s.name AS saved_name,p.done_at,d.name AS done_name
    FROM race_parts p JOIN races r ON r.id=p.race_id LEFT JOIN sign_ins s ON s.id=p.saved_by LEFT JOIN sign_ins d ON d.id=p.done_by
    WHERE r.day_id=$1 AND NOT r.deleted${scope}`,params)).rows;
  const meta=new Map<string,Partial<Record<RacePartName,StepMeta>>>();
  for(const row of rows) meta.set(row.race_id,{...meta.get(row.race_id),[row.part]:{version:row.version,by:row.saved_name??null,at:row.saved_at?.toISOString()??null,doneBy:row.done_name??null,doneAt:row.done_at?.toISOString()??null}});
  return meta;
}
/** A race as Home and a Results heat row list it: its steps' statuses and why it would not save itself. */
export function raceSummary(race:StoredRace,meta:Partial<Record<RacePartName,StepMeta>>={}):RaceSummary {
  const statuses=Object.fromEntries(stepsOf(race).map(step=>[step,stepStatus(race,step,meta)]));
  return {id:race.id,kind:race.kind,number:race.number,state:race.state,steps:statuses,blocker:race.state==='saved'?null:stepBlocker(race,race.event.relay)};
}
