import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RacePartName } from '../../shared/race-clashes.js';
import { currentRaceLabel,jobWords,raceJobs,type RaceJob,type RaceScreenRead } from '../../shared/race-screen.js';
import type { FinishingOrder,Runner } from '../../shared/races.js';
import { timesOutOfOrder } from '../../shared/time-entry.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { stageForRace } from '../../shared/stage-lock.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { writeAuditNote } from '../rulings/records.js';
import { readCompletedStages } from '../rulings/stages.js';
import { createRace } from './create.js';
import { currentRaces } from './current.js';
import { raceChange,readRace,type Database } from './records.js';
import { publishPart,rememberRace,sameRunnerSnapshot } from './versions.js';
import { annotateRunners,keptWarningNumbers } from './warnings.js';
/** The race part each job writes. */
const jobParts:Record<RaceJob,RacePartName>={'check-in':'runners',order:'finish',times:'times'};
/** Every event's holds, by event id. Holds belong to the event, so they carry over to its next heat or race by themselves. */
export async function readHolds(db:Database,dayId:string):Promise<Map<string,RaceScreenRead['holds']>> {
  const rows=(await db.query('SELECT h.event_id,h.job,s.id,s.name FROM job_holds h JOIN events e ON e.id=h.event_id JOIN sign_ins s ON s.id=h.sign_in_id WHERE e.day_id=$1',[dayId])).rows;
  const holds=new Map<string,RaceScreenRead['holds']>();
  for(const row of rows) holds.set(row.event_id,{...holds.get(row.event_id),[row.job]:{id:row.id,name:row.name}});
  return holds;
}
/** A phone that is signed out holds nothing. Run inside the sign-out's change, so the day revision rises with it. */
export async function clearHolds(client:pg.PoolClient,signInId:string) {
  await client.query('DELETE FROM job_holds WHERE sign_in_id=$1',[signInId]);
}
/** One event's race screen: the event, its current race and who holds its jobs. */
export async function raceScreenRead(db:Database,dayId:string,code:string):Promise<RaceScreenRead> {
  const event=(await db.query('SELECT id,code,name,section,format,enabled FROM events WHERE day_id=$1 AND code=$2',[dayId,code])).rows[0];
  if(!event) throw new Refusal(404,'Event not found');
  const revision=Number((await db.query('SELECT revision FROM olympics_days WHERE id=$1',[dayId])).rows[0].revision);
  const race=(await currentRaces(db,dayId,[event])).get(event.id)!,stage=stageForRace({kind:race.kind,event});
  const stageComplete=(await readCompletedStages(db,dayId)).some(item=>item.eventId===event.id && item.stage===stage);
  return {revision,event,race,stageComplete,holds:(await readHolds(db,dayId)).get(event.id)||{}};
}
function requestedJob(body:unknown):RaceJob {
  const job=(body as {job?:unknown}|null)?.job;
  if(!raceJobs.includes(job as RaceJob)) throw new Refusal(400,'Choose check-in, the order or the times');
  return job as RaceJob;
}
/** A job that can be held now: its stage is open, and a final has no times. */
function requireJob(screen:RaceScreenRead,job:RaceJob) {
  if(screen.stageComplete) throw new Refusal(409,'Stage complete - ask a lead');
  if(job==='times' && screen.race.kind==='final') throw new Refusal(409,'A final has no times');
}
const takeHold=(client:pg.PoolClient,screen:RaceScreenRead,job:RaceJob,phone:Phone)=>client.query('INSERT INTO job_holds(event_id,job,sign_in_id) VALUES($1,$2,$3) ON CONFLICT(event_id,job) DO UPDATE SET sign_in_id=EXCLUDED.sign_in_id',[screen.event.id,job,phone.id]);
/**
 * The volunteer write rules, in the order they refuse: stage complete, race deleted, race saved, not the job's
 * holder, version behind. `raceId` and `version` are the race and part version the phone last saw (null and 0 for
 * the empty next race). Writing a job nobody holds takes it, as opening its card would.
 */
async function requireWrite(client:pg.PoolClient,phone:Phone,screen:RaceScreenRead,job:RaceJob,raceId:string|null,version:number) {
  requireJob(screen,job);
  if(raceId!==null && raceId!==screen.race.id) {
    // A race deleted permanently is gone, so its name is too.
    const race=await readRace(client,phone.dayId,raceId).catch(error=>{if(error instanceof Refusal) return null;throw error;});
    if(!race || race.event.id!==screen.event.id) throw new Refusal(409,'A lead deleted this race');
    if(race.deleted) throw new Refusal(409,`A lead deleted ${currentRaceLabel(race)}`);
    if(race.recording.readyForRanking) throw new Refusal(409,`${currentRaceLabel(race)} is saved - ask a lead to change it`);
  }
  const holder=screen.holds[job];
  if(holder && holder.id!==phone.id) throw new Refusal(409,`${holder.name} took over ${jobWords[job]}`);
  if(raceId!==screen.race.id || version!==screen.race.parts[jobParts[job]].version) throw new Refusal(409,'Not saved - check your entries and enter it again');
  if(!holder) await takeHold(client,screen,job,phone);
}
/**
 * The race screen's writes. Each runs under the day lock, raises the day revision when it changes anything (which
 * wakes every open stream), and answers with the race screen as it then stands, so the phone carries on from it at once.
 */
export function raceScreenRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),code=(request:FastifyRequest)=>(request.params as {code:string}).code;
  const read=(phone:Phone,code:string)=>resultsSnapshot(pool,phone.dayId,db=>raceScreenRead(db,phone.dayId,code));
  async function write(phone:Phone,code:string,change:(client:pg.PoolClient,screen:RaceScreenRead,unchanged:()=>void)=>Promise<void>) {
    await raceChange(pool,phone,async(client,unchanged)=>change(client,await raceScreenRead(client,phone.dayId,code),unchanged));
    return read(phone,code);
  }
  action('GET','/api/race-screen/:code','Volunteer',(request,_reply,phone)=>read(phone,code(request)));
  // Opening a job's card takes its hold when nobody has it; otherwise nothing changes and the phone watches.
  action('POST','/api/race-screen/:code/hold','Volunteer',(request,_reply,phone)=>{
    const job=requestedJob(request.body);
    return write(phone,code(request),async(client,screen,unchanged)=>{
      requireJob(screen,job);
      if(screen.holds[job]) unchanged();
      else await takeHold(client,screen,job,phone);
    });
  });
  // Take over: the hold passes to this phone (after its confirm), with an audit note naming who had it.
  action('POST','/api/race-screen/:code/take-over','Volunteer',(request,_reply,phone)=>{
    const job=requestedJob(request.body);
    return write(phone,code(request),async(client,screen,unchanged)=>{
      requireJob(screen,job);
      const from=screen.holds[job];
      if(from?.id===phone.id) {unchanged();return;}
      await takeHold(client,screen,job,phone);
      if(from) await writeAuditNote(client,phone,screen.event.id,{action:'take-over',message:`${phone.name} took over ${jobWords[job]} from ${from.name} on ${screen.event.name} ${screen.event.section} ${currentRaceLabel(screen.race)}`,comment:null,touches:screen.race.id?[{raceId:screen.race.id}]:[]});
    });
  });
  // Check-in: the holder's whole list of wristbands, a fixed number keeping its entry. The first write on the empty next race creates it.
  action('POST','/api/race-screen/:code/check-in','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {raceId?:unknown;version?:unknown;runners?:unknown};
    const {raceId,version}=seenRace(body,'Open the race before checking runners in');
    const entries=(Array.isArray(body.runners)?body.runners:[]) as Array<{id?:unknown;wristband?:unknown}>;
    if(!Array.isArray(body.runners) || entries.some(entry=>!entry || typeof entry!=='object' || (entry.id!==undefined && typeof entry.id!=='string'))) throw new Refusal(400,'Enter the runner list');
    const numbers=entries.map(entry=>entry.wristband) as number[];
    // Taking the last runner off leaves the stored race with nobody checked in; only a first runner stores a race.
    const refusal=!numbers.length && raceId!==null?null:runnerListRefusal(numbers);
    if(refusal) throw new Refusal(400,refusal);
    const ids=entries.flatMap(entry=>typeof entry.id==='string'?[entry.id]:[]);
    if(new Set(ids).size!==ids.length) throw new Refusal(400,'Choose each runner only once');
    const kept=keptWarningNumbers(body,numbers);
    return write(phone,code(request),async(client,screen)=>{
      await requireWrite(client,phone,screen,'check-in',raceId,version);
      if(screen.race.kind==='final') throw new Refusal(409,"Mark the final's runners Here or Absent");
      const previous=screen.race.parts.runners.value||[],id=screen.race.id||randomUUID();
      // A fixed number keeps its entry, so its place follows it. A number sent without its entry keeps the entry
      // already holding that number. Unchanged numbers keep their warnings; a new or fixed one gets the server's.
      const input=entries.map(({id:entryId,wristband})=>{
        if(entryId===undefined) return previous.find(runner=>runner.wristband===wristband && !ids.includes(runner.id))||{id:randomUUID(),wristband:wristband as number};
        const old=previous.find(runner=>runner.id===entryId);
        if(!old) throw new Refusal(400,'Choose a runner from this race');
        return {...old,wristband:wristband as number};
      });
      const runners=await annotateRunners(client,phone.dayId,screen.event,input,kept,id,previous);
      if(!screen.race.id) {
        if(!screen.event.enabled) throw new Refusal(409,'This event is switched off');
        await createRace(client,runners,{id,dayId:phone.dayId,eventId:screen.event.id,kind:screen.race.kind,savedBy:phone.id});
        await rememberRace(client,await readRace(client,phone.dayId,id));
        return;
      }
      await publishPart(client,phone,await readRace(client,phone.dayId,id),'runners',runners,runners);
      await dropFromOrder(client,screen,runners);
    });
  });
  // Here / Absent on the final: the check-in holder's whole list of absent seeded runners, by entry. Only those Here
  // are the final's runners, so one marked Absent leaves the order holder's list, and comes back when marked Here.
  action('POST','/api/race-screen/:code/absent','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {raceId?:unknown;version?:unknown;absent?:unknown};
    const {raceId,version}=seenRace(body,'Open the final before marking who is here');
    if(!Array.isArray(body.absent) || body.absent.some(id=>typeof id!=='string') || new Set(body.absent).size!==body.absent.length) throw new Refusal(400,'Choose the absent runners');
    const absent=body.absent as string[];
    return write(phone,code(request),async(client,screen)=>{
      await requireWrite(client,phone,screen,'check-in',raceId,version);
      if(raceId===null || screen.race.kind!=='final') throw new Refusal(409,'Only a final has Here / Absent');
      const race=await readRace(client,phone.dayId,raceId),final=race.final!,previous=race.parts.runners.value||[];
      const lineup=[...final.entries.map(entry=>entry.runner||{id:entry.finalEntryId,wristband:entry.heatWristband}),...(final.additionalEntries||[]).map(entry=>entry.runner)];
      if(absent.some(id=>!lineup.some(runner=>runner.id===id))) throw new Refusal(400,'Choose a runner from this final');
      const runners=lineup.filter(runner=>!absent.includes(runner.id)).map(runner=>previous.find(current=>current.id===runner.id)||runner);
      if(new Set(runners.map(runner=>runner.wristband)).size!==runners.length) throw new Refusal(409,'Ask a lead to settle the final line-up');
      // The runner list is the attendance: publishing it marks everyone else Absent on the final's line-up.
      await publishPart(client,phone,race,'runners',runners,runners);
      await dropFromOrder(client,screen,runners);
    });
  });
  // The order: the holder's whole finishing order by entry, with Did not finish, Didn't run (which takes the runner
  // off the race) and runners added at the finish. Runners check-in has since taken off are dropped, later places moving up.
  action('POST','/api/race-screen/:code/order','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {raceId?:unknown;version?:unknown;order?:unknown;didNotFinish?:unknown;didNotRun?:unknown;added?:unknown};
    const {raceId,version}=seenRace(body,'Open the race before saving its finishing order');
    const unclassified="Choose a place, Did not finish or Didn't run for each runner";
    const entryIds=(value:unknown)=>{
      if(!Array.isArray(value) || value.some(id=>typeof id!=='string')) throw new Refusal(400,unclassified);
      return value as string[];
    };
    const order=entryIds(body.order),didNotFinish=entryIds(body.didNotFinish),didNotRun=entryIds(body.didNotRun),classified=[...order,...didNotFinish,...didNotRun];
    if(new Set(classified).size!==classified.length) throw new Refusal(400,unclassified);
    if(!Array.isArray(body.added)) throw new Refusal(400,'Enter the runners added at the finish');
    const added=body.added as number[],addedRefusal=added.length?runnerListRefusal(added):null;
    if(addedRefusal) throw new Refusal(400,addedRefusal);
    const kept=keptWarningNumbers(body,added);
    return write(phone,code(request),async(client,screen)=>{
      await requireWrite(client,phone,screen,'order',raceId,version);
      if(raceId===null) throw new Refusal(409,'Check runners in before the order');
      const previous=screen.race.parts.runners.value||[],race=await readRace(client,phone.dayId,raceId);
      const already=added.find(number=>previous.some(runner=>runner.wristband===number));
      if(already!==undefined) throw new Refusal(400,`${already} is already in this race`);
      const input=[...previous.filter(runner=>!didNotRun.includes(runner.id)),...added.map(wristband=>({id:randomUUID(),wristband,addedAtFinish:true}))];
      // A final's runners all ran in its heats, so "already ran in this event" does not apply.
      const runners=await annotateRunners(client,phone.dayId,screen.event,input,kept,raceId,previous,screen.race.kind==='final');
      if(!sameRunnerSnapshot(runners,previous)) await publishPart(client,phone,race,'runners',runners,runners);
      const finish=onlyRunners({order,didNotFinish},runners);
      await publishPart(client,phone,race,'finish',finish.order.length || finish.didNotFinish.length?finish:null,runners);
    });
  });
  // The times: the holder's whole column by place, with the wrong times kept as typed. Only a place with a wristband
  // takes a time; a time left at a place that has since lost its wristband stays as it is.
  action('POST','/api/race-screen/:code/times','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {raceId?:unknown;version?:unknown;places?:unknown;keptWrong?:unknown};
    const {raceId,version}=seenRace(body,'Open the race before saving its times');
    const hundredths=(value:unknown)=>Array.isArray(value) && value.every(item=>Number.isSafeInteger(item) && item>=0);
    if(!hundredths(body.places)) throw new Refusal(400,'Enter whole hundredths for every place');
    if(!hundredths(body.keptWrong)) throw new Refusal(400,'Choose the wrong times to keep');
    const places=body.places as number[],keptWrong=body.keptWrong as number[];
    return write(phone,code(request),async(client,screen)=>{
      await requireWrite(client,phone,screen,'times',raceId,version);
      if(raceId===null) throw new Refusal(409,'Check runners in before the times');
      const placed=screen.race.parts.finish.value?.order.length||0,stored=screen.race.parts.times.value;
      const unplaced=places.findIndex((time,index)=>index>=placed && time!==stored?.places[index]);
      if(unplaced>=0) throw new Refusal(409,`Place ${unplaced+1} has no wristband yet`);
      const wrong=wrongTimes(places).map(item=>item.index),accepted=stored?.acceptedByLead && JSON.stringify(stored.places)===JSON.stringify(places);
      await publishPart(client,phone,await readRace(client,phone.dayId,raceId),'times',{places,outOfOrder:timesOutOfOrder(places),keptWrong:wrong.filter(index=>keptWrong.includes(index)),...(accepted?{acceptedByLead:true}:{})});
    });
  });
}
/** The race and part version a write was made on: null and 0 for the empty next race. */
function seenRace(body:{raceId?:unknown;version?:unknown},message:string) {
  if(body.raceId!==null && typeof body.raceId!=='string') throw new Refusal(400,'Choose a race');
  if(!Number.isSafeInteger(body.version) || Number(body.version)<0) throw new Refusal(400,message);
  return {raceId:body.raceId as string|null,version:Number(body.version)};
}
/**
 * A runner taken off (or marked Absent) drops out of the order, later places moving up. The order's version stays as
 * it is: it counts the order holder's own changes, so an order they send before seeing this is still saved.
 */
async function dropFromOrder(client:pg.PoolClient,screen:RaceScreenRead,runners:readonly Runner[]) {
  const finish=screen.race.parts.finish.value,left=finish && onlyRunners(finish,runners);
  if(finish && JSON.stringify(left)!==JSON.stringify(finish)) await client.query(`UPDATE race_parts SET value=$1 WHERE race_id=$2 AND part='finish'`,[JSON.stringify(left),screen.race.id]);
}
/** A finishing order keeping only the race's runners: anyone taken off drops out, and later places move up. */
function onlyRunners(finish:FinishingOrder,runners:readonly Runner[]):FinishingOrder {
  const on=(id:string)=>runners.some(runner=>runner.id===id);
  return {order:finish.order.filter(on),didNotFinish:finish.didNotFinish.filter(on)};
}
