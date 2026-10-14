import type { FinalPresence } from './finals.js';
import type { CompletedStage } from './stage-lock.js';
import type { RaceTimes } from './time-entry.js';
import type { DayEvent } from './day.js';
import type { WristbandWarning } from './wristband-checks.js';
export interface Runner { id:string; wristband:number; addedAtFinish?:boolean; warnings?:Array<WristbandWarning & {kept:boolean}> }
export interface FinishingOrder { order:string[]; didNotFinish:string[] }
export interface FinishOrderRead { waiting:RaceRead[]; recent:RaceRead[]; completedStages:CompletedStage[] }
export interface TimesRead { waiting:RaceRead[]; recent:RaceRead[]; completedStages:CompletedStage[] }
export interface RaceRecording { countMismatch:string|null; readyForRanking:boolean; results:Array<{entryId:string;wristband:number;place:number|null;time:number|null}> }
export interface RacePart<T> { version:number; value:T|null; clash?:true }
export interface RaceRead {
  id:string; event:DayEvent; kind:'heat'|'final'|'race'; number:number; checkedInAt:string; deleted:boolean; stageComplete?:boolean; final?:FinalPresence; deleteReason?:string|null;
  /** Lead reads only: the race that replaced this one in a re-run, or null when it can no longer be found. */
  replacedBy?:string|null; recording:RaceRecording;
  parts:{runners:RacePart<Runner[]>; finish:RacePart<FinishingOrder>; times:RacePart<RaceTimes>}
}
export interface StartLineRead { events:DayEvent[]; eventsConfirmed:boolean; waiting:RaceRead[]; recent:RaceRead[]; completedStages:CompletedStage[] }
export const raceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
/** How a lead sees a race deleted by a re-run: it can never be restored, so it names its replacement instead. */
export const replacedByRerun=(race:Pick<RaceRead,'deleted'|'deleteReason'|'replacedBy'>)=>race.deleted && race.deleteReason==='re-run'?(race.replacedBy?`Replaced by ${race.replacedBy} (re-run)`:'Replaced by a re-run'):null;
