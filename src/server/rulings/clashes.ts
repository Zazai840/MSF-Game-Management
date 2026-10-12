import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { raceParts,partLabel,type RacePartName,type PartValue } from '../../shared/race-clashes.js';
import { raceLabel,type Runner,type FinishingOrder } from '../../shared/races.js';
import { actions,Refusal } from '../access/permissions.js';
import { leadRace,publishPart,samePart } from '../races/versions.js';
import { rulingChange,writeAuditNote } from './records.js';
import { readEventResults } from '../results/read.js';
export function clashRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/lead/races/:id','Lead',async(request,_reply,phone)=>{
    const client=await pool.connect();
    try {await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await leadRace(client,phone.dayId,(request.params as {id:string}).id);await client.query('COMMIT');return result;}
    catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  });
  action('POST','/api/lead/races/:id/clashes/:part','Lead',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const {id,part:partInput}=request.params as {id:string;part:string};
    const part=raceParts.find(part=>part===partInput);
    const candidateId=(request.body as {candidateId?:unknown}|null)?.candidateId;
    if(!part || typeof candidateId!=='string') throw new Refusal(400,'Choose a saved version');
    const read=await leadRace(client,current.dayId,id),race=read.race;
    if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
    const chosen=read.clashes.find(clash=>clash.part===part)?.candidates.find(candidate=>candidate.id===candidateId);
    if(!chosen) throw new Refusal(409,'That clash has changed - open the race again');
    await client.query('UPDATE race_part_saves SET active=false WHERE race_id=$1 AND part=$2 AND active',[race.id,part]);
    if(part==='finish' && !samePart('runners',chosen.runners,chosen.runners,race.parts.runners.value,race.parts.runners.value||[])) await publishPart(client,current,race,'runners',chosen.runners,chosen.runners);
    await publishPart(client,current,race,part,chosen.value,part==='runners'?chosen.value as Runner[]:chosen.runners);
    if(part==='runners' && race.parts.finish.value && [...race.parts.finish.value.order,...race.parts.finish.value.didNotFinish].some(entryId=>!(chosen.value as Runner[]).some(runner=>runner.id===entryId))) await publishPart(client,current,race,'finish',null,chosen.value as Runner[]);
    await writeAuditNote(client,current,race.event.id,{action:`Chose ${partLabel(part)} version`,message:`${current.name} chose ${chosen.author||'the unrecorded'} ${partLabel(part).toLowerCase()} version for ${raceLabel(race)}`,comment:null,touches:[{raceId:race.id}]});
    return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
  }));
}
