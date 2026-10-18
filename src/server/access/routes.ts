import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal, tokenHash } from './permissions.js';
import { rulingChange,writeAuditNote } from '../rulings/records.js';
import { failureBackoff,WrongAccessCode } from './failures.js';
import { activeDay, fullName, matches, signInRoutes, signInTransaction, startFirstDay } from './sign-in.js';
export function accessRoutes(app: FastifyInstance, pool: pg.Pool, ownerPassword: string) {
  // Olympics, owner and day code attempts share one backoff per IP.
  const passwordFailures=failureBackoff(),leadFailures=failureBackoff();
  signInRoutes(app, pool, ownerPassword, passwordFailures, leadFailures);
  // shortcut: the old day-code join stays until the server tests move to the shared sign-in helper (spec 78); then it goes.
  app.post('/api/join', async (request,reply) => passwordFailures([request.ip],reply,async()=>{
    const body = request.body as {code?: unknown; name?: unknown} | null;
    if (typeof body?.code !== 'string' || typeof body.name !== 'string') throw new Refusal(400, 'Enter the code and your full name');
    const code = body.code, name = fullName(body.name);
    return signInTransaction(pool, async client => {
      let day = await activeDay(client);
      let level = 'Volunteer';
      if (!day) {
        if (!matches(code, ownerPassword)) throw new WrongAccessCode('Wrong owner password');
        level = 'Scoring team';
        day = await startFirstDay(client);
      } else if (!matches(code, day.day_code)) throw new WrongAccessCode('Wrong day code - ask for the right one');
      const existing = (await client.query('SELECT name FROM sign_ins WHERE day_id=$1 AND lower(name)=lower($2) AND NOT signed_out', [day.id, name])).rows[0];
      if (existing) throw new Refusal(409, `Someone has joined as ${existing.name} - use your full name so the zone lead can tell you apart`);
      const token = randomBytes(32).toString('base64url');
      const phone = (await client.query('INSERT INTO sign_ins(id,day_id,name,level,token_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,level', [randomUUID(), day.id, name, level, tokenHash(token)])).rows[0];
      await client.query('UPDATE olympics_days SET revision=revision+1 WHERE id=$1',[day.id]);
      return {token, phone};
    });
  }));
  const action = actions(app, pool);
  action('GET', '/api/me', 'Volunteer', (_request, _reply, phone) => phone);
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
