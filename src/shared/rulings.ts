import type { WristbandWarning } from './wristband-checks.js';
export const disqualificationReasons=['Two false starts','Obstruction','Out of lane','Baton','Wrong section or age','Other'] as const;
export type DisqualificationReason=typeof disqualificationReasons[number];
export interface Disqualification { reason:DisqualificationReason; comment:string|null }
/** Rulings follow the stable entry, even when a later correction changes its number. */
export interface RunnerRuling { raceId:string; entryId:string; disqualification:Disqualification|null; warningChecks?:WristbandWarning[]; notCounted?:boolean }
export interface NoteTouch { raceId:string; entryId?:string }
/** Actor and message are snapshots: audit notes survive phone removal and number corrections. */
export interface AuditNote { id:string; action:string; actor:string; at:string; message:string; comment:string|null; touches:NoteTouch[] }
