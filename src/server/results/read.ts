import { readCompletedStages } from '../rulings/stages.js';
import type { Stage } from '../../shared/stages.js';
import type pg from 'pg';
import type { AuditNote,RunnerRuling } from '../../shared/rulings.js';
import { readAuditNotes,readRulings } from '../rulings/records.js';
import type { Database,StoredRace } from '../races/records.js';
import { listRaces } from '../races/records.js';
import type { EventState,ResultsRace } from '../../shared/results-rules.js';
import { eventResults } from '../../shared/results-rules.js';
import type { EventSummary,ResultsRead,EventResultsRead } from '../../shared/lead-results.js';
import type { DayEvent } from '../../shared/day.js';
import { runnersOf,type Runner } from '../../shared/races.js';
import { newDay, Refusal } from '../access/permissions.js';
import type { TieSettlement } from '../../shared/ties.js';
import { readTieSettlements } from '../rulings/ties.js';
async function eventsForDay(db:Database,dayId:string):Promise<DayEvent[]> {
  return (await db.query('SELECT id,code,name,section,format,enabled,relay FROM events WHERE day_id=$1 ORDER BY programme_order,code',[dayId])).rows;
}
/** Storage adapter: the pure module receives facts, never pre-ranked rows. */
export function eventState(event:DayEvent,races:readonly StoredRace[],rulings:readonly RunnerRuling[]=[],auditNotes:readonly AuditNote[]=[],tieSettlements:readonly TieSettlement[]=[],completedStages:readonly Stage[]=[],timings:Map<string,ResultsRace['leadTimes']>=new Map()):EventState {
  return {event,rulings,auditNotes,tieSettlements,completedStages,races:races.filter(race=>race.event.id===event.id).map(race=>({id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt,deleted:race.deleted,saved:race.state==='saved',final:race.final,leadTimes:timings.get(race.id),runners:race.parts.runners.value||[],finish:race.parts.finish.value,times:race.parts.times.value}))};

}
export async function readResults(db:Database,dayId:string,providedRaces?:StoredRace[]):Promise<ResultsRead> {
  const events=await eventsForDay(db,dayId),races=providedRaces||await listRaces(db,dayId);
  const timings=await leadTimings(db,dayId);
  const rulings=await readRulings(db,dayId),notes=await readAuditNotes(db,dayId);
  const tieSettlements=await readTieSettlements(db,dayId);
  const stages=await readCompletedStages(db,dayId);
  const day=(await db.query('SELECT events_confirmed FROM olympics_days WHERE id=$1',[dayId])).rows[0];
  if(!day) throw newDay();
  const groups=new Map<string,EventSummary[]>(),needsYou:ResultsRead['needsYou']=[];
  for(const event of events) {
    const results=eventResults(eventState(event,races,rulings,notes.filter(note=>note.eventId===event.id),tieSettlements.filter(settlement=>settlement.eventId===event.id),stages.filter(stage=>stage.eventId===event.id).map(stage=>stage.stage),timings));
    needsYou.push(...results.needsYou.map(item=>{const race=races.find(race=>race.id===item.raceId);return {...item,event,...(race?{race:{id:race.id,number:race.number,kind:race.kind,checkedInAt:race.checkedInAt}}:{})};}));
    const rows=groups.get(event.name)||[];rows.push({event,needsYou:results.needsYou.length,status:results.status,raceCount:results.raceCount,provisional:results.provisional,latestNoteAt:notes.find(note=>note.eventId===event.id)?.at??null});groups.set(event.name,rows);
  }
  const profileRequests=(await db.query("SELECT r.id,p.name,r.created_at AS at FROM profile_requests r JOIN profiles p ON p.id=r.profile_id WHERE r.day_id=$1 AND r.status='waiting' ORDER BY r.created_at DESC,r.id",[dayId])).rows.map(row=>({...row,at:row.at.toISOString()}));
  return {needsYou:needsYou.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id)),profileRequests,eventsConfirmed:day.events_confirmed,groups:[...groups].map(([name,events])=>({name,events}))};
}
export async function readEventResults(db:Database,dayId:string,code:string):Promise<EventResultsRead> {
  const event=(await eventsForDay(db,dayId)).find(event=>event.code===code);
  if(!event) throw new Refusal(404,'Event not found');
  const auditNotes=(await readAuditNotes(db,dayId)).filter(note=>note.eventId===event.id);
  const tieSettlements=(await readTieSettlements(db,dayId)).filter(settlement=>settlement.eventId===event.id);
  const stages=(await readCompletedStages(db,dayId)).filter(stage=>stage.eventId===event.id).map(stage=>stage.stage);
  return {event,auditNotes,results:eventResults(eventState(event,await listRaces(db,dayId),await readRulings(db,dayId),auditNotes,tieSettlements,stages,await leadTimings(db,dayId)))};
}

/** Reuse persisted part and history times; queue ordering never depends on poll time. */
async function leadTimings(db:Database,dayId:string) {
  const rows=(await db.query('SELECT p.race_id,p.part,p.saved_at,p.value FROM race_parts p JOIN races r ON r.id=p.race_id WHERE r.day_id=$1',[dayId])).rows;
  const map=new Map<string,ResultsRace['leadTimes']>();
  for(const row of rows) {const times=map.get(row.race_id)||{},part=row.part as keyof NonNullable<ResultsRace['leadTimes']>;const at=row.saved_at?.toISOString();if(at && (!times[part] || at>times[part]!)) times[part]=at;map.set(row.race_id,times);}
  // Track the saved fact's introduction (at save, or by a lead correction), so a later change to somebody else never refreshes an old warning.
  const published=(await db.query(`SELECT h.race_id,h.value,h.saved_at FROM race_part_history h JOIN races r ON r.id=h.race_id
    WHERE r.day_id=$1 AND h.part='runners' AND h.saved_at IS NOT NULL ORDER BY h.saved_at`,[dayId])).rows;
  const current=new Map<string,Runner[]>(rows.filter(row=>row.part==='runners').map(row=>[row.race_id,runnersOf(row.value)]));
  for(const saved of published) for(const runner of current.get(saved.race_id)||[]) {
    const old=(saved.value as Runner[]|null)?.find(entry=>entry.id===runner.id);if(!old) continue;
    const times=map.get(saved.race_id)!,at=saved.saved_at.toISOString();
    const warningKey=`warning:${runner.id}` as const,addedKey=`added:${runner.id}` as const;
    const warnings=(runner.warnings||[]).filter(warning=>warning.kind!=='already-ran');
    if(warnings.length && !times[warningKey] && warnings.every(warning=>old.warnings?.some(previous=>previous.kind===warning.kind && previous.message===warning.message))) times[warningKey]=at;
    if(runner.addedAtFinish && old.addedAtFinish && !times[addedKey]) times[addedKey]=at;
  }
  return map;
}
export async function resultsSnapshot<T>(pool:pg.Pool,dayId:string,read:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();
  let failure:Error|boolean|undefined;
  try {await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if(!(await client.query('SELECT id FROM olympics_days WHERE id=$1 AND active',[dayId])).rowCount) throw newDay();
    const result=await read(client);await client.query('COMMIT');return result;}
  catch(error) {
    failure=error instanceof Error?error:true;
    try {await client.query('ROLLBACK');} catch { /* Preserve the original transaction error. */ }
    throw error;
  } finally {client.release(failure);}
}
