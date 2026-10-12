import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions } from '../access/permissions.js';
export function dayRoutes(app: FastifyInstance, pool: pg.Pool) {
  actions(app, pool)('GET', '/api/day', 'Scoring team', async () => {
    const day = (await pool.query('SELECT day_code,lead_code FROM olympics_days WHERE active')).rows[0];
    return {dayCode: day.day_code, leadCode: day.lead_code};
  });
}
