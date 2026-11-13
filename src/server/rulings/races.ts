import { createRace,nextNumber } from '../races/create.js';
import { placeList,refuseImpossibleTimes } from '../races/steps.js';
import type { Runner,FinishingOrder,RaceEntry,TeamEntry } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandWarnings } from '../../shared/wristband-checks.js';
import { keptWarningNumbers,wristbandRaces } from '../races/warnings.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import { actions,Refusal } from '../access/permissions.js';
import { readRace,requireRace,withReplacement,type StoredRace } from '../races/records.js';
import { correctPart,leadRace } from '../races/versions.js';
import { readEventResults,resultsSnapshot } from '../results/read.js';
import { reopenEntryChecks,rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
import { remakeLineUp } from './finals.js';
import { removedPlaces,timesOutOfOrder,timesWithoutPlaces } from '../../shared/time-entry.js';
import { entryName,entryNumber,isTeamEntry,raceLabel,runnersOf } from '../../shared/races.js';
import { entryCount } from '../../shared/teams.js';
import { correctTeam,fourBoxes,joiningTeam,readTeamLists,relayLists } from '../relays/teams.js';
/** These corrections rewrite a race child by child, so a relay race's teams would be lost: "Correct teams" corrects them. */
function requireNotRelay(race:{event:{relay:boolean}}) {
  if(race.event.relay) throw new Refusal(409,'A relay race is corrected by team');
}
/**
 * A lead's corrected finishing order, and the times with it: a removed place loses its time, so the entries below keep
 * their own (`timesWithoutPlaces`). The removed places are those of the entries that left the order, unless `removed`
 * names them. An order cleared to be recorded again removes no place.
 */
async function correctFinish(client:pg.PoolClient,lead:Phone,race:StoredRace,finish:FinishingOrder|null,runners:RaceEntry[],removed?:number[]) {
  await correctPart(client,lead,race,'finish',finish,runners);
  const stored=race.parts.times.value,times=finish?timesWithoutPlaces(stored,removed??removedPlaces(race.parts.finish.value?.order||[],finish.order)):stored;
  if(times!==stored) await correctPart(client,lead,race,'times',times,runners);
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
      requireRace(race,'correct');
      if(race.kind==='final') throw new Refusal(409,'Finals use finishing order only');
      if(value.baseVersion!==race.parts.times.version) throw new Refusal(409,'These times have changed - open the race again');
      const count=race.parts.runners.value?.length||0;
      if(places.length>count) throw new Refusal(409,`This race has ${entryCount(count,race.event.relay)} - enter no more places than that`);
      if(places.length<count) throw new Refusal(409,race.event.relay?'The teams in this race have changed - open the race again':'The runner list has changed - open the race again');
      refuseImpossibleTimes(places,race.parts.times.value?.places,race.event.name);
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
      requireRace(race,value.permanent?'delete for good':'delete');
      if(value.permanent) await client.query('DELETE FROM races WHERE id=$1',[race.id]);
      else await client.query('UPDATE races SET deleted=true,delete_reason=$1,deleted_at=now() WHERE id=$2',['lead-delete',race.id]);
      if(race.kind==='heat') await remakeLineUp(client,current,race.event.code);
      await writeAuditNote(client,current,race.event.id,{action:value.permanent?'delete-race-permanently':'delete-race',comment,message:`${current.name} ${value.permanent?'permanently deleted':'moved to Deleted races'} ${raceLabel(race)}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  action('POST','/api/lead/races/:id/restore','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      requireRace(race,'restore');
      // The heats are complete and this heat is not: restored, it would leave the made final with a heat still to run.
      if(race.kind==='heat' && race.state!=='saved' && race.stageComplete) throw new Refusal(409,'Reopen the heats first');
      if(race.kind==='final' && (await client.query("SELECT 1 FROM events WHERE id=$1 AND phase='no final'",[race.event.id])).rowCount) throw new Refusal(409,'Results were decided without a final - reopen results first');
      // A live race has its number now: it comes back with the next one, never touching the live race.
      const taken=(await client.query('SELECT 1 FROM races WHERE event_id=$1 AND kind=$2 AND number=$3 AND NOT deleted',[race.event.id,race.kind,race.number])).rowCount;
      const number=taken?await nextNumber(client,race.event.id,race.kind):race.number;
      await client.query('UPDATE races SET deleted=false,delete_reason=null,deleted_at=null,number=$2 WHERE id=$1',[race.id,number]);
      if(race.kind==='heat') await remakeLineUp(client,current,race.event.code);
      await writeAuditNote(client,current,race.event.id,{action:'restore-race',comment,message:`${current.name} restored ${raceLabel(race)}${taken?` as ${raceLabel({...race,number})}`:''}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',number,...await readEventResults(client,current.dayId,race.event.code)};
    });
  });

  action('POST','/api/lead/races/:id/re-run','Lead',async(request,_reply,phone)=>{
    const {comment}=rulingDetails(request.body,false);
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      requireRace(race,'rule');
      if(!race.parts.runners.value?.length) throw new Refusal(409,'There are no runners to re-run');
      requireRace(race,'re-run');
      // The same children in new entries: a team keeps its four children as they ran, a child their warnings.
      const runners:RaceEntry[]=race.parts.runners.value!.map(entry=>isTeamEntry(entry)?{id:randomUUID(),team:entry.team,legs:entry.legs}:{id:randomUUID(),wristband:entry.wristband,warnings:(entry.warnings||[]).filter(warning=>warning.kind!=='already-ran')});
      await client.query('UPDATE races SET deleted=true,delete_reason=$1,deleted_at=now() WHERE id=$2',['re-run',race.id]);
      // Made after the replaced race is deleted, so it can keep that race's number.
      const {id}=await createRace(client,runners,{dayId:current.dayId,eventId:race.event.id,kind:race.kind,savedBy:current.id,number:race.number});
      if(race.final) {
        const ids=new Map(race.final.entries.map(entry=>[entry.finalEntryId,runners[(race.parts.runners.value||[]).findIndex(runner=>runner.id===entry.finalEntryId)]?.id||randomUUID()]));
        const entries=race.final.entries.map(entry=>({...entry,finalEntryId:ids.get(entry.finalEntryId)!,...(entry.runner?{runner:{...entry.runner,id:ids.get(entry.finalEntryId)!}}:{}),...(entry.replacesEntryId?{replacesEntryId:ids.get(entry.replacesEntryId)!}:{})}));
        const additionalEntries=(race.final.additionalEntries||[]).map(entry=>({...entry,runner:{...entry.runner,id:runners[(race.parts.runners.value||[]).findIndex(runner=>runner.id===entry.runner.id)]?.id||randomUUID()}}));
        await client.query('INSERT INTO race_finals(race_id,entries,additional_entries,generation) VALUES($1,$2,$3,$4)',[id,JSON.stringify(entries),JSON.stringify(additionalEntries),randomUUID()]);
        // A re-run final is to be run again: medals it decided are open again.
        await client.query("UPDATE events SET phase='final' WHERE id=$1 AND phase='medals'",[race.event.id]);
      }
      await writeAuditNote(client,current,race.event.id,{action:'re-run',comment,message:`${current.name} called a re-run of ${raceLabel(race)}${comment?`: ${comment}`:''}`,touches:[{raceId:race.id},{raceId:id}]});
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
      requireRace(race,'correct');
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
      if(JSON.stringify(finish)!==JSON.stringify(race.parts.finish.value)) await correctFinish(client,current,race,finish,runners);
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
      requireRace(race,'correct');
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
        if(team) runners.push(joiningTeam(team));
        else if(item.legs && item.legs.some((wristband,index)=>wristband!==old!.legs[index].wristband)) {
          runners.push(await correctTeam(client,current,race,old!,item.legs,kept));changed.push(old!.id);
        } else runners.push(old!);
      }
      const ids=new Set(runners.map(entry=>entry.id)),finish=race.parts.finish.value,added=runners.filter(entry=>!previous.includes(entry) && !changed.includes(entry.id));
      await correctPart(client,current,race,'runners',runners,runners);
      if(finish) {
        const next={order:[...finish.order.filter(id=>ids.has(id)),...added.map(entry=>entry.id)],didNotFinish:finish.didNotFinish.filter(id=>ids.has(id))};
        if(JSON.stringify(next)!==JSON.stringify(finish)) await correctFinish(client,current,race,next,runners);
      }
      for(const entryId of changed) await reopenEntryChecks(client,race.id,entryId);
      await writeAuditNote(client,current,race.event.id,{action:'correct-runners',comment,message:`${current.name} corrected the teams for ${raceLabel(race)}: ${runners.map(entryName).join(', ')||'none'}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
  /**
   * Correct finishing order: wristbands (on a relay, team numbers) move between places while times stay by place; Didn't
   * run takes the entry off the race, so a relay team is still to run again. A place taken away loses its time:
   * `removedPlaces` names those places as the times count them (the screen's, where a drag may come before No place),
   * or else they are the places the leaving entries had. More places than entries leaving is the screen's No place and
   * then Give a place on one entry.
   */
  action('POST','/api/lead/races/:id/finish-order','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false),unclassified="Choose a place, Did not finish or Didn't run for every runner";
    if(!Number.isSafeInteger(value.baseVersion) || Number(value.baseVersion)<0 || !Number.isSafeInteger(value.runnersVersion) || Number(value.runnersVersion)<1) throw new Refusal(400,'Open the race before correcting its finishing order');
    const numbers=(list:unknown)=>{if(!Array.isArray(list) || list.some(number=>!Number.isSafeInteger(number))) throw new Refusal(400,unclassified);return list as number[];};
    const order=numbers(value.order),didNotFinish=numbers(value.didNotFinish),didNotRun=numbers(value.didNotRun);
    const unopened='Open the race before correcting its finishing order',removed=value.removedPlaces===undefined?undefined:placeList(value.removedPlaces);
    if(removed===null) throw new Refusal(400,unopened);
    return rulingChange(pool,phone,async(client,current)=>{
      const race=await readRace(client,current.dayId,(request.params as {id:string}).id);
      requireRace(race,'correct');
      if(value.baseVersion!==race.parts.finish.version || value.runnersVersion!==race.parts.runners.version) throw new Refusal(409,'This race has changed - open it again');
      const previous=race.parts.runners.value||[],classified=[...order,...didNotFinish,...didNotRun];
      if(classified.length!==previous.length || new Set(classified).size!==classified.length || classified.some(number=>!previous.some(entry=>entryNumber(entry)===number))) throw new Refusal(400,unclassified);
      const entryFor=(number:number)=>previous.find(entry=>entryNumber(entry)===number)!,idFor=(number:number)=>entryFor(number).id;
      // The places named are never trusted: each is a place of the saved order, and every entry that leaves it takes one.
      const saved=race.parts.finish.value?.order||[],leaving=removedPlaces(saved,order.map(idFor)).length;
      if(removed && (removed.length<leaving || removed.some(place=>place>=saved.length))) throw new Refusal(400,unopened);
      const runners=previous.filter(entry=>!didNotRun.includes(entryNumber(entry))),names=(list:number[])=>list.map(number=>entryName(entryFor(number))).join(', ');
      if(didNotRun.length) await correctPart(client,current,race,'runners',runners,runners);
      await correctFinish(client,current,race,{order:order.map(idFor),didNotFinish:didNotFinish.map(idFor)},runners,removed);
      const details=[names(order)||'no places',...(didNotFinish.length?[`Did not finish ${names(didNotFinish)}`]:[]),...(didNotRun.length?[`Didn't run ${names(didNotRun)}`]:[])].join('; ');
      await writeAuditNote(client,current,race.event.id,{action:'correct-finish-order',comment,message:`${current.name} corrected the finishing order for ${raceLabel(race)}: ${details}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,race.event.code)};
    });
  });
}
