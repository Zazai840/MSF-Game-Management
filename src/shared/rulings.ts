import type { WarningKind } from './results-rules.js';
export const disqualificationReasons=['Two false starts','Obstruction','Out of lane','Baton','Wrong section or age','Other'] as const;
export type DisqualificationReason=typeof disqualificationReasons[number];
export interface Disqualification { reason:DisqualificationReason; comment:string|null }
/** Who checked a warning or an addition at the finish, when, and the lead's note: a snapshot, like an audit note. */
export interface CheckedBy { name:string; at:string; note?:string }
/** Rulings follow the stable entry, even when a later correction changes its number. Checks saved before who-checked was kept have no `checkedBy`. */
export interface RunnerRuling { raceId:string; entryId:string; disqualification:Disqualification|null; warningChecks?:Array<{kind:WarningKind;message:string;checkedBy?:CheckedBy}>; notCounted?:boolean; addedAtFinishChecked?:boolean; addedAtFinishCheckedBy?:CheckedBy|null }
export interface NoteTouch { raceId:string; entryId?:string }
/** Actor and message are snapshots: audit notes survive phone removal and number corrections. */
export interface AuditNote { id:string; action:string; actor:string; at:string; message:string; comment:string|null; touches:NoteTouch[] }
