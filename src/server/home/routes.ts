import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions } from '../access/permissions.js';
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', (_request, _reply, phone) => ({
    phone, waiting: {'Start line':0, 'Finish order':0, Times:0},
    ...(phone.level === 'Volunteer' ? {} : {needsYou:0})
  }));
  action('GET', '/api/lead', 'Lead', () => ({needsYou: [], events: []}));
}
