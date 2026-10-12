import type { EventState,LeaderboardRow,NotRankedRace,ResultTie } from './results-rules.js';
import { isOpenEligibilityWarning,runnerWarningFlags } from './runner-rulings.js';
export type Stage='event'|'heats'|'final';
export interface StageItem { id:string; kind:'tie'|'clash'|'ran-twice'|'incomplete'|'warning'; message:string; raceId?:string; entryId?:string; tieId?:string }
export interface StagePlace { position:number; wristband:number|null; raceId?:string; entryId?:string }
export interface StageCheckSheet { stage:Stage; label:string; completed:boolean; mustSettleFirst:StageItem[]; worthALook:StageItem[]; creates:StagePlace[] }
export interface InputRunning { eventCode:string; first:number|null; second:number|null; third:number|null }
/** Completion decisions use the same eligible rows and open ties as the leaderboard. */
export function timedCheckSheet(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[],pending:readonly NotRankedRace[]):StageCheckSheet {
  const active=state.races.filter(race=>!race.deleted && race.kind!=='final');
  const mustSettleFirst:StageItem[]=ties.map(tie=>({id:`tie:${tie.id}`,kind:'tie',tieId:tie.id,message:`Tie: ${tie.entries.map(entry=>entry.wristband).join(', ')}`}));
  for(const item of pending) mustSettleFirst.push({id:`race:${item.race.id}`,kind:item.reasons.includes('two versions, lead to check')?'clash':'incomplete',raceId:item.race.id,message:`${item.race.kind==='heat'?'Heat':'Race'} ${item.race.number}: ${item.reasons.join(' · ')}`});
  for(const row of rows) if(row.highlighted && row.flags.some(flag=>flag.kind==='ran-twice')) mustSettleFirst.push({id:`ran-twice:${row.raceId}:${row.entryId}`,kind:'ran-twice',raceId:row.raceId,entryId:row.entryId,message:`${row.wristband}: Ran twice in this event`});
  const worthALook:StageItem[]=[];
  for(const race of active) for(const runner of race.runners) {
    const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
    for(const flag of runnerWarningFlags(runner,ruling,false).filter(isOpenEligibilityWarning)) worthALook.push({id:`warning:${race.id}:${runner.id}:${flag.warningKind}`,kind:'warning',raceId:race.id,entryId:runner.id,message:`${runner.wristband}: ${flag.message}`});
  }
  const eligible=rows.filter(row=>row.position!==null);
  const creates=[1,2,3].map(position=>{const row=eligible[position-1];return {position,wristband:row?.wristband??null,...(row?{raceId:row.raceId,entryId:row.entryId}:{})};});
  return {stage:'event',label:'Event complete',completed:state.completedStages?.includes('event')??false,mustSettleFirst,worthALook,creates};
}
