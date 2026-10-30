import type { FinalPresence } from './finals.js';
import type { RaceTimes } from './time-entry.js';
import type { DayEvent } from './day.js';
import type { WristbandWarning } from './wristband-checks.js';
import type { TeamLeg } from './teams.js';
/** A child in a race: one race entry. */
export interface Runner { id:string; wristband:number; addedAtFinish?:boolean; warnings?:Array<WristbandWarning & {kept:boolean}> }
/** One child of a relay team in a race: the team list's leg as it was copied in, and whether the child is marked here. */
export type EntryLeg=TeamLeg & {here:boolean};
/**
 * A relay team in a race: one race entry, keeping its own copy of the team's four children in leg order (the copy is
 * who ran). Finishing order, times and rulings point at its id, as they point at a child's.
 */
export interface TeamEntry { id:string; team:{id:string;number:number}; legs:EntryLeg[]; addedAtFinish?:boolean }
/** One entry of a race's runner list: a child, or on a relay a team. */
export type RaceEntry=Runner|TeamEntry;
export const isTeamEntry=(entry:RaceEntry):entry is TeamEntry=>'team' in entry;
export const isRunner=(entry:RaceEntry):entry is Runner=>!isTeamEntry(entry);
/**
 * A race's children, for the screens and rulings that work child by child. A relay race's entries are teams, so it has
 * none; those places name teams as relays reach them.
 */
export const runnersOf=(entries:readonly RaceEntry[]|null|undefined)=>(entries||[]).filter(isRunner);
/** An entry as a volunteer reads it: a child's wristband, or "Team 3". */
export const entryName=(entry:RaceEntry)=>isTeamEntry(entry)?`Team ${entry.team.number}`:String(entry.wristband);
/** The number a finishing order correction names an entry by: a child's wristband, or on a relay the team's number. */
export const entryNumber=(entry:RaceEntry)=>isTeamEntry(entry)?entry.team.number:entry.wristband;
export interface FinishingOrder { order:string[]; didNotFinish:string[] }
export interface RaceRecording { countMismatch:string|null; readyForRanking:boolean; results:Array<{entryId:string;wristband:number|null;place:number|null;time:number|null}> }
export interface RacePart<T> { version:number; value:T|null }
export const raceParts=['runners','finish','times'] as const;
export type RacePartName=typeof raceParts[number];
export type PartValue=RaceEntry[]|FinishingOrder|RaceTimes|null;
export const partLabel=(part:RacePartName)=>part==='runners'?'Runners':part==='finish'?'Finishing order':'Times';
/** A race is in progress until it saves itself, once every step is done. Only saved races count. */
export type RaceState='in progress'|'saved';
export interface RaceRead {
  id:string; event:DayEvent; kind:'heat'|'final'|'race'; number:number; checkedInAt:string; deleted:boolean; state:RaceState; stageComplete?:boolean; final?:FinalPresence; deleteReason?:string|null;
  /** Lead reads only: the race that replaced this one in a re-run, or null when it can no longer be found. */
  replacedBy?:string|null; recording:RaceRecording;
  parts:{runners:RacePart<RaceEntry[]>; finish:RacePart<FinishingOrder>; times:RacePart<RaceTimes>}
}
/** Every run of every event type is a Heat (race-flow.md decision 1), the final a Final. */
export const raceLabel=(race:Pick<RaceRead,'kind'|'number'>)=>`${race.kind==='final'?'Final':'Heat'} ${race.number}`;
export const runnersText=(count:number)=>`${count} ${count===1?'runner':'runners'}`;
/** How a lead sees a race deleted by a re-run: it can never be restored, so it names its replacement instead. */
export const replacedByRerun=(race:Pick<RaceRead,'deleted'|'deleteReason'|'replacedBy'>)=>race.deleted && race.deleteReason==='re-run'?(race.replacedBy?`Replaced by ${race.replacedBy} (re-run)`:'Replaced by a re-run'):null;
