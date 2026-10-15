import { wrongTimes,type WrongTime } from '../../shared/wrong-times.js';
import './flow.css';
/**
 * Wrong-time highlighting, shared by the volunteer Times screens and the lead's race page.
 * Rules come from `src/shared/wrong-times.ts` (v1's checks only); these pieces only show them.
 *
 * Usage: `const wrong=wrongTimesByPlace(places)`; give each place's element
 * `className={wrong.get(index)?'time-wrong':''}` and render `<WrongTimeReason wrong={wrong.get(index)}/>` inside it.
 */
export function wrongTimesByPlace(places:readonly(number|null)[]):Map<number,WrongTime> {
  return new Map(wrongTimes(places).map(wrong=>[wrong.index,wrong]));
}
/** The amber reason under a wrong time, for example "Faster than 3rd place". Nothing when the time is fine. */
export function WrongTimeReason({wrong}:{wrong:WrongTime|undefined}) {
  return wrong?<small className="wrong-time-reason">{wrong.reason}</small>:null;
}
/** The amber warning triangle beside a wrong time. */
export function WrongTimeIcon() {
  return <svg className="wrong-time-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>;
}
const plural=(count:number,word:string)=>`${count} ${word}${count===1?'':'s'}`;
/**
 * "7 times · 7 finishers" with a green tick when they agree. Without a finishing order yet it shows the times alone.
 * `mismatch` is v1's count-disagreement message (`race.recording.countMismatch`); when set the line is amber.
 */
export function TimeCount({times,finishers,mismatch}:{times:number;finishers:number|null;mismatch:string|null}) {
  const agree=finishers!==null && !mismatch;
  return <p className={mismatch?'time-count time-count-mismatch':agree?'time-count time-count-agree':'time-count'}>
    {agree && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>}
    {plural(times,'time')}{finishers!==null && ` · ${plural(finishers,'finisher')}`}
  </p>;
}
