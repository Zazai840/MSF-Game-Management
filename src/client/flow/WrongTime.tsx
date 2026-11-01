import { wrongTimes,type WrongTime } from '../../shared/wrong-times.js';
import './flow.css';
/**
 * Wrong-time highlighting, shared by the volunteer Times screens and the lead's race page.
 * Rules come from `src/shared/wrong-times.ts`; these pieces only show them.
 *
 * Usage: `const wrong=wrongTimesByPlace(places,event.name)`; give each place's element
 * `className={wrong.get(index)?'time-wrong':''}` and render `<WrongTimeReason wrong={wrong.get(index)}/>` inside it.
 */
export function wrongTimesByPlace(places:readonly(number|null)[],eventName:string):Map<number,WrongTime> {
  return new Map(wrongTimes(places,eventName).map(wrong=>[wrong.index,wrong]));
}
/** The amber reason under a wrong time, for example "Faster than 3rd place". Nothing when the time is fine. */
export function WrongTimeReason({wrong}:{wrong:WrongTime|undefined}) {
  return wrong?<small className="wrong-time-reason">{wrong.reason}</small>:null;
}
/** The amber warning triangle beside a wrong time. */
export function WrongTimeIcon() {
  return <svg className="wrong-time-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>;
}
