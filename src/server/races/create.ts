import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { isTeamEntry,type RaceEntry,type RaceRead } from '../../shared/races.js';
/** A race's runners as first stored, kept for its history: each child's wristband, or a team's four in leg order. */
export const originalRunners=(runners:readonly RaceEntry[])=>JSON.stringify(runners.map(runner=>isTeamEntry(runner)?runner.legs.map(leg=>leg.wristband):runner.wristband));
/** The number an event's next race of this kind takes: the highest live one + 1, so deleting the newest frees its number. */
export const nextNumber=async(client:pg.PoolClient,eventId:string,kind:RaceRead['kind'])=>
  (await client.query('SELECT COALESCE(MAX(number),0)+1 AS next FROM races WHERE event_id=$1 AND kind=$2 AND NOT deleted',[eventId,kind])).rows[0].next as number;
type Creation={id?:string;dayId:string;eventId:string;kind:RaceRead['kind'];savedBy:string;number?:number};
/** Number the race (the next number, unless given: a re-run keeps its race's) and initialize every part inside the caller's transaction. */
export async function createRace(client:pg.PoolClient,runners:RaceEntry[],creation:Creation):Promise<{id:string;number:number}> {
  const {dayId,eventId,kind,savedBy}=creation,id=creation.id||randomUUID();
  const number=creation.number??await nextNumber(client,eventId,kind);
  await client.query('INSERT INTO races(id,day_id,event_id,kind,number,original_runners) VALUES($1,$2,$3,$4,$5,$6)',[id,dayId,eventId,kind,number,originalRunners(runners)]);
  for(const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,$6)',[id,part,part==='runners'?1:0,part==='runners'?JSON.stringify(runners):null,part==='runners'?savedBy:null,part==='runners'?new Date():null]);
  return {id,number};
}
