import type { Stage } from './stages.js';
import type { RaceRead } from './races.js';
export interface CompletedStage { eventId:string; eventCode:string; stage:Stage }
export const stageForRace=(race:Pick<RaceRead,'kind'|'event'>):Stage=>race.kind==='final'?'final':race.event.format==='heats'?'heats':'event';
export const stageLocked=(race:RaceRead,completed:readonly CompletedStage[])=>completed.some(item=>item.eventId===race.event.id && item.stage===stageForRace(race));
