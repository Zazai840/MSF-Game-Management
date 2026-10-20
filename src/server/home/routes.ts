import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { readResults,resultsSnapshot } from '../results/read.js';
import { listRaces } from '../races/records.js';
import { actions } from '../access/permissions.js';
import { readEvents } from '../day/events.js';
import { currentRaces } from '../races/current.js';
import type { HomeEvent } from '../../shared/race-screen.js';
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', (_request, _reply, phone) => resultsSnapshot(pool,phone.dayId,async db=>{
    const races=await listRaces(db,phone.dayId),events=await readEvents(db,true,phone.dayId),current=await currentRaces(db,phone.dayId,events,races);
    return {phone, events:events.map(({id,code,name,section}):HomeEvent=>{const {kind,number}=current.get(id)!;return {code,name,section,race:{kind,number}};}),
      ...(phone.level === 'Volunteer' ? {} : {needsYou:await readResults(db,phone.dayId,races).then(read=>read.needsYou.length+read.profileRequests.length)})};
  }));
  action('GET', '/api/lead', 'Lead', (_request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>readResults(db,phone.dayId)));
}
