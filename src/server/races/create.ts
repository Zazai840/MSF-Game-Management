import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { RaceRead,Runner } from '../../shared/races.js';
type Creation={id?:string;dayId:string;eventId:string;kind:RaceRead['kind'];savedBy:string};
/** Allocate a number and initialize every part inside the caller's transaction. */
export async function createRace(client:pg.PoolClient,runners:Runner[],creation:Creation):Promise<{id:string;number:number}> {
  const {dayId,eventId,kind,savedBy}=creation,id=creation.id||randomUUID();
  const counter=(await client.query('INSERT INTO race_counters(event_id,kind,last_number) VALUES($1,$2,1) ON CONFLICT(event_id,kind) DO UPDATE SET last_number=race_counters.last_number+1 RETURNING last_number',[eventId,kind])).rows[0];
  await client.query('INSERT INTO races(id,day_id,event_id,kind,number,original_runners) VALUES($1,$2,$3,$4,$5,$6)',[id,dayId,eventId,kind,counter.last_number,JSON.stringify(runners.map(runner=>runner.wristband))]);
  for(const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,$6)',[id,part,part==='runners'?1:0,part==='runners'?JSON.stringify(runners):null,part==='runners'?savedBy:null,part==='runners'?new Date():null]);
  return {id,number:counter.last_number};
}
