import { requireFinalReady } from '../rulings/finals.js';
import { readCompletedStages } from '../rulings/stages.js';
import type { Runner } from '../../shared/races.js';
import { partVersion,savePart,publishPart,sameRunnerSnapshot } from './versions.js';
import { randomUUID } from 'node:crypto';
import { annotateRunners,keptWarningNumbers } from './warnings.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { listRaces,raceChange,readRace,requireStageOpen,jobRace } from './records.js';
export function finishOrderRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/jobs/finish-order','Volunteer',async(_request,_reply,phone)=>{
    const races=await listRaces(pool,phone.dayId);
    return {completedStages:await readCompletedStages(pool,phone.dayId),waiting:races.filter(race=>!race.stageComplete && race.parts.finish.value===null && (race.kind!=='final' || ((race.final?.heatsComplete || race.final?.hasRun) && race.final.presenceConfirmed))).map(jobRace),recent:races.filter(race=>race.parts.finish.value!==null).slice(-10).reverse().map(jobRace)};
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
      requireStageOpen(race);requireFinalReady(race);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races - ask a lead');
      const previous=(await partVersion<Runner[]>(client,race,'runners',Number(body!.runnersVersion))).value||[];
      const original=previous.map(runner=>runner.wristband);
      const refusal=runnerListRefusal([...original.filter(number=>!didNotRun.includes(number)),...added]);
      if(refusal && !(refusal==='Enter at least one wristband number' && didNotRun.length===original.length)) throw new Refusal(400,refusal);
      if(added.some(number=>original.includes(number))) throw new Refusal(400,'That runner is already in this race');
      const classified=[...order,...didNotFinish,...didNotRun];
      const all=[...original,...added];
      if(classified.length!==all.length || new Set(classified).size!==classified.length || classified.some(number=>!all.includes(number)) || didNotRun.some(number=>!original.includes(number))) throw new Refusal(400,'Choose a place, Did not finish or Did not run for every runner');
      const input=[...previous.filter(runner=>!didNotRun.includes(runner.wristband)),...added.map(wristband=>({id:randomUUID(),wristband,addedAtFinish:true}))];
      const runners=await annotateRunners(client,phone.dayId,race.event,input,kept,race.id,previous,race.kind==='final');
      const idFor=(number:number)=>runners.find(runner=>runner.wristband===number)!.id;
      const runnerChange=!sameRunnerSnapshot(runners,race.parts.runners.value||[]);
      const runnerSnapshotChanged=!sameRunnerSnapshot(previous,race.parts.runners.value||[]);
      const status=await savePart(client,phone,race,'finish',Number(body!.baseVersion),{order:order.map(idFor),didNotFinish:didNotFinish.map(idFor)},{runners,runnersBefore:previous,forceClash:runnerSnapshotChanged,apply:async()=>{
        if(runnerChange) await publishPart(client,phone,race,'runners',runners,runners);
      }});
      return {status,race:jobRace(await readRace(client,phone.dayId,race.id))};
    });
  });
}
