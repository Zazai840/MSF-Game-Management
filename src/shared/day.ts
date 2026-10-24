import type { Event } from './results-rules.js';
export const sections = ['Boy Beavers','Girl Beavers','Boy Cubs','Girl Cubs','Boy Scouts','Girl Scouts'] as const;
/** `relay`: run by relay teams; only a new day's seeded relays have it. */
export interface DayEvent extends Event { id: string; enabled: boolean; relay: boolean }
export interface DayRead { olympicsPassword: string; leadCode: string; eventsConfirmed: boolean; revision: number; exportedAt:string|null; exportedRevision:number|null; events: DayEvent[] }
