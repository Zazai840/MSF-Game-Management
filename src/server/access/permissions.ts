import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import type pg from 'pg';
import { createHash } from 'node:crypto';
import { levels, type Level, type Phone } from '../../shared/domain.js';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export class Refusal extends Error {
  /** Details travel beside the message, for example a 401's reason or a taken name's marker. */
  constructor(public statusCode: number, message: string, public details?: Record<string, unknown>) { super(message); }
}
/** Every 401 says why, so the phone clears exactly what that reason calls for. */
export const signedOut = () => new Refusal(401, 'You are signed out. Sign in again', {reason:'signed-out'});
export const newDay = () => new Refusal(401, 'A new Olympics day has started. Tap your name to sign in.', {reason:'new-day'});
export function requireLevel(phone: Phone, minimum: Level) {
  if (levels.indexOf(phone.level) < levels.indexOf(minimum)) throw new Refusal(403, `${minimum} access needed`);
}
/** All authenticated feature actions use this registration boundary. */
export function actions(app: FastifyInstance, pool: pg.Pool) {
  return (method: HTTPMethods, url: string, minimum: Level, handler: (request: FastifyRequest, reply: FastifyReply, phone: Phone) => unknown) => {
    app.route({method, url, handler: async (request, reply) => {
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw signedOut();
      const hash = tokenHash(token);
      const result = await pool.query(`SELECT p.id, p.day_id AS "dayId", p.name, p.level, p.profile_id AS "profileId" FROM sign_ins p JOIN olympics_days d ON d.id=p.day_id WHERE p.token_hash=$1 AND NOT p.signed_out AND d.active`, [hash]);
      const phone = result.rows[0] as Phone | undefined;
      if (!phone) {
        // Start new day deletes the old day's sign-ins, so a token not found on the active day is from a day that has gone.
        const known = (await pool.query('SELECT 1 FROM sign_ins p JOIN olympics_days d ON d.id=p.day_id WHERE p.token_hash=$1 AND d.active', [hash])).rowCount;
        throw known ? signedOut() : newDay();
      }
      requireLevel(phone, minimum);
      return handler(request, reply, phone);
    }});
  };
}
