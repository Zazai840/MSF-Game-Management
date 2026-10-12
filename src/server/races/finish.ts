import { randomUUID } from 'node:crypto';
import { annotateRunners,keptWarningNumbers } from './warnings.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { listRaces,raceChange,readRace } from './records.js';
export function finishOrderRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/jobs/finish-order','Volunteer',async(_request,_reply,phone)=>{
    const races=await listRaces(pool,phone.dayId);
    return {waiting:races.filter(race=>race.parts.finish.value===null),recent:races.filter(race=>race.parts.finish.value!==null).slice(-10).reverse()};
  });
  action('POST','/api/races/:id/finish','Volunteer',async(request,_reply,phone)=>{
    const body=request.body as {baseVersion?:unknown;runnersVersion?:unknown;order?:unknown;didNotFinish?:unknown;didNotRun?:unknown;added?:unknown}|null;
    if(!Number.isSafeInteger(body?.baseVersion) || Number(body?.baseVersion)<0 || !Number.isSafeInteger(body?.runnersVersion) || Number(body?.runnersVersion)<1) throw new Refusal(400,'Open the race before saving its finishing order');
    function numbers(value:unknown):number[] {
      if(!Array.isArray(value) || value.some(number=>!Number.isSafeInteger(number) || number<0)) throw new Refusal(400,'Choose a wristband number for every runner');
      return value;
    }
    const order=numbers(body?.order),didNotFinish=numbers(body?.didNotFinish),didNotRun=numbers(body?.didNotRun),added=numbers(body?.added);
    const kept=keptWarningNumbers(request.body,added);
    return raceChange(pool,phone,async client=>{
      const race=await readRace(client,phone.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races - ask a lead');
      if(body!.baseVersion!==race.parts.finish.version || body!.runnersVersion!==race.parts.runners.version) throw new Refusal(409,'This race has changed - open it again');
      const previous=race.parts.runners.value||[];
      const original=previous.map(runner=>runner.wristband);
      const refusal=runnerListRefusal([...original.filter(number=>!didNotRun.includes(number)),...added]);
      if(refusal && !(refusal==='Enter at least one wristband number' && didNotRun.length===original.length)) throw new Refusal(400,refusal);
      if(added.some(number=>original.includes(number))) throw new Refusal(400,'That runner is already in this race');
      const classified=[...order,...didNotFinish,...didNotRun];
      const all=[...original,...added];
      if(classified.length!==all.length || new Set(classified).size!==classified.length || classified.some(number=>!all.includes(number)) || didNotRun.some(number=>!original.includes(number))) throw new Refusal(400,'Choose a place, Did not finish or Did not run for every runner');
      const runners=await annotateRunners(client,phone.dayId,race.event,[...previous.filter(runner=>!didNotRun.includes(runner.wristband)),...added.map(wristband=>({id:randomUUID(),wristband,addedAtFinish:true}))],kept,race.id,previous);
      const idFor=(number:number)=>runners.find(runner=>runner.wristband===number)!.id;
      if(added.length || didNotRun.length) await client.query("UPDATE race_parts SET value=$1,version=version+1,saved_at=now(),saved_by=$2 WHERE race_id=$3 AND part='runners'",[JSON.stringify(runners),phone.id,race.id]);
      await client.query("UPDATE race_parts SET value=$1,version=version+1,saved_at=now(),saved_by=$2 WHERE race_id=$3 AND part='finish'",[JSON.stringify({order:order.map(idFor),didNotFinish:didNotFinish.map(idFor)}),phone.id,race.id]);
      return {status:'saved',race:await readRace(client,phone.dayId,race.id)};
    });
  });
}
