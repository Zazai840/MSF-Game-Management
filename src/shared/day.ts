import type { Event } from './results-rules.js';
export const sections = ['Boy Beavers','Girl Beavers','Boy Cubs','Girl Cubs','Boy Scouts','Girl Scouts'] as const;
/** Home's tabs, one per event type. Every event has one, stored with it; a lead adds Races or Hurdles. */
export const eventTypes = ['races','hurdles','relays'] as const;
export type EventType = typeof eventTypes[number];
export const eventTypeNames: Record<EventType,string> = {races:'Races',hurdles:'Hurdles',relays:'Relays'};
/**
 * `type` is stored; `relay` (run by relay teams) is `type === 'relays'`, worked out when the event is read so relay
 * code keeps reading it. Only a new day's seeded relays are relays: the add-event route never makes one.
 */
export interface DayEvent extends Event { id: string; enabled: boolean; type: EventType; relay: boolean }
export interface DayRead { olympicsPassword: string; leadCode: string; eventsConfirmed: boolean; revision: number; exportedAt:string|null; exportedRevision:number|null; events: DayEvent[] }
