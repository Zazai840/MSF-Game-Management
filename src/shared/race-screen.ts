import type { DayEvent } from './day.js';
import { ordinal } from './ordinal.js';
import { raceLabel,type RaceRead } from './races.js';
import { wrongTimes } from './wrong-times.js';
/** An event's current race: its latest race not yet saved or deleted, or else the next one, not stored until its first check-in (id null, empty parts). */
export type CurrentRace=Pick<RaceRead,'kind'|'number'|'state'|'parts'|'final'> & {id:string|null};
/** The three jobs on a race (the glossary's Job). A final has no times. */
export const jobs=['check-in','order','times'] as const;
export type Job=typeof jobs[number];
/** How a job reads in a sentence: "Ali took over check-in", "Take over the times". */
export const jobWords:Record<Job,string>={'check-in':'check-in',order:'the order',times:'the times'};
/** Who holds a job: a signed-in phone (its sign-in id) and its name. */
export interface Holder { id:string; name:string }
/**
 * One snapshot of a race screen, versioned by the day revision. Holds belong to the event, so they carry over to its
 * next race. `asked` are the holders who must press Submit Race (each job's holder, once the job has entries on this
 * race), `pressed` those who have, and `lastSaved` the event's most recently saved race, who saved it and when.
 */
export interface RaceScreenRead { revision:number; event:DayEvent; race:CurrentRace; stageComplete:boolean; holds:Partial<Record<Job,Holder>>;
  asked:Holder[]; pressed:Holder[]; lastSaved:(Pick<RaceRead,'kind'|'number'> & {by:string;at:string})|null }
/** A switched-on event as Home lists it, with its current race. */
export interface HomeEvent { code:string; name:string; section:DayEvent['section']; race:Pick<CurrentRace,'kind'|'number'> }
/** "Heat 2", "Race 3", or just "Final": an event has one final. */
export const currentRaceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>race.kind==='final'?'Final':raceLabel(race);
/**
 * Why Submit Race cannot be pressed yet, or null: nobody checked in (on a final, everyone Absent), a runner with no
 * place (nor Did not finish), a placed wristband with no time, or a wrong time neither kept nor retyped. Kept wristband
 * warnings never block it. The phone shows it under the button; the server refuses a press with it.
 */
export function submitBlocker(race:Pick<CurrentRace,'kind'|'parts'>):string|null {
  const runners=race.parts.runners.value||[],finish=race.parts.finish.value;
  if(!runners.length) return race.kind==='final'?'Everyone is marked Absent':'Nobody is checked in yet';
  const unplaced=runners.filter(runner=>!finish?.order.includes(runner.id) && !finish?.didNotFinish.includes(runner.id));
  if(unplaced.length) return unplaced.length===1?`${unplaced[0].wristband} has no place yet`:`${unplaced.length} runners have no place yet`;
  if(race.kind==='final') return null;
  const times=race.parts.times.value,places=times?.places||[];
  const untimed=finish!.order.findIndex((_,index)=>places[index]==null);
  if(untimed>=0) return `Place ${untimed+1} has no time`;
  const wrong=wrongTimes(places).find(item=>!times!.keptWrong?.includes(item.index));
  return wrong?`${ordinal(wrong.index+1)} place's time needs Fix time or Keep`:null;
}
/** "Sam", "Sam and Jo", "Sam, Priya and Jo". */
export const andList=(names:readonly string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
