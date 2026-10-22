import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions, Refusal } from '../access/permissions.js';
import { readRace } from './records.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandRaces } from './warnings.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
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
}
