import { readCompletedStages } from '../rulings/stages.js';
import { savePart } from './versions.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { listRaces,raceChange,readRace,requireStageOpen } from './records.js';
import { timesOutOfOrder } from '../../shared/time-entry.js';
import { timesWaiting } from '../../shared/recording.js';
export function timesRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/jobs/times','Volunteer',async(_request,_reply,phone)=>{
    const races=(await listRaces(pool,phone.dayId)).filter(race=>race.kind!=='final');
    return {completedStages:await readCompletedStages(pool,phone.dayId),waiting:timesWaiting(races),recent:races.filter(race=>race.parts.times.value!==null).slice(-10).reverse()};
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
      requireStageOpen(race);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races - ask a lead');
      if(race.kind==='final') throw new Refusal(409,'Finals use finishing order only');
      const count=race.parts.runners.value?.length||0;
      // Another job may have changed the runner count after this phone opened.
      // Keep every recorded time; a count disagreement remains visible for checking.
      const numericCount=places.filter(time=>time!==null).length;
      const currentPlaces=places.slice(0,Math.max(count,numericCount));
      const accepted=race.parts.times.value?.acceptedByLead && JSON.stringify(race.parts.times.value.places)===JSON.stringify(currentPlaces);
      const status=await savePart(client,phone,race,'times',Number(body!.baseVersion),{places:currentPlaces,outOfOrder:timesOutOfOrder(currentPlaces),...(accepted?{acceptedByLead:true}:{})});
      return {status,race:await readRace(client,phone.dayId,race.id)};
    });
  });
}
