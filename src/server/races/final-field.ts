import type pg from 'pg';
import { isRunner,type RaceEntry,type RaceRead } from '../../shared/races.js';
import type { FinalEntry,FinalAddition } from '../../shared/finals.js';
/** Attendance follows the published runner list; a finalist's Here marker is never cleared. */
export async function publishFinalRunners(client:pg.PoolClient,race:Pick<RaceRead,'id'|'kind'>,runners:readonly RaceEntry[]) {
  if(race.kind!=='final') return;
  const row=(await client.query('SELECT entries,additional_entries FROM race_finals WHERE race_id=$1',[race.id])).rows[0];
  if(!row) return;
  const present=new Map(runners.map(runner=>[runner.id,runner]));
  const original:FinalEntry[]=row.entries;
  const known=new Set(original.map(entry=>entry.finalEntryId));
  const here=(runner:RaceEntry|undefined)=>runner && (isRunner(runner) || runner.legs.some(leg=>leg.here))?{wasHere:true}:{};
  const additional:FinalAddition[]=(row.additional_entries||[]).map((entry:FinalAddition)=>({...entry,runner:present.get(entry.runner.id)||entry.runner,absent:!present.has(entry.runner.id),...here(present.get(entry.runner.id))}));
  for(const runner of runners) if(!known.has(runner.id)&&!additional.some(entry=>entry.runner.id===runner.id)) additional.push({runner,absent:false,...here(runner)});
  const entries=original.map(entry=>({...entry,...(present.has(entry.finalEntryId)?{runner:present.get(entry.finalEntryId)}:{}),absent:!present.has(entry.finalEntryId),...here(present.get(entry.finalEntryId))}));
  await client.query('UPDATE race_finals SET entries=$1,additional_entries=$2 WHERE race_id=$3',[JSON.stringify(entries),JSON.stringify(additional),race.id]);
}
