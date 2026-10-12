import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions } from '../access/permissions.js';
import { readResults,readEventResults,resultsSnapshot } from './read.js';
export function resultsRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/lead/results','Lead',(_request,_reply,phone)=>resultsSnapshot(pool,db=>readResults(db,phone.dayId)));
  action('GET','/api/lead/events/:code/results','Lead',(request,_reply,phone)=>resultsSnapshot(pool,db=>readEventResults(db,phone.dayId,(request.params as {code:string}).code)));
}
