import type { DayEvent } from './day.js';
export interface Runner { id:string; wristband:number }
export interface RacePart<T> { version:number; value:T|null }
export interface RaceRead {
  id:string; event:DayEvent; kind:'heat'|'final'|'race'; number:number; checkedInAt:string; deleted:boolean;
  parts:{runners:RacePart<Runner[]>; finish:RacePart<unknown>; times:RacePart<unknown>}
}
export interface StartLineRead { events:DayEvent[]; eventsConfirmed:boolean; waiting:RaceRead[]; recent:RaceRead[] }
export const raceLabel=(race:RaceRead)=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
