import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { FinishingOrder,RaceRead,Runner } from '../../shared/races.js';
import { raceParts,type RacePartName,type PartValue,type PartSave,type LeadRaceRead } from '../../shared/race-clashes.js';
import { Refusal } from '../access/permissions.js';
import { readRace,type Database } from './records.js';
/** Capture every published value before another command can replace it. Called under the day lock. */
export async function rememberRace(client:pg.PoolClient,race:RaceRead) {
  const parts=(await client.query('SELECT p.*,f.name FROM race_parts p LEFT JOIN phones f ON f.id=p.saved_by WHERE p.race_id=$1 ORDER BY p.part',[race.id])).rows;
  const runners=parts.find(part=>part.part==='runners')?.value||[];
  for(const part of parts) {
    await client.query('INSERT INTO race_part_history(race_id,part,version,value,runners) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[race.id,part.part,part.version,JSON.stringify(part.value),JSON.stringify(runners)]);
    const saved=await client.query('SELECT 1 FROM race_part_saves WHERE race_id=$1 AND part=$2 LIMIT 1',[race.id,part.part]);
    if(!saved.rowCount) await client.query('INSERT INTO race_part_saves(id,race_id,part,base_version,version,author_name,saved_at,value,runners) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),race.id,part.part,Math.max(0,part.version-1),part.version,part.name,part.saved_at||race.checkedInAt,JSON.stringify(part.value),JSON.stringify(runners)]);
  }
}
export async function partVersion<T extends PartValue>(client:pg.PoolClient,race:RaceRead,part:RacePartName,version:number):Promise<{value:T;runners:Runner[]}> {
  await rememberRace(client,race);
  const row=(await client.query('SELECT value,runners FROM race_part_history WHERE race_id=$1 AND part=$2 AND version=$3',[race.id,part,version])).rows[0];
  if(!row) throw new Refusal(400,'Open the race before saving this version');
  return row;
}
function canonical(value:unknown):string {
  const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value && typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)])):value;
  return JSON.stringify(ordered(value));
}
function runnerFacts(runners:readonly Runner[]) {return runners.map(({id:_,...runner})=>runner);}
/** Entry IDs are stable references; separately allocated identical additions are the same answer. */
export function samePart(part:RacePartName,left:PartValue,leftRunners:Runner[],right:PartValue,rightRunners:Runner[]) {
  if(part==='runners') return canonical(runnerFacts(left as Runner[]||[]))===canonical(runnerFacts(right as Runner[]||[]));
  if(part==='finish') {
    const facts=(value:PartValue,runners:Runner[])=>value===null?null:{order:(value as FinishingOrder).order.map(id=>runners.find(runner=>runner.id===id)?.wristband??id),didNotFinish:(value as FinishingOrder).didNotFinish.map(id=>runners.find(runner=>runner.id===id)?.wristband??id),runners:runnerFacts(runners)};
    return canonical(facts(left,leftRunners))===canonical(facts(right,rightRunners));
  }
  return canonical(left)===canonical(right);
}
async function recordSave(client:pg.PoolClient,phone:Phone,raceId:string,part:RacePartName,baseVersion:number,version:number,value:PartValue,runners:Runner[],active:boolean) {
  await client.query('INSERT INTO race_part_saves(id,race_id,part,base_version,version,author_name,value,runners,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),raceId,part,baseVersion,version,phone.name,JSON.stringify(value),JSON.stringify(runners),active]);
}
/** Publish an intentional current correction, retaining an already open clash. Lead resolution retires its candidates explicitly first. */
export async function publishPart(client:pg.PoolClient,phone:Phone,race:RaceRead,part:RacePartName,value:PartValue,runners:Runner[]=race.parts.runners.value||[]) {
  await rememberRace(client,race);
  const old=(await client.query('SELECT version FROM race_parts WHERE race_id=$1 AND part=$2',[race.id,part])).rows[0];
  const candidates=Number((await client.query('SELECT count(*) FROM race_part_saves WHERE race_id=$1 AND part=$2 AND active',[race.id,part])).rows[0].count);
  if(candidates<2) await client.query('UPDATE race_part_saves SET active=false WHERE race_id=$1 AND part=$2 AND active',[race.id,part]);
  const version=old.version+1;
  await client.query('UPDATE race_parts SET value=$1,version=$2,saved_at=clock_timestamp(),saved_by=$3 WHERE race_id=$4 AND part=$5',[JSON.stringify(value),version,phone.id,race.id,part]);
  await client.query('INSERT INTO race_part_history(race_id,part,version,value,runners) VALUES($1,$2,$3,$4,$5)',[race.id,part,version,JSON.stringify(value),JSON.stringify(runners)]);
  await recordSave(client,phone,race.id,part,old.version,version,value,runners,true);
}
export async function savePart(client:pg.PoolClient,phone:Phone,race:RaceRead,part:RacePartName,baseVersion:number,value:PartValue,options:{runners?:Runner[];forceClash?:boolean;apply?:()=>Promise<void>}={}) {
  await partVersion(client,race,part,baseVersion);
  const runners=options.runners||race.parts.runners.value||[];
  if(baseVersion===race.parts[part].version && !options.forceClash) {
    await options.apply?.();await publishPart(client,phone,race,part,value,runners);
    return race.parts[part].clash?'clash' as const:'saved' as const;
  }
  const candidates=(await client.query('SELECT value,runners FROM race_part_saves WHERE race_id=$1 AND part=$2 AND active',[race.id,part])).rows;
  const identical=candidates.some(candidate=>samePart(part,value,runners,candidate.value,candidate.runners));
  await recordSave(client,phone,race.id,part,baseVersion,race.parts[part].version,value,runners,!identical);
  return identical?'merged' as const:'clash' as const;
}
export async function leadRace(db:Database,dayId:string,id:string):Promise<LeadRaceRead> {
  const race=await readRace(db,dayId,id);
  const rows=(await db.query('SELECT id,part,base_version AS "baseVersion",version,author_name AS author,saved_at,value,runners,active FROM race_part_saves WHERE race_id=$1 ORDER BY sequence_number',[race.id])).rows;
  const history:PartSave[]=rows.map(({saved_at,...save})=>({...save,at:saved_at.toISOString()}));
  return {race,history,clashes:raceParts.filter(part=>race.parts[part].clash).map(part=>({part,candidates:history.filter(save=>save.part===part && save.active)}))};
}
