import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import type pg from 'pg';
import { createHash } from 'node:crypto';
import { levels, type Level, type Phone } from '../../shared/domain.js';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export class Refusal extends Error {
  /** Details travel beside the message, for example a 401's reason or a taken name's marker. */
  constructor(public statusCode: number, message: string, public details?: Record<string, unknown>) { super(message); }
}
export function requireLevel(phone: Phone, minimum: Level) {
  if (levels.indexOf(phone.level) < levels.indexOf(minimum)) throw new Refusal(403, `${minimum} access needed`);
}
/** Whether a token names an Olympics day that is no longer running (Start new day deleted its sign-ins). */
async function endedDay(pool: pg.Pool, token: string) {
  const dayId = token.match(/^([0-9a-f-]{36})\./)?.[1];
  return Boolean(dayId) && !(await pool.query('SELECT 1 FROM olympics_days WHERE active AND id::text=$1', [dayId])).rowCount;
}
/** All authenticated feature actions use this registration boundary. */
export function actions(app: FastifyInstance, pool: pg.Pool) {
  return (method: HTTPMethods, url: string, minimum: Level, handler: (request: FastifyRequest, reply: FastifyReply, phone: Phone) => unknown) => {
    app.route({method, url, handler: async (request, reply) => {
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new Refusal(401, 'Please join the Olympics day');
      const result = await pool.query(`SELECT p.id, p.day_id AS "dayId", p.name, p.level, p.profile_id AS "profileId" FROM sign_ins p JOIN olympics_days d ON d.id=p.day_id WHERE p.token_hash=$1 AND NOT p.signed_out AND d.active`, [tokenHash(token)]);
      const phone = result.rows[0] as Phone | undefined;
      if (!phone) throw new Refusal(401, 'Please join the Olympics day', await endedDay(pool, token) ? {reason:'new-day'} : undefined);
      requireLevel(phone, minimum);
      return handler(request, reply, phone);
    }});
  };
}
