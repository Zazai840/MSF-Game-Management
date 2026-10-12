import { resultRecords,finalRecords,type ResultRecord,type FinalRecord } from './result-records.js';
import { finalResults,type FinalField,type FinalResults } from './finals.js';
import { timedCheckSheet,heatsCheckSheet,finalCheckSheet,type Stage,type StageCheckSheet,type InputRunning } from './stages.js';
import { eventLeadItems } from './lead-items.js';
import { runnerWarningFlags } from './runner-rulings.js';
import type { WristbandWarning } from './wristband-checks.js';
import type { FinishingOrder,Runner } from './races.js';
import type { AuditNote,RunnerRuling,Disqualification } from './rulings.js';
import type { RaceTimes } from './time-entry.js';
import { timesOutOfOrder } from './time-entry.js';
import { eventTies,type TieSettlement } from './ties.js';
export type Section = 'Boy Beavers' | 'Girl Beavers' | 'Boy Cubs' | 'Girl Cubs' | 'Boy Scouts' | 'Girl Scouts';
export interface Event { code:string; name:string; section:Section; format:'heats'|'timed' }
export interface RaceReference { id:string; kind:'heat'|'final'|'race'; number:number; checkedInAt:string }
/** Complete, persisted facts for one race. Versions and storage details do not affect ranking. */
export interface ResultsRace extends RaceReference { deleted:boolean; clash?:boolean; leadTimes?:Partial<Record<'runners'|'finish'|'times'|'clash'|`warning:${string}`|`added:${string}`,string>>; runners:readonly Runner[]; finish:FinishingOrder|null; times:RaceTimes|null; final?:FinalField }
export interface EventState { event:Event; races:readonly ResultsRace[]; rulings?:readonly RunnerRuling[]; auditNotes?:readonly AuditNote[]; tieSettlements?:readonly TieSettlement[]; completedStages?:readonly Stage[] }
export interface ResultFlag { kind:'warning'|'ran-twice'|'added-at-finish'|'tie'|'tie-settled'; message:string; warningKind?:WristbandWarning['kind']; checked?:boolean }

export interface ResultEntry { raceId:string; entryId:string; wristband:number }
export interface LeaderboardRow extends ResultEntry {
  race:RaceReference; recordingPending?:true; position:number|null; place:number|null; time:number|null; status:'Finished'|'Did not finish'|'Disqualified'|'Not counted'|'Pending'; notCounted:boolean; disqualification:Disqualification|null; hasNote:boolean;
  highlighted:boolean; qualification:'Q'|null; medalPlace:1|2|3|null; flags:ResultFlag[];
}
export type NotRankedReason='two versions, lead to check'|'checked in'|'awaiting finishing order'|'awaiting times'|'times out of order'|"finishers and times don't agree";
export interface NotRankedRace { race:RaceReference; reasons:NotRankedReason[] }
/** Later rulings extend these typed derivatives at the same eventResults seam. */
export interface ResultTie { id:string; time:number; entries:ResultEntry[]; impact:string }
export interface LeadItem { id:string; kind:'warning'|'ran-twice'|'added-at-finish'|'times-out-of-order'|'clash'|'tie'; raceId?:string; entryId?:string; tieId?:string; at:string; message:string }
export interface ResultsBand { highlightCount:number; lineAfter:number; lineLabel:'Qualifying line'|'Medal line' }
export interface EventResults {
  allResults:ResultRecord[]; finalRecords:FinalRecord[]; leaderboard:LeaderboardRow[]; actionableRunners:LeaderboardRow[]; qualifiers:LeaderboardRow[]; medalPlaces:LeaderboardRow[];
  ties:ResultTie[]; notRankedYet:NotRankedRace[]; needsYou:LeadItem[]; band:ResultsBand;
  checkSheet:StageCheckSheet|null; heatsCheckSheet:StageCheckSheet|null; finalResults:FinalResults|null; inputRunning:InputRunning|null;
  status:'Not started'|'In progress - provisional'|'Heats complete - final to run'|'Complete'; raceCount:number; provisional:boolean;
}
/** One event's results are recomputed from facts. Callers never sort or assign positions. */
export function eventResults(state:EventState):EventResults {
  const allActive=state.races.filter(race=>!race.deleted);
  const active=allActive.filter(race=>race.kind!=='final');
  const band:ResultsBand=state.event.format==='heats'?{highlightCount:8,lineAfter:6,lineLabel:'Qualifying line'}:{highlightCount:6,lineAfter:3,lineLabel:'Medal line'};
  const publishedRows:LeaderboardRow[]=[],actionableRunners:LeaderboardRow[]=[];
  const recordingReasons=new Map<string,NotRankedReason[]>();
  const finished:LeaderboardRow[]=[],didNotFinish:LeaderboardRow[]=[],disqualified:LeaderboardRow[]=[],notCounted:LeaderboardRow[]=[],notRankedYet:NotRankedRace[]=[];
  const reference=(race:ResultsRace):RaceReference=>({id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt});
  const appearances=new Map<number,Set<string>>();
  for(const race of active) for(const runner of race.runners) {
    const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
    if(ruling?.disqualification || ruling?.notCounted) continue;
    const races=appearances.get(runner.wristband)||new Set<string>();races.add(race.id);appearances.set(runner.wristband,races);
  }
  for(const race of state.races) {
    const reasons:NotRankedReason[]=[];
    if(race.clash) reasons.push('two versions, lead to check');
    if(!race.finish) reasons.push(race.times?'awaiting finishing order':'checked in');
    if(race.kind==='final' && !race.final?.presenceConfirmed) reasons.push('checked in');
    if(race.kind!=='final' && race.finish && !race.times) reasons.push('awaiting times');
    if(race.kind!=='final' && race.times && timesOutOfOrder(race.times.places) && race.times.acceptedByLead!==true) reasons.push('times out of order');
    if(race.kind!=='final' && race.finish && race.times && race.finish.order.length!==race.times.places.filter(time=>time!==null).length) reasons.push("finishers and times don't agree");
    recordingReasons.set(race.id,reasons);
    if(reasons.length && !race.deleted && race.kind!=='final') notRankedYet.push({race:reference(race),reasons});
    for(const runner of race.runners) {
      const index=race.finish?.order.indexOf(runner.id)??-1,isFinisher=index>=0;
      const row:LeaderboardRow={raceId:race.id,entryId:runner.id,wristband:runner.wristband,race:reference(race),position:null,place:isFinisher?index+1:null,time:isFinisher?race.times?.places[index]??null:null,status:reasons.length?'Pending':isFinisher?'Finished':'Did not finish',disqualification:null,notCounted:false,hasNote:false,highlighted:false,qualification:null,medalPlace:null,flags:[],...(reasons.length?{recordingPending:true as const}:{})};
      const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
      row.disqualification=ruling?.disqualification??null;row.notCounted=ruling?.notCounted??false;
      row.hasNote=!!state.auditNotes?.some(note=>note.touches.some(touch=>touch.raceId===race.id && (!touch.entryId || touch.entryId===runner.id)));
      const repeated=!race.deleted && race.kind!=='final' && !row.disqualification && !row.notCounted && (appearances.get(runner.wristband)?.size||0)>1;
      row.flags=runnerWarningFlags(runner,ruling,repeated);
      if(repeated) row.flags.push({kind:'ran-twice',message:'Ran twice in this event'});
      if(runner.addedAtFinish) row.flags.push({kind:'added-at-finish',message:'Added at the finish',...(ruling?.addedAtFinishChecked?{checked:true}:{})});
      publishedRows.push(row);
      if(race.deleted) continue;
      actionableRunners.push(row);
      if(reasons.length || race.kind==='final') {if(row.disqualification) row.status='Disqualified';else if(row.notCounted) row.status='Not counted';continue;}
      if(row.disqualification) {row.status='Disqualified';disqualified.push(row);}
      else if(row.notCounted) {row.status='Not counted';notCounted.push(row);}
      else (isFinisher?finished:didNotFinish).push(row);
    }
  }
  finished.sort((left,right)=>(left.time!-right.time!) || (left.raceId===right.raceId?left.place!-right.place!:left.race.number-right.race.number || left.race.checkedInAt.localeCompare(right.race.checkedInAt) || left.raceId.localeCompare(right.raceId)));
  const ties=eventTies(finished,band.highlightCount,state.event.format,state.tieSettlements);
  for(const [index,row] of finished.entries()) {
    row.position=index+1;row.highlighted=index<band.highlightCount;
    if(state.event.format==='heats' && index<6) row.qualification='Q';
    if(state.event.format==='timed' && index<3) row.medalPlace=(index+1) as 1|2|3;
  }
  const leaderboard=[...finished,...didNotFinish,...disqualified,...notCounted];
  const final=state.event.format==='heats'?finalResults(state,leaderboard):null;
  if(final) for(const row of actionableRunners.filter(row=>row.raceId===final.raceId)) {
    const ranked=final.leaderboard.find(other=>other.entryId===row.entryId);
    if(ranked) {delete row.recordingPending;Object.assign(row,ranked);}
  }
  const needsYou=eventLeadItems(state,actionableRunners,ties);
  const heatsSheet=state.event.format==='heats'?heatsCheckSheet(state,leaderboard,ties,notRankedYet,final,needsYou):null;
  const checkSheet=state.event.format==='timed'?timedCheckSheet(state,leaderboard,ties,notRankedYet,needsYou):heatsSheet?.completed||final?.hasRun?finalCheckSheet(state,final,needsYou):heatsSheet;
  const complete=checkSheet?.stage!=='heats' && (checkSheet?.completed??false);
  const inputRunning=complete?{eventCode:state.event.code,first:checkSheet!.creates[0].wristband,second:checkSheet!.creates[1].wristband,third:checkSheet!.creates[2].wristband}:null;
  return {finalRecords:finalRecords(state),allResults:resultRecords(state,publishedRows,recordingReasons),heatsCheckSheet:heatsSheet,finalResults:final,checkSheet,inputRunning,leaderboard,actionableRunners,qualifiers:state.event.format==='heats'?finished.slice(0,6):[],medalPlaces:state.event.format==='timed'?finished.slice(0,3):final?.leaderboard.filter(row=>row.medalPlace!==null)||[],ties,notRankedYet,needsYou,band,status:complete?'Complete':heatsSheet?.completed?'Heats complete - final to run':active.length?'In progress - provisional':'Not started',raceCount:active.length,provisional:!complete};
}
