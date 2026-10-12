import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions } from '../access/permissions.js';
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', async(_request, _reply, phone) => {
    const counts=(await pool.query(`SELECT COUNT(*) FILTER (WHERE f.value IS NULL)::int AS start,
      COUNT(*) FILTER (WHERE f.value IS NULL)::int AS finish,
      COUNT(*) FILTER (WHERE t.value IS NULL AND r.kind!='final')::int AS times
      FROM races r JOIN race_parts f ON f.race_id=r.id AND f.part='finish'
      JOIN race_parts t ON t.race_id=r.id AND t.part='times' WHERE r.day_id=$1 AND NOT r.deleted`,[phone.dayId])).rows[0];
    return {phone, waiting: {'Start line':counts.start, 'Finish order':counts.finish, Times:counts.times},
      ...(phone.level === 'Volunteer' ? {} : {needsYou:0})};
  });
  action('GET', '/api/lead', 'Lead', () => ({needsYou: [], events: []}));
}
