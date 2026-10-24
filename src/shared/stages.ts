import type { FinalResults } from './finals.js';
import { raceCounts } from './race-counts.js';
import { isTeamEntry } from './races.js';
import { teamCount } from './teams.js';
import { resultName,type EventState,type LeaderboardRow,type NotRankedRace,type ResultTie,type LeadItem,type ResultTeam } from './results-rules.js';
export type Stage='event'|'heats'|'final'|'no-final';
export interface StageItem { id:string; kind:'tie'|'ran-twice'|'incomplete'|'warning'; message:string; raceId?:string; entryId?:string; tieId?:string }
/** A place a stage creates: the child by wristband, or on a relay the team with its four children. */
export interface StagePlace { position:number; wristband:number|null; team?:ResultTeam; raceId?:string; entryId?:string }
const stagePlace=(position:number,row:LeaderboardRow|undefined):StagePlace=>({position,wristband:row?.wristband??null,...(row?{...(row.team?{team:row.team}:{}),raceId:row.raceId,entryId:row.entryId}:{})});
export interface StageCheckSheet { stage:Stage; label:string; completed:boolean; mustSettleFirst:StageItem[]; worthALook:StageItem[]; creates:StagePlace[]; reopenWarning?:string }
/** The event's row for the scoring database; on a relay, `teams` names the 1st, 2nd and 3rd team with their four children. */
export interface InputRunning { eventCode:string; first:number|null; second:number|null; third:number|null; teams?:Array<ResultTeam|null> }
/** Completion decisions use the same eligible rows and open ties as the leaderboard. */
export function timedCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[],needsYou:readonly LeadItem[]):StageCheckSheet {
  const active=state.races.filter(race=>!race.deleted && race.kind!=='final');
  const mustSettleFirst:StageItem[]=ties.map(tie=>({id:`tie:${tie.id}`,kind:'tie',tieId:tie.id,message:`Tie: ${tie.entries.map(resultName).join(', ')}`}));
  for(const item of pending) if(item.reasons.includes('in progress')) {
    // A race not saved yet waits on its Submit Race; with nobody checked in it is just the empty current race.
    const entries=state.races.find(race=>race.id===item.race.id)?.runners||[];
    if(entries.length) mustSettleFirst.push({id:`race:${item.race.id}`,kind:'incomplete',raceId:item.race.id,message:`${item.race.kind==='heat'?'Heat':'Race'} ${item.race.number} is in progress (${entries.some(isTeamEntry)?teamCount(entries.length):entries.length} checked in) - submit it or delete it`});
  } else mustSettleFirst.push({id:`race:${item.race.id}`,kind:'incomplete',raceId:item.race.id,message:`${item.race.kind==='heat'?'Heat':'Race'} ${item.race.number}: ${item.reasons.join(' · ')}`});
  for(const row of rows) if(row.highlighted && row.flags.some(flag=>flag.kind==='ran-twice')) mustSettleFirst.push({id:`ran-twice:${row.raceId}:${row.entryId}`,kind:'ran-twice',raceId:row.raceId,entryId:row.entryId,message:`${resultName(row)}: Ran twice in this event`});
  const worthALook:StageItem[]=needsYou.filter(item=>item.kind==='warning' && active.some(race=>race.id===item.raceId)).map(item=>({id:item.id,kind:'warning',raceId:item.raceId,entryId:item.entryId,message:item.message}));
  const eligible=rows.filter(row=>row.position!==null);
  const creates=[1,2,3].map(position=>stagePlace(position,eligible[position-1]));
  return {stage:'event',label:'Event complete',completed:state.completedStages?.includes('event')??false,mustSettleFirst,worthALook,creates};
}

export function heatsCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[],final:FinalResults|null,needsYou:readonly LeadItem[]):StageCheckSheet {
  const sheet=timedCheckSheet(state,rows,ties,pending,needsYou);
  return {...sheet,stage:'heats',label:'Heats complete',completed:state.completedStages?.includes('heats')??false,creates:rows.filter(row=>row.position!==null).slice(0,6).map(row=>stagePlace(row.position!,row)),reopenWarning:final?.started?'The final has started. Heats cannot be reopened.':'The unrun final will be rebuilt from the corrected heat rankings when heats are completed again.'};
}
/** Results without a final: a heats event's medals from the 3 fastest heat times, judged as a timed event's Event complete. */
export function noFinalCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[],needsYou:readonly LeadItem[]):StageCheckSheet {
  return {...timedCheckSheet(state,rows,ties,pending,needsYou),stage:'no-final',label:'Results without a final',completed:state.completedStages?.includes('no-final')??false};
}
export function finalCheckSheet(state:EventState,final:FinalResults|null,needsYou:readonly LeadItem[]):StageCheckSheet {
  const race=state.races.find(race=>race.id===final?.raceId);
  const mustSettleFirst:StageItem[]=[];
  // A final nobody is running in (an empty event, or everyone Absent) has nothing to save.
  if(!race || (race.runners.length && !raceCounts(race))) mustSettleFirst.push({id:'final-recording',kind:'incomplete',raceId:race?.id,message:'Final: awaiting finishing order'});
  const rows=final?.leaderboard.filter(row=>row.position!==null)||[];
  return {stage:'final',label:'Final complete',completed:state.completedStages?.includes('final')??false,mustSettleFirst,worthALook:needsYou.filter(item=>item.kind==='warning'&&item.raceId===final?.raceId).map(item=>({id:item.id,kind:'warning',raceId:item.raceId,entryId:item.entryId,message:item.message})),creates:[1,2,3].map(position=>stagePlace(position,rows[position-1]))};
}
