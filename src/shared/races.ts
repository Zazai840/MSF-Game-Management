import type { DayEvent } from './day.js';
import type { WristbandWarning } from './wristband-checks.js';
export interface Runner { id:string; wristband:number; addedAtFinish?:boolean; warnings?:Array<WristbandWarning & {kept:boolean}> }
export interface FinishingOrder { order:string[]; didNotFinish:string[] }
export interface FinishOrderRead { waiting:RaceRead[]; recent:RaceRead[] }
export interface RacePart<T> { version:number; value:T|null }
export interface RaceRead {
  id:string; event:DayEvent; kind:'heat'|'final'|'race'; number:number; checkedInAt:string; deleted:boolean;
  parts:{runners:RacePart<Runner[]>; finish:RacePart<FinishingOrder>; times:RacePart<unknown>}
}
export interface StartLineRead { events:DayEvent[]; eventsConfirmed:boolean; waiting:RaceRead[]; recent:RaceRead[] }
export const raceLabel=(race:RaceRead)=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
