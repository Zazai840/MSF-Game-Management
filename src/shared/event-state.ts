import type { DayEvent } from './day.js';
import type { EventResults } from './results-rules.js';
/** The three colours of a Results event card: green Done, navy-bordered Running, grey Not started. */
export type EventState='done'|'running'|'not-started';
/**
 * How Results shows an event: its card state and the plain status line under it,
 * worded from v1's event status ("Done · medals decided", "Heats running · 3 races").
 * Running covers any race recorded but not complete, including heats done with the final to run.
 */
export function eventState({status,raceCount,format}:{status:EventResults['status'];raceCount:number;format:DayEvent['format']}):{state:EventState;label:'Done'|'Running'|'Not started';line:string} {
  if(status==='Complete') return {state:'done',label:'Done',line:'Done · medals decided'};
  if(status==='Heats complete - final to run') return {state:'running',label:'Running',line:'Heats done · final to run'};
  if(status==='Not started') return {state:'not-started',label:'Not started',line:'Not started'};
  return {state:'running',label:'Running',line:`${format==='heats'?'Heats running':'Running'} · ${raceCount} ${raceCount===1?'race':'races'}`};
}
