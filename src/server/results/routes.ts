import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions } from '../access/permissions.js';
import { readResults,readEventResults } from './read.js';
/** A read sees one consistent day while phones save other races. */
async function snapshot<T>(pool:pg.Pool,read:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();
  try {await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await read(client);await client.query('COMMIT');return result;}
  catch(error) {await client.query('ROLLBACK');throw error;}
  finally {client.release();}
}
export function resultsRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/lead/results','Lead',(_request,_reply,phone)=>snapshot(pool,db=>readResults(db,phone.dayId)));
  action('GET','/api/lead/events/:code/results','Lead',(request,_reply,phone)=>snapshot(pool,db=>readEventResults(db,phone.dayId,(request.params as {code:string}).code)));
}
