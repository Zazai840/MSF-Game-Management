import type { Event } from './results-rules.js';
import { clock } from './clock.js';
export const sections = ['Boy Beavers','Girl Beavers','Boy Cubs','Girl Cubs','Boy Scouts','Girl Scouts'] as const;
/** What kind of event it is, stored with it; a lead adds Races or Hurdles. Home's Races tab holds races and hurdles. */
export const eventTypes = ['races','hurdles','relays'] as const;
export type EventType = typeof eventTypes[number];
export const eventTypeNames: Record<EventType,string> = {races:'Races',hurdles:'Hurdles',relays:'Relays'};
/**
 * `type` is stored; `relay` (run by relay teams) is `type === 'relays'`, worked out when the event is read so relay
 * code keeps reading it. Only a new day's seeded relays are relays: the add-event route never makes one.
 */
export interface DayEvent extends Event { id: string; enabled: boolean; type: EventType; relay: boolean }
/** This day labels the Olympics day for the scoring team: Year (2026 to next year), Region and Day number (1-5). */
export const regions = ['North','South','National'] as const;
export type Region = typeof regions[number];
export const dayNumbers = [1,2,3,4,5] as const;
/** The years This day offers: 2026 to the year after `now`'s. */
export const thisDayYears=(now:Date)=>Array.from({length:now.getUTCFullYear()-2024},(_,index)=>2026+index);
export interface ThisDay { year: number; region: Region|null; dayNumber: number|null }
export interface DayRead extends ThisDay { olympicsPassword: string; leadCode: string; revision: number; exportedAt:string|null; exportedRevision:number|null; events: DayEvent[] }
/** This day is chosen once it has a region and a day: Day setup's row asks for them until then. */
export const thisDayChosen=(day:Pick<ThisDay,'region'|'dayNumber'>)=>day.region!==null && day.dayNumber!==null;
type Exported=Pick<DayRead,'exportedAt'|'exportedRevision'|'revision'>;
/** The Day export is behind once something changed after its last download: its row then waits for the lead. */
export const exportBehind=(day:Exported)=>day.exportedAt!==null && day.exportedRevision!==day.revision;
/** When the Day export was last downloaded, and whether anything changed after it. */
export const exportStatus=(day:Exported)=>!day.exportedAt?'Not downloaded yet.':`Last downloaded ${clock(day.exportedAt)}, ${exportBehind(day)?'with newer changes since':'includes every change so far'}.`;
/** An event's name on every screen, "200m · Boy Cubs"; its code goes in a tag beside it. */
export const eventTitle=(event:Pick<Event,'name'|'section'>)=>`${event.name} · ${event.section}`;
