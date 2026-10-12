import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { listRaces,raceChange,readRace } from './records.js';
import { timesOutOfOrder } from '../../shared/time-entry.js';
import { timesWaiting } from '../../shared/recording.js';
export function timesRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/jobs/times','Volunteer',async(_request,_reply,phone)=>{
    const races=(await listRaces(pool,phone.dayId)).filter(race=>race.kind!=='final');
    return {waiting:timesWaiting(races),recent:races.filter(race=>race.parts.times.value!==null).slice(-10).reverse()};
  });
  action('POST','/api/races/:id/times','Volunteer',async(request,_reply,phone)=>{
    const body=request.body as {baseVersion?:unknown;places?:unknown}|null;
    if(!Number.isSafeInteger(body?.baseVersion) || Number(body?.baseVersion)<0) throw new Refusal(400,'Open the race before saving its times');
    const places=body?.places;
    if(!Array.isArray(places) || places.length>6 || places.some(time=>time!==null && (!Number.isSafeInteger(time) || time<0))) throw new Refusal(400,'Enter whole hundredths or No finisher for every place');
    const firstEmpty=places.indexOf(null);
    if(firstEmpty>=0 && places.slice(firstEmpty).some(time=>time!==null)) throw new Refusal(400,'No finisher belongs only at the bottom of the times');
    return raceChange(pool,phone,async client=>{
      const race=await readRace(client,phone.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races - ask a lead');
      if(race.kind==='final') throw new Refusal(409,'Finals use finishing order only');
      if(body!.baseVersion!==race.parts.times.version) throw new Refusal(409,'These times have changed - open the race again');
      const count=race.parts.runners.value?.length||0;
      if(places.length<count || places.slice(count).some(time=>time!==null)) throw new Refusal(409,'The runner list has changed - open the race again');
      const currentPlaces=places.slice(0,count);
      await client.query("UPDATE race_parts SET value=$1,version=version+1,saved_at=now(),saved_by=$2 WHERE race_id=$3 AND part='times'",[JSON.stringify({places:currentPlaces,outOfOrder:timesOutOfOrder(currentPlaces)}),phone.id,race.id]);
      return {status:'saved',race:await readRace(client,phone.dayId,race.id)};
    });
  });
}
