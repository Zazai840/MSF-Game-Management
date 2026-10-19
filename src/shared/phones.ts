import type { Level } from './domain.js';
import type { AuditNote } from './rulings.js';
export interface SignedInRow {id:string;name:string;level:Level;owner:boolean}
export interface PhonesRead {selfId:string;phones:SignedInRow[];auditNotes:Array<AuditNote & {eventId:null}>}
