import { raceRecording } from '../../shared/recording.js';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RaceRead } from '../../shared/races.js';
import { Refusal } from '../access/permissions.js';
export type Database=pg.Pool|pg.PoolClient;
export async function listRaces(db:Database,dayId:string) {
  const rows=(await db.query('SELECT id FROM races WHERE day_id=$1 AND NOT deleted ORDER BY checked_in_at,id',[dayId])).rows;
  if('release' in db) {
    const races:RaceRead[]=[];for(const row of rows) races.push(await readRace(db,dayId,row.id));return races;
  }
  return Promise.all(rows.map(row=>readRace(db,dayId,row.id)));
}
export function requireStartLineEdit(race:RaceRead) {
  if (race.deleted) throw new Refusal(409,'This race is in Deleted races - ask a lead');
  if (race.parts.finish.value!==null) throw new Refusal(409,'Finishing order already recorded - ask a lead');
}
export async function readRace(db:Database,dayId:string,id:string):Promise<RaceRead> {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) throw new Refusal(404,'Race not found');
  const row=(await db.query(`SELECT r.*,e.code,e.name,e.section,e.format,e.enabled FROM races r JOIN events e ON e.id=r.event_id WHERE r.day_id=$1 AND r.id=$2`,[dayId,id])).rows[0];
  if (!row) throw new Refusal(404,'Race not found');
  const rows=(await db.query('SELECT part,version,value FROM race_parts WHERE race_id=$1',[id])).rows;
  const clashes=(await db.query('SELECT part FROM race_part_saves WHERE race_id=$1 AND active GROUP BY part HAVING count(*)>1',[id])).rows.map(row=>row.part);
  const parts=Object.fromEntries(rows.map(row=>[row.part,{version:row.version,value:row.value,...(clashes.includes(row.part)?{clash:true}:{})}]));
  const race={id:row.id,event:{id:row.event_id,code:row.code,name:row.name,section:row.section,format:row.format,enabled:row.enabled},kind:row.kind,number:row.number,checkedInAt:row.checked_in_at.toISOString(),deleted:row.deleted,parts:parts as RaceRead['parts']};
  return {...race,recording:raceRecording(race)};
}
export async function raceChange<T>(pool:pg.Pool,phone:Phone,change:(client:pg.PoolClient,unchanged:()=>void)=>Promise<T>) {
  const client=await pool.connect();
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
  } catch(error) {await client.query('ROLLBACK');throw error;}
  finally {client.release();}
}
