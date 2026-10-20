import type { FinalPresence } from './finals.js';
import type { RaceTimes } from './time-entry.js';
import type { DayEvent } from './day.js';
import type { WristbandWarning } from './wristband-checks.js';
export interface Runner { id:string; wristband:number; addedAtFinish?:boolean; warnings?:Array<WristbandWarning & {kept:boolean}> }
export interface FinishingOrder { order:string[]; didNotFinish:string[] }
export interface RaceRecording { countMismatch:string|null; readyForRanking:boolean; results:Array<{entryId:string;wristband:number;place:number|null;time:number|null}> }
export interface RacePart<T> { version:number; value:T|null }
export const raceParts=['runners','finish','times'] as const;
export type RacePartName=typeof raceParts[number];
export type PartValue=Runner[]|FinishingOrder|RaceTimes|null;
export const partLabel=(part:RacePartName)=>part==='runners'?'Runners':part==='finish'?'Finishing order':'Times';
/** A race moves in progress -> submitted (the first Submit press) -> saved (the last required press). Only saved races count. */
export type RaceState='in progress'|'submitted'|'saved';
export interface RaceRead {
  id:string; event:DayEvent; kind:'heat'|'final'|'race'; number:number; checkedInAt:string; deleted:boolean; state:RaceState; stageComplete?:boolean; final?:FinalPresence; deleteReason?:string|null;
  /** Lead reads only: the race that replaced this one in a re-run, or null when it can no longer be found. */
  replacedBy?:string|null; recording:RaceRecording;
  parts:{runners:RacePart<Runner[]>; finish:RacePart<FinishingOrder>; times:RacePart<RaceTimes>}
}
export const raceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
export const runnersText=(count:number)=>`${count} ${count===1?'runner':'runners'}`;
/** How a lead sees a race deleted by a re-run: it can never be restored, so it names its replacement instead. */
export const replacedByRerun=(race:Pick<RaceRead,'deleted'|'deleteReason'|'replacedBy'>)=>race.deleted && race.deleteReason==='re-run'?(race.replacedBy?`Replaced by ${race.replacedBy} (re-run)`:'Replaced by a re-run'):null;
