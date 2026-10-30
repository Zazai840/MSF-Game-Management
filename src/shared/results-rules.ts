import { resultRecords,finalRecords,type ResultRecord,type FinalRecord } from './result-records.js';
import { finalResults,type FinalField,type FinalResults } from './finals.js';
import { timedCheckSheet,heatsCheckSheet,noFinalCheckSheet,finalCheckSheet,type Stage,type StageCheckSheet,type InputRunning } from './stages.js';
import { eventLeadItems } from './lead-items.js';
import { leaderboardRowFacts,resultEntry } from './leaderboard-row.js';
import type { WristbandWarning } from './wristband-checks.js';
import type { RelayTeam,TeamList,TeamWarning } from './teams.js';
import type { FinishingOrder,RaceEntry } from './races.js';
import type { AuditNote,CheckedBy,RunnerRuling,Disqualification } from './rulings.js';
import type { RaceTimes } from './time-entry.js';
import { notCountedReasons } from './race-counts.js';
import { eventTies,type TieSettlement } from './ties.js';
export type Section = 'Boy Beavers' | 'Girl Beavers' | 'Boy Cubs' | 'Girl Cubs' | 'Boy Scouts' | 'Girl Scouts';
export interface Event { code:string; name:string; section:Section; format:'heats'|'timed' }
export interface RaceReference { id:string; kind:'heat'|'final'|'race'; number:number; checkedInAt:string }
/** Complete, persisted facts for one race. Versions and storage details do not affect ranking. */
export interface ResultsRace extends RaceReference { deleted:boolean;
  /** Saved once every step is done: only a saved race counts. */
  saved:boolean; leadTimes?:Partial<Record<'runners'|'finish'|'times'|`warning:${string}`|`added:${string}`,string>>; runners:readonly RaceEntry[]; finish:FinishingOrder|null; times:RaceTimes|null; final?:FinalField }
export interface EventState { event:Event; races:readonly ResultsRace[]; rulings?:readonly RunnerRuling[]; auditNotes?:readonly AuditNote[]; tieSettlements?:readonly TieSettlement[]; completedStages?:readonly Stage[];
  /** On a relay: the day's switched-on relays' team lists, for "A child is in two relays". */
  relays?:ReadonlyArray<Pick<TeamList,'code'|'section'> & {teams:ReadonlyArray<Pick<RelayTeam,'number'|'legs'>>}> }
/** What a warning flag is about: a child's wristband, a child in two relays (`other-relay`), or a team that ran short. */
export type WarningKind=WristbandWarning['kind']|TeamWarning['kind']|'ran-short';
/** A warning on a result as a lead checks it: its kind and its message. */
export interface ResultWarning { kind:WarningKind; message:string }
/** `checked` is whether it is settled; `checkedBy` names the lead's check, `settledByDisqualification` a disqualification that settled it instead. */
export interface ResultFlag { kind:'warning'|'ran-twice'|'added-at-finish'|'tie'|'tie-settled'; message:string; warningKind?:WarningKind; checked?:boolean; checkedBy?:CheckedBy; settledByDisqualification?:true }

/** A relay team a result belongs to: its number and the four children who ran in that race, in leg order. */
export interface ResultTeam { id:string; number:number; wristbands:Array<number|null> }
/** Whose result it is: a child by wristband, or on a relay a team (with no wristband of its own). */
export interface ResultEntry { raceId:string; entryId:string; wristband:number|null; team?:ResultTeam }
/** The same child, or the same relay team, across an event's races. */
export const resultHolder=(entry:Pick<ResultEntry,'wristband'|'team'>)=>entry.team?`team:${entry.team.id}`:`wristband:${entry.wristband}`;
/** A result as a lead names it in a message: "2001", or "Team 3". */
export const resultName=(entry:Pick<ResultEntry,'wristband'|'team'>)=>entry.team?`Team ${entry.team.number}`:String(entry.wristband);
export interface LeaderboardRow extends ResultEntry {
  race:RaceReference; recordingPending?:true; position:number|null; place:number|null; time:number|null; status:'Finished'|'Did not finish'|'Disqualified'|'Not counted'|'Pending'; notCounted:boolean; disqualification:Disqualification|null;
  /** The result's audit notes (see resultAuditNotes; its Notes are resultNotes); `hasNote` is its note badge (see hasNotes). */
  notes:AuditNote[]; hasNote:boolean;
  highlighted:boolean; qualification:'Q'|null; medalPlace:1|2|3|null; flags:ResultFlag[];
}
export type NotRankedReason='in progress'|'checked in'|'awaiting finishing order'|'awaiting times'|'times out of order'|"finishers and times don't agree";
export interface NotRankedRace { race:RaceReference; reasons:NotRankedReason[] }
/** Later rulings extend these typed derivatives at the same eventResults seam. */
export interface ResultTie { id:string; time:number; entries:ResultEntry[]; impact:string }
/**
 * A lead queue item. `message` is v1's terse line; the optional facts beside it let the
 * To check list explain the item in plain English (see src/shared/to-check.ts).
 */
export interface LeadItem {
  id:string; kind:'warning'|'two-relays'|'ran-short'|'ran-twice'|'added-at-finish'|'times-out-of-order'|'tie'; raceId?:string; entryId?:string; tieId?:string; at:string; message:string;
  wristband?:number; warningKinds?:WarningKind[];
  /** On a relay: the team's number, and its children's warnings as the lead reads them. */
  team?:number; warnings?:string[];
  wrongTime?:{ place:number; time:number; earlierPlace:number; earlierTime:number };
  /** The tied children's wristbands, or teams ("Team 3"), and on a relay the tied teams with their four children. */
  /** A tie's time and names, its relay teams, and the races it is between (it shows on each one's step). */
  tie?:{ time:number; names:string[]; raceIds:string[]; teams?:ResultTeam[] };
}
export interface ResultsBand { highlightCount:number; lineAfter:number; lineLabel:'Qualifying line'|'Medal line' }
export interface EventResults {
  allResults:ResultRecord[]; finalRecords:FinalRecord[]; leaderboard:LeaderboardRow[]; actionableRunners:LeaderboardRow[]; qualifiers:LeaderboardRow[]; medalPlaces:LeaderboardRow[];
  ties:ResultTie[]; notRankedYet:NotRankedRace[]; needsYou:LeadItem[]; band:ResultsBand;
  checkSheet:StageCheckSheet|null; heatsCheckSheet:StageCheckSheet|null; finalResults:FinalResults|null; inputRunning:InputRunning|null;
  /** Results without a final while a lead may choose it, with the ties it must settle judged against medal places; once chosen, `checkSheet` is that sheet. */
  noFinalCheckSheet:StageCheckSheet|null; noFinalTies:ResultTie[]; decidedWithoutFinal:boolean;
  status:'Not started'|'In progress - provisional'|'Heats complete - final to run'|'Complete'; raceCount:number; provisional:boolean;
}
/** One event's results are recomputed from facts. Callers never sort or assign positions. */
export function eventResults(state:EventState):EventResults {
  const allActive=state.races.filter(race=>!race.deleted);
  const active=allActive.filter(race=>race.kind!=='final');
  // A heats event decided without a final is ranked as a timed event: medal line, medal marks, no final.
  const decidedWithoutFinal=state.event.format==='heats' && (state.completedStages?.includes('no-final')??false);
  const rankedAs=decidedWithoutFinal?'timed':state.event.format;
  const band:ResultsBand=rankedAs==='heats'?{highlightCount:8,lineAfter:6,lineLabel:'Qualifying line'}:{highlightCount:6,lineAfter:3,lineLabel:'Medal line'};
  const publishedRows:LeaderboardRow[]=[],actionableRunners:LeaderboardRow[]=[];
  const recordingReasons=new Map<string,NotRankedReason[]>();
  const finished:LeaderboardRow[]=[],didNotFinish:LeaderboardRow[]=[],disqualified:LeaderboardRow[]=[],notCounted:LeaderboardRow[]=[],notRankedYet:NotRankedRace[]=[];
  const reference=(race:ResultsRace):RaceReference=>({id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt});
  // Ran twice counts saved races only, as To check does.
  const appearances=new Map<string,Set<string>>();
  for(const race of active.filter(race=>race.saved)) for(const runner of race.runners) {
    const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
    if(ruling?.disqualification || ruling?.notCounted) continue;
    const holder=resultHolder(resultEntry(race,runner)),races=appearances.get(holder)||new Set<string>();races.add(race.id);appearances.set(holder,races);
  }
  for(const race of state.races) {
    const reasons=notCountedReasons(race);
    recordingReasons.set(race.id,reasons);
    if(reasons.length && !race.deleted && race.kind!=='final') notRankedYet.push({race:reference(race),reasons});
    for(const runner of race.runners) {
      const index=race.finish?.order.indexOf(runner.id)??-1,isFinisher=index>=0;
      const ruling=state.rulings?.find(ruling=>ruling.raceId===race.id && ruling.entryId===runner.id);
      const repeated=!race.deleted && race.saved && race.kind!=='final' && !ruling?.disqualification && !ruling?.notCounted && (appearances.get(resultHolder(resultEntry(race,runner)))?.size||0)>1;
      const row:LeaderboardRow={...leaderboardRowFacts(state,race,runner,ruling,repeated),place:isFinisher?index+1:null,time:isFinisher?race.times?.places[index]??null:null,status:reasons.length?'Pending':isFinisher?'Finished':'Did not finish',...(reasons.length?{recordingPending:true as const}:{})};
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
  const ties=eventTies(finished,band.highlightCount,rankedAs,state.tieSettlements);
  for(const [index,row] of finished.entries()) {
    row.position=index+1;row.highlighted=index<band.highlightCount;
    if(rankedAs==='heats' && index<6) row.qualification='Q';
    if(rankedAs==='timed' && index<3) row.medalPlace=(index+1) as 1|2|3;
  }
  const leaderboard=[...finished,...didNotFinish,...disqualified,...notCounted];
  const final=rankedAs==='heats'?finalResults(state,leaderboard):null;
  if(final) for(const row of actionableRunners.filter(row=>row.raceId===final.raceId)) {
    const ranked=final.leaderboard.find(other=>other.entryId===row.entryId);
    if(ranked) {delete row.recordingPending;Object.assign(row,ranked);}
  }
  const needsYou=eventLeadItems(state,actionableRunners,ties);
  const heatsSheet=rankedAs==='heats'?heatsCheckSheet(state,leaderboard,ties,notRankedYet,final,needsYou):null;
  // Offered once a heat is ranked, until a volunteer starts the final; judged on a copy of the rows seen as a timed event's, so a tie settled for qualifying comes back when it decides a medal.
  const noFinalOffered=heatsSheet!==null && !final?.started && finished.length>0;
  const medalRows=noFinalOffered?finished.map((row,index)=>({...row,highlighted:index<6,flags:[...row.flags]})):[];
  const noFinalTies=noFinalOffered?eventTies(medalRows,6,'timed',state.tieSettlements):[];
  const noFinalSheet=noFinalOffered?noFinalCheckSheet(state,medalRows,noFinalTies,notRankedYet,needsYou):null;
  const checkSheet=decidedWithoutFinal?noFinalCheckSheet(state,leaderboard,ties,notRankedYet,needsYou):rankedAs==='timed'?timedCheckSheet(state,leaderboard,ties,notRankedYet,needsYou):heatsSheet?.completed||final?.hasRun?finalCheckSheet(state,final,needsYou):heatsSheet;
  const complete=checkSheet?.stage!=='heats' && (checkSheet?.completed??false);
  const podium=checkSheet?.creates.slice(0,3)||[];
  const inputRunning=complete?{eventCode:state.event.code,first:podium[0].wristband,second:podium[1].wristband,third:podium[2].wristband,...(podium.some(place=>place.team)?{teams:podium.map(place=>place.team??null)}:{})}:null;
  return {finalRecords:finalRecords(state),allResults:resultRecords(state,publishedRows,recordingReasons),heatsCheckSheet:heatsSheet,noFinalCheckSheet:noFinalSheet,noFinalTies,decidedWithoutFinal,finalResults:final,checkSheet,inputRunning,leaderboard,actionableRunners,qualifiers:rankedAs==='heats'?finished.slice(0,6):[],medalPlaces:rankedAs==='timed'?finished.slice(0,3):final?.leaderboard.filter(row=>row.medalPlace!==null)||[],ties,notRankedYet,needsYou,band,status:complete?'Complete':heatsSheet?.completed?'Heats complete - final to run':active.length?'In progress - provisional':'Not started',raceCount:active.length,provisional:!complete};
}
