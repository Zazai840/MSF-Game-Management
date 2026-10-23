import { publishFinalRunners } from './final-field.js';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import { runnersOf,type RaceEntry,type RacePartName,type PartValue } from '../../shared/races.js';
import type { LeadRaceRead } from '../../shared/lead-results.js';
import { readRace,withReplacement,type Database,type StoredRace } from './records.js';
function canonical(value:unknown):string {
  const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value && typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)])):value;
  return JSON.stringify(ordered(value));
}
/** Unlike answer equality, applying a coherent snapshot must preserve every entry ID. */
export const sameRunnerSnapshot=(left:readonly RaceEntry[],right:readonly RaceEntry[])=>canonical(left)===canonical(right);
/** Writes a part's new value at the next version. Taps before saving are not kept: history is written at save and by `correctPart`. */
export async function publishPart(client:pg.PoolClient,phone:Phone,race:StoredRace,part:RacePartName,value:PartValue) {
  const version=(await client.query('UPDATE race_parts SET value=$1,version=version+1,saved_at=clock_timestamp(),saved_by=$2 WHERE race_id=$3 AND part=$4 RETURNING version',[JSON.stringify(value),phone.id,race.id,part])).rows[0].version as number;
  // shortcut: a final's attendance follows its children only; a relay final's teams join it when relay finals are built.
  if(part==='runners') await publishFinalRunners(client,race,runnersOf(value as RaceEntry[]|null));
  return version;
}
/** A lead correction: the part's new value, kept in the race's history with the lead's name and the race's runners then. */
export async function correctPart(client:pg.PoolClient,lead:Phone,race:StoredRace,part:RacePartName,value:PartValue,runners:RaceEntry[]=race.parts.runners.value||[]) {
  const version=await publishPart(client,lead,race,part,value);
  await client.query('INSERT INTO race_part_history(race_id,part,version,value,runners,corrected_by) VALUES($1,$2,$3,$4,$5,$6)',[race.id,part,version,JSON.stringify(value),JSON.stringify(runners),lead.name]);
}
export async function leadRace(db:Database,dayId:string,id:string):Promise<LeadRaceRead> {
  const race=await withReplacement(db,dayId,await readRace(db,dayId,id));
  const rows=(await db.query(`SELECT part,version,coalesce(corrected_by,held_by) AS author,saved_at FROM race_part_history WHERE race_id=$1 ORDER BY saved_at NULLS FIRST,version,array_position(ARRAY['runners','finish','times'],part)`,[race.id])).rows;
  return {race,history:rows.map(({saved_at,...row})=>({...row,at:saved_at?.toISOString()??null}))};
}
