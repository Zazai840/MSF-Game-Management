import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { levels, type Level, type Phone } from '../../shared/domain.js';
import { moved, passwordChanged, Refusal, tokenHash } from './permissions.js';
import { newLeadCode, newOlympicsPassword } from './codes.js';
import { seedEvents } from '../day/events.js';
import { WrongAccessCode, type failureBackoff } from './failures.js';
export const matches = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const wrongPassword = 'That is not the Olympics password. Check with a lead and try again.';
const wrongLeadCode = "That is not today's lead code. Ask a lead for it.";
/** Full names are stored tidied (trimmed, inner spaces collapsed), so lower(name) is the form compared for uniqueness. */
export function fullName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 80) throw new Refusal(400, 'Enter your full name (up to 80 characters)');
  return name;
}
/**
 * Every sign-in and Start new day take this advisory lock before the day row, so a sign-in queued
 * behind a reset lands on the new day and no inverse lock order can deadlock.
 */
export async function signInTransaction<T>(pool: pg.Pool, change: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  let rollbackFailure: Error | boolean | undefined;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(23001)');
    const result = await change(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { rollbackFailure = rollbackError instanceof Error ? rollbackError : true; }
    throw error;
  } finally { client.release(rollbackFailure); }
}
export const activeDay = async (client: pg.PoolClient) => (await client.query('SELECT * FROM olympics_days WHERE active FOR UPDATE')).rows[0];
/** The owner starts the first day: its lead code, the built-in events and the first Olympics password. */
export async function startFirstDay(client: pg.PoolClient) {
  const day = (await client.query('INSERT INTO olympics_days(id,lead_code) VALUES($1,$2) RETURNING *', [randomUUID(), newLeadCode()])).rows[0];
  await seedEvents(client, day.id);
  await client.query('INSERT INTO olympics_settings(password) VALUES($1) ON CONFLICT DO NOTHING', [newOlympicsPassword()]);
  return day;
}
interface Settings { password: string; password_version: number }
const readSettings = async (db: pg.Pool | pg.PoolClient) => (await db.query('SELECT password,password_version FROM olympics_settings')).rows[0] as Settings | undefined;
/** A password pass proves the phone typed the Olympics password. It is bound to the password version, so a change invalidates every pass. */
const passFor = (settings: Settings) => createHmac('sha256', settings.password).update(`olympics-pass:${settings.password_version}`).digest('base64url');
export async function requirePass(client: pg.PoolClient, pass: unknown) {
  const settings = await readSettings(client);
  if (!settings || typeof pass !== 'string' || !matches(pass, passFor(settings))) throw passwordChanged();
  return settings;
}
async function createProfile(client: pg.PoolClient, name: string) {
  const secret = randomBytes(32).toString('base64url');
  const profile = (await client.query('INSERT INTO profiles(id,name,secret_hash) VALUES($1,$2,$3) RETURNING id,name', [randomUUID(), name, tokenHash(secret)])).rows[0];
  return {...profile, secret} as {id: string; name: string; secret?: string};
}
/** The ids of the profiles this phone proves it holds, by their secrets. */
async function heldProfiles(client: pg.PoolClient, value: unknown) {
  const held = Array.isArray(value) ? value : [];
  if (held.length > 100 || held.some(entry => typeof entry?.id !== 'string' || typeof entry?.secret !== 'string')) throw new Refusal(400, 'Check what you entered and try again');
  const rows = (await client.query('SELECT p.id FROM profiles p JOIN unnest($1::text[],$2::text[]) AS held(id,hash) ON p.id::text=held.id AND p.secret_hash=held.hash',
    [held.map(entry => entry.id), held.map(entry => tokenHash(entry.secret))])).rows;
  return new Set(rows.map(row => row.id as string));
}
/** Lead and owner sign-in never refuse a name: this phone's profile, else a new profile, else the lowest free number from 2. */
async function profileByName(client: pg.PoolClient, name: string, phoneProfiles: unknown) {
  const held = await heldProfiles(client, phoneProfiles);
  let base = name;
  for (let number = 1; ; number++) {
    const candidate = number === 1 ? name : `${base} ${number}`;
    const found = (await client.query('SELECT id,name FROM profiles WHERE lower(name)=lower($1)', [candidate])).rows[0];
    if (!found) return createProfile(client, candidate);
    if (held.has(found.id)) return found as {id: string; name: string};
    // Number the name as the existing profile spells it ("Sam Patel 2", not "sam patel 2").
    if (number === 1) base = found.name;
  }
}
/** Signs a profile in to the day. Today's row keeps its role (so roles survive a password change) unless `level` raises it. */
export async function signIn(client: pg.PoolClient, dayId: string, profile: {id: string; name: string}, level: Level = 'Volunteer', owner = false) {
  // The token names its day, so after Start new day deletes the row the phone can still be told new-day.
  const token = `${dayId}.${randomBytes(32).toString('base64url')}`;
  // The session is issued under the current password version, so a password change ends it.
  const phone = (await client.query(`INSERT INTO sign_ins(id,day_id,profile_id,name,level,owner,token_hash,password_version) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT password_version FROM olympics_settings))
    ON CONFLICT (day_id,profile_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, signed_out=false, owner=sign_ins.owner OR EXCLUDED.owner, password_version=EXCLUDED.password_version,
      level=CASE WHEN array_position($8::text[],EXCLUDED.level)>array_position($8::text[],sign_ins.level) THEN EXCLUDED.level ELSE sign_ins.level END
    RETURNING id,day_id AS "dayId",name,level,profile_id AS "profileId"`,
  [randomUUID(), dayId, profile.id, profile.name, level, owner, tokenHash(token), levels])).rows[0] as Phone;
  await client.query('UPDATE olympics_days SET revision=revision+1 WHERE id=$1', [dayId]);
  return {token, phone};
}
export async function runningDay(client: pg.PoolClient) {
  const day = await activeDay(client);
  if (!day) throw passwordChanged();
  return day;
}
export function signInRoutes(app: FastifyInstance, pool: pg.Pool, ownerPassword: string, passwordFailures: ReturnType<typeof failureBackoff>, leadFailures: ReturnType<typeof failureBackoff>) {
  // These are public: the password check, owner sign-in, Create profile, tapping a name, Lead sign-in and this phone's profiles.
  app.post('/api/password', async (request, reply) => {
    const password = (request.body as {password?: unknown} | null)?.password;
    if (typeof password !== 'string') throw new Refusal(400, 'Type the Olympics password');
    return passwordFailures([request.ip], reply, async () => {
      if (matches(password, ownerPassword)) return {kind:'owner', dayRunning:Boolean((await pool.query('SELECT 1 FROM olympics_days WHERE active')).rowCount)};
      const settings = await readSettings(pool);
      if (settings && matches(password, settings.password)) return {kind:'olympics', pass:passFor(settings)};
      throw new WrongAccessCode(wrongPassword);
    });
  });
  app.post('/api/owner-sign-in', async (request, reply) => {
    const body = request.body as {password?: unknown; name?: unknown; profiles?: unknown} | null;
    if (typeof body?.password !== 'string') throw new Refusal(400, 'Type the Olympics password');
    const password = body.password, name = fullName(body.name);
    return passwordFailures([request.ip], reply, async () => {
      if (!matches(password, ownerPassword)) throw new WrongAccessCode(wrongPassword);
      // The owner password never clears or restarts a running day; it only starts the first one.
      return signInTransaction(pool, async client => {
        const day = await activeDay(client) ?? await startFirstDay(client);
        const profile = await profileByName(client, name, body.profiles);
        return {pass:passFor((await readSettings(client))!), profile, ...await signIn(client, day.id, profile, 'Lead', true)};
      });
    });
  });
  app.post('/api/profiles', async request => {
    const body = request.body as {pass?: unknown; name?: unknown} | null;
    const name = fullName(body?.name);
    return signInTransaction(pool, async client => {
      await requirePass(client, body?.pass);
      const day = await runningDay(client);
      const taken = (await client.query('SELECT name FROM profiles WHERE lower(name)=lower($1)', [name])).rows[0];
      if (taken) throw new Refusal(409, `${taken.name} already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial.`, {taken:true});
      const profile = await createProfile(client, name);
      return {profile, ...await signIn(client, day.id, profile)};
    });
  });
  app.post('/api/sign-in', async request => {
    const body = request.body as {pass?: unknown; profileId?: unknown; secret?: unknown} | null;
    if (typeof body?.profileId !== 'string' || typeof body.secret !== 'string') throw new Refusal(400, 'Check what you entered and try again');
    const {profileId, secret} = body;
    return signInTransaction(pool, async client => {
      await requirePass(client, body.pass);
      const day = await runningDay(client);
      const profile = (await client.query('SELECT id,name FROM profiles WHERE id::text=$1 AND secret_hash=$2', [profileId, tokenHash(secret)])).rows[0];
      if (!profile) throw moved();
      return signIn(client, day.id, profile);
    });
  });
  app.post('/api/lead-sign-in', async (request, reply) => {
    const body = request.body as {pass?: unknown; name?: unknown; code?: unknown; profiles?: unknown} | null;
    if (typeof body?.code !== 'string') throw new Refusal(400, 'Enter the lead code');
    const code = body.code, name = fullName(body.name);
    // Before signing in, a phone is known only by the profiles it holds.
    const phoneKeys = (Array.isArray(body.profiles) ? body.profiles : []).slice(0, 100).map(entry => `profile:${String(entry?.id)}`);
    return leadFailures([...phoneKeys, `ip:${request.ip}`], reply, () => signInTransaction(pool, async client => {
      await requirePass(client, body.pass);
      const day = await runningDay(client);
      if (!matches(code, day.lead_code)) throw new WrongAccessCode(wrongLeadCode);
      const profile = await profileByName(client, name, body.profiles);
      return {profile, ...await signIn(client, day.id, profile, 'Lead')};
    }));
  });
  /** Today's role for each profile this phone holds, for the profile screen's tags; a profile whose secret no longer matches was moved away. */
  app.post('/api/phone-profiles', async request => {
    const body = request.body as {pass?: unknown; profiles?: unknown} | null;
    return signInTransaction(pool, async client => {
      await requirePass(client, body?.pass);
      const held = await heldProfiles(client, body?.profiles);
      const levels = new Map((await client.query('SELECT s.profile_id,s.level FROM sign_ins s JOIN olympics_days d ON d.id=s.day_id AND d.active WHERE s.profile_id=ANY($1::uuid[]) AND NOT s.signed_out', [[...held]])).rows
        .map(row => [row.profile_id as string, row.level as string]));
      return {profiles:((body?.profiles ?? []) as {id: string}[]).map(({id}) => held.has(id) ? {id, level:levels.get(id) ?? null} : {id, moved:true})};
    });
  });
}
