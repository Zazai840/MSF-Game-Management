import { runnerWarningFlags } from './runner-rulings.js';
import type { WristbandWarning } from './wristband-checks.js';
import type { FinishingOrder,Runner } from './races.js';
import type { AuditNote,RunnerRuling,Disqualification } from './rulings.js';
import type { RaceTimes } from './time-entry.js';
import { timesOutOfOrder } from './time-entry.js';
import { eventTies,type TieSettlement } from './ties.js';
import { formatTime } from './time-entry.js';
export type Section = 'Boy Beavers' | 'Girl Beavers' | 'Boy Cubs' | 'Girl Cubs' | 'Boy Scouts' | 'Girl Scouts';
export interface Event { code:string; name:string; section:Section; format:'heats'|'timed' }
export interface RaceReference { id:string; kind:'heat'|'final'|'race'; number:number; checkedInAt:string }
/** Complete, persisted facts for one race. Versions and storage details do not affect ranking. */
export interface ResultsRace extends RaceReference { deleted:boolean; runners:readonly Runner[]; finish:FinishingOrder|null; times:RaceTimes|null }
export interface EventState { event:Event; races:readonly ResultsRace[]; rulings?:readonly RunnerRuling[]; auditNotes?:readonly AuditNote[]; tieSettlements?:readonly TieSettlement[] }
export interface ResultFlag { kind:'warning'|'ran-twice'|'added-at-finish'|'tie'|'tie-settled'; message:string; warningKind?:WristbandWarning['kind']; checked?:boolean }
export interface ResultEntry { raceId:string; entryId:string; wristband:number }
export interface LeaderboardRow extends ResultEntry {
  race:RaceReference; position:number|null; place:number|null; time:number|null; status:'Finished'|'Did not finish'|'Disqualified'|'Not counted'; notCounted:boolean; disqualification:Disqualification|null; hasNote:boolean;
  highlighted:boolean; qualification:'Q'|null; medalPlace:1|2|3|null; flags:ResultFlag[];
}
export type NotRankedReason='checked in'|'awaiting finishing order'|'awaiting times'|'times out of order'|"finishers and times don't agree";
export interface NotRankedRace { race:RaceReference; reasons:NotRankedReason[] }
/** Later rulings extend these typed derivatives at the same eventResults seam. */
export interface ResultTie { id:string; time:number; entries:ResultEntry[]; impact:string }
export interface LeadItem { id:string; kind:'warning'|'ran-twice'|'added-at-finish'|'times-out-of-order'|'clash'|'tie'; raceId?:string; entryId?:string; message:string }
export interface ResultsBand { highlightCount:number; lineAfter:number; lineLabel:'Qualifying line'|'Medal line' }
export interface EventResults {
  leaderboard:LeaderboardRow[]; qualifiers:LeaderboardRow[]; medalPlaces:LeaderboardRow[];
  ties:ResultTie[]; notRankedYet:NotRankedRace[]; needsYou:LeadItem[]; band:ResultsBand;
  status:'Not started'|'In progress - provisional'; raceCount:number; provisional:boolean;
}
/** One event's results are recomputed from facts. Callers never sort or assign positions. */
export function eventResults(state:EventState):EventResults {
  const active=state.races.filter(race=>!race.deleted && race.kind!=='final');
  const band:ResultsBand=state.event.format==='heats'?{highlightCount:8,lineAfter:6,lineLabel:'Qualifying line'}:{highlightCount:6,lineAfter:3,lineLabel:'Medal line'};
  const finished:LeaderboardRow[]=[],didNotFinish:LeaderboardRow[]=[],disqualified:LeaderboardRow[]=[],notCounted:LeaderboardRow[]=[],notRankedYet:NotRankedRace[]=[];
  const reference=(race:ResultsRace):RaceReference=>({id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt});
  const appearances=new Map<number,Set<string>>();
  for(const race of active) for(const runner of race.runners) {
    const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
    if(ruling?.disqualification || ruling?.notCounted) continue;
    const races=appearances.get(runner.wristband)||new Set<string>();races.add(race.id);appearances.set(runner.wristband,races);
  }
  for(const race of active) {
    const reasons:NotRankedReason[]=[];
    if(!race.finish) reasons.push(race.times?'awaiting finishing order':'checked in');
    if(race.finish && !race.times) reasons.push('awaiting times');
    if(race.times && timesOutOfOrder(race.times.places) && race.times.acceptedByLead!==true) reasons.push('times out of order');
    if(race.finish && race.times && race.finish.order.length!==race.times.places.filter(time=>time!==null).length) reasons.push("finishers and times don't agree");
    if(reasons.length) {notRankedYet.push({race:reference(race),reasons});continue;}
    if(!race.finish || !race.times) continue;
    for(const runner of race.runners) {
      const index=race.finish.order.indexOf(runner.id),isFinisher=index>=0;
      const row:LeaderboardRow={raceId:race.id,entryId:runner.id,wristband:runner.wristband,race:reference(race),position:null,place:isFinisher?index+1:null,time:isFinisher?race.times.places[index]??null:null,status:isFinisher?'Finished':'Did not finish',disqualification:null,notCounted:false,hasNote:false,highlighted:false,qualification:null,medalPlace:null,flags:[]};
      const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
      row.disqualification=ruling?.disqualification??null;row.notCounted=ruling?.notCounted??false;
      row.hasNote=!!state.auditNotes?.some(note=>note.touches.some(touch=>touch.raceId===race.id && (!touch.entryId || touch.entryId===runner.id)));
      const repeated=!row.disqualification && !row.notCounted && (appearances.get(runner.wristband)?.size||0)>1;
      row.flags=runnerWarningFlags(runner,ruling,repeated);
      if(repeated) row.flags.push({kind:'ran-twice',message:'Ran twice in this event'});
      if(runner.addedAtFinish) row.flags.push({kind:'added-at-finish',message:'Added at the finish'});
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
  return {leaderboard,qualifiers:state.event.format==='heats'?finished.slice(0,6):[],medalPlaces:state.event.format==='timed'?finished.slice(0,3):[],ties,notRankedYet,needsYou:ties.map(tie=>({id:`tie:${tie.id}`,kind:'tie',message:`Tie at ${formatTime(tie.time)}: ${tie.entries.map(entry=>entry.wristband).join(', ')}`})),band,status:active.length?'In progress - provisional':'Not started',raceCount:active.length,provisional:true};
}
