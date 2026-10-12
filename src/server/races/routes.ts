import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal } from '../access/permissions.js';
import { raceChange, readRace, requireStartLineEdit, listRaces } from './records.js';
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
    return {warnings:wristbandWarnings(body.wristband as number,event.section,await wristbandRaces(pool,phone.dayId,event.id),{currentRaceId:body.raceId})};
  });
  action('GET','/api/jobs/start-line','Volunteer',async(_request,_reply,phone)=>{
    const day=(await pool.query('SELECT events_confirmed FROM olympics_days WHERE id=$1 AND active',[phone.dayId])).rows[0];
    if (!day) throw new Refusal(401,'Please join the Olympics day');
    const events=(await pool.query('SELECT id,code,name,section,format,enabled FROM events WHERE day_id=$1 AND enabled ORDER BY programme_order,code',[phone.dayId])).rows;
    const races=await listRaces(pool,phone.dayId);
    return {events:day.events_confirmed?events:[],eventsConfirmed:day.events_confirmed,waiting:races.filter(race=>race.parts.finish.value===null),recent:races.slice(-10).reverse()};
  });
  action('GET','/api/races/:id','Volunteer',(request,_reply,phone)=>readRace(pool,phone.dayId,(request.params as {id:string}).id));
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
        if (race.event.code!==body.eventCode || JSON.stringify(existing.original_runners)!==JSON.stringify(runnersInput)) throw new Refusal(409,'This check-in was already saved - open the race to edit it');
        unchanged();
        return {status:'saved',race};
      }
      const day=(await client.query('SELECT events_confirmed FROM olympics_days WHERE id=$1',[phone.dayId])).rows[0];
      if (!day.events_confirmed) throw new Refusal(409,'Ask the scoring team to confirm the event list');
      const event=(await client.query('SELECT * FROM events WHERE day_id=$1 AND code=$2',[phone.dayId,body.eventCode])).rows[0];
      if (!event) throw new Refusal(404,'Event not found');
      if (!event.enabled) throw new Refusal(409,'This event is switched off');
      const kind=event.format==='heats'?'heat':'race';
      const counter=(await client.query(`INSERT INTO race_counters(event_id,kind,last_number) VALUES($1,$2,1) ON CONFLICT(event_id,kind) DO UPDATE SET last_number=race_counters.last_number+1 RETURNING last_number`,[event.id,kind])).rows[0];
      const id=randomUUID();
      await client.query('INSERT INTO races(id,day_id,event_id,kind,number,request_id,original_runners) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,phone.dayId,event.id,kind,counter.last_number,requestId,JSON.stringify(runnersInput)]);
      const runners=await annotateRunners(client,phone.dayId,event,runnersInput.map(wristband=>({id:randomUUID(),wristband})),kept,id);
      for (const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,$6)',[id,part,part==='runners'?1:0,part==='runners'?JSON.stringify(runners):null,part==='runners'?phone.id:null,part==='runners'?new Date():null]);
      return {status:'saved',race:await readRace(client,phone.dayId,id)};
    });
  });
  action('POST','/api/races/:id/runners','Volunteer',async(request,_reply,phone)=>{
    const numbers=runnerNumbers(request.body);
    const kept=keptWarningNumbers(request.body,numbers);
    const baseVersion=(request.body as {baseVersion?:unknown}).baseVersion;
    if (!Number.isSafeInteger(baseVersion) || Number(baseVersion)<1) throw new Refusal(400,'Open the race before saving its runners');
    return raceChange(pool,phone,async client=>{
      const race=await readRace(client,phone.dayId,(request.params as {id:string}).id);
      requireStartLineEdit(race);
      if (baseVersion!==race.parts.runners.version) throw new Refusal(409,'This runner list has changed - open the race again');
      const previous=race.parts.runners.value || [];
      const runners=await annotateRunners(client,phone.dayId,race.event,numbers.map(wristband=>previous.find(runner=>runner.wristband===wristband)||{id:randomUUID(),wristband}),kept,race.id,previous);
      await client.query('UPDATE race_parts SET value=$1,version=version+1,saved_at=now(),saved_by=$2 WHERE race_id=$3 AND part=$4',[JSON.stringify(runners),phone.id,race.id,'runners']);
      return {status:'saved',race:await readRace(client,phone.dayId,race.id)};
    });
  });
  action('POST','/api/races/:id/delete','Volunteer',async(request,_reply,phone)=>{
    const permanent=(request.body as {permanent?:unknown}|null)?.permanent;
    if (typeof permanent!=='boolean') throw new Refusal(400,'Choose Delete permanently or move to Deleted races');
    return raceChange(pool,phone,async client=>{
      const race=await readRace(client,phone.dayId,(request.params as {id:string}).id);
      requireStartLineEdit(race);
      if (permanent) await client.query('DELETE FROM races WHERE id=$1',[race.id]);
      else await client.query('UPDATE races SET deleted=true,delete_reason=$1 WHERE id=$2',['start-line',race.id]);
      return {status:'saved'};
    });
  });
}
