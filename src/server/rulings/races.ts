import { createRace } from '../races/create.js';
import { requireCurrentUnstarted } from '../races/current.js';
import type { Runner,FinishingOrder,RaceEntry,TeamEntry } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
import { keptWarningNumbers,wristbandRaces } from '../races/warnings.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { actions,Refusal } from '../access/permissions.js';
import { readRace,withReplacement } from '../races/records.js';
import { correctPart,leadRace } from '../races/versions.js';
import { readEventResults,resultsSnapshot } from '../results/read.js';
import { reopenEntryChecks,rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
import { timesOutOfOrder } from '../../shared/time-entry.js';
import { entryName,entryNumber,isTeamEntry,raceLabel,runnersOf } from '../../shared/races.js';
import { entryCount } from '../../shared/teams.js';
import { correctTeam,fourBoxes,joiningTeam,readTeamLists,relayLists } from '../relays/teams.js';
/** Lead corrections and Re-run change a saved race only: until then, its entries belong to the race screen. */
function requireSaved(race:{kind:'heat'|'final'|'race';number:number;state:string}) {
  if(race.state!=='saved') throw new Refusal(409,`${raceLabel(race)} is in progress - open the race screen`);
}
/** These corrections rewrite a race child by child, so a relay race's teams would be lost: "Correct teams" corrects them. */
function requireNotRelay(race:{event:{relay:boolean}}) {
  if(race.event.relay) throw new Refusal(409,'A relay race is corrected by team');
}
export function raceRulingRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  // A relay race's page carries the team list, and every switched-on relay's, which Correct teams checks against.
  action('GET','/api/lead/races/:id','Lead',(request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,async db=>{
    const read=await leadRace(db,phone.dayId,(request.params as {id:string}).id);
    return read.race.event.relay?{...read,...await relayLists(db,phone.dayId,read.race.event.id)}:read;
  }));
  action('POST','/api/lead/races/:id/times','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false),places=value.places;
    if(!Number.isSafeInteger(value.baseVersion) || Number(value.baseVersion)<0) throw new Refusal(400,'Open the race before correcting its times');
    if(!Array.isArray(places) || places.some(time=>time!==null && (!Number.isSafeInteger(time) || time<0))) throw new Refusal(400,'Enter whole hundredths or No finisher for every place');
    const empty=places.indexOf(null);if(empty>=0 && places.slice(empty).some(time=>time!==null)) throw new Refusal(400,'No finisher belongs only at the bottom of the times');
    if(value.acceptOutOfOrder!==undefined && typeof value.acceptOutOfOrder!=='boolean') throw new Refusal(400,'Choose whether to accept these times');
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      requireSaved(race);
      if(race.kind==='final') throw new Refusal(409,'Finals use finishing order only');
      if(value.baseVersion!==race.parts.times.version) throw new Refusal(409,'These times have changed - open the race again');
      const count=race.parts.runners.value?.length||0;
      if(places.length>count) throw new Refusal(409,`This race has ${entryCount(count,race.event.relay)} - enter no more places than that`);
      if(places.length<count) throw new Refusal(409,race.event.relay?'The teams in this race have changed - open the race again':'The runner list has changed - open the race again');
      const currentPlaces=places,outOfOrder=timesOutOfOrder(currentPlaces),acceptedByLead=outOfOrder && value.acceptOutOfOrder===true;
      await correctPart(client,current,race,'times',{places:currentPlaces,outOfOrder,...(acceptedByLead?{acceptedByLead:true}:{})});
      await writeAuditNote(client,current,race.event.id,{action:acceptedByLead?'accept-times':'correct-times',comment,message:`${current.name} ${acceptedByLead?'accepted out-of-order times':'corrected the times'} for ${raceLabel(race)}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('GET','/api/lead/events/:code/deleted-races','Lead',async(request,_reply,phone)=>{
    const {code}=request.params as {code:string},client=await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const event=(await client.query('SELECT id FROM events WHERE day_id=$1 AND code=$2',[phone.dayId,code])).rows[0];
      if(!event) throw new Refusal(404,'Event not found');
      const rows=(await client.query('SELECT id FROM races WHERE day_id=$1 AND event_id=$2 AND deleted ORDER BY checked_in_at DESC,id',[phone.dayId,event.id])).rows;
      const races=[];for(const row of rows) races.push(await withReplacement(client,phone.dayId,await readRace(client,phone.dayId,row.id)));
      await client.query('COMMIT');return races;
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
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
      if(race.deleteReason==='re-run') throw new Refusal(409,'This race was replaced by a re-run and cannot be restored');
      if(race.kind==='final' && (await client.query("SELECT 1 FROM event_stages WHERE event_id=$1 AND stage='no-final'",[race.event.id])).rowCount) throw new Refusal(409,'Results were decided without a final - reopen results first');
      if(race.state!=='saved') await requireCurrentUnstarted(client,current.dayId,race.event,'restore');
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
      await requireCurrentUnstarted(client,current.dayId,race.event,'re-run');
      requireSaved(race);
      // The same children in new entries: a team keeps its four children as they ran, a child their warnings.
      const runners:RaceEntry[]=race.parts.runners.value!.map(entry=>isTeamEntry(entry)?{id:randomUUID(),team:entry.team,legs:entry.legs}:{id:randomUUID(),wristband:entry.wristband,warnings:(entry.warnings||[]).filter(warning=>warning.kind!=='already-ran')});
      await client.query('UPDATE races SET deleted=true,delete_reason=$1 WHERE id=$2',['re-run',race.id]);
      const {id,number}=await createRace(client,runners,{dayId:current.dayId,eventId:race.event.id,kind:race.kind,savedBy:current.id});
      if(race.final) {
        const ids=new Map(race.final.entries.map(entry=>[entry.finalEntryId,runners[(race.parts.runners.value||[]).findIndex(runner=>runner.id===entry.finalEntryId)]?.id||randomUUID()]));
        const entries=race.final.entries.map(entry=>({...entry,finalEntryId:ids.get(entry.finalEntryId)!,...(entry.runner?{runner:{...entry.runner,id:ids.get(entry.finalEntryId)!}}:{}),...(entry.replacesEntryId?{replacesEntryId:ids.get(entry.replacesEntryId)!}:{})}));
        const additionalEntries=(race.final.additionalEntries||[]).map(entry=>({...entry,runner:{...entry.runner,id:runners[(race.parts.runners.value||[]).findIndex(runner=>runner.id===entry.runner.id)]?.id||randomUUID()}}));
        await client.query('INSERT INTO race_finals(race_id,entries,additional_entries,generation) VALUES($1,$2,$3,$4)',[id,JSON.stringify(entries),JSON.stringify(additionalEntries),randomUUID()]);
        await client.query("DELETE FROM event_stages WHERE event_id=$1 AND stage='final'",[race.event.id]);
      }
      await writeAuditNote(client,current,race.event.id,{action:'re-run',comment,message:`${current.name} called a re-run of ${raceLabel(race)} as ${raceLabel({...race,number})}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id},{raceId:id}]});
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
      requireSaved(race);
      requireNotRelay(race);
      if(value.baseVersion!==race.parts.runners.version || value.finishVersion!==race.parts.finish.version) throw new Refusal(409,'This race has changed - open it again');
      const previous=runnersOf(race.parts.runners.value),otherRaces=await wristbandRaces(client,current.dayId,race.event.id);
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
      await correctPart(client,current,race,'runners',runners,runners);
      if(JSON.stringify(finish)!==JSON.stringify(race.parts.finish.value)) await correctPart(client,current,race,'finish',finish,runners);
      for(const entryId of changed) await reopenEntryChecks(client,race.id,entryId);
      await writeAuditNote(client,current,race.event.id,{action:'correct-runners',comment,message:`${current.name} corrected the runners for ${raceLabel(race)}: ${numbers.join(', ')||'none'}${finish===null && race.parts.finish.value?'; Finish order must be recorded again':''}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  /**
   * Correct teams, the relay's "Correct runner list": the race's teams as they should be. A team left out comes off
   * the race (and is still to run again); one named by team id joins it from the team list, its children here, taking
   * the next place as a team added at the finish does; one sent with four boxes has its children corrected as a team write is, through to the team list on its latest race.
   */
  action('POST','/api/lead/races/:id/teams','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false),input=value.teams;
    if(!Array.isArray(input) || input.some(item=>!item || typeof item!=='object' || Array.isArray(item) || (typeof item.entryId==='string')===(typeof item.teamId==='string'))) throw new Refusal(400,'Choose the teams');
    if(input.some(item=>item.legs!==undefined && (!item.entryId || !fourBoxes(item.legs) || item.legs.every((leg:number|null)=>leg===null)))) throw new Refusal(400,'Enter the four wristband boxes');
    if(!Number.isSafeInteger(value.baseVersion) || Number(value.baseVersion)<1 || !Number.isSafeInteger(value.finishVersion) || Number(value.finishVersion)<0) throw new Refusal(400,'Open the race before correcting its teams');
    const kept=Array.isArray(value.keptWarnings)?value.keptWarnings:[];
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      requireSaved(race);
      if(!race.event.relay) throw new Refusal(409,'Only a relay has teams');
      if(value.baseVersion!==race.parts.runners.version || value.finishVersion!==race.parts.finish.version) throw new Refusal(409,'This race has changed - open it again');
      const previous=(race.parts.runners.value||[]).filter(isTeamEntry),list=(await readTeamLists(client,current.dayId)).get(race.event.id)!.teams;
      const runners:TeamEntry[]=[],changed:string[]=[];
      for(const item of input as Array<{entryId?:string;teamId?:string;legs?:Array<number|null>}>) {
        const old=item.entryId===undefined?undefined:previous.find(entry=>entry.id===item.entryId);
        if(item.entryId!==undefined && !old) throw new Refusal(400,'Choose a team from this race');
        const team=old?undefined:list.find(other=>other.id===item.teamId);
        if(!old && !team) throw new Refusal(404,'Team not found');
        const teamId=old?.team.id??team!.id;
        if(runners.some(entry=>entry.team.id===teamId)) throw new Refusal(400,'Choose each team once');
        // A lead's correction is not held back by a volunteer's open change.
        if(team) runners.push(joiningTeam(team,{here:true,evenIfChanging:true}));
        else if(item.legs && item.legs.some((wristband,index)=>wristband!==old!.legs[index].wristband)) {
          runners.push(await correctTeam(client,current,race,old!,item.legs,kept));changed.push(old!.id);
        } else runners.push(old!);
      }
      const ids=new Set(runners.map(entry=>entry.id)),finish=race.parts.finish.value,added=runners.filter(entry=>!previous.includes(entry) && !changed.includes(entry.id));
      await correctPart(client,current,race,'runners',runners,runners);
      if(finish) {
        const next={order:[...finish.order.filter(id=>ids.has(id)),...added.map(entry=>entry.id)],didNotFinish:finish.didNotFinish.filter(id=>ids.has(id))};
        if(JSON.stringify(next)!==JSON.stringify(finish)) await correctPart(client,current,race,'finish',next,runners);
      }
      for(const entryId of changed) await reopenEntryChecks(client,race.id,entryId);
      await writeAuditNote(client,current,race.event.id,{action:'correct-runners',comment,message:`${current.name} corrected the teams for ${raceLabel(race)}: ${runners.map(entryName).join(', ')||'none'}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  /**
   * Correct finishing order: wristbands (on a relay, team numbers) move between places while times stay by place; Didn't
   * run takes the entry off the race, so a relay team is still to run again.
   */
  action('POST','/api/lead/races/:id/finish-order','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false),unclassified="Choose a place, Did not finish or Didn't run for every runner";
    if(!Number.isSafeInteger(value.baseVersion) || Number(value.baseVersion)<0 || !Number.isSafeInteger(value.runnersVersion) || Number(value.runnersVersion)<1) throw new Refusal(400,'Open the race before correcting its finishing order');
    const numbers=(list:unknown)=>{if(!Array.isArray(list) || list.some(number=>!Number.isSafeInteger(number))) throw new Refusal(400,unclassified);return list as number[];};
    const order=numbers(value.order),didNotFinish=numbers(value.didNotFinish),didNotRun=numbers(value.didNotRun);
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      if(race.deleted) throw new Refusal(409,'This race is in Deleted races');
      requireSaved(race);
      if(value.baseVersion!==race.parts.finish.version || value.runnersVersion!==race.parts.runners.version) throw new Refusal(409,'This race has changed - open it again');
      const previous=race.parts.runners.value||[],classified=[...order,...didNotFinish,...didNotRun];
      if(classified.length!==previous.length || new Set(classified).size!==classified.length || classified.some(number=>!previous.some(entry=>entryNumber(entry)===number))) throw new Refusal(400,unclassified);
      const entryFor=(number:number)=>previous.find(entry=>entryNumber(entry)===number)!,idFor=(number:number)=>entryFor(number).id;
      const runners=previous.filter(entry=>!didNotRun.includes(entryNumber(entry))),names=(list:number[])=>list.map(number=>entryName(entryFor(number))).join(', ');
      if(didNotRun.length) await correctPart(client,current,race,'runners',runners,runners);
      await correctPart(client,current,race,'finish',{order:order.map(idFor),didNotFinish:didNotFinish.map(idFor)},runners);
      const details=[names(order)||'no places',...(didNotFinish.length?[`Did not finish ${names(didNotFinish)}`]:[]),...(didNotRun.length?[`Didn't run ${names(didNotRun)}`]:[])].join('; ');
      await writeAuditNote(client,current,race.event.id,{action:'correct-finish-order',comment,message:`${current.name} corrected the finishing order for ${raceLabel(race)}: ${details}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
}
