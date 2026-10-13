import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal, tokenHash } from './permissions.js';
import { seedEvents } from '../day/events.js';
import { newDayCode,newLeadCode } from './codes.js';
import { rulingChange,writeAuditNote } from '../rulings/records.js';
import { failureBackoff,WrongAccessCode } from './failures.js';
const matches = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export function accessRoutes(app: FastifyInstance, pool: pg.Pool, ownerPassword: string) {
  const joinFailures=failureBackoff(),leadFailures=failureBackoff();
  // Joining is the only public mutation; every other action declares its minimum level.
  app.post('/api/join', async (request,reply) => joinFailures([request.ip],reply,async()=>{
    const body = request.body as {code?: unknown; name?: unknown} | null;
    if (typeof body?.code !== 'string' || typeof body.name !== 'string') throw new Refusal(400, 'Enter the code and your first name');
    const name = body.name.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) throw new Refusal(400, 'Enter your first name (up to 80 characters)');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Reset must take this advisory lock before the day row lock, so queued joins
      // check the fresh active day and no inverse lock order can deadlock.
      await client.query('SELECT pg_advisory_xact_lock(23001)');
      let day = (await client.query('SELECT * FROM olympics_days WHERE active FOR UPDATE')).rows[0];
      let level = 'Volunteer';
      if (!day) {
        if (!matches(body.code, ownerPassword)) throw new WrongAccessCode('Wrong owner password');
        level = 'Scoring team';
        day = (await client.query('INSERT INTO olympics_days(id,day_code,lead_code) VALUES($1,$2,$3) RETURNING *', [randomUUID(), newDayCode(),newLeadCode()])).rows[0];
        await seedEvents(client,day.id);
      } else if (!matches(body.code, day.day_code)) throw new WrongAccessCode('Wrong day code - ask for the right one');
      const existing = (await client.query('SELECT name FROM phones WHERE day_id=$1 AND lower(name)=lower($2) AND NOT removed', [day.id, name])).rows[0];
      if (existing) throw new Refusal(409, `Someone has joined as ${existing.name} - add your surname initial`);
      const token = randomBytes(32).toString('base64url');
      const phone = (await client.query('INSERT INTO phones(id,day_id,name,level,token_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,level', [randomUUID(), day.id, name, level, tokenHash(token)])).rows[0];
      await client.query('UPDATE olympics_days SET revision=revision+1 WHERE id=$1',[day.id]);
      await client.query('COMMIT');
      return {token, phone};
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
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
      const updated=(await client.query('UPDATE phones SET level=$1 WHERE id=$2 RETURNING id,day_id AS "dayId",name,level',[level,current.id])).rows[0];
      if(level!==current.level) await writeAuditNote(client,current,null,{action:level==='Scoring team'?'Made scoring team':'Became lead',message:level==='Scoring team'?`Made ${current.name} scoring team with the owner password`:`${current.name} became a lead`,comment:null,touches:[]});
      return updated;
    },'Volunteer'));
  });
}
