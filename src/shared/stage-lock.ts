import type { Stage } from './stages.js';
import type { RaceRead } from './races.js';
export interface CompletedStage { eventId:string; eventCode:string; stage:Stage }
export const stageForRace=(race:Pick<RaceRead,'kind'|'event'>):Stage=>race.kind==='final'?'final':race.event.format==='heats'?'heats':'event';
/** An event's stage is complete; its heats also once a lead chose Results without a final. */
export const stageDone=(eventId:string,stage:Stage,completed:readonly Pick<CompletedStage,'eventId'|'stage'>[])=>completed.some(item=>item.eventId===eventId && (item.stage===stage || (stage==='heats' && item.stage==='no-final')));
/** stageDone as SQL, for the server's queries: `eventId` and `stage` are SQL expressions. */
export const stageDoneSql=(eventId:string,stage:string)=>`EXISTS(SELECT 1 FROM event_stages s WHERE s.event_id=${eventId} AND (s.stage=${stage} OR (${stage}='heats' AND s.stage='no-final')))`;
export const stageLocked=(race:RaceRead,completed:readonly CompletedStage[])=>stageDone(race.event.id,stageForRace(race),completed);
