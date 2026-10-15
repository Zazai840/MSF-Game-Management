import { ordinal } from './ordinal.js';
/**
 * A place whose time looks wrong by v1's only per-place rule: it is faster than the
 * last place before it that has a time. (The other wrong-time check, a count of times
 * that disagrees with the finishers, is the race's `recording.countMismatch`.)
 */
export interface WrongTime { index:number; fasterThan:number; reason:string }
/** Every wrong place, in place order. Any result at all is exactly v1's `timesOutOfOrder`. */
export function wrongTimes(places:readonly(number|null)[]):WrongTime[] {
  const wrong:WrongTime[]=[];let previous=-1;
  places.forEach((time,index)=>{
    if(time===null) return;
    if(previous>=0 && time<places[previous]!) wrong.push({index,fasterThan:previous,reason:`Faster than ${ordinal(previous+1)} place`});
    previous=index;
  });
  return wrong;
}
/** One sentence naming the first wrong place, for example "The 4th place time is faster than 3rd." */
export function wrongTimesBanner(wrong:readonly WrongTime[]):string|null {
  const first=wrong[0];
  return first?`The ${ordinal(first.index+1)} place time is faster than ${ordinal(first.fasterThan+1)}.`:null;
}
