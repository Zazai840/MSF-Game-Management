import type { Runner,FinishingOrder } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
import { keptWarningNumbers,wristbandRaces } from '../races/warnings.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { readRace } from '../races/records.js';
import { publishPart } from '../races/versions.js';
import { readEventResults } from '../results/read.js';
import { rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
import { timesOutOfOrder } from '../../shared/time-entry.js';
import { raceLabel } from '../../shared/races.js';
export function raceRulingRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('POST','/api/lead/races/:id/times','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false),places=value.places;
    if(!Number.isSafeInteger(value.baseVersion) || Number(value.baseVersion)<0) throw new Refusal(400,'Open the race before correcting its times');
    if(!Array.isArray(places) || places.length>6 || places.some(time=>time!==null && (!Number.isSafeInteger(time) || time<0))) throw new Refusal(400,'Enter whole hundredths or No finisher for every place');
    const empty=places.indexOf(null);if(empty>=0 && places.slice(empty).some(time=>time!==null)) throw new Refusal(400,'No finisher belongs only at the bottom of the times');
    if(value.acceptOutOfOrder!==undefined && typeof value.acceptOutOfOrder!=='boolean') throw new Refusal(400,'Choose whether to accept these times');
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      if(race.kind==='final') throw new Refusal(409,'Finals use finishing order only');
      if(value.baseVersion!==race.parts.times.version) throw new Refusal(409,'These times have changed - open the race again');
      const count=race.parts.runners.value?.length||0;
      if(places.length<count || places.slice(count).some(time=>time!==null)) throw new Refusal(409,'The runner list has changed - open the race again');
      const currentPlaces=places.slice(0,count),outOfOrder=timesOutOfOrder(currentPlaces),acceptedByLead=outOfOrder && value.acceptOutOfOrder===true;
      await publishPart(client,current,race,'times',{places:currentPlaces,outOfOrder,...(acceptedByLead?{acceptedByLead:true}:{})});
      await writeAuditNote(client,current,race.event.id,{action:acceptedByLead?'accept-times':'correct-times',comment,message:`${current.name} ${acceptedByLead?'accepted out-of-order times':'corrected the times'} for ${raceLabel(race)}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('GET','/api/lead/events/:code/deleted-races','Lead',async(request,_reply,phone)=>{
    const {code}=request.params as {code:string};
    const event=(await pool.query('SELECT id FROM events WHERE day_id=$1 AND code=$2',[phone.dayId,code])).rows[0];
    if(!event) throw new Refusal(404,'Event not found');
    const rows=(await pool.query('SELECT id FROM races WHERE day_id=$1 AND event_id=$2 AND deleted ORDER BY checked_in_at DESC,id',[phone.dayId,event.id])).rows;
    return Promise.all(rows.map(row=>readRace(pool,phone.dayId,row.id)));
  });
  action('POST','/api/lead/races/:id/delete','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false);
    if(typeof value.permanent!=='boolean') throw new Refusal(400,'Choose Delete permanently or move to Deleted races');
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted && !value.permanent) throw new Refusal(409,'This race is already in Deleted races');
      if(value.permanent) await client.query('DELETE FROM races WHERE id=$1',[race.id]);
      else await client.query('UPDATE races SET deleted=true,delete_reason=$1 WHERE id=$2',['lead-delete',race.id]);
      await writeAuditNote(client,current,race.event.id,{action:value.permanent?'delete-race-permanently':'delete-race',comment,message:`${current.name} ${value.permanent?'permanently deleted':'moved to Deleted races'} ${raceLabel(race)}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('POST','/api/lead/races/:id/restore','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(!race.deleted) throw new Refusal(409,'This race is already in the event');
      await client.query('UPDATE races SET deleted=false,delete_reason=null WHERE id=$1',[race.id]);
      await writeAuditNote(client,current,race.event.id,{action:'restore-race',comment,message:`${current.name} restored ${raceLabel(race)}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });

  action('POST','/api/lead/races/:id/re-run','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      if(!race.parts.runners.value?.length) throw new Refusal(409,'There are no runners to re-run');
      const runners=race.parts.runners.value.map(runner=>({id:randomUUID(),wristband:runner.wristband,warnings:(runner.warnings||[]).filter(warning=>warning.kind!=='already-ran')}));
      await client.query('UPDATE races SET deleted=true,delete_reason=$1 WHERE id=$2',['re-run',race.id]);
      const counter=(await client.query('INSERT INTO race_counters(event_id,kind,last_number) VALUES($1,$2,1) ON CONFLICT(event_id,kind) DO UPDATE SET last_number=race_counters.last_number+1 RETURNING last_number',[race.event.id,race.kind])).rows[0];
      const id=randomUUID();
      await client.query('INSERT INTO races(id,day_id,event_id,kind,number,original_runners) VALUES($1,$2,$3,$4,$5,$6)',[id,current.dayId,race.event.id,race.kind,counter.last_number,JSON.stringify(runners.map(runner=>runner.wristband))]);
      for(const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,$6)',[id,part,part==='runners'?1:0,part==='runners'?JSON.stringify(runners):null,part==='runners'?current.id:null,part==='runners'?new Date():null]);
      await writeAuditNote(client,current,race.event.id,{action:'re-run',comment,message:`${current.name} called a re-run of ${raceLabel(race)} as ${raceLabel({...race,number:counter.last_number})}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id},{raceId:id}]});
      return {status:'saved',newRaceId:id,...await readEventResults(client,current.dayId,race.event.code)};
    });
  });

  action('POST','/api/lead/races/:id/runners','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false),input=value.runners;
    if(!Array.isArray(input) || input.some(entry=>!entry || typeof entry!=='object' || Array.isArray(entry) || (entry.entryId!==undefined && typeof entry.entryId!=='string'))) throw new Refusal(400,'Enter the runner list');
    const numbers=input.map(entry=>entry.wristband),refusal=runnerListRefusal(numbers);
    if(refusal && numbers.length!==0) throw new Refusal(400,refusal);
    const entryIds=input.filter(entry=>entry.entryId!==undefined).map(entry=>entry.entryId);
    if(new Set(entryIds).size!==entryIds.length) throw new Refusal(400,'Choose each runner only once');
    const kept=keptWarningNumbers(value,numbers);
    if(!Number.isSafeInteger(value.baseVersion) || Number(value.baseVersion)<1 || !Number.isSafeInteger(value.finishVersion) || Number(value.finishVersion)<0) throw new Refusal(400,'Open the race before correcting its runners');
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      if(value.baseVersion!==race.parts.runners.version || value.finishVersion!==race.parts.finish.version) throw new Refusal(409,'This race has changed - open it again');
      const previous=race.parts.runners.value||[],otherRaces=await wristbandRaces(client,current.dayId,race.event.id);
      const changed:string[]=[];
      const runners:Runner[]=input.map(entry=>{
        const old=entry.entryId===undefined?undefined:previous.find(runner=>runner.id===entry.entryId);
        if(entry.entryId!==undefined && !old) throw new Refusal(400,'Choose a runner from this race');
        if(old && old.wristband===entry.wristband) return old;
        const id=old?.id||randomUUID();changed.push(id);
        const warnings=wristbandWarnings(entry.wristband,race.event.section,otherRaces,{currentRaceId:race.id,skipAlreadyRan:race.kind==='final'}).map(warning=>({...warning,kept:kept.includes(entry.wristband)}));
        return {...(old||{id,...(race.parts.finish.value?{addedAtFinish:true}:{})}),wristband:entry.wristband,warnings};
      });
      const additions=runners.filter(runner=>!previous.some(old=>old.id===runner.id));
      let finish:FinishingOrder|null=race.parts.finish.value;
      if(value.finish!==undefined) {
        const supplied=value.finish as {order?:unknown;didNotFinish?:unknown}|null;
        if(!supplied || !Array.isArray(supplied.order) || !Array.isArray(supplied.didNotFinish)) throw new Refusal(400,'Choose a place or Did not finish for every runner');
        const classified=[...supplied.order,...supplied.didNotFinish];
        if(classified.length!==numbers.length || new Set(classified).size!==classified.length || classified.some(number=>!numbers.includes(number))) throw new Refusal(400,'Choose a place or Did not finish for every runner');
        const idFor=(number:unknown)=>runners.find(runner=>runner.wristband===number)!.id;
        finish={order:supplied.order.map(idFor),didNotFinish:supplied.didNotFinish.map(idFor)};
      } else if(additions.length && finish) finish=null;
      else if(finish) {
        const keptIds=new Set(runners.map(runner=>runner.id));
        finish={order:finish.order.filter(id=>keptIds.has(id)),didNotFinish:finish.didNotFinish.filter(id=>keptIds.has(id))};
      }
      await publishPart(client,current,race,'runners',runners,runners);
      if(JSON.stringify(finish)!==JSON.stringify(race.parts.finish.value)) await publishPart(client,current,race,'finish',finish,runners);
      for(const entryId of changed) await client.query('INSERT INTO runner_rulings(race_id,entry_id,warning_checks,not_counted) VALUES($1,$2,$3,false) ON CONFLICT(race_id,entry_id) DO UPDATE SET warning_checks=EXCLUDED.warning_checks,not_counted=false',[race.id,entryId,'[]']);
      await writeAuditNote(client,current,race.event.id,{action:'correct-runners',comment,message:`${current.name} corrected the runners for ${raceLabel(race)}: ${numbers.join(', ')||'none'}${finish===null && race.parts.finish.value?'; Finish order must be recorded again':''}${comment?` — ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });

}
