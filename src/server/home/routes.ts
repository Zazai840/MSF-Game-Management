import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { readResults,resultsSnapshot } from '../results/read.js';
import { actions } from '../access/permissions.js';
/** Home's poll: who the phone is and, for a lead, the To check count. The races come live from `/api/live/races`. */
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  // `waiting: {}` is for the switch-over release only: an older build still open reads `waiting[job]` and goes white
  // without it. Remove it in the release after.
  action('GET', '/api/home', 'Volunteer', (_request, _reply, phone) => resultsSnapshot(pool,phone.dayId,async db=>({phone,waiting:{},
    // The role this phone last reported (ADR 0007), its own only: the phone reports again when it is not the one it shows.
    role:(await db.query('SELECT reported_role FROM sign_ins WHERE id=$1',[phone.id])).rows[0]?.reported_role??null,
    ...(phone.level === 'Volunteer' ? {} : {needsYou:await readResults(db,phone.dayId).then(read=>read.needsYou.length)})})));
  action('GET', '/api/lead', 'Lead', (_request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>readResults(db,phone.dayId)));
}
