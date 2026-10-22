import { EventEmitter } from 'node:events';
// shortcut: streams are fed in-process, so this holds for one server instance only; more instances need Postgres LISTEN/NOTIFY.
const changes=new EventEmitter().setMaxListeners(0);
let count=0;
/** Tells every open stream of a day that something it shows may have changed (after the change is committed). */
export const dayChanged=(dayId:string)=>{count++;changes.emit(dayId);};
/** How many changes have been told so far: a read begun at the same count has seen every committed change. */
export const changesSoFar=()=>count;
/** Calls `listener` on each change of the day; returns the way to stop. */
export function onDayChange(dayId:string,listener:()=>void) {
  changes.on(dayId,listener);
  return ()=>{changes.off(dayId,listener);};
}
