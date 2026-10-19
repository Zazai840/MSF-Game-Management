import { createRace } from './create.js';
import { readCompletedStages } from '../rulings/stages.js';
import type { Runner } from '../../shared/races.js';
import { rememberRace,partVersion,savePart } from './versions.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, newDay, Refusal } from '../access/permissions.js';
import { raceChange, readRace, requireStageOpen, requireStartLineEdit, listRaces,jobRace } from './records.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { annotateRunners,keptWarningNumbers,wristbandRaces } from './warnings.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
function runnerNumbers(body:unknown):number[] {
  const runners=(body as {runners?:unknown}|null)?.runners;
  const refusal=runnerListRefusal(runners);
  if (refusal) throw new Refusal(400,refusal);
  return runners as number[];
}
export function raceRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('POST','/api/wristband-check','Volunteer',async(request,_reply,phone)=>{
    const body=request.body as {eventCode?:unknown;wristband?:unknown;raceId?:unknown}|null;
    const refusal=runnerListRefusal([body?.wristband]);
    if (refusal) throw new Refusal(400,refusal);
    if (typeof body?.eventCode!=='string') throw new Refusal(400,'Choose an event and section');
    if (body.raceId!==undefined && typeof body.raceId!=='string') throw new Refusal(400,'Choose a race');
    const event=(await pool.query('SELECT id,section FROM events WHERE day_id=$1 AND code=$2',[phone.dayId,body.eventCode])).rows[0];
    if (!event) throw new Refusal(404,'Event not found');
    const race=typeof body.raceId==='string'?await readRace(pool,phone.dayId,body.raceId):null;
    if(race && race.event.id!==event.id) throw new Refusal(400,'Choose this race event');
    return {warnings:wristbandWarnings(body.wristband as number,event.section,await wristbandRaces(pool,phone.dayId,event.id),{currentRaceId:body.raceId,skipAlreadyRan:race?.kind==='final'})};
  });
  action('GET','/api/jobs/start-line','Volunteer',async(_request,_reply,phone)=>{
    const day=(await pool.query('SELECT events_confirmed FROM olympics_days WHERE id=$1 AND active',[phone.dayId])).rows[0];
    if (!day) throw newDay();
    const events=(await pool.query('SELECT id,code,name,section,format,enabled FROM events WHERE day_id=$1 AND enabled ORDER BY programme_order,code',[phone.dayId])).rows;
    const races=await listRaces(pool,phone.dayId);
    return {completedStages:await readCompletedStages(pool,phone.dayId),events,eventsConfirmed:day.events_confirmed,waiting:races.filter(race=>!race.stageComplete && race.parts.finish.value===null && race.kind!=='final').map(jobRace),recent:races.slice(-10).reverse().map(jobRace)};
  });
  action('GET','/api/races/:id','Volunteer',async(request,_reply,phone)=>jobRace(await readRace(pool,phone.dayId,(request.params as {id:string}).id)));
  // Each job uses this same Volunteer boundary for all three permission levels.
  action('POST','/api/races/check-in','Volunteer',async(request,_reply,phone)=>{
    const runnersInput=runnerNumbers(request.body);
    const kept=keptWarningNumbers(request.body,runnersInput);
    const body=request.body as {eventCode?:unknown;requestId?:unknown};
    if (typeof body.eventCode!=='string') throw new Refusal(400,'Choose an event and section');
    if (body.requestId!==undefined && (typeof body.requestId!=='string' || !/^[a-z\d-]{1,100}$/i.test(body.requestId))) throw new Refusal(400,'Start a new check-in');
    const requestId=body.requestId || randomUUID();
    return raceChange(pool,phone,async(client,unchanged)=>{
      const existing=(await client.query('SELECT id,event_id,original_runners FROM races WHERE day_id=$1 AND request_id=$2',[phone.dayId,requestId])).rows[0];
      if (existing) {
        const race=await readRace(client,phone.dayId,existing.id);
        requireStageOpen(race);
        if (race.event.code!==body.eventCode || JSON.stringify(existing.original_runners)!==JSON.stringify(runnersInput)) throw new Refusal(409,'This check-in was already saved - open the race to edit it');
        unchanged();
        return {status:'saved',race:jobRace(race)};
      }
      const event=(await client.query('SELECT * FROM events WHERE day_id=$1 AND code=$2',[phone.dayId,body.eventCode])).rows[0];
      if (!event) throw new Refusal(404,'Event not found');
      const completed=(await readCompletedStages(client,phone.dayId)).some(stage=>stage.eventId===event.id && stage.stage===(event.format==='heats'?'heats':'event'));
      if(completed) throw new Refusal(409,'Stage complete - ask a lead');
      if (!event.enabled) throw new Refusal(409,'This event is switched off');
      const kind=event.format==='heats'?'heat':'race';
      const id=randomUUID();
      const runners=await annotateRunners(client,phone.dayId,event,runnersInput.map(wristband=>({id:randomUUID(),wristband})),kept,id);
      await createRace(client,runners,{id,dayId:phone.dayId,eventId:event.id,kind,savedBy:phone.id,requestId,originalRunners:runnersInput});
      const race=await readRace(client,phone.dayId,id);await rememberRace(client,race);
      return {status:'saved',race:jobRace(race)};
    });
  });
  action('POST','/api/races/:id/runners','Volunteer',async(request,_reply,phone)=>{
    const numbers=runnerNumbers(request.body);
    const kept=keptWarningNumbers(request.body,numbers);
    const baseVersion=(request.body as {baseVersion?:unknown}).baseVersion;
    if (!Number.isSafeInteger(baseVersion) || Number(baseVersion)<1) throw new Refusal(400,'Open the race before saving its runners');
    return raceChange(pool,phone,async client=>{
      const race=await readRace(client,phone.dayId,(request.params as {id:string}).id);
      requireStageOpen(race);
      if(race.kind==='final' || race.deleted || baseVersion===race.parts.runners.version) requireStartLineEdit(race);
      const previous=(await partVersion<Runner[]>(client,race,'runners',Number(baseVersion))).value || [];
      const runners=await annotateRunners(client,phone.dayId,race.event,numbers.map(wristband=>previous.find(runner=>runner.wristband===wristband)||{id:randomUUID(),wristband}),kept,race.id,previous);
      const status=await savePart(client,phone,race,'runners',Number(baseVersion),runners);
      return {status,race:jobRace(await readRace(client,phone.dayId,race.id))};
    });
  });
  action('POST','/api/races/:id/delete','Volunteer',async(request,_reply,phone)=>{
    const permanent=(request.body as {permanent?:unknown}|null)?.permanent;
    if (typeof permanent!=='boolean') throw new Refusal(400,'Choose Delete permanently or move to Deleted races');
    return raceChange(pool,phone,async client=>{
      const race=await readRace(client,phone.dayId,(request.params as {id:string}).id);
      requireStageOpen(race);
      requireStartLineEdit(race);
      if (permanent) await client.query('DELETE FROM races WHERE id=$1',[race.id]);
      else await client.query('UPDATE races SET deleted=true,delete_reason=$1 WHERE id=$2',['start-line',race.id]);
      return {status:'saved'};
    });
  });
}
