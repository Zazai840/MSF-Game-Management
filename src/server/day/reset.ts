import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { actions,newDay,Refusal,requireLevel,signedOut } from '../access/permissions.js';
import { newLeadCode } from '../access/codes.js';
import { seedEvents } from './events.js';
export function resetRoutes(app:FastifyInstance,pool:pg.Pool) {
  actions(app,pool)('POST','/api/day/start-new','Scoring team',async(request,_reply,phone)=>{
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Sign-in and reset always take this lock before the captured day, then phone.
      await client.query('SELECT pg_advisory_xact_lock(23001)');
      const day=(await client.query('SELECT * FROM olympics_days WHERE id=$1 AND active FOR UPDATE',[phone.dayId])).rows[0];
      if(!day) throw newDay();
      const current=(await client.query('SELECT id,day_id AS "dayId",name,level,profile_id AS "profileId" FROM sign_ins WHERE id=$1 AND day_id=$2 AND NOT signed_out FOR UPDATE',[phone.id,phone.dayId])).rows[0];
      if(!current) throw signedOut();
      requireLevel(current,'Scoring team');
      if((request.body as {confirmation?:unknown}|null)?.confirmation!=='NEW DAY') throw new Refusal(400,'Type NEW DAY to confirm');
      if(day.exported_revision===null || day.exported_at===null || day.exported_revision!==day.revision) throw new Refusal(409,'Download a day export after the last change before starting a new day');
      const nextDay=randomUUID();
      await client.query('UPDATE olympics_days SET active=false WHERE id=$1',[phone.dayId]);
      await client.query('INSERT INTO olympics_days(id,lead_code,revision) VALUES($1,$2,1)',[nextDay,newLeadCode(day.lead_code)]);
      await seedEvents(client,nextDay);
      await client.query('UPDATE sign_ins SET day_id=$1 WHERE id=$2',[nextDay,current.id]);
      // Parts reference their authors; counters and audit notes reference events.
      // Delete these in dependency order, scoped exclusively to the old day.
      await client.query('DELETE FROM races WHERE day_id=$1',[phone.dayId]);
      await client.query('DELETE FROM audit_notes WHERE day_id=$1',[phone.dayId]);
      await client.query('DELETE FROM race_counters WHERE event_id IN (SELECT id FROM events WHERE day_id=$1)',[phone.dayId]);
      await client.query('DELETE FROM events WHERE day_id=$1',[phone.dayId]);
      await client.query('DELETE FROM profile_requests WHERE day_id=$1',[phone.dayId]);
      await client.query('DELETE FROM sign_ins WHERE day_id=$1',[phone.dayId]);
      await client.query('DELETE FROM olympics_days WHERE id=$1',[phone.dayId]);
      await client.query('COMMIT');
      return {phone:{...current,dayId:nextDay}};
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  });
}
