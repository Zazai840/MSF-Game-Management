import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal } from './permissions.js';
import { rulingChange,writeAuditNote } from '../rulings/records.js';
import { failureBackoff,WrongAccessCode } from './failures.js';
import { matches, signInRoutes } from './sign-in.js';
import { raceChange } from '../races/records.js';
import { clearHolds } from '../races/race-screen.js';
export function accessRoutes(app: FastifyInstance, pool: pg.Pool, ownerPassword: string) {
  // Olympics and owner password attempts share one backoff per IP.
  const passwordFailures=failureBackoff(),leadFailures=failureBackoff();
  signInRoutes(app, pool, ownerPassword, passwordFailures, leadFailures);
  const action = actions(app, pool);
  action('GET', '/api/me', 'Volunteer', (_request, _reply, phone) => phone);
  // Signing yourself out is not a decision, so it writes no audit note. Tapping the name again signs in as a volunteer.
  // It clears the phone's holds and, like every change of the day, raises the revision and wakes the live streams.
  action('POST', '/api/sign-out', 'Volunteer', (_request, _reply, phone) => raceChange(pool, phone, async client => {
    await client.query("UPDATE sign_ins SET signed_out=true, level='Volunteer' WHERE id=$1", [phone.id]);
    await clearHolds(client, phone.id);
    return {status:'signed-out'};
  }));
  action('POST', '/api/become-lead', 'Volunteer', async (request, reply, phone) => {
    const code = (request.body as {code?: unknown} | null)?.code;
    if (typeof code !== 'string') throw new Refusal(400, 'Enter the lead code');
    return leadFailures([`phone:${phone.id}`,`ip:${request.ip}`],reply,()=>rulingChange(pool,phone,async(client,current)=>{
      const day=(await client.query('SELECT lead_code FROM olympics_days WHERE id=$1',[current.dayId])).rows[0];
      const byOwner=matches(code,ownerPassword);
      if(!byOwner && !matches(code,day.lead_code)) throw new WrongAccessCode('Wrong lead code');
      const wasOwner=(await client.query('SELECT owner FROM sign_ins WHERE id=$1',[current.id])).rows[0].owner as boolean;
      const updated=(await client.query(`UPDATE sign_ins SET level='Lead',owner=owner OR $2 WHERE id=$1 RETURNING id,day_id AS "dayId",name,level,profile_id AS "profileId"`,[current.id,byOwner])).rows[0];
      if(byOwner && !wasOwner) await writeAuditNote(client,current,null,{action:'Made lead with owner password',message:`Made ${current.name} a lead with the owner password`,comment:null,touches:[]});
      else if(current.level==='Volunteer') await writeAuditNote(client,current,null,{action:'Became lead',message:`${current.name} became a lead`,comment:null,touches:[]});
      return updated;
    },'Volunteer'));
  });
}
