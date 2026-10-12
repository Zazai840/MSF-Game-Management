import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import type pg from 'pg';
import { createHash } from 'node:crypto';
import { levels, type Level, type Phone } from '../../shared/domain.js';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export class Refusal extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export function requireLevel(phone: Phone, minimum: Level) {
  if (levels.indexOf(phone.level) < levels.indexOf(minimum)) throw new Refusal(403, `${minimum} access needed`);
}
/** All authenticated feature actions use this registration boundary. */
export function actions(app: FastifyInstance, pool: pg.Pool) {
  return (method: HTTPMethods, url: string, minimum: Level, handler: (request: FastifyRequest, reply: FastifyReply, phone: Phone) => unknown) => {
    app.route({method, url, handler: async (request, reply) => {
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new Refusal(401, 'Please join the Olympics day');
      const result = await pool.query(`SELECT p.id, p.day_id AS "dayId", p.name, p.level FROM phones p JOIN olympics_days d ON d.id=p.day_id WHERE p.token_hash=$1 AND NOT p.removed AND d.active`, [tokenHash(token)]);
      const phone = result.rows[0] as Phone | undefined;
      if (!phone) throw new Refusal(401, 'Please join the Olympics day');
      requireLevel(phone, minimum);
      return handler(request, reply, phone);
    }});
  };
}
