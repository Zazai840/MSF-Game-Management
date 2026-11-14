import type pg from 'pg';
import { isRunner,isTeamEntry,type RaceEntry,type RaceRead } from '../../shared/races.js';
import type { TeamLeg } from '../../shared/teams.js';
import type { FinalEntry,FinalAddition,FinalField } from '../../shared/finals.js';
/**
 * Attendance follows the published runner list: those in it are Here, and one leaving it (Didn't run, a lead taking
 * them off, a relay team's Absent) is Absent. One never in it keeps its mark, so a finalist not yet checked in stays
 * unmarked; the final's check-in sets the marks itself (`markAbsentFinalists`). A finalist's Here marker is never cleared.
 * `race` is as it was before this publication.
 */
export async function publishFinalRunners(client:pg.PoolClient,race:Pick<RaceRead,'id'|'kind'|'parts'>,runners:readonly RaceEntry[]) {
  if(race.kind!=='final') return;
  const row=(await client.query('SELECT entries,additional_entries FROM race_finals WHERE race_id=$1',[race.id])).rows[0];
  if(!row) return;
  const present=new Map(runners.map(runner=>[runner.id,runner])),before=new Set((race.parts.runners.value||[]).map(runner=>runner.id));
  const absent=(id:string,stored:boolean)=>!present.has(id) && (stored || before.has(id));
  const original:FinalEntry[]=row.entries;
  const known=new Set(original.map(entry=>entry.finalEntryId));
  const here=(runner:RaceEntry|undefined)=>runner && (isRunner(runner) || runner.legs.some(leg=>leg.here))?{wasHere:true}:{};
  const additional:FinalAddition[]=(row.additional_entries||[]).map((entry:FinalAddition)=>({...entry,runner:present.get(entry.runner.id)||entry.runner,absent:absent(entry.runner.id,entry.absent),...here(present.get(entry.runner.id))}));
  for(const runner of runners) if(!known.has(runner.id)&&!additional.some(entry=>entry.runner.id===runner.id)) additional.push({runner,absent:false,...here(runner)});
  const entries=original.map(entry=>({...entry,...(present.has(entry.finalEntryId)?{runner:present.get(entry.finalEntryId)}:{}),absent:absent(entry.finalEntryId,entry.absent),...here(present.get(entry.finalEntryId))}));
  await client.query('UPDATE race_finals SET entries=$1,additional_entries=$2 WHERE race_id=$3',[JSON.stringify(entries),JSON.stringify(additional),race.id]);
}
/**
 * The one write of the Absent marks, made after the runner list (those Here) is published: `absent` answers for each
 * finalist, given its id and the mark stored. A child's final check-in names exactly the Absent ones; a relay final's
 * tap answers for its one team and leaves the rest as stored.
 */
export async function markAbsentFinalists(client:pg.PoolClient,raceId:string,absent:(id:string,stored:boolean)=>boolean) {
  const row=(await client.query('SELECT entries,additional_entries FROM race_finals WHERE race_id=$1',[raceId])).rows[0];
  const entries=(row.entries as FinalEntry[]).map(entry=>({...entry,absent:absent(entry.finalEntryId,entry.absent)}));
  const additional=((row.additional_entries||[]) as FinalAddition[]).map(entry=>({...entry,absent:absent(entry.runner.id,entry.absent)}));
  await client.query('UPDATE race_finals SET entries=$1,additional_entries=$2 WHERE race_id=$3',[JSON.stringify(entries),JSON.stringify(additional),raceId]);
}
/** A runner who replaced finalist `replacesEntryId` at the start line: their added entry names that finalist, as a call-up does. */
export async function markReplacement(client:pg.PoolClient,raceId:string,entryId:string,replacesEntryId:string) {
  const row=(await client.query('SELECT additional_entries FROM race_finals WHERE race_id=$1',[raceId])).rows[0];
  const additional=((row.additional_entries||[]) as FinalAddition[]).map(entry=>entry.runner.id===entryId?{...entry,replacesEntryId}:entry);
  await client.query('UPDATE race_finals SET additional_entries=$1 WHERE race_id=$2',[JSON.stringify(additional),raceId]);
}
/** A relay final's team changed at check-in while not in the race: its kept copy takes the new legs. False when the team is not a finalist. */
export async function keepFinalistLegs(client:pg.PoolClient,raceId:string,teamId:string,legs:readonly TeamLeg[]) {
  const row=(await client.query('SELECT entries,additional_entries FROM race_finals WHERE race_id=$1',[raceId])).rows[0];
  let found=false;
  const changed=<Item extends {runner?:RaceEntry}>(item:Item):Item=>{
    if(!item.runner || !isTeamEntry(item.runner) || item.runner.team.id!==teamId) return item;
    found=true;
    return {...item,runner:{...item.runner,legs:legs.map(leg=>({...leg,here:false}))}};
  };
  const entries=(row.entries as FinalEntry[]).map(changed),additional=((row.additional_entries||[]) as FinalAddition[]).map(changed);
  if(found) await client.query('UPDATE race_finals SET entries=$1,additional_entries=$2 WHERE race_id=$3',[JSON.stringify(entries),JSON.stringify(additional),raceId]);
  return found;
}
/**
 * A relay team's entry in a final's line-up, seeded, called up or added: its id, its Absent mark, its kept copy, and for
 * a seeded or called-up team the heat entry it ran in.
 */
export function finalTeam(final:FinalField,teamId:string) {
  const ofTeam=(runner:RaceEntry|undefined)=>!!runner && isTeamEntry(runner) && runner.team.id===teamId;
  const seeded=final.entries.find(item=>ofTeam(item.runner));
  if(seeded) return {id:seeded.finalEntryId,absent:seeded.absent,runner:seeded.runner,heat:{raceId:seeded.heatRaceId,entryId:seeded.heatEntryId}};
  const added=(final.additionalEntries||[]).find(item=>ofTeam(item.runner));
  return added && {id:added.runner.id,absent:added.absent,runner:added.runner};
}
