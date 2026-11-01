import { wrongTimes,type WrongTime } from '../../shared/wrong-times.js';
/** Wrong times by place, for the Timer, the lead's race page and Correct times. Rules come from `src/shared/wrong-times.ts`. */
export function wrongTimesByPlace(places:readonly(number|null)[],eventName:string):Map<number,WrongTime> {
  return new Map(wrongTimes(places,eventName).map(wrong=>[wrong.index,wrong]));
}
