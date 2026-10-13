import type { DayEvent } from './day.js';
import type { AuditNote } from './rulings.js';
import type { RaceReference,LeadItem,EventResults } from './results-rules.js';
export interface DayLeadItem extends LeadItem { race?:RaceReference; event:DayEvent }
export interface EventSummary { needsYou:number; event:DayEvent; status:EventResults['status']; raceCount:number; provisional:boolean; latestNoteAt:string|null }
export interface ResultsRead { needsYou:DayLeadItem[]; eventsConfirmed:boolean; groups:Array<{name:string;events:EventSummary[]}> }
export interface EventResultsRead { event:DayEvent; results:EventResults; auditNotes:AuditNote[] }
