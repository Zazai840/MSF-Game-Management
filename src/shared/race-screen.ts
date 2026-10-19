import type { DayEvent } from './day.js';
import { raceLabel,type RaceRead } from './races.js';
/** An event's current race: its latest race not yet saved or deleted, or else the next one, not stored until its first check-in (id null, empty parts). */
export type CurrentRace=Pick<RaceRead,'kind'|'number'|'parts'|'final'> & {id:string|null};
/** One snapshot of a race screen, versioned by the day revision. */
export interface RaceScreenRead { revision:number; event:DayEvent; race:CurrentRace }
/** A switched-on event as Home lists it, with its current race. */
export interface HomeEvent { code:string; name:string; section:DayEvent['section']; race:Pick<CurrentRace,'kind'|'number'> }
/** "Heat 2", "Race 3", or just "Final": an event has one final. */
export const currentRaceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>race.kind==='final'?'Final':raceLabel(race);
