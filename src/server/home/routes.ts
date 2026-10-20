import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { readResults,resultsSnapshot } from '../results/read.js';
import { actions } from '../access/permissions.js';
/** Home's poll: who the phone is and, for a lead, the To check count. The events come live from `/api/live/home`. */
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', (_request, _reply, phone) => resultsSnapshot(pool,phone.dayId,async db=>({phone,
    ...(phone.level === 'Volunteer' ? {} : {needsYou:await readResults(db,phone.dayId).then(read=>read.needsYou.length+read.profileRequests.length)})})));
  action('GET', '/api/lead', 'Lead', (_request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>readResults(db,phone.dayId)));
}
