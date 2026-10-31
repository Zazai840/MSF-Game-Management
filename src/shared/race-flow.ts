import type { DayEvent } from './day.js';
import type { DayLeadItem } from './lead-results.js';
import { ordinal } from './ordinal.js';
import { entryName,type FinishingOrder,type RaceEntry,type RacePartName,type RaceRead,type RaceState } from './races.js';
import type { NotRankedReason } from './results-rules.js';
import { entryCount,entryNoun,entryWord,type RelayTeam,type TeamList } from './teams.js';
import { issueLine } from './to-check.js';
import { wrongTimes } from './wrong-times.js';
/**
 * The race flow (docs/running-zone-design-system/race-flow.md): Home lists event groups, each with its races, and a
 * person does the one step their role names on a race. A step is one of the race's parts: Runners (check-in), Finishing order
 * and Times. Relays run in it too, a relay's teams typed in its teams sheet.
 */
export const steps=['runners','positions','times'] as const;
export type Step=typeof steps[number];
export const stepParts:Record<Step,RacePartName>={runners:'runners',positions:'finish',times:'times'};
export const stepLabels:Record<Step,string>={runners:'Runners',positions:'Finishing order',times:'Times'};
/** A final has no times: it is decided by the finishing order. */
export const stepsOf=(race:Pick<RaceRead,'kind'>):readonly Step[]=>race.kind==='final'?['runners','positions']:steps;
/** A person's role, kept on their phone: one volunteer step, or Zone lead, who sees every step. */
export const roles=['start','finish','timer','lead'] as const;
export type Role=typeof roles[number];
export const roleLabels:Record<Role,string>={start:'Start line',finish:'Finish line',timer:'Timer',lead:'Lead'};
export const roleSteps:Record<Exclude<Role,'lead'>,Step>={start:'runners',finish:'positions',timer:'times'};
/** A heat usually has 6 runners (6 lanes; the 60m final takes the fastest 6). Only Races-tab events warn past it. */
export const usualRunnersPerRace=6;
export const usualSizeApplies=(event:Pick<DayEvent,'type'>)=>event.type==='races';
/** Every run is "Heat n", whatever its event format; an event has one final. */
export const raceName=(race:Pick<RaceRead,'kind'|'number'>)=>race.kind==='final'?'Final':`Heat ${race.number}`;
export const chipName=(race:Pick<RaceRead,'kind'|'number'>)=>race.kind==='final'?'F':`H${race.number}`;
/** "Sam", "Sam and Jo", "Sam, Priya and Jo". */
export const andList=(names:readonly string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
/** A finishing order keeping only the race's runners: anyone taken off drops out, and later places move up. */
export function onlyRunners(finish:FinishingOrder,runners:readonly RaceEntry[]):FinishingOrder {
  const on=(id:string)=>runners.some(runner=>runner.id===id);
  return {order:finish.order.filter(on),didNotFinish:finish.didNotFinish.filter(on)};
}
/**
 * Why a race whose steps are all done does not save itself yet, or null: nobody checked in (on a relay, no team in it;
 * on a final, everyone Absent), a runner or team with no place (nor Did not finish), a placed runner with no time, a
 * time at a place with no runner (left when a runner came off the order), or a wrong time neither kept nor retyped.
 * Kept wristband warnings, and relay teams short of four here, never block it.
 */
export function stepBlocker(race:Pick<RaceRead,'kind'|'parts'>,relay=false):string|null {
  const runners=race.parts.runners.value||[],finish=race.parts.finish.value;
  if(!runners.length) return race.kind==='final'?(relay?'Every team is marked Absent':'Everyone is marked Absent'):relay?'No team is ticked yet':'Nobody is checked in yet';
  const unplaced=runners.filter(runner=>!finish?.order.includes(runner.id) && !finish?.didNotFinish.includes(runner.id));
  if(unplaced.length) return unplaced.length===1?`${entryName(unplaced[0])} has no place yet`:`${unplaced.length} ${entryNoun(relay)}s have no place yet`;
  if(race.kind==='final') return null;
  const times=race.parts.times.value,places=times?.places||[];
  const untimed=finish!.order.findIndex((_,index)=>places[index]==null);
  if(untimed>=0) return `Place ${untimed+1} has no time`;
  // Finishers and times disagree only after a lead's correction, never on a saved race.
  const surplus=places.findIndex((time,index)=>index>=finish!.order.length && time!=null);
  if(surplus>=0) return `${ordinal(surplus+1)} place has a time but no ${entryWord(relay)}`;
  const wrong=wrongTimes(places).find(item=>!times!.keptWrong?.includes(item.index));
  return wrong?`${ordinal(wrong.index+1)} place's time needs Fix time or Keep`:null;
}
/** Who last changed a step and when, and who marked it done and when. */
export interface StepMeta { version:number; by:string|null; at:string|null; doneBy:string|null; doneAt:string|null }
/**
 * One step's status on one race. `count` is what has been entered (runners checked in, runners placed or Did not
 * finish, places timed) and `expected` what it would be when complete, or null when nothing says (Runners). Times
 * expects the finishers once Finishing order is done, before that every runner. Finishing order also counts its Did not finish.
 */
export interface StepStatus extends StepMeta { state:'not started'|'in progress'|'done'; count:number; expected:number|null; didNotFinish?:number }
const noMeta:StepMeta={version:0,by:null,at:null,doneBy:null,doneAt:null};
export function stepStatus(race:Pick<RaceRead,'parts'>,step:Step,meta:Partial<Record<RacePartName,StepMeta>>={}):StepStatus {
  const runners=race.parts.runners.value||[],finish=race.parts.finish.value,places=race.parts.times.value?.places||[];
  const placed=finish?.order.length||0,didNotFinish=finish?.didNotFinish.length||0,own=meta[stepParts[step]]??noMeta;
  const [count,expected]=step==='runners'?[runners.length,null]
    :step==='positions'?[placed+didNotFinish,runners.length]
    :[places.filter(time=>time!==null).length,meta.finish?.doneAt?placed:Math.max(runners.length,placed)];
  return {...own,state:own.doneAt?'done':count>0?'in progress':'not started',count,expected,...(step==='positions'?{didNotFinish}:{})};
}
/** A saved finishing order in words: "10 finished · 1 did not finish". */
export const finishedCount=(status:StepStatus)=>`${status.count-(status.didNotFinish||0)} finished`;
export const finishedWords=(status:StepStatus)=>`${finishedCount(status)}${status.didNotFinish?` · ${status.didNotFinish} did not finish`:''}`;
/** A race as Home lists it: its name, state, when it was made and last changed, and each of its steps. */
export interface RaceSummary { id:string; kind:RaceRead['kind']; number:number; state:RaceState; createdAt:string; updatedAt:string; steps:Partial<Record<Step,StepStatus>> }
/** Why making the final would be refused: the race it is about, the step to fix it on (none: Results on the event), and the line. */
export interface FinalReason { raceId:string; step:Step|null; line:string }
/**
 * What holds the final up, from the heats check sheet's first item: a runner who ran twice (`name` is theirs), a tie,
 * or why the heat is not ranked yet (`name` is the heat's). "Heat 1 has a time to check first".
 */
export function finalHold(kind:'ran-twice'|'tie'|NotRankedReason|undefined,name:string):Omit<FinalReason,'raceId'> {
  if(kind==='ran-twice') return {step:null,line:`${name} ran twice: choose which result counts first`};
  if(kind==='tie') return {step:'times',line:`${name} has a tie to settle first`};
  if(kind==='times out of order' || kind==="finishers and times don't agree") return {step:'times',line:`${name} has a time to check first`};
  if(kind==='awaiting times') return {step:'times',line:`${name} needs its times first`};
  if(kind==='awaiting finishing order' || kind==='checked in') return {step:'positions',line:`${name} needs its finishing order first`};
  return {step:null,line:`${name} is not saved yet`};
}
/**
 * An event group: one event × one section, with its races in order. `nextHeat` is the number "+" makes, and
 * `finalAvailable` says "+ Final" can be tapped: a heats event with no final yet, every heat with runners saved.
 * `finalReason`, while `finalAvailable`, is the first thing the heats check would refuse the final for.
 * `heatsOpen` is whether a new heat can be made: false once its heats (a timed event: the event) are complete.
 * `medalsDecided` is whether a lead has decided its medals: Event complete, Final complete or Results without a final.
 * `medalsWaiting` is the lead's Confirm the medals waits on, while every race so far is saved and the medals are not
 * decided: Final complete once the final is saved, or Event complete on a timed event; `since` is its last race's save.
 * A relay's group also carries its team list (the teams sheet's) and `nextTeam`, the number New team takes.
 */
export interface RaceGroup { event:DayEvent; races:RaceSummary[]; nextHeat:number; finalAvailable:boolean; finalReason:FinalReason|null; heatsOpen:boolean; medalsDecided:boolean;
  medalsWaiting:{stage:'final'|'event';since:string}|null; updatedAt:string; teams?:RelayTeam[]; nextTeam?:number }
/** The races list, versioned by the day revision: every switched-on event, in programme order. */
export interface RacesRead { revision:number; groups:RaceGroup[] }
/** One race in the flow, with its group (for the heat chips) and its steps; a relay's race also its team list, for check-in. */
export interface RaceFlowRead { revision:number; group:RaceGroup; race:RaceRead; steps:Partial<Record<Step,StepStatus>>; teams?:RelayTeam[]; relays?:TeamList[] }
/** Whether a step on this race can be worked on now: the race is not saved, the step not done, and for Finishing order and Times someone is in the race. */
export function workable(race:Pick<RaceSummary,'state'|'steps'>,step:Step) {
  const status=race.steps[step];
  if(!status || race.state==='saved' || status.state==='done') return false;
  return step==='runners' || (race.steps.runners?.count||0)>0;
}
/** A group is done once its medals are decided; until then it stays in progress, even with every race saved. */
export const groupDone=(group:Pick<RaceGroup,'medalsDecided'>)=>group.medalsDecided;
/** Whether an event group's final is made: New race then opens it, and nobody makes another. */
export const finalMade=(group:{races:readonly Pick<RaceSummary,'kind'>[]})=>group.races.some(race=>race.kind==='final');
/** A relay with teams and no heats yet: listed under Teams ready, no heats yet, after In progress. */
const teamsReady=(groups:readonly RaceGroup[])=>groups.filter(group=>!group.races.length && group.teams?.length);
/**
 * Home's sections for a volunteer role: Ready for you (a race whose step for the role can be worked on now, the
 * group whose oldest such race was made first coming first), In progress (every other group not done, most recently
 * updated first), Teams ready (a relay with teams and no heats) and Done. Any other group with no races is not
 * listed: New race makes its first.
 */
export function raceSections(groups:readonly RaceGroup[],role:Exclude<Role,'lead'>) {
  const step=roleSteps[role],listed=groups.filter(group=>group.races.length);
  const waitingSince=(group:RaceGroup)=>group.races.filter(race=>workable(race,step)).map(race=>race.createdAt).sort()[0];
  const ready=listed.filter(waitingSince).sort((a,b)=>waitingSince(a).localeCompare(waitingSince(b)));
  const newest=(a:RaceGroup,b:RaceGroup)=>b.updatedAt.localeCompare(a.updatedAt);
  const rest=listed.filter(group=>!ready.includes(group));
  return {ready,inProgress:rest.filter(group=>!groupDone(group)).sort(newest),teamsReady:teamsReady(groups),done:rest.filter(groupDone).sort(newest)};
}
/** A race nobody is in yet, on its finish line and as That's everyone's refusal: on a final, nobody is marked Here yet. */
export const emptyRaceLine=(race:{kind:RaceRead['kind'];event:{relay:boolean}})=>race.kind==='final'?(race.event.relay?'No team is marked Here yet':'Nobody is marked Here yet'):race.event.relay?'No team is in this heat yet':'Nobody is checked in yet';
/**
 * Why a step cannot be marked done yet, or null: Runners needs someone checked in (on a final, someone Here),
 * Finishing order needs every runner placed or Did not finish, and Times every wrong time kept or retyped (no time at all is
 * a heat nobody finished).
 */
export function doneBlocker(race:Pick<RaceRead,'kind'|'parts'|'event'>,step:Step):string|null {
  const runners:RaceEntry[]=race.parts.runners.value||[],finish=race.parts.finish.value,relay=race.event.relay;
  if(!runners.length) return emptyRaceLine(race);
  if(step==='positions') {
    const unplaced=runners.filter(runner=>!finish?.order.includes(runner.id) && !finish?.didNotFinish.includes(runner.id));
    return !unplaced.length?null:unplaced.length===1?`${entryName(unplaced[0])} has no place yet`:`${entryCount(unplaced.length,relay)} have no place yet`;
  }
  if(step==='times') {
    const times=race.parts.times.value;
    const wrong=wrongTimes(times?.places||[]).find(item=>!times!.keptWrong?.includes(item.index));
    if(wrong) return `${ordinal(wrong.index+1)} place's time needs Fix time or Keep`;
  }
  return null;
}
/** What a step needs ("Heat 3 needs times") and what it says once done but the race not saved ("Heat 3 checked in"). */
const stepNeeds:Record<Step,string>={runners:'runners',positions:'the finishing order',times:'times'};
const stepDone:Record<Step,string>={runners:'checked in',positions:'order saved',times:'timed'};
/** "Heat 3", "Heats 3 and 4", "Heats 1 and 2 and the final", "The final": the final is never counted as a heat. */
export function heatList(races:readonly Pick<RaceSummary,'kind'|'number'>[]) {
  const heats=races.filter(race=>race.kind!=='final'),named=heats.length?`${heats.length>1?'Heats':'Heat'} ${andList(heats.map(race=>String(race.number)))}`:'';
  return races.some(race=>race.kind==='final')?named?`${named} and the final`:'The final':named;
}
/**
 * A race's state in the viewer's step, and where it comes on a card: what waits for them (0), their step done or, for a
 * lead, the race in progress (1), the race saved (2), then a race still with others (3). `joins` is how a card line
 * puts it after the races: "Heats 3 and 4 need times", "Heat 2 is waiting", "Heat 1 checked in", "The final: check who is here".
 */
type RaceWord={rank:number} & ({joins:'needs';what:string}|{joins:'is';what:'waiting'|'checking in'}|{joins:'reads';what:string}|{joins:'final check'});
function raceWord(race:Pick<RaceSummary,'kind'|'state'|'steps'>,role:Role):RaceWord {
  if(role==='lead') return race.state==='saved'?{joins:'reads',what:'saved',rank:2}:chipState(race,role)==='ready'?{joins:'needs',what:'a lead',rank:0}:{joins:'reads',what:'in progress',rank:1};
  if(race.state==='saved') return {joins:'reads',what:'done',rank:2};
  const step=roleSteps[role],status=race.steps[step];
  if(status?.state==='done') return {joins:'reads',what:stepDone[step],rank:1};
  if(status && workable(race,step)) return race.kind==='final' && step==='runners'?{joins:'final check',rank:0}:{joins:'needs',what:stepNeeds[step],rank:0};
  return {joins:'is',what:race.steps.runners?.state==='done'?'waiting':'checking in',rank:3};
}
/** A race's word on its own, as its chip says it: "needs times", "waiting", "checked in", "check who is here". */
const wordText=(word:RaceWord)=>word.joins==='final check'?'check who is here':word.joins==='needs'?`needs ${word.what}`:word.what;
/**
 * A heat chip's state for a viewer: done (their step done or not on this race, or the race saved), ready (their step
 * can be worked on now; for a lead, every step done but the race not saved, so it waits for them) or waiting.
 */
export function chipState(race:Pick<RaceSummary,'state'|'steps'>,role:Role):'done'|'ready'|'waiting' {
  if(race.state==='saved') return 'done';
  if(role!=='lead' && (race.steps[roleSteps[role]]?.state??'done')==='done') return 'done';
  if(role==='lead') return Object.values(race.steps).every(step=>step?.state==='done')?'ready':'waiting';
  return workable(race,roleSteps[role])?'ready':'waiting';
}
/** A heat chip's name in words, so its state never rests on colour alone: "Heat 3, needs times", "Heat 1, checked in". */
export const chipLabel=(race:Pick<RaceSummary,'kind'|'number'|'state'|'steps'>,role:Role)=>`${raceName(race)}, ${wordText(raceWord(race,role))}`;
/**
 * A race card's status line, each race's state in the viewer's step: "Heats 3 and 4 need times · Heats 1 and 2 done",
 * "Heat 1 checked in · Heat 2 is checking in", "Heats 1 and 2 and the final done", "The final: check who is here".
 */
export function groupStatus(group:Pick<RaceGroup,'races'>,role:Role) {
  const words=group.races.map(race=>raceWord(race,role)),texts=words.map(wordText);
  return [...new Map(words.map((word,index)=>[texts[index],word])).entries()].sort(([,a],[,b])=>a.rank-b.rank).map(([text,word])=>{
    const races=group.races.filter((_,index)=>texts[index]===text),list=heatList(races),many=races.length>1;
    if(word.joins==='final check') return `${list}: ${text}`;
    if(word.joins==='needs') return `${list} ${many?'need':'needs'} ${word.what}`;
    if(word.joins==='is') return `${list} ${many?'are':'is'} ${word.what}`;
    return `${list} ${word.what}`;
  }).join(' · ');
}
type FinalGroup=Pick<RaceGroup,'event'|'races'|'heatsOpen'>;
/** Heats still running towards a final: a heats event whose heats are not complete (no final made, no results without one). */
const heatsRunning=(group:FinalGroup)=>group.event.format==='heats' && group.heatsOpen;
const savedHeats=(group:FinalGroup)=>group.races.filter(race=>race.kind!=='final' && race.state==='saved');
/** Under a volunteer's chips while heats run: who makes the final, and when. */
export const volunteerFinalLine=(group:FinalGroup)=>heatsRunning(group)?'A lead makes the final once every heat has run.':null;
/** A lead's card while heats run, once a heat is saved and nothing waits: "Heat 2 saved · make the final once every heat has run". */
export const leadFinalLine=(group:FinalGroup)=>heatsRunning(group) && savedHeats(group).length?`${groupStatus(group,'lead')} · make the final once every heat has run`:null;
/** New race in place of Create heat, once a section's heats are complete (its final made, or results without one). */
const finishedLine=(section:string,final:boolean,ask:string)=>`${section} ${final?'final is':'heats are'} finished. Ask a lead to ${ask}.`;
export const heatsFinishedLine=(group:Pick<RaceGroup,'event'>)=>finishedLine(group.event.section,false,'add another heat');
/** A race whose stage is complete, on its screen and in the refusal of its writes: "Girl Cubs heats are finished. Ask a lead to change this race." */
export const raceFinishedLine=(race:{kind:string;event:Pick<RaceGroup['event'],'section'>})=>finishedLine(race.event.section,race.kind==='final','change this race');
/** A relay whose heats are complete, in the refusal of its team writes. */
export const teamsFinishedLine=(relay:{section:string})=>finishedLine(relay.section,false,'change the teams');
/** The sheet "+ Final" opens: the heat count to check against what the lead saw, and that the heats end. */
export function finalConfirm(group:FinalGroup) {
  const saved=savedHeats(group).length;
  return {title:`Have all ${group.event.section} heats run?`,text:`${saved} ${saved===1?'heat':'heats'} saved. The final takes the fastest 6${group.event.relay?' teams':''}, and no more heats can be added.`};
}
const ownIssues=(group:Pick<RaceGroup,'event'>,issues:readonly DayLeadItem[])=>issues.filter(item=>item.event.code===group.event.code);
/** The check sheet a lead's Confirm the medals opens on this card, shown only once nothing of the event is in To check. */
export const medalsToConfirm=(group:Pick<RaceGroup,'event'|'medalsWaiting'>,issues:readonly DayLeadItem[])=>!ownIssues(group,issues).length && group.medalsWaiting?.stage||null;
/**
 * A lead's card status line: the event's To check line first, then what its medals wait on, "Medals decided" once
 * confirmed, else the final's line or each race's state.
 */
export function leadLine(group:Pick<RaceGroup,'event'|'races'|'heatsOpen'|'medalsDecided'|'medalsWaiting'>,issues:readonly DayLeadItem[]) {
  const own=ownIssues(group,issues),stage=medalsToConfirm(group,issues);
  if(own.length) return issueLine(own);
  if(stage) return stage==='final'?'Final saved · confirm the medals':'Every race saved · confirm the medals after the last race';
  return group.medalsDecided?'Medals decided':leadFinalLine(group)??groupStatus(group,'lead');
}
/**
 * A lead's sections: Action required (`ready`) is the groups with open issues or medals waiting on the lead, the one that started
 * waiting last first (its newest issue, or its last race's save); the rest as for everyone.
 */
export function leadSections(groups:readonly RaceGroup[],issues:readonly DayLeadItem[]) {
  const listed=groups.filter(group=>group.races.length),newest=(a:RaceGroup,b:RaceGroup)=>b.updatedAt.localeCompare(a.updatedAt);
  const waitingSince=(group:RaceGroup)=>[...ownIssues(group,issues).map(item=>item.at),group.medalsWaiting?.since??''].sort().at(-1);
  const ready=listed.filter(waitingSince).sort((a,b)=>waitingSince(b)!.localeCompare(waitingSince(a)!));
  const rest=listed.filter(group=>!ready.includes(group));
  return {ready,inProgress:rest.filter(group=>!groupDone(group)).sort(newest),teamsReady:teamsReady(groups),done:rest.filter(groupDone).sort(newest)};
}
/** A write refused because someone changed it first: "Tom Barker changed this a moment ago", or "Someone ..." when nobody is named. */
export const changedLine=(by:string|null)=>`${by??'Someone'} changed this a moment ago`;
