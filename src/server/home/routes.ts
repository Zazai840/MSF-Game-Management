import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { listRaces } from '../races/records.js';
import { timesWaiting } from '../../shared/recording.js';
import { actions } from '../access/permissions.js';
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', async(_request, _reply, phone) => {
    const races=(await listRaces(pool,phone.dayId)).filter(race=>!race.stageComplete);
    const finish=races.filter(race=>race.parts.finish.value===null).length;
    return {phone, waiting: {'Start line':finish, 'Finish order':finish, Times:timesWaiting(races).length},
      ...(phone.level === 'Volunteer' ? {} : {needsYou:0})};
  });
  action('GET', '/api/lead', 'Lead', () => ({needsYou: [], events: []}));
}
