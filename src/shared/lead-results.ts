import type { DayEvent } from './day.js';
import type { EventState } from './event-state.js';
import type { RelayTeam,TeamList } from './teams.js';
import type { FinalField } from './finals.js';
import type { RaceRead,RacePartName } from './races.js';
import type { AuditNote } from './rulings.js';
import type { Stage } from './stages.js';
import type { RaceReference,LeadItem,EventResults } from './results-rules.js';
export interface DayLeadItem extends LeadItem { race?:RaceReference; event:DayEvent }
/** What Results opens on: a lead item, or only its event; with `stage`, a Races card's Confirm the medals, which opens that screen. */
export type ResultsTarget=Pick<DayLeadItem,'event'> & Partial<DayLeadItem> & {stage?:Stage};
export interface EventSummary { needsYou:number; event:DayEvent; status:EventResults['status']; decidedWithoutFinal:boolean; raceCount:number; provisional:boolean; latestNoteAt:string|null }
export interface ResultsRead { needsYou:DayLeadItem[]; groups:Array<{name:string;events:EventSummary[]}> }
/** Results' event grid: each event with its card, coloured and worded as its Races card (`cardState`, `leadCardLine`). */
export interface ResultsGridRead extends ResultsRead { groups:Array<{name:string;events:Array<EventSummary & {card:{state:EventState;line:string}}>}> }
/** A relay's also carries its team list, which a lead picks a team to add to its Final from. */
export interface EventResultsRead { event:DayEvent; results:EventResults; auditNotes:AuditNote[]; teams?:RelayTeam[] }
/**
 * One row of a race's history: a part as it stood when the race was saved (by the job's holder then) or after a lead
 * correction (by that lead). Rows an older build kept have no time or author.
 */
export interface SavedVersion { part:RacePartName; version:number; author:string|null; at:string|null }
/**
 * One race for a lead; a relay race also carries its team list and every switched-on relay's, for Correct teams' checks.
 * `deletion` is who deleted a deleted race (or called its re-run) and their comment, from its audit note; null when live.
 */
export interface LeadRaceRead { race:Omit<RaceRead,'final'> & {final?:FinalField}; history:SavedVersion[]; deletion:{by:string;comment:string|null}|null; teams?:RelayTeam[]; relays?:TeamList[] }
