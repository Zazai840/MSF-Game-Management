import { ordinal } from './ordinal.js';
import { formatTime,timeLimits } from './time-entry.js';
/**
 * A place whose time looks wrong: faster than the last place before it that has a time (v1's rule), or slower than
 * 1.5 m/s for the event's distance (a doubled digit). Faster than an earlier place wins when both apply. (The other
 * wrong-time check, a count of times that disagrees with the finishers, is the race's `recording.countMismatch`.)
 * `reason` is the slot's short label and `banner` the sentence naming the place.
 */
export interface WrongTime { index:number; reason:string; banner:string }
/**
 * Every wrong place, in place order. With no event name (the lead's screens) or no known distance, only the order
 * rule applies, and any result at all is exactly v1's `timesOutOfOrder`.
 */
export function wrongTimes(places:readonly(number|null)[],eventName?:string):WrongTime[] {
  const wrong:WrongTime[]=[],slowest=eventName && timeLimits(eventName)?.slowest;let previous=-1;
  places.forEach((time,index)=>{
    if(time===null) return;
    const place=`The ${ordinal(index+1)} place time`;
    if(previous>=0 && time<places[previous]!) wrong.push({index,reason:`Faster than ${ordinal(previous+1)} place`,banner:`${place} is faster than ${ordinal(previous+1)}.`});
    else if(slowest && time>slowest) wrong.push({index,reason:`Slow for ${eventName}`,banner:`${place}, ${formatTime(time)}, looks slow for ${eventName}.`});
    previous=index;
  });
  return wrong;
}
/** One sentence naming the first wrong place, for example "The 4th place time is faster than 3rd." */
export const wrongTimesBanner=(wrong:readonly WrongTime[]):string|null=>wrong[0]?.banner??null;
