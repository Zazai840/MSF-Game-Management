import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, moved, Refusal, tokenHash } from './permissions.js';
import { fullName, requirePass, runningDay, signIn, signInTransaction } from './sign-in.js';
import { rulingChange, writeAuditNote } from '../rulings/records.js';
const secretOf = (body: unknown) => {
  const secret = (body as {secret?: unknown} | null)?.secret;
  if (typeof secret !== 'string') throw new Refusal(400, 'Check what you entered and try again');
  return tokenHash(secret);
};
const noRequest = () => new Refusal(404, 'This request is no longer waiting');
/**
 * That's me: a phone whose profile is gone asks for it back, and a lead approves after checking in person.
 * The waiting secret becomes the profile secret on approval, which cuts the old phone off.
 */
export function thatsMeRoutes(app: FastifyInstance, pool: pg.Pool) {
  app.post('/api/thats-me', async request => {
    const body = request.body as {pass?: unknown; name?: unknown} | null;
    const name = fullName(body?.name);
    return signInTransaction(pool, async client => {
      await requirePass(client, body?.pass);
      const day = await runningDay(client);
      const profile = (await client.query('SELECT id,name FROM profiles WHERE lower(name)=lower($1)', [name])).rows[0];
      if (!profile) throw new Refusal(404, `Nobody has a profile called ${name}`);
      const secret = randomBytes(32).toString('base64url'), id = randomUUID();
      await client.query('INSERT INTO profile_requests(id,day_id,profile_id,secret_hash) VALUES($1,$2,$3,$4)', [id, day.id, profile.id, tokenHash(secret)]);
      return {id, name:profile.name, secret};
    });
  });
  // The waiting phone polls this. The approved answer (secret and session) comes once, so a later read cannot undo a Remove.
  app.post('/api/thats-me/status', async request => {
    const body = request.body as {pass?: unknown; secret?: unknown} | null;
    const hash = secretOf(body);
    return signInTransaction(pool, async client => {
      await requirePass(client, body?.pass);
      const found = (await client.query(`SELECT r.id AS "requestId",r.status,r.delivered,r.day_id,p.id,p.name,p.secret_hash=r.secret_hash AS held FROM profile_requests r JOIN profiles p ON p.id=r.profile_id
        JOIN olympics_days d ON d.id=r.day_id AND d.active WHERE r.secret_hash=$1`, [hash])).rows[0];
      if (!found || found.delivered) throw noRequest();
      if (found.status !== 'approved') return {status:found.status};
      // Approved, then moved again by a later That's me.
      if (!found.held) throw moved();
      await client.query('UPDATE profile_requests SET delivered=true WHERE id=$1', [found.requestId]);
      const profile = {id:found.id as string, name:found.name as string};
      return {status:'approved', profile:{...profile, secret:body!.secret as string}, ...await signIn(client, found.day_id, profile)};
    });
  });
  app.post('/api/thats-me/cancel', async request => {
    const cancelled = await pool.query("UPDATE profile_requests SET status='cancelled' WHERE secret_hash=$1 AND status='waiting'", [secretOf(request.body)]);
    if (!cancelled.rowCount) throw noRequest();
    return {status:'cancelled'};
  });
  const action = actions(app, pool);
  for (const decision of ['approve', 'decline'] as const) action('POST', `/api/lead/thats-me/:requestId/${decision}`, 'Lead', (request, _reply, phone) => rulingChange(pool, phone, async (client, current) => {
    const {requestId} = request.params as {requestId: string};
    const waiting = (await client.query(`SELECT r.id,r.profile_id,r.secret_hash,p.name FROM profile_requests r JOIN profiles p ON p.id=r.profile_id
      WHERE r.id::text=$1 AND r.day_id=$2 AND r.status='waiting' FOR UPDATE OF r`, [requestId, current.dayId])).rows[0];
    if (!waiting) throw noRequest();
    if (decision === 'decline') {
      await client.query("UPDATE profile_requests SET status='declined' WHERE id=$1", [waiting.id]);
      await writeAuditNote(client, current, null, {action:'Declined That\'s me', message:`Did not move ${waiting.name}'s profile to a new phone`, comment:null, touches:[]});
      return {status:'saved'};
    }
    // Today's one row stays, as a volunteer, with a dead token until the new phone picks up its own.
    const old = (await client.query(`UPDATE sign_ins s SET level='Volunteer', token_hash=$3 FROM (SELECT id,token_hash FROM sign_ins WHERE day_id=$1 AND profile_id=$2 FOR UPDATE) o
      WHERE s.id=o.id RETURNING o.token_hash`, [current.dayId, waiting.profile_id, tokenHash(randomBytes(32).toString('base64url'))])).rows[0];
    await client.query('UPDATE profiles SET secret_hash=$1 WHERE id=$2', [waiting.secret_hash, waiting.profile_id]);
    await client.query("UPDATE profile_requests SET status='approved', moved_token_hash=$1 WHERE id=$2", [old?.token_hash ?? null, waiting.id]);
    await writeAuditNote(client, current, null, {action:'Approved That\'s me', message:`Moved ${waiting.name}'s profile to a new phone`, comment:null, touches:[]});
    return {status:'saved'};
  }));
}
