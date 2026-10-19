import type { DayEvent } from './day.js';
import { raceLabel,type RaceRead } from './races.js';
/** An event's current race: its latest race not yet saved or deleted, or else the next one, not stored until its first check-in (id null, empty parts). */
export type CurrentRace=Pick<RaceRead,'kind'|'number'|'parts'|'final'> & {id:string|null};
/** The three jobs on a race (the glossary's Job; the old job screens' `Job` in domain.ts goes with them). A final has no times. */
export const raceJobs=['check-in','order','times'] as const;
export type RaceJob=typeof raceJobs[number];
/** How a job reads in a sentence: "Ali took over check-in", "Take over the times". */
export const jobWords:Record<RaceJob,string>={'check-in':'check-in',order:'the order',times:'the times'};
/** Who holds a job: a signed-in phone (its sign-in id) and its name. */
export interface Holder { id:string; name:string }
/** One snapshot of a race screen, versioned by the day revision. Holds belong to the event, so they carry over to its next race. */
export interface RaceScreenRead { revision:number; event:DayEvent; race:CurrentRace; stageComplete:boolean; holds:Partial<Record<RaceJob,Holder>> }
/** A switched-on event as Home lists it, with its current race. */
export interface HomeEvent { code:string; name:string; section:DayEvent['section']; race:Pick<CurrentRace,'kind'|'number'> }
/** "Heat 2", "Race 3", or just "Final": an event has one final. */
export const currentRaceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>race.kind==='final'?'Final':raceLabel(race);
