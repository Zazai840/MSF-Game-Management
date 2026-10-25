import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Phone,Level } from '../../shared/domain.js';
import type { AuditNote,RunnerRuling } from '../../shared/rulings.js';
import { requireLevel } from '../access/permissions.js';
import { raceChange,type Database } from '../races/records.js';
/** All lead rulings share the day lock, current permission check and export revision. */
export function rulingChange<T>(pool:pg.Pool,phone:Phone,change:(client:pg.PoolClient,current:Phone)=>Promise<T>,minimum:Level='Lead') {
  return raceChange(pool,phone,async client=>{
    const current=(await client.query('SELECT id,day_id AS "dayId",name,level,profile_id AS "profileId" FROM sign_ins WHERE id=$1',[phone.id])).rows[0] as Phone;
    requireLevel(current,minimum);
    return change(client,current);
  });
}
export async function readRulings(db:Database,dayId:string):Promise<RunnerRuling[]> {
  return (await db.query('SELECT u.race_id AS "raceId",u.entry_id AS "entryId",u.disqualification,u.warning_checks AS "warningChecks",u.not_counted AS "notCounted",u.added_at_finish_checked AS "addedAtFinishChecked",u.added_at_finish_checked_by AS "addedAtFinishCheckedBy" FROM runner_rulings u JOIN races r ON r.id=u.race_id WHERE r.day_id=$1',[dayId])).rows;
}
export async function readAuditNotes(db:Database,dayId:string):Promise<Array<AuditNote & {eventId:string|null}>> {
  const rows=(await db.query('SELECT id,event_id AS "eventId",action,actor_name AS actor,occurred_at,message,comment,touches FROM audit_notes WHERE day_id=$1 ORDER BY sequence_number DESC',[dayId])).rows;
  return rows.map(({occurred_at,...note})=>({...note,at:occurred_at.toISOString()}));
}
/** A corrected entry is a new fact: its warnings are checked again and it counts again. */
export async function reopenEntryChecks(client:pg.PoolClient,raceId:string,entryId:string) {
  await client.query('INSERT INTO runner_rulings(race_id,entry_id,warning_checks,not_counted) VALUES($1,$2,$3,false) ON CONFLICT(race_id,entry_id) DO UPDATE SET warning_checks=EXCLUDED.warning_checks,not_counted=false',[raceId,entryId,'[]']);
}
/** Snapshot prose and touched identities, without depending on surviving phones or races. Answers the note's time. */
export async function writeAuditNote(client:pg.PoolClient,phone:Phone,eventId:string|null,note:Omit<AuditNote,'id'|'actor'|'at'>):Promise<string> {
  return (await client.query('INSERT INTO audit_notes(id,day_id,event_id,action,actor_name,message,comment,touches) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING occurred_at',[randomUUID(),phone.dayId,eventId,note.action,phone.name,note.message,note.comment,JSON.stringify(note.touches)])).rows[0].occurred_at.toISOString();
}
