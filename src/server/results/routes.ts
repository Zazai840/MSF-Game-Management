import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions } from '../access/permissions.js';
import { readResults,readEventResults,resultsSnapshot } from './read.js';
import { readGroups } from '../races/race-flow.js';
import { actionRequired,cardState,leadCardLine } from '../../shared/race-flow.js';
import type { ResultsGridRead } from '../../shared/lead-results.js';
import type { Database } from '../races/records.js';
/** The Results list: the lead results, each event with its Races card's colour and words and whether it is in Action required (switched-off events too). */
async function readResultsGrid(db:Database,dayId:string):Promise<ResultsGridRead> {
  const read=await readResults(db,dayId),groups=new Map((await readGroups(db,dayId,undefined,true)).map(group=>[group.event.id,group]));
  return {...read,groups:read.groups.map(({name,events})=>({name,events:events.map(item=>{
    const group=groups.get(item.event.id)!;
    return {...item,card:{state:cardState(group),line:leadCardLine(group,read.needsYou),actionRequired:actionRequired(group,read.needsYou)}};
  })}))};
}
export function resultsRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/lead/results','Lead',(_request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>readResultsGrid(db,phone.dayId)));
  action('GET','/api/lead/events/:code/results','Lead',(request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>readEventResults(db,phone.dayId,(request.params as {code:string}).code)));
}
