import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RacePartName } from '../../shared/race-clashes.js';
import { currentRaceLabel,jobWords,raceJobs,type RaceJob,type RaceScreenRead } from '../../shared/race-screen.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { stageForRace } from '../../shared/stage-lock.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { writeAuditNote } from '../rulings/records.js';
import { readCompletedStages } from '../rulings/stages.js';
import { createRace } from './create.js';
import { currentRaces } from './current.js';
import { raceChange,readRace,type Database } from './records.js';
import { publishPart,rememberRace } from './versions.js';
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
  // Check-in: the holder's whole list of wristbands. The first write on the empty next race creates it.
  action('POST','/api/race-screen/:code/check-in','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {raceId?:unknown;version?:unknown;runners?:unknown};
    if(body.raceId!==null && typeof body.raceId!=='string') throw new Refusal(400,'Choose a race');
    if(!Number.isSafeInteger(body.version) || Number(body.version)<0) throw new Refusal(400,'Open the race before checking runners in');
    // Taking the last runner off leaves the stored race with nobody checked in; only a first runner stores a race.
    const refusal=Array.isArray(body.runners) && !body.runners.length && body.raceId!==null?null:runnerListRefusal(body.runners);
    if(refusal) throw new Refusal(400,refusal);
    const numbers=body.runners as number[],kept=keptWarningNumbers(body,numbers),raceId=body.raceId as string|null;
    return write(phone,code(request),async(client,screen)=>{
      await requireWrite(client,phone,screen,'check-in',raceId,Number(body.version));
      if(screen.race.kind==='final') throw new Refusal(409,'Use Is everyone here? for the seeded final');
      const previous=screen.race.parts.runners.value||[],id=screen.race.id||randomUUID();
      // An unchanged number keeps its entry and warnings; a new one gets the server's warnings.
      const runners=await annotateRunners(client,phone.dayId,screen.event,numbers.map(wristband=>previous.find(runner=>runner.wristband===wristband)||{id:randomUUID(),wristband}),kept,id,previous);
      if(screen.race.id) {await publishPart(client,phone,await readRace(client,phone.dayId,id),'runners',runners,runners);return;}
      if(!screen.event.enabled) throw new Refusal(409,'This event is switched off');
      await createRace(client,runners,{id,dayId:phone.dayId,eventId:screen.event.id,kind:screen.race.kind,savedBy:phone.id});
      await rememberRace(client,await readRace(client,phone.dayId,id));
    });
  });
}
