import type { FinalField } from '../../shared/finals.js';
import { raceRecording } from '../../shared/recording.js';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RaceRead } from '../../shared/races.js';
import { Refusal } from '../access/permissions.js';
export type StoredRace=Omit<RaceRead,'final'> & {final?:FinalField};
/** Jobs receive attendance only; heat ranking and provenance stay within Lead reads. */
export function jobRace(race:StoredRace):RaceRead {
  const {final,...rest}=race;
  return {...rest,...(final?{final:{generation:final.generation,presenceConfirmed:final.presenceConfirmed,hasRun:final.hasRun,heatsComplete:final.heatsComplete,entries:[...final.entries.map(({finalEntryId,heatWristband,seed,absent,runner})=>({finalEntryId,wristband:race.parts.runners.value?.find(current=>current.id===finalEntryId)?.wristband??runner?.wristband??heatWristband,seed,absent})),...(final.additionalEntries||[]).map(({runner,absent})=>({finalEntryId:runner.id,wristband:runner.wristband,seed:null,absent}))]}}:{})};
}
export type Database=pg.Pool|pg.PoolClient;
const raceRowsQuery=`SELECT r.*,e.code,e.name,e.section,e.format,e.enabled,EXISTS(SELECT 1 FROM event_stages s WHERE s.event_id=r.event_id AND s.stage=CASE WHEN r.kind='final' THEN 'final' WHEN e.format='heats' THEN 'heats' ELSE 'event' END) AS stage_complete FROM races r JOIN events e ON e.id=r.event_id`;
const finalRowsQuery=`SELECT f.race_id,f.entries,f.additional_entries,f.generation,f.presence_confirmed,
  EXISTS(SELECT 1 FROM event_stages WHERE event_id=r.event_id AND stage='heats') AS heats_complete,
  EXISTS(SELECT 1 FROM race_part_history WHERE race_id=f.race_id AND part='finish' AND value IS NOT NULL AND value<>'null'::jsonb)
  OR EXISTS(SELECT 1 FROM race_parts WHERE race_id=f.race_id AND part='finish' AND value IS NOT NULL AND value<>'null'::jsonb)
  OR EXISTS(SELECT 1 FROM race_part_saves WHERE race_id=f.race_id AND part='finish' AND value IS NOT NULL AND value<>'null'::jsonb) AS has_run
  FROM race_finals f JOIN races r ON r.id=f.race_id`;
export async function listRaces(db:Database,dayId:string):Promise<StoredRace[]> {
  const rows=(await db.query(`${raceRowsQuery} WHERE r.day_id=$1 AND NOT r.deleted ORDER BY r.checked_in_at,r.id`,[dayId])).rows;
  if(!rows.length) return [];
  const partRows=(await db.query('SELECT p.race_id,p.part,p.version,p.value FROM race_parts p JOIN races r ON r.id=p.race_id WHERE r.day_id=$1 AND NOT r.deleted',[dayId])).rows;
  const clashRows=(await db.query('SELECT s.race_id,s.part FROM race_part_saves s JOIN races r ON r.id=s.race_id WHERE r.day_id=$1 AND NOT r.deleted AND s.active GROUP BY s.race_id,s.part HAVING count(*)>1',[dayId])).rows;
  const finalRows=(await db.query(`${finalRowsQuery} WHERE r.day_id=$1 AND NOT r.deleted AND r.kind='final'`,[dayId])).rows;
  const parts=new Map<string,pg.QueryResultRow[]>(),clashes=new Map<string,string[]>();
  for(const row of partRows) {const group=parts.get(row.race_id)||[];group.push(row);parts.set(row.race_id,group);}
  for(const row of clashRows) {const group=clashes.get(row.race_id)||[];group.push(row.part);clashes.set(row.race_id,group);}
  const finals=new Map(finalRows.map(row=>[row.race_id,row]));
  return rows.map(row=>storedRace(row,parts.get(row.id)||[],clashes.get(row.id)||[],finals.get(row.id)));
}
export function requireStageOpen(race:Pick<RaceRead,'stageComplete'>) {
  if(race.stageComplete) throw new Refusal(409,'Stage complete - ask a lead');
}
export function requireStartLineEdit(race:StoredRace) {
  requireStageOpen(race);
  if (race.deleted) throw new Refusal(409,'This race is in Deleted races - ask a lead');
  if(race.kind==='final') throw new Refusal(409,'Use Is everyone here? for the seeded final');
  if (race.parts.finish.value!==null) throw new Refusal(409,'Finishing order already recorded - ask a lead');
}
export async function readRace(db:Database,dayId:string,id:string):Promise<StoredRace> {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) throw new Refusal(404,'Race not found');
  const row=(await db.query(`${raceRowsQuery} WHERE r.day_id=$1 AND r.id=$2`,[dayId,id])).rows[0];
  if (!row) throw new Refusal(404,'Race not found');
  const rows=(await db.query('SELECT part,version,value FROM race_parts WHERE race_id=$1',[id])).rows;
  const clashes=(await db.query('SELECT part FROM race_part_saves WHERE race_id=$1 AND active GROUP BY part HAVING count(*)>1',[id])).rows.map(row=>row.part);
  const finalRow=row.kind==='final'?(await db.query(`${finalRowsQuery} WHERE f.race_id=$1`,[id])).rows[0]:undefined;
  return storedRace(row,rows,clashes,finalRow);
}
function storedRace(row:pg.QueryResultRow,rows:pg.QueryResultRow[],clashes:string[],finalRow?:pg.QueryResultRow):StoredRace {
  const parts=Object.fromEntries(rows.map(row=>[row.part,{version:row.version,value:row.value,...(clashes.includes(row.part)?{clash:true}:{})}]));
  const final=finalRow?{generation:finalRow.generation,entries:finalRow.entries,additionalEntries:finalRow.additional_entries,presenceConfirmed:finalRow.presence_confirmed,hasRun:finalRow.has_run,heatsComplete:finalRow.heats_complete}:undefined;
  const race={...(final?{final}:{}),id:row.id,event:{id:row.event_id,code:row.code,name:row.name,section:row.section,format:row.format,enabled:row.enabled},kind:row.kind,number:row.number,checkedInAt:row.checked_in_at.toISOString(),deleted:row.deleted,stageComplete:row.stage_complete,deleteReason:row.delete_reason,parts:parts as RaceRead['parts']};
  return {...race,recording:raceRecording(race)};
}
export async function raceChange<T>(pool:pg.Pool,phone:Phone,change:(client:pg.PoolClient,unchanged:()=>void)=>Promise<T>) {
  const client=await pool.connect();
  let failure:Error|boolean|undefined;
  try {
    await client.query('BEGIN');
    const day=await client.query('SELECT id FROM olympics_days WHERE id=$1 AND active FOR UPDATE',[phone.dayId]);
    if (!day.rowCount) throw new Refusal(401,'Please join the Olympics day');
    const joined=await client.query('SELECT id FROM phones WHERE id=$1 AND day_id=$2 AND NOT removed FOR SHARE',[phone.id,phone.dayId]);
    if (!joined.rowCount) throw new Refusal(401,'Please join the Olympics day');
    let changed=true;
    const result=await change(client,()=>{changed=false;});
    if(changed) await client.query('UPDATE olympics_days SET revision=revision+1 WHERE id=$1',[phone.dayId]);
    await client.query('COMMIT'); return result;
  } catch(error) {
    failure=error instanceof Error?error:true;
    try {await client.query('ROLLBACK');} catch { /* Preserve the original transaction error. */ }
    throw error;
  } finally {client.release(failure);}
}
