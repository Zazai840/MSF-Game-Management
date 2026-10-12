import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { readResults,resultsSnapshot } from '../results/read.js';
import { listRaces } from '../races/records.js';
import { timesWaiting } from '../../shared/recording.js';
import { actions } from '../access/permissions.js';
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', (_request, _reply, phone) => resultsSnapshot(pool,async db=>{
    const allRaces=await listRaces(db,phone.dayId),races=allRaces.filter(race=>!race.stageComplete);
    const finish=races.filter(race=>race.parts.finish.value===null).length;
    return {phone, waiting: {'Start line':finish, 'Finish order':finish, Times:timesWaiting(races).length},
      ...(phone.level === 'Volunteer' ? {} : {needsYou:(await readResults(db,phone.dayId,allRaces)).needsYou.length})};
  }));
  action('GET', '/api/lead', 'Lead', (_request,_reply,phone)=>resultsSnapshot(pool,db=>readResults(db,phone.dayId)));
}
