import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { DayEvent } from '../../shared/day.js';
import type { Phone } from '../../shared/domain.js';
import { doneBlocker,finalHold,heatsFinishedLine,raceFinishedLine,raceName,stepParts,stepStatus,steps,stepsOf,type FinalReason,type RaceFlowRead,type RaceGroup,type RaceSummary,type RacesRead,type Step,type StepMeta } from '../../shared/race-flow.js';
import { submitBlocker,type Job } from '../../shared/race-screen.js';
import type { RacePartName } from '../../shared/races.js';
import { resultName } from '../../shared/results-rules.js';
import { stageDone,stageForRace } from '../../shared/stage-lock.js';
import { actions,Refusal } from '../access/permissions.js';
import { readEvents } from '../day/events.js';
import { readEventResults,resultsSnapshot } from '../results/read.js';
import { changeStage,readCompletedStages } from '../rulings/stages.js';
import { createRace } from './create.js';
import { absentInput,checkIn,checkInInput,markAbsent,orderInput,saveRace,timesInput,writeOrder,writeTimes,type WriteTarget } from './race-screen.js';
import { jobRace,listRaces,raceChange,readRace,type Database,type StoredRace } from './records.js';
/** The part each race-screen job writes, so a saved race's history names who marked each step done. */
const jobSteps:Record<Job,Step>={'check-in':'runners',order:'positions',times:'times'};
/** Who last changed each part of each race of the day and who marked it done, by race id and part. */
async function readStepMeta(db:Database,dayId:string) {
  const rows=(await db.query(`SELECT p.race_id,p.part,p.version,p.saved_at,s.name AS saved_name,p.done_at,d.name AS done_name
    FROM race_parts p JOIN races r ON r.id=p.race_id LEFT JOIN sign_ins s ON s.id=p.saved_by LEFT JOIN sign_ins d ON d.id=p.done_by
    WHERE r.day_id=$1 AND NOT r.deleted`,[dayId])).rows;
  const meta=new Map<string,Partial<Record<RacePartName,StepMeta>>>();
  for(const row of rows) meta.set(row.race_id,{...meta.get(row.race_id),[row.part]:{version:row.version,by:row.saved_name??null,at:row.saved_at?.toISOString()??null,doneBy:row.done_name??null,doneAt:row.done_at?.toISOString()??null}});
  return meta;
}
function summary(race:StoredRace,meta:Partial<Record<RacePartName,StepMeta>>={}):RaceSummary {
  const statuses=Object.fromEntries(stepsOf(race).map(step=>[step,stepStatus(race,step,meta)]));
  const changes=[race.checkedInAt,...Object.values(meta).flatMap(item=>[item.at,item.doneAt])].filter((at):at is string=>!!at).sort();
  return {id:race.id,kind:race.kind,number:race.number,state:race.state,createdAt:race.checkedInAt,updatedAt:changes.at(-1)!,steps:statuses};
}
/**
 * The first thing the heats check sheet (the one making the final runs) must settle before the final, as a lead reads
 * it: "Heat 1 has a time to check first". Which result counts for a child who ran twice is chosen in Results: no step.
 */
async function finalReason(db:Database,dayId:string,code:string,own:readonly StoredRace[]):Promise<FinalReason|null> {
  const {results}=await readEventResults(db,dayId,code),item=results.heatsCheckSheet?.mustSettleFirst[0];
  if(!item) return null;
  const raceId=item.raceId??results.ties.find(tie=>tie.id===item.tieId)!.entries[0]!.raceId;
  const race=own.find(race=>race.id===raceId),name=race?raceName(race):'A heat';
  if(item.kind==='ran-twice') return {raceId,...finalHold('ran-twice',resultName(results.leaderboard.find(row=>row.raceId===raceId && row.entryId===item.entryId)!))};
  if(item.kind==='tie') return {raceId,...finalHold('tie',name)};
  return {raceId,...finalHold(results.notRankedYet.find(pending=>pending.race.id===raceId)?.reasons[0],name)};
}
/** Each switched-on event that is not a relay as an event group, its races in order (heats, then the final). */
async function readGroups(db:Database,dayId:string,only?:string):Promise<RaceGroup[]> {
  const events=(await readEvents(db,true,dayId)).filter(event=>!event.relay && (!only || event.id===only));
  const races=await listRaces(db,dayId),meta=await readStepMeta(db,dayId),stages=await readCompletedStages(db,dayId);
  const counters=(await db.query("SELECT c.event_id,c.last_number FROM race_counters c JOIN events e ON e.id=c.event_id WHERE e.day_id=$1 AND c.kind<>'final'",[dayId])).rows;
  return Promise.all(events.map(async event=>{
    const own=races.filter(race=>race.event.id===event.id).sort((a,b)=>Number(a.kind==='final')-Number(b.kind==='final') || a.number-b.number);
    const summaries=own.map(race=>summary(race,meta.get(race.id)));
    const heats=own.filter(race=>race.kind!=='final' && race.parts.runners.value?.length);
    const finalAvailable=event.format==='heats' && !own.some(race=>race.kind==='final') && heats.length>0 && heats.every(race=>race.state==='saved')
      && !stageDone(event.id,'heats',stages);
    const last=counters.find(counter=>counter.event_id===event.id)?.last_number??0;
    const updatedAt=summaries.map(race=>race.updatedAt).sort().at(-1)??'';
    const heatsOpen=!stageDone(event.id,stageForRace({kind:event.format==='timed'?'race':'heat',event}),stages);
    const medalsDecided=stages.some(item=>item.eventId===event.id && ['event','final','no-final'].includes(item.stage));
    return {event,races:summaries,nextHeat:last+1,finalAvailable,finalReason:finalAvailable?await finalReason(db,dayId,event.code,own):null,heatsOpen,medalsDecided,updatedAt};
  }));
}
export async function racesRead(db:Database,dayId:string):Promise<RacesRead> {
  return {revision:await dayRevision(db,dayId),groups:await readGroups(db,dayId)};
}
export async function raceFlowRead(db:Database,dayId:string,raceId:string):Promise<RaceFlowRead> {
  const race=await readRace(db,dayId,raceId);
  if(race.deleted) throw new Refusal(404,`A lead deleted ${raceName(race)}`);
  if(race.event.relay) throw new Refusal(409,'Relays use the relay race screen');
  const group=(await readGroups(db,dayId,race.event.id))[0];
  if(!group) throw new Refusal(409,'This event is switched off');
  return {revision:await dayRevision(db,dayId),group,race:jobRace(race),steps:group.races.find(item=>item.id===race.id)!.steps};
}
/**
 * Saves a race whose steps are all done once nothing blocks it (finishers and times agree), with history naming who
 * marked each step done. A done mark checks, and so does every step write: a timer who drops a time left over saves a
 * race whose steps were already all done.
 */
async function saveIfDone(client:pg.PoolClient,phone:Phone,raceId:string) {
  const race=await readRace(client,phone.dayId,raceId);
  if(race.state!=='in progress' || race.deleted) return;
  const done=(await client.query('SELECT p.part,s.name FROM race_parts p LEFT JOIN sign_ins s ON s.id=p.done_by WHERE p.race_id=$1 AND p.done_at IS NOT NULL',[raceId])).rows as Array<{part:RacePartName;name:string|null}>;
  if(stepsOf(race).every(step=>done.some(row=>row.part===stepParts[step])) && !submitBlocker(race)) {
    await saveRace(client,phone,race,job=>done.find(row=>row.part===stepParts[jobSteps[job]])?.name??null);
  }
}
const dayRevision=async(db:Database,dayId:string)=>Number((await db.query('SELECT revision FROM olympics_days WHERE id=$1',[dayId])).rows[0].revision);
/**
 * The race a flow write is made on, as it stands under the day lock: refused when a lead deleted it, it is a relay's,
 * its stage is complete, or it is saved. Nobody holds a step: anyone may write it at the version they saw.
 */
async function requireOpen(client:pg.PoolClient,phone:Phone,raceId:string) {
  const race=await readRace(client,phone.dayId,raceId);
  if(race.deleted) throw new Refusal(409,`A lead deleted ${raceName(race)}`);
  if(race.event.relay) throw new Refusal(409,'Relays use the relay race screen');
  if(race.stageComplete) throw new Refusal(409,raceFinishedLine(race));
  if(race.state==='saved') throw new Refusal(409,`${raceName(race)} is saved - ask a lead to change it`);
  if(race.state==='submitted') throw new Refusal(409,`${raceName(race)} is submitted - ask a lead to save it`);
  return race;
}
/** A write's target, refused when the phone saw an older version of the part: someone changed it since, never overwritten silently. */
async function requireCurrent(client:pg.PoolClient,phone:Phone,raceId:string,part:RacePartName,seen:{raceId:string|null;version:number}):Promise<WriteTarget> {
  if(seen.raceId!==raceId) throw new Refusal(400,'Choose this race');
  const race=await requireOpen(client,phone,raceId);
  if(seen.version!==race.parts[part].version) {
    const by=(await client.query('SELECT s.id,s.name FROM race_parts p LEFT JOIN sign_ins s ON s.id=p.saved_by WHERE p.race_id=$1 AND p.part=$2',[raceId,part])).rows[0];
    throw new Refusal(409,by?.name && by.id!==phone.id?`${by.name} changed this a moment ago`:'Not saved - check your entries and enter it again',{reason:'changed',by:by?.name??null});
  }
  return {event:race.event,race:jobRace(race)};
}
function requestedStep(request:FastifyRequest,race:Pick<StoredRace,'kind'>):Step {
  const step=(request.params as {step:string}).step as Step;
  if(!steps.includes(step)) throw new Refusal(404,'Choose Runners, Finishing order or Times');
  if(!stepsOf(race).includes(step)) throw new Refusal(409,'A final has no times');
  return step;
}
/**
 * The race flow's routes, all Volunteer (making a final needs a lead). Each write runs under the day lock, raises the
 * day revision when it changes anything (which wakes every open stream), and answers with the race as it then stands.
 */
export function raceFlowRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),raceId=(request:FastifyRequest)=>(request.params as {raceId:string}).raceId;
  const read=(phone:Phone,id:string)=>resultsSnapshot(pool,phone.dayId,db=>raceFlowRead(db,phone.dayId,id));
  async function write(phone:Phone,id:string,change:(client:pg.PoolClient,unchanged:()=>void)=>Promise<string|void>) {
    const made=await raceChange(pool,phone,change);
    return read(phone,made||id);
  }
  action('GET','/api/races','Volunteer',(_request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>racesRead(db,phone.dayId)));
  action('GET','/api/races/:raceId','Volunteer',(request,_reply,phone)=>read(phone,raceId(request)));
  // New race: the next heat of an event group, or its final. Two phones making the same next heat get one race: the
  // second is answered with the race the first made. Only a lead makes the final: it runs today's Heats complete checks
  // and seeds the fastest 6.
  action('POST','/api/races','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {eventCode?:unknown;kind?:unknown;number?:unknown};
    if(typeof body.eventCode!=='string') throw new Refusal(400,'Choose an event and section');
    if(body.kind!=='heat' && body.kind!=='final') throw new Refusal(400,'Choose a heat or the final');
    if(body.kind==='heat' && !Number.isSafeInteger(body.number)) throw new Refusal(400,'Choose the heat number');
    if(body.kind==='final' && phone.level!=='Lead') throw new Refusal(403,'Ask a lead to make the final');
    const {eventCode,kind}=body,number=Number(body.number);
    return write(phone,'',async(client,unchanged)=>{
      const event:DayEvent|undefined=(await readEvents(client,false,phone.dayId)).find(event=>event.code===eventCode);
      if(!event) throw new Refusal(404,'Event not found');
      if(!event.enabled) throw new Refusal(409,'This event is switched off');
      if(event.relay) throw new Refusal(409,'Relays use the relay race screen');
      const stages=await readCompletedStages(client,phone.dayId),own=(await listRaces(client,phone.dayId)).filter(race=>race.event.id===event.id);
      if(kind==='final') {
        if(event.format!=='heats') throw new Refusal(409,'This event has no final');
        const final=own.find(race=>race.kind==='final');
        if(final) {unchanged();return final.id;}
        const heats=own.filter(race=>race.parts.runners.value?.length);
        if(!heats.length || heats.some(race=>race.state!=='saved')) throw new Refusal(409,'The final opens when every heat has times');
        const reason=await finalReason(client,phone.dayId,event.code,own);
        if(reason) throw new Refusal(409,reason.line,{raceId:reason.raceId,step:reason.step});
        await changeStage(client,phone,event.code,'heats',false,null);
        return (await listRaces(client,phone.dayId)).find(race=>race.event.id===event.id && race.kind==='final')!.id;
      }
      const heatKind=event.format==='timed'?'race':'heat';
      if(stageDone(event.id,stageForRace({kind:heatKind,event}),stages)) throw new Refusal(409,heatsFinishedLine({event}));
      const existing=own.find(race=>race.kind===heatKind && race.number===number);
      if(existing) {unchanged();return existing.id;}
      const last=(await client.query('SELECT last_number FROM race_counters WHERE event_id=$1 AND kind=$2',[event.id,heatKind])).rows[0]?.last_number??0;
      if(number!==last+1) throw new Refusal(409,`Heat ${last+1} is next`,{next:last+1});
      return (await createRace(client,[],{dayId:phone.dayId,eventId:event.id,kind:heatKind,savedBy:phone.id})).id;
    });
  });
  // The step writes: the race screen's own, addressed by race, with no hold.
  action('POST','/api/races/:raceId/check-in','Volunteer',(request,_reply,phone)=>{
    const input=checkInInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await checkIn(client,phone,await requireCurrent(client,phone,id,'runners',input),input);await saveIfDone(client,phone,id);});
  });
  action('POST','/api/races/:raceId/absent','Volunteer',(request,_reply,phone)=>{
    const input=absentInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await markAbsent(client,phone,await requireCurrent(client,phone,id,'runners',input),input);await saveIfDone(client,phone,id);});
  });
  action('POST','/api/races/:raceId/order','Volunteer',(request,_reply,phone)=>{
    const input=orderInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await writeOrder(client,phone,await requireCurrent(client,phone,id,'finish',input),input);await saveIfDone(client,phone,id);});
  });
  action('POST','/api/races/:raceId/times','Volunteer',(request,_reply,phone)=>{
    const input=timesInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await writeTimes(client,phone,await requireCurrent(client,phone,id,'times',input),input,true);await saveIfDone(client,phone,id);});
  });
  // Done: That's everyone, Save the order, No more finishers. Once every step is done and nothing blocks it, the race is saved.
  action('POST','/api/races/:raceId/steps/:step/done','Volunteer',(request,_reply,phone)=>{
    const id=raceId(request);
    return write(phone,id,async(client,unchanged)=>{
      const race=await requireOpen(client,phone,id),step=requestedStep(request,race),part=stepParts[step];
      const blocker=doneBlocker(race,step);
      if(blocker) throw new Refusal(409,blocker);
      const marked=await client.query('UPDATE race_parts SET done_at=clock_timestamp(),done_by=$3 WHERE race_id=$1 AND part=$2 AND done_at IS NULL',[id,part,phone.id]);
      if(!marked.rowCount) {unchanged();return;}
      await saveIfDone(client,phone,id);
    });
  });
  // Undo: reverses this person's own done mark, and the save it made, while nobody has changed the step since.
  action('POST','/api/races/:raceId/steps/:step/undone','Volunteer',(request,_reply,phone)=>{
    const id=raceId(request),version=(request.body as {version?:unknown}|null)?.version;
    if(!Number.isSafeInteger(version)) throw new Refusal(400,'Choose the step you saved');
    return write(phone,id,async client=>{
      const race=await readRace(client,phone.dayId,id),step=requestedStep(request,race),part=stepParts[step];
      if(race.deleted) throw new Refusal(409,`A lead deleted ${raceName(race)}`);
      if(race.stageComplete) throw new Refusal(409,raceFinishedLine(race));
      const row=(await client.query('SELECT p.version,p.done_by,p.saved_by,s.name FROM race_parts p LEFT JOIN sign_ins s ON s.id=p.saved_by WHERE p.race_id=$1 AND p.part=$2',[id,part])).rows[0];
      const corrected=race.state==='saved' && (await client.query('SELECT 1 FROM race_part_history h JOIN races r ON r.id=h.race_id WHERE h.race_id=$1 AND h.corrected_by IS NOT NULL AND h.saved_at>=r.saved_at',[id])).rowCount;
      if(row.done_by!==phone.id || row.version!==version || corrected) {
        const by=row.saved_by!==phone.id && row.name?row.name:'Someone';
        throw new Refusal(409,`${by} changed this since. Open the race to edit it.`,{reason:'changed-since',by:row.name??null});
      }
      await client.query('UPDATE race_parts SET done_at=NULL,done_by=NULL WHERE race_id=$1 AND part=$2',[id,part]);
      if(race.state!=='saved') return;
      // The save this done mark made goes with it, and its history rows, so nothing is left counting.
      await client.query("UPDATE races SET state='in progress',saved_at=NULL,saved_by=NULL WHERE id=$1",[id]);
      await client.query('DELETE FROM race_part_history h USING race_parts p WHERE h.race_id=$1 AND p.race_id=h.race_id AND p.part=h.part AND p.version=h.version AND h.corrected_by IS NULL',[id]);
    });
  });
}
