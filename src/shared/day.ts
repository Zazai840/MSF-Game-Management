import type { Event } from './results-rules.js';
export const sections = ['Boy Beavers','Girl Beavers','Boy Cubs','Girl Cubs','Boy Scouts','Girl Scouts'] as const;
export interface DayEvent extends Event { id: string; enabled: boolean }
export interface DayRead { dayCode: string; leadCode: string; eventsConfirmed: boolean; revision: number; exportedAt:string|null; exportedRevision:number|null; events: DayEvent[] }
