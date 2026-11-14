import type { ResultWarning } from './results-rules.js';
export const disqualificationReasons=['Two false starts','Obstruction','Out of lane','Baton','Wrong section or age','Other'] as const;
export type DisqualificationReason=typeof disqualificationReasons[number];
export interface Disqualification { reason:DisqualificationReason; comment:string|null }
/** "Disqualified: Out of lane - Stepped into lane 3", the comment only when there is one. */
export const disqualifiedText=(disqualification:{reason:string;comment?:string|null})=>`Disqualified: ${disqualification.reason}${disqualification.comment?` - ${disqualification.comment}`:''}`;
/** "Why the change?": a final's line-up changed by hand (an add, a replace, a lead's Correct number). "Wrong number" is offered only on a replace or a Correct number. */
export const changeReasons=['Did not want to run','Hurt','Not found','Wrong number','Other'] as const;
/** One of `changeReasons`, with the optional "More" text (required for Other). */
export interface ChangeReason { reason:typeof changeReasons[number]; text:string|null }
/** "Hurt", or "Other - Went home" with its text: the end of the change's audit note. */
export const changeReasonText=({reason,text}:ChangeReason)=>`${reason}${text?` - ${text}`:''}`;
/** Who checked a warning or an addition at the finish, when, and the lead's note: a snapshot, like an audit note. `noteId` is the check's own audit note (none on checks saved before it was kept). */
export interface CheckedBy { name:string; at:string; note?:string; noteId?:string }
/** Rulings follow the stable entry, even when a later correction changes its number. Checks saved before who-checked was kept have no `checkedBy`. */
export interface RunnerRuling { raceId:string; entryId:string; disqualification:Disqualification|null; warningChecks?:Array<ResultWarning & {checkedBy?:CheckedBy}>; notCounted?:boolean; addedAtFinishChecked?:boolean; addedAtFinishCheckedBy?:CheckedBy|null }
export interface NoteTouch { raceId:string; entryId?:string }
/** Actor and message are snapshots: audit notes survive phone removal and number corrections. */
export interface AuditNote { id:string; action:string; actor:string; at:string; message:string; comment:string|null; touches:NoteTouch[] }
