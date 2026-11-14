import { leaderboardRowFacts,resultEntry } from './leaderboard-row.js';
import { ordinal } from './ordinal.js';
import { raceCounts } from './race-counts.js';
import { isTeamEntry,type FinishingOrder,type RaceEntry,type TeamEntry } from './races.js';
import { resultHolder,type EventState,type LeaderboardRow,type ResultsRace } from './results-rules.js';
/** Immutable heat provenance (a relay team's has no wristband: its heat entry names the team). An absent qualifier remains here when a replacement is called up. */
export interface FinalEntry { finalEntryId:string; heatRaceId:string; heatEntryId:string; heatWristband:number|null; seed:number; heatRank:number; kind:'qualifier'|'call-up'; absent:boolean; wasHere?:boolean; runner?:RaceEntry; replacesEntryId?:string }
/** A runner or team added to a final. `replacesEntryId` is the finalist a start line replace gave the place to, as a call-up's is. */
export interface FinalAddition { runner:RaceEntry; absent:boolean; wasHere?:boolean; replacesEntryId?:string }
export interface FinalField { generation:string; entries:FinalEntry[]; additionalEntries?:FinalAddition[]; hasRun:boolean; heatsComplete:boolean }
export interface FinalPresence { generation:string; hasRun:boolean;heatsComplete:boolean;entries:Array<{finalEntryId:string;wristband:number|null;team?:TeamEntry['team'];legs?:TeamEntry['legs'];seed:number|null;absent:boolean;calledUp:boolean}> }
export interface FinalResults extends FinalField { raceId:string; runners:readonly RaceEntry[]; leaderboard:LeaderboardRow[]; nextCallUp:LeaderboardRow|null; vacancy:FinalEntry|null;
  /** Attendance has been published (an individual Here or Absent, or a relay child Here), or a finishing order recorded. */
  started:boolean }
/**
 * A finalist's mark at the final's check-in: Here once in the race (its runner list), else Absent, else not marked
 * yet. The one rule the start line's rows, the check sheet and the server read.
 */
export type FinalMark='here'|'absent'|null;
export const finalMark=(finalist:{finalEntryId:string;absent:boolean},runners:ReadonlyArray<{id:string}>):FinalMark=>
  runners.some(runner=>runner.id===finalist.finalEntryId)?'here':finalist.absent?'absent':null;
export function finalRows(state:EventState,race:ResultsRace):LeaderboardRow[] {
  if(!raceCounts(race)) return [];
  const finish:FinishingOrder=race.finish!;
  const rows=race.runners.map((runner):LeaderboardRow=>{
    const index=finish.order.indexOf(runner.id),ruling=state.rulings?.find(item=>item.raceId===race.id && item.entryId===runner.id);
    const disqualification=ruling?.disqualification??null,notCounted=ruling?.notCounted??false;
    return {...leaderboardRowFacts(state,race,runner,ruling),place:index<0?null:index+1,time:null,status:disqualification?'Disqualified':notCounted?'Not counted':index<0?'Did not finish':'Finished'};
  });
  const eligible=rows.filter(row=>row.status==='Finished').sort((a,b)=>a.place!-b.place!);
  for(const [index,row] of eligible.entries()) {row.position=index+1;row.highlighted=index<3;if(index<3) row.medalPlace=(index+1) as 1|2|3;}
  return [...eligible,...rows.filter(row=>row.status!=='Finished')];
}
export function finalResults(state:EventState,heats:readonly LeaderboardRow[]):FinalResults|null {
  const race=state.races.find(race=>race.kind==='final'&&!race.deleted);
  if(!race?.final) return null;
  const used=new Set(race.final.entries.map(entry=>`${entry.heatRaceId}:${entry.heatEntryId}`));
  // A seed is held by a seeded or called-up finalist not Absent, or by a runner not Absent who replaced one with that seed.
  const replaced=(race.final.additionalEntries||[]).filter(entry=>!entry.absent).map(entry=>race.final!.entries.find(other=>other.finalEntryId===entry.replacesEntryId));
  const held=new Set([...race.final.entries.filter(entry=>!entry.absent),...replaced].map(entry=>entry?.seed));
  const vacancy=race.runners.length>=6?null:race.final.entries.find(entry=>entry.absent && !held.has(entry.seed))??null;
  const nextCallUp=heats.find(row=>row.position!==null && !used.has(`${row.raceId}:${row.entryId}`) && !race.runners.some(runner=>resultHolder(resultEntry(race,runner))===resultHolder(row)))??null;
  const started=race.final.hasRun || !!(race.finish?.order.length || race.finish?.didNotFinish.length) || [...race.final.entries,...race.final.additionalEntries||[]].some(entry=>entry.absent || entry.wasHere)
    || race.runners.some(runner=>isTeamEntry(runner) && runner.legs.some(leg=>leg.here));
  return {...race.final,raceId:race.id,runners:race.runners,leaderboard:finalRows(state,race),nextCallUp,vacancy,started};
}
/** A finalist's place in the line-up at the final's check-in: "1st fastest", "Called up" or "Added". */
/** A final still taking call-ups and added teams: its heats are complete and it has not run. */
export const finalTakesChanges=(final:Pick<FinalField,'heatsComplete'|'hasRun'>)=>final.heatsComplete && !final.hasRun;
/** The next-ranked heat entry a final can call up now, or null: a place is free (`placeFree`), an Absent finalist's seed is free, and a ranked entry is left. */
export const openCallUp=(final:FinalResults|null)=>final && placeFree(final) && final.vacancy?final.nextCallUp:null;
/**
 * A place is free for "+ Runner" or "+ Team" at a final taking changes: a finalist is Absent and fewer than 6 are not
 * Absent (Here, or not marked yet, since each of those may still run). The start line's button and the server's check read this.
 */
export const placeFree=(final:Pick<FinalField,'heatsComplete'|'hasRun'> & {entries:ReadonlyArray<{absent:boolean}>;additionalEntries?:ReadonlyArray<{absent:boolean}>})=>{
  // The server's stored final keeps added entries apart; a phone's line-up has them in `entries` already.
  const all=[...final.entries,...final.additionalEntries||[]];
  return finalTakesChanges(final) && all.some(entry=>entry.absent) && all.filter(entry=>!entry.absent).length<6;
};
/** The call-up button's words, at the final's check-in and on the Final tab: "Call up next fastest: 2011 (7th)". */
export const callUpLabel=(who:string,position:number)=>`Call up next fastest: ${who} (${ordinal(position)})`;
/** Whether a relay team is in the final's line-up (as the start line reads it), Absent ones included: such a team is not added again. */
export const teamInFinal=(entries:ReadonlyArray<{team?:{id:string}}>,teamId:string)=>entries.some(entry=>entry.team?.id===teamId);
/** "+ Team" refused, on the phone and the server: "Team 3 is already in the Final". */
export const teamInFinalLine=(team:number)=>`Team ${team} is already in the Final`;
/** "+ Runner", "+ Team" or a call-up refused, on the phone and the server, when no place is free (`placeFree`). */
export const noPlaceFreeLine='No place is free in the Final';
/** A line-up row added at the start line ("Added"), not seeded or called up: a replace on it corrects its number in place. */
export const addedToFinal=(entry:Pick<FinalPresence['entries'][number],'seed'>)=>entry.seed===null;
/** A final's runner changed at the start line, as the phone says it and its audit note does: "replaced 2003 with 2050", or on an Added row "corrected 2050 to 2052". */
export const runnerChangeLine=(added:boolean,from:number|null,to:number)=>added?`corrected ${from} to ${to}`:`replaced ${from} with ${to}`;
export const seedLabel=(entry:Pick<FinalPresence['entries'][number],'calledUp'|'seed'>)=>entry.calledUp?'Called up':addedToFinal(entry)?'Added':`${ordinal(entry.seed!)} fastest`;
