import type { Level } from './domain.js';
import type { AuditNote } from './rulings.js';
export interface SignedInRow {id:string;name:string;level:Level;owner:boolean}
export interface PhonesRead {selfId:string;phones:SignedInRow[];auditNotes:Array<AuditNote & {eventId:null}>}
/** Whether a lead may give a signed-in row this role: nobody can make the owner a volunteer. */
export const canMakeRole=(row:Pick<SignedInRow,'owner'>,role:Level)=>!(row.owner && role==='Volunteer');
