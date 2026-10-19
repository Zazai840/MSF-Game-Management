import type { DayEvent } from './day.js';
import type { AuditNote } from './rulings.js';
import type { RaceReference,LeadItem,EventResults } from './results-rules.js';
export interface DayLeadItem extends LeadItem { race?:RaceReference; event:DayEvent }
export interface EventSummary { needsYou:number; event:DayEvent; status:EventResults['status']; raceCount:number; provisional:boolean; latestNoteAt:string|null }
/** A waiting That's me request: a day-level To check item that opens no race. */
export interface ProfileRequest { id:string; name:string; at:string }
export interface ResultsRead { needsYou:DayLeadItem[]; profileRequests:ProfileRequest[]; eventsConfirmed:boolean; groups:Array<{name:string;events:EventSummary[]}> }
export interface EventResultsRead { event:DayEvent; results:EventResults; auditNotes:AuditNote[] }
