import type { DayEvent } from './day.js';
import { ordinal } from './ordinal.js';
import { andList } from './race-screen.js';
import { entryName,type RaceEntry,type RacePartName,type RaceRead,type RaceState } from './races.js';
import { wrongTimes } from './wrong-times.js';
/**
 * The race flow (docs/running-zone-design-system/race-flow.md): Home lists event groups, each with its races, and a
 * person does the one step their role names on a race. A step is one of the race's parts: Runners (check-in), Finishing order
 * and Times. Relays keep the race screen.
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
/** Who last changed a step and when, and who marked it done and when. */
export interface StepMeta { version:number; by:string|null; at:string|null; doneBy:string|null; doneAt:string|null }
/**
 * One step's status on one race. `count` is what has been entered (runners checked in, runners placed or Did not
 * finish, places timed) and `expected` what it would be when complete, or null when nothing says (Runners).
 */
export interface StepStatus extends StepMeta { state:'not started'|'in progress'|'done'; count:number; expected:number|null }
export function stepStatus(race:Pick<RaceRead,'parts'>,step:Step,meta:StepMeta):StepStatus {
  const runners=race.parts.runners.value||[],finish=race.parts.finish.value,places=race.parts.times.value?.places||[];
  const placed=finish?.order.length||0;
  const [count,expected]=step==='runners'?[runners.length,null]
    :step==='positions'?[placed+(finish?.didNotFinish.length||0),runners.length]
    :[places.filter(time=>time!==null).length,Math.max(runners.length,placed)];
  return {...meta,state:meta.doneAt?'done':count>0?'in progress':'not started',count,expected};
}
/** A race as Home lists it: its name, state, when it was made and last changed, and each of its steps. */
export interface RaceSummary { id:string; kind:RaceRead['kind']; number:number; state:RaceState; createdAt:string; updatedAt:string; steps:Partial<Record<Step,StepStatus>> }
/**
 * An event group: one event × one section, with its races in order. `nextHeat` is the number "+" makes, and
 * `finalAvailable` says "+ Final" can be tapped: a heats event with no final yet, every heat with runners saved.
 */
/** One event's races. `heatsOpen` is whether a new heat can be made: false once its heats (a timed event: the event) are complete. */
export interface RaceGroup { event:DayEvent; races:RaceSummary[]; nextHeat:number; finalAvailable:boolean; heatsOpen:boolean; updatedAt:string }
/** The races list, versioned by the day revision: every switched-on event that is not a relay, in programme order. */
export interface RacesRead { revision:number; groups:RaceGroup[] }
/** One race in the flow, with its group (for the heat chips) and its steps. */
export interface RaceFlowRead { revision:number; group:RaceGroup; race:RaceRead; steps:Partial<Record<Step,StepStatus>> }
/** Whether a step on this race can be worked on now: the race is not saved, the step not done, and for Finishing order and Times someone is in the race. */
export function workable(race:Pick<RaceSummary,'state'|'steps'>,step:Step) {
  const status=race.steps[step];
  if(!status || race.state==='saved' || status.state==='done') return false;
  return step==='runners' || (race.steps.runners?.count||0)>0;
}
/** A group is done when every race in it is saved and there is no final to make. */
export const groupDone=(group:RaceGroup)=>group.races.length>0 && !group.finalAvailable && group.races.every(race=>race.state==='saved');
/**
 * Home's sections for a volunteer role: Ready for you (a race whose step for the role can be worked on now, the
 * group whose oldest such race was made first coming first), In progress (every other group not done, most recently
 * updated first) and Done. A group with no races is not listed: New race makes its first.
 */
export function raceSections(groups:readonly RaceGroup[],role:Exclude<Role,'lead'>) {
  const step=roleSteps[role],listed=groups.filter(group=>group.races.length);
  const waitingSince=(group:RaceGroup)=>group.races.filter(race=>workable(race,step)).map(race=>race.createdAt).sort()[0];
  const ready=listed.filter(waitingSince).sort((a,b)=>waitingSince(a).localeCompare(waitingSince(b)));
  const newest=(a:RaceGroup,b:RaceGroup)=>b.updatedAt.localeCompare(a.updatedAt);
  const rest=listed.filter(group=>!ready.includes(group));
  return {ready,inProgress:rest.filter(group=>!groupDone(group)).sort(newest),done:rest.filter(groupDone).sort(newest)};
}
/**
 * Why a step cannot be marked done yet, or null: Runners needs someone checked in (on a final, someone Here),
 * Finishing order needs every runner placed or Did not finish, and Times every wrong time kept or retyped (no time at all is
 * a heat nobody finished).
 */
export function doneBlocker(race:Pick<RaceRead,'kind'|'parts'>,step:Step):string|null {
  const runners:RaceEntry[]=race.parts.runners.value||[],finish=race.parts.finish.value;
  if(!runners.length) return race.kind==='final'?'Everyone is marked Absent':'Nobody is checked in yet';
  if(step==='positions') {
    const unplaced=runners.filter(runner=>!finish?.order.includes(runner.id) && !finish?.didNotFinish.includes(runner.id));
    return !unplaced.length?null:unplaced.length===1?`${entryName(unplaced[0])} has no place yet`:`${unplaced.length} runners have no place yet`;
  }
  if(step==='times') {
    const times=race.parts.times.value;
    const wrong=wrongTimes(times?.places||[]).find(item=>!times!.keptWrong?.includes(item.index));
    if(wrong) return `${ordinal(wrong.index+1)} place's time needs Fix time or Keep`;
  }
  return null;
}
/** What a step needs, in a sentence: "Heat 3 needs times". */
const stepNeeds:Record<Step,string>={runners:'runners',positions:'positions',times:'times'};
/** "3", "3 and 4", "1, 2 and the final". */
const numbers=(races:readonly Pick<RaceSummary,'kind'|'number'>[])=>andList(races.map(race=>race.kind==='final'?'the final':String(race.number)));
/** "Heat 3", "Heats 3 and 4", "The final". */
export const heatList=(races:readonly Pick<RaceSummary,'kind'|'number'>[])=>races.length===1 && races[0].kind==='final'?'The final':`${races.length>1?'Heats':'Heat'} ${numbers(races)}`;
/** Whether a race is done for a viewer: their step done (or the race saved); for a lead, the race saved. */
export function doneFor(race:Pick<RaceSummary,'state'|'steps'>,role:Role) {
  if(race.state==='saved') return true;
  if(role==='lead') return false;
  const status=race.steps[roleSteps[role]];
  return !status || status.state==='done';
}
/**
 * A heat chip's state for a viewer: done (their step done, or the race saved), ready (their step can be worked on
 * now; for a lead, every step done but the race not saved, so it waits for them) or waiting.
 */
export function chipState(race:Pick<RaceSummary,'state'|'steps'>,role:Role):'done'|'ready'|'waiting' {
  if(doneFor(race,role)) return 'done';
  if(role==='lead') return Object.values(race.steps).every(step=>step?.state==='done')?'ready':'waiting';
  return workable(race,roleSteps[role])?'ready':'waiting';
}
/** A heat chip's name in words, so its state never rests on colour alone: "Heat 3, needs times". */
export function chipLabel(race:Pick<RaceSummary,'kind'|'number'|'state'|'steps'>,role:Role) {
  const state=chipState(race,role),name=raceName(race);
  if(role==='lead') return `${name}, ${race.state==='saved'?'saved':state==='ready'?'needs a lead':'in progress'}`;
  const step=roleSteps[role];
  return `${name}, ${state==='done'?`${stepNeeds[step]} done`:state==='ready'?`needs ${stepNeeds[step]}`:race.steps.runners?.state==='done'?'waiting':'checking in'}`;
}
/**
 * A race card's status line, written for the viewer's role: "Heats 3 and 4 need times · 1 and 2 done",
 * "Heat 1 needs times · Heat 2 is checking in", "All 3 heats done". Only a lead makes the final, so it is not offered here.
 */
export function groupStatus(group:Pick<RaceGroup,'races'>,role:Exclude<Role,'lead'>) {
  const step=roleSteps[role],races=group.races;
  const ready=races.filter(race=>workable(race,step)),done=races.filter(race=>doneFor(race,role));
  const rest=races.filter(race=>!ready.includes(race) && !done.includes(race));
  const parts:string[]=[];
  if(ready.length) parts.push(`${heatList(ready)} ${ready.length>1?'need':'needs'} ${stepNeeds[step]}`);
  if(done.length===races.length && races.length>1) parts.push(`All ${races.length} heats done`);
  else if(done.length) parts.push(`${ready.length?numbers(done):heatList(done)} done`);
  if(rest.length) parts.push(`${heatList(rest)} ${rest.length>1?'are':'is'} ${rest.some(race=>race.steps.runners?.state!=='done')?'checking in':'waiting'}`);
  return parts.join(' · ');
}
type FinalGroup=Pick<RaceGroup,'event'|'races'|'heatsOpen'>;
/** Heats still running towards a final: a heats event whose heats are not complete (no final made, no results without one). */
const heatsRunning=(group:FinalGroup)=>group.event.format==='heats' && group.heatsOpen;
const savedHeats=(group:FinalGroup)=>group.races.filter(race=>race.kind!=='final' && race.state==='saved');
/** Under a volunteer's chips while heats run: who makes the final, and when. */
export const volunteerFinalLine=(group:FinalGroup)=>heatsRunning(group)?'A lead makes the final once every heat has run.':null;
/** A lead's card while heats run and nothing waits: "Heat 2 saved · make the final once every heat has run". */
export function leadFinalLine(group:FinalGroup) {
  const saved=savedHeats(group);
  return heatsRunning(group) && saved.length?`${heatList(saved)} saved · make the final once every heat has run`:null;
}
/** New race in place of Create heat, once a section's heats are complete (its final made, or results without one). */
export const heatsFinishedLine=(group:Pick<RaceGroup,'event'>)=>`${group.event.section} heats are finished. Ask a lead to add another heat.`;
/** The sheet "+ Final" opens: the heat count to check against what the lead saw, and that the heats end. */
export function finalConfirm(group:FinalGroup) {
  const saved=savedHeats(group).length;
  return {title:`Have all ${group.event.section} heats run?`,text:`${saved} ${saved===1?'heat':'heats'} saved. The final takes the fastest 6, and no more heats can be added.`};
}
