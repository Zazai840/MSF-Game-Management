import type { Level } from './domain.js';
import type { AuditNote } from './rulings.js';
export interface JoinedPhone {id:string;name:string;level:Level}
export interface PhonesRead {selfId:string;phones:JoinedPhone[];auditNotes:Array<AuditNote & {eventId:null}>}
