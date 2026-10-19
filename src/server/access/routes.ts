import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal } from './permissions.js';
import { rulingChange,writeAuditNote } from '../rulings/records.js';
import { failureBackoff,WrongAccessCode } from './failures.js';
import { matches, signInRoutes } from './sign-in.js';
export function accessRoutes(app: FastifyInstance, pool: pg.Pool, ownerPassword: string) {
  // Olympics and owner password attempts share one backoff per IP.
  const passwordFailures=failureBackoff(),leadFailures=failureBackoff();
  signInRoutes(app, pool, ownerPassword, passwordFailures, leadFailures);
  const action = actions(app, pool);
  action('GET', '/api/me', 'Volunteer', (_request, _reply, phone) => phone);
  // Signing yourself out is not a decision, so it writes no audit note. Tapping the name again signs in as a volunteer.
  action('POST', '/api/sign-out', 'Volunteer', async (_request, _reply, phone) => {
    await pool.query("UPDATE sign_ins SET signed_out=true, level='Volunteer' WHERE id=$1", [phone.id]);
    return {status:'signed-out'};
  });
  action('POST', '/api/become-lead', 'Volunteer', async (request, reply, phone) => {
    const code = (request.body as {code?: unknown} | null)?.code;
    if (typeof code !== 'string') throw new Refusal(400, 'Enter the lead code');
    return leadFailures([`phone:${phone.id}`,`ip:${request.ip}`],reply,()=>rulingChange(pool,phone,async(client,current)=>{
      const day=(await client.query('SELECT lead_code FROM olympics_days WHERE id=$1',[current.dayId])).rows[0];
      let level=current.level;
      if(matches(code,ownerPassword)) level='Scoring team';
      else if(matches(code,day.lead_code)) {if(level==='Volunteer') level='Lead';}
      else throw new WrongAccessCode('Wrong lead code');
      const updated=(await client.query('UPDATE sign_ins SET level=$1 WHERE id=$2 RETURNING id,day_id AS "dayId",name,level,profile_id AS "profileId"',[level,current.id])).rows[0];
      if(level!==current.level) await writeAuditNote(client,current,null,{action:level==='Scoring team'?'Made scoring team':'Became lead',message:level==='Scoring team'?`Made ${current.name} scoring team with the owner password`:`${current.name} became a lead`,comment:null,touches:[]});
      return updated;
    },'Volunteer'));
  });
}
