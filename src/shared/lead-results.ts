import type { DayEvent } from './day.js';
import type { EventResults } from './results-rules.js';
export interface EventSummary { event:DayEvent; status:EventResults['status']; raceCount:number; provisional:boolean }
export interface ResultsRead { eventsConfirmed:boolean; groups:Array<{name:string;events:EventSummary[]}> }
export interface EventResultsRead { event:DayEvent; results:EventResults }
