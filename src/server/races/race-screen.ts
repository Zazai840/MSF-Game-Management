import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import { andList,currentRaceLabel,jobWords,jobs,onlyRunners,submitBlocker,waitingOn,type CurrentRace,type HomeSnapshot,type Holder,type Job,type RaceScreenRead } from '../../shared/race-screen.js';
import { isTeamEntry,runnersOf,type RaceEntry,type RacePartName,type TeamEntry } from '../../shared/races.js';
import { changingName,stillToRun,type RelayTeam } from '../../shared/teams.js';
import { timesOutOfOrder } from '../../shared/time-entry.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { stageForRace } from '../../shared/stage-lock.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { writeAuditNote } from '../rulings/records.js';
import { readCompletedStages } from '../rulings/stages.js';
import { readEvents } from '../day/events.js';
import { readTeamLists } from '../relays/teams.js';
import { createRace } from './create.js';
import { currentRaces } from './current.js';
import { raceChange,readRace,type Database } from './records.js';
import { publishPart,sameRunnerSnapshot } from './versions.js';
import { annotateRunners,keptWarningNumbers } from './warnings.js';
/** The race part each job writes. */
const jobParts:Record<Job,RacePartName>={'check-in':'runners',order:'finish',times:'times'};
/**
 * Every event's race job holds, by event id. Holds belong to the event, so they carry over to its next heat or race by
 * themselves. A relay's teams hold is not a race job: the Teams screen reads it with the team list.
 */
export async function readHolds(db:Database,dayId:string):Promise<Map<string,RaceScreenRead['holds']>> {
  const rows=(await db.query("SELECT h.event_id,h.job,s.id,s.name FROM job_holds h JOIN events e ON e.id=h.event_id JOIN sign_ins s ON s.id=h.sign_in_id WHERE e.day_id=$1 AND h.job<>'teams'",[dayId])).rows;
  const holds=new Map<string,RaceScreenRead['holds']>();
  for(const row of rows) holds.set(row.event_id,{...holds.get(row.event_id),[row.job]:{id:row.id,name:row.name}});
  return holds;
}
/** A phone that is signed out holds nothing. Run inside the sign-out's change, so the day revision rises with it. */
export async function clearHolds(client:pg.PoolClient,signInId:string) {
  await client.query('DELETE FROM job_holds WHERE sign_in_id=$1',[signInId]);
}
/**
 * One event's race screen: the event, its current race, who holds its jobs, who is asked to press Submit Race and who
 * has, and the event's last saved race.
 */
export async function raceScreenRead(db:Database,dayId:string,code:string):Promise<RaceScreenRead> {
  const event=(await db.query('SELECT id,code,name,section,format,enabled,relay FROM events WHERE day_id=$1 AND code=$2',[dayId,code])).rows[0];
  if(!event) throw new Refusal(404,'Event not found');
  const revision=Number((await db.query('SELECT revision FROM olympics_days WHERE id=$1',[dayId])).rows[0].revision);
  const race=(await currentRaces(db,dayId,[event])).get(event.id)!,stage=stageForRace({kind:race.kind,event});
  const stageComplete=(await readCompletedStages(db,dayId)).some(item=>item.eventId===event.id && item.stage===stage);
  const holds=(await readHolds(db,dayId)).get(event.id)||{},open=race.id!==null && race.state!=='saved';
  const pressed:Holder[]=open?(await db.query('SELECT s.id,s.name FROM submit_presses p JOIN sign_ins s ON s.id=p.sign_in_id WHERE p.race_id=$1 ORDER BY p.pressed_at,s.name',[race.id])).rows:[];
  const last=(await db.query("SELECT kind,number,saved_by,saved_at FROM races WHERE event_id=$1 AND state='saved' AND NOT deleted ORDER BY saved_at DESC LIMIT 1",[event.id])).rows[0];
  return {revision,event,race,stageComplete,holds,asked:open?askedToSubmit(race,holds):[],pressed,lastSaved:last?{kind:last.kind,number:last.number,by:last.saved_by,at:last.saved_at.toISOString()}:null,
    ...(event.relay?{teams:(await readTeamLists(db,dayId)).get(event.id)!.teams}:{})};
}
/** Home: every switched-on event's status line inputs, and each relay's team list with its teams holder, read for the whole day at once. */
export async function homeRead(db:Database,dayId:string):Promise<HomeSnapshot> {
  const revision=Number((await db.query('SELECT revision FROM olympics_days WHERE id=$1',[dayId])).rows[0].revision);
  const events=await readEvents(db,true,dayId),current=await currentRaces(db,dayId,events),stages=await readCompletedStages(db,dayId),holds=await readHolds(db,dayId),teamLists=await readTeamLists(db,dayId);
  const presses=(await db.query("SELECT p.race_id,p.sign_in_id FROM submit_presses p JOIN races r ON r.id=p.race_id WHERE r.day_id=$1 AND r.state='submitted'",[dayId])).rows;
  return {revision,events:events.map(event=>{
    const race=current.get(event.id)!,own=holds.get(event.id)||{},stage=stageForRace({kind:race.kind,event});
    const waiting=race.state==='submitted'?waitingOn(askedToSubmit(race,own),presses.filter(press=>press.race_id===race.id).map(press=>({id:press.sign_in_id}))).map(holder=>holder.name):[];
    return {code:event.code,name:event.name,section:event.section,relay:event.relay,race:{id:race.id,kind:race.kind,number:race.number,state:race.state},holds:own,
      started:hasEntries(race,'order') || hasEntries(race,'times'),waitingOn:waiting,done:stages.some(item=>item.eventId===event.id && item.stage===stage),
      ...(event.relay?{teams:teamLists.get(event.id)!.teams,teamsHolder:teamLists.get(event.id)!.holder}:{})};
  })};
}
const hasEntries=(race:CurrentRace,job:Job)=>{const value=race.parts[jobParts[job]].value;return value!==null && (!Array.isArray(value) || value.length>0);};
/** Who must press Submit Race: the holder of each job that has entries on this race, each person once. Watchers are not asked. */
function askedToSubmit(race:CurrentRace,holds:RaceScreenRead['holds']):Holder[] {
  const asked:Holder[]=[];
  for(const job of jobs) {
    const holder=holds[job];
    if(holder && hasEntries(race,job) && !asked.some(other=>other.id===holder.id)) asked.push(holder);
  }
  return asked;
}
function requestedJob(body:unknown):Job {
  const job=(body as {job?:unknown}|null)?.job;
  if(!jobs.includes(job as Job)) throw new Refusal(400,'Choose check-in, the order or the times');
  return job as Job;
}
/** A job that can be held now: its stage is open, a final has no times, and a relay's check-in is nobody's job (ADR 0002). */
function requireJob(screen:RaceScreenRead,job:Job) {
  if(job==='check-in' && screen.event.relay) throw new Refusal(409,'Anyone can check a relay in: tick its teams');
  if(screen.stageComplete) throw new Refusal(409,'Stage complete - ask a lead');
  if(job==='times' && screen.race.kind==='final') throw new Refusal(409,'A final has no times');
}
const takeHold=(client:pg.PoolClient,screen:RaceScreenRead,job:Job,phone:Phone)=>client.query('INSERT INTO job_holds(event_id,job,sign_in_id) VALUES($1,$2,$3) ON CONFLICT(event_id,job) DO UPDATE SET sign_in_id=EXCLUDED.sign_in_id',[screen.event.id,job,phone.id]);
/**
 * The race a write was made on (`raceId`, null for the empty next race) as it stands now: refused when a lead deleted
 * it, or when it is saved. Only the current race can be submitted.
 */
async function requireUnsaved(client:pg.PoolClient,phone:Phone,screen:RaceScreenRead,raceId:string|null) {
  let race:Pick<CurrentRace,'id'|'kind'|'number'|'state'|'parts'>=screen.race;
  if(raceId!==null && raceId!==screen.race.id) {
    // A race deleted permanently is gone, so its name is too.
    const seen=await readRace(client,phone.dayId,raceId).catch(error=>{if(error instanceof Refusal) return null;throw error;});
    if(!seen || seen.event.id!==screen.event.id) throw new Refusal(409,'A lead deleted this race');
    if(seen.deleted) throw new Refusal(409,`A lead deleted ${currentRaceLabel(seen)}`);
    race=seen;
  }
  if(race.state==='saved') throw new Refusal(409,`${currentRaceLabel(race)} is saved - ask a lead to change it`);
  return race;
}
/**
 * The volunteer write rules, in the order they refuse: stage complete, race deleted, race saved, race submitted, not
 * the job's holder, version behind. `raceId` and `version` are the race and part version the phone last saw (null and
 * 0 for the empty next race). Writing a job nobody holds takes it, as opening its card would.
 */
async function requireWrite(client:pg.PoolClient,phone:Phone,screen:RaceScreenRead,job:Job,raceId:string|null,version:number) {
  requireJob(screen,job);
  const race=await requireUnsaved(client,phone,screen,raceId);
  if(race.state==='submitted') throw new Refusal(409,`${currentRaceLabel(race)} is submitted - tap Not yet to change it`);
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
      // While submitted, the old holder's press goes: the new holder must press.
      if(from && screen.race.id) await client.query('DELETE FROM submit_presses WHERE race_id=$1 AND sign_in_id=$2',[screen.race.id,from.id]);
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
      const previous=runnersOf(screen.race.parts.runners.value),id=screen.race.id||randomUUID();
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
        return;
      }
      await publishPart(client,phone,await readRace(client,phone.dayId,id),'runners',runners);
      await dropFromOrder(client,screen.race,runners);
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
      const race=await readRace(client,phone.dayId,raceId),final=race.final!,previous=runnersOf(race.parts.runners.value);
      const lineup=[...final.entries.map(entry=>entry.runner||{id:entry.finalEntryId,wristband:entry.heatWristband}),...(final.additionalEntries||[]).map(entry=>entry.runner)];
      if(absent.some(id=>!lineup.some(runner=>runner.id===id))) throw new Refusal(400,'Choose a runner from this final');
      const runners=lineup.filter(runner=>!absent.includes(runner.id)).map(runner=>previous.find(current=>current.id===runner.id)||runner);
      if(new Set(runners.map(runner=>runner.wristband)).size!==runners.length) throw new Refusal(409,'Ask a lead to settle the final line-up');
      // The runner list is the attendance: publishing it marks everyone else Absent on the final's line-up.
      await publishPart(client,phone,race,'runners',runners);
      await dropFromOrder(client,screen.race,runners);
    });
  });
  // Relay check-in taps (ADR 0002): anyone on the race screen, no hold and no version check. Each applies to the race
  // as it stands under the day lock, so taps from several phones at once all land; a repeated tap changes nothing.
  function tap(request:FastifyRequest,phone:Phone,change:(tapped:Tapped,unchanged:()=>void)=>Promise<RaceEntry[]|void>) {
    const {raceId,teamId}=tappedTeam(request.body);
    return write(phone,code(request),async(client,screen,unchanged)=>{
      const tapped=await requireTap(client,phone,screen,raceId,teamId);
      const runners=await change(tapped,unchanged);
      if(!runners) return;
      await publishPart(client,phone,await readRace(client,phone.dayId,tapped.race.id!),'runners',runners);
      await dropFromOrder(client,tapped.race,runners);
    });
  }
  // Tick: the team goes in the race with a copy of its four children and their kept warnings. The first tick on the
  // empty next heat creates it, as the first check-in does.
  action('POST','/api/race-screen/:code/tick','Volunteer',(request,_reply,phone)=>tap(request,phone,async({client,screen,race,team,entries,entry:ticked},unchanged)=>{
    if(ticked) {unchanged();return;}
    if(race.kind==='final') throw new Refusal(409,"Mark the final's teams Here or Absent");
    if(!stillToRun(team)) throw new Refusal(409,`Team ${team.number} has already run`);
    const changer=changingName(team);
    if(changer) throw new Refusal(409,`${changer} is changing Team ${team.number}`);
    const entry:TeamEntry={id:randomUUID(),team:{id:team.id,number:team.number},legs:team.legs.map(leg=>({...leg,here:false}))};
    if(race.id) return [...entries,entry];
    if(!screen.event.enabled) throw new Refusal(409,'This event is switched off');
    await createRace(client,[entry],{dayId:phone.dayId,eventId:screen.event.id,kind:race.kind,savedBy:phone.id});
  }));
  // Take off (Cancel on a team just ticked): only while none of its children is marked here.
  action('POST','/api/race-screen/:code/take-off','Volunteer',(request,_reply,phone)=>tap(request,phone,async({team,entries,entry},unchanged)=>{
    if(!entry) {unchanged();return;}
    if(entry.legs.some(leg=>leg.here)) throw new Refusal(409,`Team ${team.number} has children marked here - unmark them first`);
    return entries.filter(other=>other!==entry);
  }));
  // Here: one child of a ticked team marked here, or not here. The last tap on a child wins.
  action('POST','/api/race-screen/:code/here','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {leg?:unknown;here?:unknown};
    if(!Number.isInteger(body.leg) || Number(body.leg)<0 || Number(body.leg)>3 || typeof body.here!=='boolean') throw new Refusal(400,'Choose a child and whether they are here');
    const index=Number(body.leg),here=body.here;
    return tap(request,phone,async({race,team,entries,entry},unchanged)=>{
      if(!entry) throw new Refusal(409,`Team ${team.number} is no longer in ${currentRaceLabel(race)}`);
      if(entry.legs[index].wristband===null) throw new Refusal(400,'Choose a child in this team');
      if(entry.legs[index].here===here) {unchanged();return;}
      return entries.map(other=>other===entry?{...entry,legs:entry.legs.map((leg,at)=>at===index?{...leg,here}:leg)}:other);
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
      // shortcut: a team crossing the line unticked can't be added yet; "+ Team not on the list" adds it by team.
      if(screen.event.relay && added.length) throw new Refusal(409,'Tick the team at check-in');
      const previous=screen.race.parts.runners.value||[],race=await readRace(client,phone.dayId,raceId);
      const already=added.find(number=>runnersOf(previous).some(runner=>runner.wristband===number));
      if(already!==undefined) throw new Refusal(400,`${already} is already in this race`);
      const staying=previous.filter(runner=>!didNotRun.includes(runner.id));
      // A team keeps the warnings its team list gave it. A final's runners all ran in its heats, so "already ran in this event" does not apply.
      const runners=screen.event.relay?staying:await annotateRunners(client,phone.dayId,screen.event,[...runnersOf(staying),...added.map(wristband=>({id:randomUUID(),wristband,addedAtFinish:true}))],kept,raceId,runnersOf(previous),screen.race.kind==='final');
      if(!sameRunnerSnapshot(runners,previous)) await publishPart(client,phone,race,'runners',runners);
      const finish=onlyRunners({order,didNotFinish},runners);
      await publishPart(client,phone,race,'finish',finish.order.length || finish.didNotFinish.length?finish:null);
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
  // Submit Race, pressed by those asked: the first press (once nothing blocks it) moves the race to submitted; the last of those asked saves it.
  action('POST','/api/race-screen/:code/submit','Volunteer',(request,_reply,phone)=>{
    const raceId=tappedRace(request.body);
    return write(phone,code(request),async(client,screen,unchanged)=>{
      await requireSubmittable(client,phone,screen,raceId);
      // Watchers (and a lead holding nothing) are not asked; with nobody left to ask, anyone's press saves it.
      if(screen.asked.length && !screen.asked.some(holder=>holder.id===phone.id)) throw new Refusal(409,"Only the people doing this race's jobs submit it");
      if(!waitingOn(screen.asked,[...screen.pressed,phone]).length) {await saveRace(client,phone,screen);return;}
      const press=await client.query('INSERT INTO submit_presses(race_id,sign_in_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[raceId,phone.id]);
      if(screen.race.state==='in progress') await client.query("UPDATE races SET state='submitted' WHERE id=$1",[raceId]);
      else if(!press.rowCount) unchanged();
    });
  });
  // Save as lead: a lead saves the race without the Submit presses it still waits on, under the same blockers. Those
  // it waited on lose their holds, so the next race does not wait on them too.
  action('POST','/api/race-screen/:code/save-as-lead','Lead',(request,_reply,phone)=>{
    const raceId=tappedRace(request.body);
    return write(phone,code(request),async(client,screen)=>{
      await requireSubmittable(client,phone,screen,raceId);
      const waiting=waitingOn(screen.asked,[...screen.pressed,phone]);
      await saveRace(client,phone,screen);
      await client.query('DELETE FROM job_holds WHERE event_id=$1 AND sign_in_id=ANY($2)',[screen.event.id,waiting.map(holder=>holder.id)]);
      await writeAuditNote(client,phone,screen.event.id,{action:'save-as-lead',message:`Saved by ${phone.name}${waiting.length?` without ${andList(waiting.map(holder=>holder.name))}'s Submit`:''} on ${screen.event.name} ${screen.event.section} ${currentRaceLabel(screen.race)}`,comment:null,touches:[{raceId:screen.race.id!}]});
    });
  });
  // Not yet: anyone sends a submitted race back to in progress, clearing every press, so everyone confirms again.
  action('POST','/api/race-screen/:code/not-yet','Volunteer',(request,_reply,phone)=>{
    const raceId=tappedRace(request.body);
    return write(phone,code(request),async(client,screen,unchanged)=>{
      if(screen.stageComplete) throw new Refusal(409,'Stage complete - ask a lead');
      await requireUnsaved(client,phone,screen,raceId);
      if(raceId!==screen.race.id || screen.race.state!=='submitted') {unchanged();return;}
      await client.query("UPDATE races SET state='in progress' WHERE id=$1",[raceId]);
      await client.query('DELETE FROM submit_presses WHERE race_id=$1',[raceId]);
      await writeAuditNote(client,phone,screen.event.id,{action:'not-yet',message:`${phone.name} tapped Not yet on ${screen.event.name} ${screen.event.section} ${currentRaceLabel(screen.race)}`,comment:null,touches:[{raceId:screen.race.id!}]});
    });
  });
}
/** A check-in tap's body: the race the phone saw (null for the empty next heat) and the team tapped. */
function tappedTeam(body:unknown) {
  const {raceId,teamId}=(body||{}) as {raceId?:unknown;teamId?:unknown};
  if(raceId!==null && typeof raceId!=='string') throw new Refusal(400,'Choose a race');
  if(typeof teamId!=='string') throw new Refusal(400,'Choose a team');
  return {raceId,teamId};
}
/** What a check-in tap acts on: the race as it stands, the team on its relay's team list, and the team's entry in the race if it is ticked. */
interface Tapped { client:pg.PoolClient; screen:RaceScreenRead; race:Pick<CurrentRace,'id'|'kind'|'number'|'state'|'parts'>; team:RelayTeam; entries:RaceEntry[]; entry:TeamEntry|undefined }
/**
 * A relay check-in tap on the race the phone saw, or on the current race when it saw the empty next heat. Refused, in
 * order: stage complete, the race deleted, saved or submitted. The tap's own refusals follow.
 */
async function requireTap(client:pg.PoolClient,phone:Phone,screen:RaceScreenRead,raceId:string|null,teamId:string):Promise<Tapped> {
  if(!screen.event.relay) throw new Refusal(409,'Only a relay has teams');
  if(screen.stageComplete) throw new Refusal(409,'Stage complete - ask a lead');
  const race=await requireUnsaved(client,phone,screen,raceId);
  if(race.state==='submitted') throw new Refusal(409,`${currentRaceLabel(race)} is submitted - tap Not yet to change it`);
  const team=screen.teams!.find(item=>item.id===teamId);
  if(!team) throw new Refusal(404,'Team not found');
  const entries=race.parts.runners.value||[];
  return {client,screen,race,team,entries,entry:entries.find((entry):entry is TeamEntry=>isTeamEntry(entry) && entry.team.id===team.id)};
}
/** A race Submit Race (or Save as lead) can save: the current race, its stage open, not saved, and nothing blocking it. */
async function requireSubmittable(client:pg.PoolClient,phone:Phone,screen:RaceScreenRead,raceId:string|null) {
  if(screen.stageComplete) throw new Refusal(409,'Stage complete - ask a lead');
  await requireUnsaved(client,phone,screen,raceId);
  if(raceId!==screen.race.id) throw new Refusal(409,'Not saved - check your entries and enter it again');
  const blocker=submitBlocker(screen.race);
  if(blocker) throw new Refusal(409,blocker);
}
/** The race a Submit Race or Not yet was tapped on: null for the empty next race. */
function tappedRace(body:unknown) {
  const raceId=(body as {raceId?:unknown}|null)?.raceId;
  if(raceId!==null && typeof raceId!=='string') throw new Refusal(400,'Choose a race');
  return raceId;
}
/**
 * Saves the current race: its saved mark (who pressed last, and when), and a history row per part recording who held
 * each job then. The event's next race shows next, with the same holders.
 */
async function saveRace(client:pg.PoolClient,phone:Phone,screen:RaceScreenRead) {
  const race=screen.race,runners=JSON.stringify(race.parts.runners.value||[]);
  await client.query("UPDATE races SET state='saved',saved_at=clock_timestamp(),saved_by=$2 WHERE id=$1",[race.id,phone.name]);
  for(const job of jobs) {
    const part=jobParts[job],{version,value}=race.parts[part];
    await client.query('INSERT INTO race_part_history(race_id,part,version,value,runners,held_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(race_id,part,version) DO UPDATE SET held_by=EXCLUDED.held_by,saved_at=coalesce(race_part_history.saved_at,EXCLUDED.saved_at)',[race.id,part,version,JSON.stringify(value),runners,screen.holds[job]?.name??null]);
  }
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
async function dropFromOrder(client:pg.PoolClient,race:Pick<CurrentRace,'id'|'parts'>,runners:readonly RaceEntry[]) {
  const finish=race.parts.finish.value,left=finish && onlyRunners(finish,runners);
  if(finish && JSON.stringify(left)!==JSON.stringify(finish)) await client.query(`UPDATE race_parts SET value=$1 WHERE race_id=$2 AND part='finish'`,[JSON.stringify(left),race.id]);
}
