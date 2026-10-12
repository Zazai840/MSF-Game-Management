import type { Database } from './records.js';
import type { DayEvent } from '../../shared/day.js';
import type { Runner } from '../../shared/races.js';
import { wristbandWarnings,type WristbandRace } from '../../shared/wristband-checks.js';
import { Refusal } from '../access/permissions.js';
export function keptWarningNumbers(body:unknown,numbers:readonly number[]):number[] {
  const kept=(body as {keptWarnings?:unknown}|null)?.keptWarnings;
  if (kept===undefined) return [];
  if (!Array.isArray(kept) || kept.length>6 || kept.some(number=>!numbers.includes(number))) throw new Refusal(400,'Choose Keep for a wristband number in this race');
  return kept;
}
export async function wristbandRaces(db:Database,dayId:string,eventId:string):Promise<WristbandRace[]> {
  const rows=(await db.query(`SELECT r.id,r.deleted,p.value FROM races r JOIN race_parts p ON p.race_id=r.id AND p.part='runners' WHERE r.day_id=$1 AND r.event_id=$2`,[dayId,eventId])).rows;
  return rows.map(row=>({id:row.id,deleted:row.deleted,wristbands:((row.value||[]) as Runner[]).map(runner=>runner.wristband)}));
}
/** Store only server-computed warnings; an unchanged entry keeps its original warning and choice. */
export async function annotateRunners(db:Database,dayId:string,event:Pick<DayEvent,'id'|'section'>,runners:Runner[],kept:readonly number[],currentRaceId?:string,previous:readonly Runner[]=[],skipAlreadyRan=false):Promise<Runner[]> {
  const races=await wristbandRaces(db,dayId,event.id);
  return runners.map(runner=>{
    const existing=previous.find(entry=>entry.id===runner.id);
    const warnings=existing?(existing.warnings||[]):wristbandWarnings(runner.wristband,event.section,races,{currentRaceId,skipAlreadyRan});
    return {...runner,warnings:warnings.map(warning=>({...warning,kept:kept.includes(runner.wristband)||('kept' in warning && warning.kept===true)}))};
  });
}
