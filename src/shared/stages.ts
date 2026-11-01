import type { FinalResults } from './finals.js';
import { raceCounts } from './race-counts.js';
import { isTeamEntry,raceLabel } from './races.js';
import { teamCount } from './teams.js';
import { raceName } from './race-flow.js';
import { resultName,type EventState,type LeaderboardRow,type NotRankedRace,type ResultTie,type LeadItem,type ResultTeam } from './results-rules.js';
export type Stage='event'|'heats'|'final'|'no-final';
export interface StageItem { id:string; kind:'tie'|'ran-twice'|'incomplete'|'warning'; message:string; raceId?:string; entryId?:string; tieId?:string }
/**
 * A place a stage creates: the child by wristband, or on a relay the team with its four children; the race it was won in
 * ("Heat 2", "Final"), its time (none in a final), and whether an open tie still holds it (Confirm the medals' TIE tag).
 */
export interface StagePlace { position:number; wristband:number|null; team?:ResultTeam; race?:{id:string;name:string}; entryId?:string; time:number|null; tied:boolean }
const stagePlace=(position:number,row:LeaderboardRow|undefined,ties:readonly ResultTie[]=[]):StagePlace=>({position,wristband:row?.wristband??null,
  ...(row?{...(row.team?{team:row.team}:{}),race:{id:row.raceId,name:raceName(row.race)},entryId:row.entryId}:{}),time:row?.time??null,
  tied:!!row && ties.some(tie=>tie.entries.some(entry=>entry.raceId===row.raceId && entry.entryId===row.entryId))});
export interface StageCheckSheet { stage:Stage; label:string; completed:boolean; mustSettleFirst:StageItem[]; worthALook:StageItem[]; creates:StagePlace[]; reopenWarning?:string }
/** The event's row for the scoring database; on a relay, `teams` names the 1st, 2nd and 3rd team with their four children. */
export interface InputRunning { eventCode:string; first:number|null; second:number|null; third:number|null; teams?:Array<ResultTeam|null> }
/** The Day export line a lead reads on Results, from the same podium as the export's Input - Running row: "1st 2014 · 2nd 2003 · 3rd 2021", on a relay "1st Team 3 · 2nd Team 1 · 3rd Team 2". */
export const dayExportLine=(input:InputRunning)=>[input.first,input.second,input.third].map((wristband,index)=>{
  const team=input.teams?.[index];
  return `${['1st','2nd','3rd'][index]} ${team?`Team ${team.number}`:wristband??'-'}`;
}).join(' · ');
/** Completion decisions use the same eligible rows and open ties as the leaderboard. */
export function timedCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[],needsYou:readonly LeadItem[]):StageCheckSheet {
  const active=state.races.filter(race=>!race.deleted && race.kind!=='final');
  const mustSettleFirst:StageItem[]=ties.map(tie=>({id:`tie:${tie.id}`,kind:'tie',tieId:tie.id,message:`Tie: ${tie.entries.map(resultName).join(', ')}`}));
  for(const item of pending) if(item.reasons.includes('in progress')) {
    // A race not saved yet waits on its steps; with nobody checked in it is just an empty heat.
    const entries=state.races.find(race=>race.id===item.race.id)?.runners||[];
    if(entries.length) mustSettleFirst.push({id:`race:${item.race.id}`,kind:'incomplete',raceId:item.race.id,message:`${raceLabel(item.race)} is in progress (${entries.some(isTeamEntry)?teamCount(entries.length):entries.length} checked in) - finish its steps or delete it`});
  } else mustSettleFirst.push({id:`race:${item.race.id}`,kind:'incomplete',raceId:item.race.id,message:`${raceLabel(item.race)}: ${item.reasons.join(' · ')}`});
  for(const row of rows) if(row.highlighted && row.flags.some(flag=>flag.kind==='ran-twice')) mustSettleFirst.push({id:`ran-twice:${row.raceId}:${row.entryId}`,kind:'ran-twice',raceId:row.raceId,entryId:row.entryId,message:`${resultName(row)}: Ran twice in this event`});
  const worthALook:StageItem[]=needsYou.filter(item=>item.kind==='warning' && active.some(race=>race.id===item.raceId)).map(item=>({id:item.id,kind:'warning',raceId:item.raceId,entryId:item.entryId,message:item.message}));
  const eligible=rows.filter(row=>row.position!==null);
  const creates=[1,2,3].map(position=>stagePlace(position,eligible[position-1],ties));
  return {stage:'event',label:'Event complete',completed:state.completedStages?.includes('event')??false,mustSettleFirst,worthALook,creates};
}

export function heatsCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[],final:FinalResults|null,needsYou:readonly LeadItem[]):StageCheckSheet {
  const sheet=timedCheckSheet(state,rows,ties,pending,needsYou);
  return {...sheet,stage:'heats',label:'Heats complete',completed:state.completedStages?.includes('heats')??false,creates:rows.filter(row=>row.position!==null).slice(0,6).map(row=>stagePlace(row.position!,row,ties)),reopenWarning:final?.started?'The final has started. Heats cannot be reopened.':'The final has not run. It is removed. Make it again with + Final on Races after every heat has run.'};
}
/** Results without a final: a heats event's medals from the 3 fastest heat times, judged as a timed event's Event complete. */
export function noFinalCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[],needsYou:readonly LeadItem[]):StageCheckSheet {
  return {...timedCheckSheet(state,rows,ties,pending,needsYou),stage:'no-final',label:'Results without a final',completed:state.completedStages?.includes('no-final')??false};
}
export function finalCheckSheet(state:EventState,final:FinalResults|null,needsYou:readonly LeadItem[]):StageCheckSheet {
  const race=state.races.find(race=>race.id===final?.raceId);
  const mustSettleFirst:StageItem[]=[];
  // A final nobody is running in (an empty event, or everyone Absent) has nothing to save; one still checking in has.
  const unmarked=race?.final?.entries.some(entry=>!entry.absent && !race.runners.some(runner=>runner.id===entry.finalEntryId));
  if(!race || ((race.runners.length || unmarked) && !raceCounts(race))) mustSettleFirst.push({id:'final-recording',kind:'incomplete',raceId:race?.id,message:'Final: awaiting finishing order'});
  const rows=final?.leaderboard.filter(row=>row.position!==null)||[];
  return {stage:'final',label:'Final complete',completed:state.completedStages?.includes('final')??false,mustSettleFirst,worthALook:needsYou.filter(item=>item.kind==='warning'&&item.raceId===final?.raceId).map(item=>({id:item.id,kind:'warning',raceId:item.raceId,entryId:item.entryId,message:item.message})),creates:[1,2,3].map(position=>stagePlace(position,rows[position-1]))};
}
