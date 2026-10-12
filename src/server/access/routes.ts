import { randomInt, randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal, tokenHash } from './permissions.js';
const matches = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export function accessRoutes(app: FastifyInstance, pool: pg.Pool, ownerPassword: string) {
  // Joining is the only public mutation; every other action declares its minimum level.
  app.post('/api/join', async request => {
    const body = request.body as {code?: unknown; name?: unknown} | null;
    if (typeof body?.code !== 'string' || typeof body.name !== 'string') throw new Refusal(400, 'Enter the code and your first name');
    const name = body.name.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) throw new Refusal(400, 'Enter your first name (up to 80 characters)');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(23001)');
      let day = (await client.query('SELECT * FROM olympics_days WHERE active')).rows[0];
      let level = 'Volunteer';
      if (!day) {
        if (!matches(body.code, ownerPassword)) throw new Refusal(403, 'Wrong owner password');
        level = 'Scoring team';
        day = (await client.query('INSERT INTO olympics_days(id,day_code,lead_code) VALUES($1,$2,$3) RETURNING *', [randomUUID(), String(randomInt(10000)).padStart(4,'0'), Array.from({length:6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('')])).rows[0];
      } else if (!matches(body.code, day.day_code)) throw new Refusal(403, 'Wrong day code - ask for the right one');
      const existing = (await client.query('SELECT name FROM phones WHERE day_id=$1 AND lower(name)=lower($2) AND NOT removed', [day.id, name])).rows[0];
      if (existing) throw new Refusal(409, `Someone has joined as ${existing.name} - add your surname initial`);
      const token = randomBytes(32).toString('base64url');
      const phone = (await client.query('INSERT INTO phones(id,day_id,name,level,token_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,level', [randomUUID(), day.id, name, level, tokenHash(token)])).rows[0];
      await client.query('COMMIT');
      return {token, phone};
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  const action = actions(app, pool);
  action('GET', '/api/me', 'Volunteer', (_request, _reply, phone) => phone);
  action('POST', '/api/become-lead', 'Volunteer', async (request, _reply, phone) => {
    const code = (request.body as {code?: unknown} | null)?.code;
    if (typeof code !== 'string') throw new Refusal(400, 'Enter the lead code');
    const day = (await pool.query('SELECT lead_code FROM olympics_days WHERE active')).rows[0];
    let level = phone.level;
    if (matches(code, ownerPassword)) level = 'Scoring team';
    else if (matches(code, day.lead_code)) { if (level === 'Volunteer') level = 'Lead'; }
    else throw new Refusal(403, 'Wrong lead code');
    return (await pool.query('UPDATE phones SET level=$1 WHERE id=$2 RETURNING id,name,level', [level,phone.id])).rows[0];
  });
}
