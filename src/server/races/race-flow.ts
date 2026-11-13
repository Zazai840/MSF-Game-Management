import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { DayEvent } from '../../shared/day.js';
import type { Phone } from '../../shared/domain.js';
import { changedLine,doneBlocker,finalHold,finalMade,heatsFinishedLine,raceName,roleSteps,stepParts,steps,stepsOf,tieHold,type FinalReason,type RaceFlowRead,type RaceGroup,type RacesRead,type Step } from '../../shared/race-flow.js';
import { isTeamEntry,type RaceEntry,type RacePartName,type TeamEntry } from '../../shared/races.js';
import type { RelayTeam } from '../../shared/teams.js';
import { resultName } from '../../shared/results-rules.js';
import { openCallUp,placeFree,teamInFinal } from '../../shared/finals.js';
import { randomUUID } from 'node:crypto';
import { writeChangeNote } from '../rulings/records.js';
import { requireChangeReason } from '../rulings/validation.js';
import { stageDone,stageForRace } from '../../shared/stage-lock.js';
import { actions,Refusal } from '../access/permissions.js';
import { readEvents } from '../day/events.js';
import { atRevision,readEventResults,resultsSnapshot } from '../results/read.js';
import { changeStage,readCompletedStages } from '../rulings/stages.js';
import { seedFinal } from '../rulings/finals.js';
import type { CompletedStage } from '../../shared/stage-lock.js';
import { joiningTeam,readTeamLists,relayLists } from '../relays/teams.js';
import { createRace,nextNumber } from './create.js';
import { absentInput,addRunner,addRunnerInput,checkIn,checkInInput,dropFromOrder,markAbsent,orderInput,saveIfDone,timesInput,writeOrder,writeTimes,type WriteTarget } from './steps.js';
import { eventScope,jobRace,listRaces,raceChange,readRace,readStepMeta,raceSummary,requireRace,type Database,type StoredRace } from './records.js';
import { raceRefusal } from '../../shared/race-status.js';
import { markAbsentFinalists } from './final-field.js';
import { publishPart } from './versions.js';
/**
 * The first thing the heats check sheet (the one making the final runs) must settle before the final, as a lead reads
 * it: "Heat 1 has a time to check first". Which result counts for a child who ran twice is chosen in Results: no step.
 */
async function finalReason(db:Database,dayId:string,code:string,own:readonly StoredRace[]):Promise<FinalReason|null> {
  const {results}=await readEventResults(db,dayId,code),item=results.heatsCheckSheet?.mustSettleFirst[0];
  if(!item) return null;
  const tied=results.ties.find(tie=>tie.id===item.tieId)?.entries??[],raceId=item.raceId??tied[0]!.raceId;
  const race=own.find(race=>race.id===raceId),name=race?raceName(race):'A heat';
  if(item.kind==='ran-twice') return {raceId,...finalHold('ran-twice',resultName(results.leaderboard.find(row=>row.raceId===raceId && row.entryId===item.entryId)!))};
  if(item.kind==='tie') return {raceId,...tieHold(own.filter(race=>tied.some(entry=>entry.raceId===race.id)))};
  return {raceId,...finalHold(results.notRankedYet.find(pending=>pending.race.id===raceId)?.reasons[0],name)};
}
/** The event's medals are decided (by its final, or without one): no final can be made. Heats complete alone still waits for its final. */
const pastHeats=(eventId:string,stages:readonly CompletedStage[])=>stages.some(item=>item.eventId===eventId && item.stage!=='heats');
/** Each switched-on event (with `switchedOff`, every event) as an event group, its races in order (heats, then the final). */
export async function readGroups(db:Database,dayId:string,only?:string,switchedOff=false):Promise<RaceGroup[]> {
  const events=(await readEvents(db,!switchedOff,dayId)).filter(event=>!only || event.id===only);
  // One event's page reads only that event's races.
  const races=await listRaces(db,dayId,only),meta=await readStepMeta(db,dayId,only),stages=await readCompletedStages(db,dayId);
  const [scope,params]=eventScope(dayId,only);
  const savedAt=new Map((await db.query(`SELECT r.id,r.saved_at FROM races r WHERE r.day_id=$1 AND NOT r.deleted AND r.state='saved'${scope}`,params)).rows.map(row=>[row.id,row.saved_at?.toISOString() as string|undefined]));
  const groups:RaceGroup[]=[];
  // One event at a time: a final's reason reads through the same client, which runs one query at a time.
  for(const event of events) {
    const own=races.filter(race=>race.event.id===event.id).sort((a,b)=>Number(a.kind==='final')-Number(b.kind==='final') || a.number-b.number);
    const summaries=own.map(race=>raceSummary(race,meta.get(race.id)));
    const heats=own.filter(race=>race.kind!=='final' && race.parts.runners.value?.length);
    const finalAvailable=event.format==='heats' && !finalMade({races:own}) && heats.length>0 && heats.every(race=>race.state==='saved')
      && !pastHeats(event.id,stages);
    // The highest live heat: listRaces leaves deleted races out.
    const last=Math.max(0,...own.filter(race=>race.kind!=='final').map(race=>race.number));
    const heatsOpen=!stageDone(event.id,stageForRace({kind:event.format==='timed'?'race':'heat',event}),stages);
    const medalsDecided=stages.some(item=>item.eventId===event.id && ['event','final','no-final'].includes(item.stage));
    // Results without a final never waits: the lead's call decides the medals at once.
    const stage=event.format==='timed'?'event' as const:own.some(race=>race.kind==='final')?'final' as const:null;
    const medalsWaiting=stage && own.length && !medalsDecided && own.every(race=>race.state==='saved')?{stage,since:own.map(race=>savedAt.get(race.id)??'').sort().at(-1)!}:null;
    groups.push({event,races:summaries,nextHeat:last+1,finalAvailable,finalReason:finalAvailable?await finalReason(db,dayId,event.code,own):null,heatsOpen,medalsDecided,medalsWaiting});
  }
  return groups;
}
export async function racesRead(db:Database,dayId:string):Promise<RacesRead> {
  return {revision:await dayRevision(db,dayId),groups:await readGroups(db,dayId)};
}
/** A race as that phone reads it. A lead's read also names the people in each step's role today (ADR 0007): no volunteer gets those names. */
export async function raceFlowRead(db:Database,{id:phoneId,dayId}:Pick<Phone,'id'|'dayId'>,raceId:string):Promise<RaceFlowRead> {
  const race=await readRace(db,dayId,raceId);
  const gone=raceRefusal(race,'open');
  if(gone) throw new Refusal(404,gone);
  const group=(await readGroups(db,dayId,race.event.id))[0];
  if(!group) throw new Refusal(409,'This event is switched off');
  // A relay's start line shows its teams still to run and checks each typed leg against every switched-on relay's teams.
  const teams=race.event.relay?await relayLists(db,dayId,race.event.id):{};
  // A final with a seed free offers its next call-up to every phone: the Runners step shows it to the Start line and the lead.
  const next=race.kind==='final' && !race.stageComplete?openCallUp((await atRevision(db,dayId,`event:${race.event.code}`,()=>readEventResults(db,dayId,race.event.code))).results.finalResults):null;
  return {revision:await dayRevision(db,dayId),group,race:jobRace(race),steps:group.races.find(item=>item.id===race.id)!.steps,...teams,
    ...(next?{callUp:{entryId:next.entryId,who:resultName(next),position:next.position!}}:{}),...await inRole(db,phoneId,dayId)};
}
/** For a lead, the names of the signed-in people whose reported role is each step's, in name order; for anyone else, nothing. */
async function inRole(db:Database,phoneId:string,dayId:string):Promise<Pick<RaceFlowRead,'inRole'>> {
  // The level as it is now: a stream opened as a lead outlives a change of level.
  if(!(await db.query("SELECT 1 FROM sign_ins WHERE id=$1 AND level='Lead' AND NOT signed_out",[phoneId])).rowCount) return {};
  const names:NonNullable<RaceFlowRead['inRole']>={};
  for(const row of (await db.query('SELECT name,reported_role FROM sign_ins WHERE day_id=$1 AND NOT signed_out AND reported_role=ANY($2) ORDER BY name',[dayId,Object.keys(roleSteps)])).rows)
    (names[roleSteps[row.reported_role as keyof typeof roleSteps]]??=[]).push(row.name);
  return {inRole:names};
}
const dayRevision=async(db:Database,dayId:string)=>Number((await db.query('SELECT revision FROM olympics_days WHERE id=$1',[dayId])).rows[0].revision);
/**
 * The race a flow write is made on, as it stands under the day lock: refused when a lead deleted it, its stage is
 * complete, or it is saved. Nobody holds a step: anyone may write it at the version they saw.
 */
async function requireOpen(client:pg.PoolClient,phone:Phone,raceId:string) {
  const race=await readRace(client,phone.dayId,raceId);
  requireRace(race,'step');
  return race;
}
/** A write's target, refused when the phone saw an older version of the part: someone changed it since, never overwritten silently. */
async function requireCurrent(client:pg.PoolClient,phone:Phone,raceId:string,part:RacePartName,seen:{raceId:string|null;version:number}):Promise<WriteTarget> {
  if(seen.raceId!==raceId) throw new Refusal(400,'Choose this race');
  const race=await requireOpen(client,phone,raceId);
  if(seen.version!==race.parts[part].version) {
    const by=(await client.query('SELECT s.id,s.name FROM race_parts p LEFT JOIN sign_ins s ON s.id=p.saved_by WHERE p.race_id=$1 AND p.part=$2',[raceId,part])).rows[0];
    throw new Refusal(409,by?.name && by.id!==phone.id?changedLine(by.name):'Not saved - check your entries and enter it again',{reason:'changed',by:by?.name??null});
  }
  return {event:race.event,race:jobRace(race)};
}
function requestedStep(request:FastifyRequest,race:Pick<StoredRace,'kind'>):Step {
  const step=(request.params as {step:string}).step as Step;
  if(!steps.includes(step)) throw new Refusal(404,'Choose Runners, Finishing order or Times');
  if(!stepsOf(race).includes(step)) throw new Refusal(409,'A final has no times');
  return step;
}
type TeamChange=(tapped:{race:StoredRace;team:RelayTeam;entries:RaceEntry[];entry:TeamEntry|undefined},unchanged:()=>void)=>RaceEntry[]|void;
/**
 * A change to one team's entry in a relay race, as the race stands under the day lock: a Start line tap, or a team
 * saved at check-in. The team is read from its team list as it now is. Raises the Runners version, so a
 * version-checked write elsewhere still sees the change.
 */
export async function changeTeamEntry(client:pg.PoolClient,phone:Phone,raceId:string,teamId:string,change:TeamChange,unchanged:()=>void=()=>{}) {
  const race=await requireOpen(client,phone,raceId);
  if(!race.event.relay) throw new Refusal(409,'Only a relay has teams');
  const team=(await readTeamLists(client,phone.dayId)).get(race.event.id)!.teams.find(item=>item.id===teamId);
  if(!team) throw new Refusal(404,'Team not found');
  const entries=race.parts.runners.value||[];
  const runners=change({race,team,entries,entry:entries.find((entry):entry is TeamEntry=>isTeamEntry(entry) && entry.team.id===team.id)},unchanged);
  if(!runners) return;
  await publishPart(client,phone,race,'runners',runners);
  await dropFromOrder(client,race,runners);
}
/**
 * The race flow's routes, all Volunteer (making a final needs a lead). Each write runs under the day lock, raises the
 * day revision when it changes anything (which wakes every open stream), and answers with the race as it then stands.
 */
export function raceFlowRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),raceId=(request:FastifyRequest)=>(request.params as {raceId:string}).raceId;
  const read=(phone:Phone,id:string)=>resultsSnapshot(pool,phone.dayId,db=>raceFlowRead(db,phone,id));
  async function write(phone:Phone,id:string,change:(client:pg.PoolClient,unchanged:()=>void)=>Promise<string|void>) {
    const made=await raceChange(pool,phone,async(client,unchanged)=>{
      let quiet=false;
      const made=await change(client,()=>{quiet=true;});
      // Every race-flow write ends here, so no route can forget it: a race whose steps are all done saves itself.
      const saved=await saveIfDone(client,phone,made||id);
      if(quiet && !saved) unchanged();
      return made;
    });
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
      const stages=await readCompletedStages(client,phone.dayId),own=(await listRaces(client,phone.dayId)).filter(race=>race.event.id===event.id);
      if(kind==='final') {
        if(event.format!=='heats') throw new Refusal(409,'This event has no final');
        const final=own.find(race=>race.kind==='final');
        if(final) {unchanged();return final.id;}
        const heats=own.filter(race=>race.parts.runners.value?.length);
        if(!heats.length || heats.some(race=>race.state!=='saved')) throw new Refusal(409,'The final opens when every heat has times');
        const reason=await finalReason(client,phone.dayId,event.code,own);
        if(reason) throw new Refusal(409,reason.line,{raceId:reason.raceId,step:reason.step});
        // Heats already complete and no live final: the final was deleted. The heats stay complete, and the final is made again.
        if(stageDone(event.id,'heats',stages) && !pastHeats(event.id,stages)) await seedFinal(client,phone,event,(await readEventResults(client,phone.dayId,event.code)).results.qualifiers);
        else await changeStage(client,phone,event.code,'heats',false,null);
        return (await listRaces(client,phone.dayId)).find(race=>race.event.id===event.id && race.kind==='final')!.id;
      }
      const heatKind=event.format==='timed'?'race':'heat';
      if(stageDone(event.id,stageForRace({kind:heatKind,event}),stages)) throw new Refusal(409,heatsFinishedLine({event}));
      const existing=own.find(race=>race.kind===heatKind && race.number===number);
      if(existing) {unchanged();return existing.id;}
      const next=await nextNumber(client,event.id,heatKind);
      if(number!==next) throw new Refusal(409,`Heat ${next} is next`,{next});
      return (await createRace(client,[],{dayId:phone.dayId,eventId:event.id,kind:heatKind,savedBy:phone.id})).id;
    });
  });
  // The step writes, addressed by race, with no hold.
  action('POST','/api/races/:raceId/check-in','Volunteer',(request,_reply,phone)=>{
    const input=checkInInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await checkIn(client,phone,await requireCurrent(client,phone,id,'runners',input),input)});
  });
  action('POST','/api/races/:raceId/absent','Volunteer',(request,_reply,phone)=>{
    const input=absentInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await markAbsent(client,phone,await requireCurrent(client,phone,id,'runners',input),input)});
  });
  action('POST','/api/races/:raceId/add-runner','Volunteer',(request,_reply,phone)=>{
    const input=addRunnerInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await addRunner(client,phone,await requireCurrent(client,phone,id,'runners',input),input)});
  });
  action('POST','/api/races/:raceId/order','Volunteer',(request,_reply,phone)=>{
    const input=orderInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await writeOrder(client,phone,await requireCurrent(client,phone,id,'finish',input),input)});
  });
  action('POST','/api/races/:raceId/times','Volunteer',(request,_reply,phone)=>{
    const input=timesInput(request.body),id=raceId(request);
    return write(phone,id,async client=>{await writeTimes(client,phone,await requireCurrent(client,phone,id,'times',input),input)});
  });
  // A relay's Start line taps (ADR 0002): anyone, with no version check, each applied to the race as it stands under
  // the day lock, so taps from several phones at once all land. Each raises the Runners version, so a version-checked
  // write elsewhere still sees the change.
  function teamTap(request:FastifyRequest,phone:Phone,change:TeamChange) {
    const {raceId:id,teamId}=request.params as {raceId:string;teamId:string};
    return write(phone,id,(client,unchanged)=>changeTeamEntry(client,phone,id,teamId,change,unchanged));
  }
  // Add: a team still to run goes into the heat with a copy of its four children and their kept warnings, every child
  // checked in: a relay heat has no per-child Here.
  action('POST','/api/races/:raceId/teams/:teamId/tick','Volunteer',(request,_reply,phone)=>teamTap(request,phone,({race,team,entries,entry},unchanged)=>{
    if(entry) {unchanged();return;}
    if(race.kind==='final') throw new Refusal(409,"Mark the final's teams Here or Absent");
    return [...entries,joiningTeam(team)];
  }));
  // Take off: the team goes back to Still to run.
  action('POST','/api/races/:raceId/teams/:teamId/take-off','Volunteer',(request,_reply,phone)=>teamTap(request,phone,({race,entries,entry},unchanged)=>{
    if(race.kind==='final') throw new Refusal(409,"Mark the final's teams Here or Absent");
    if(!entry) {unchanged();return;}
    return entries.filter(other=>other!==entry);
  }));
  // Here / Absent on a final's team, or neither, as on a children's final: Here puts the team in the race with each of
  // its children here, Absent takes it out marked Absent (freeing its seed), and neither takes it out unmarked. Only
  // teams marked Here run the final, so the finish line places nobody else.
  action('POST','/api/races/:raceId/teams/:teamId/absent','Volunteer',(request,_reply,phone)=>{
    const mark=((request.body||{}) as {mark?:unknown}).mark;
    if(mark!=='here' && mark!=='absent' && mark!==null) throw new Refusal(400,'Choose Here, Absent or neither');
    const {raceId:id,teamId}=request.params as {raceId:string;teamId:string};
    return write(phone,id,async(client,unchanged)=>{
      let finalist:{id:string;absent:boolean;runner?:RaceEntry}|undefined,moved=false;
      await changeTeamEntry(client,phone,id,teamId,({race,team,entries,entry})=>{
        if(race.kind!=='final') throw new Refusal(409,'Only a final has Here / Absent');
        const final=race.final!;
        finalist=[...final.entries.map(item=>({id:item.finalEntryId,absent:item.absent,runner:item.runner})),...(final.additionalEntries||[]).map(item=>({id:item.runner.id,absent:item.absent,runner:item.runner}))]
          .find(item=>item.runner!==undefined && isTeamEntry(item.runner) && item.runner.team.id===team.id);
        const kept=entry??finalist?.runner as TeamEntry|undefined;
        if(!kept) throw new Refusal(409,`Team ${team.number} is not in the final`);
        if(mark!=='here') {
          if(!entry) return;
          moved=true;
          return entries.filter(other=>other!==entry);
        }
        const marked={...kept,legs:kept.legs.map(leg=>({...leg,here:leg.wristband!==null}))};
        if(entry && JSON.stringify(marked)===JSON.stringify(entry)) return;
        moved=true;
        return entry?entries.map(other=>other===entry?marked:other):[...entries,marked];
      });
      // Set after the runner list, which marks a team leaving it Absent: neither leaves it unmarked.
      if(finalist && (moved || finalist.absent!==(mark==='absent'))) {const marked=finalist.id;await markAbsentFinalists(client,id,(other,stored)=>other===marked?mark==='absent':stored);}
      else if(!moved) unchanged();
    });
  });
  // "+ Team" at a relay final's start line: a team of the relay joins the final as an added team, Here at once with
  // each of its children, while a place is free, its reason kept as an audit note on the team.
  action('POST','/api/races/:raceId/teams/:teamId/add','Volunteer',(request,_reply,phone)=>{
    const {raceId:id,teamId}=request.params as {raceId:string;teamId:string};
    const reason=requireChangeReason((request.body as {reason?:unknown}|null)?.reason,false);
    return write(phone,id,async client=>{
      let note=null as (()=>Promise<unknown>)|null;
      await changeTeamEntry(client,phone,id,teamId,({race,team,entries})=>{
        if(race.kind!=='final') throw new Refusal(409,'Only a final takes an added team');
        if(teamInFinal({...race.final!,runners:entries},team.id)) throw new Refusal(409,`Team ${team.number} is already in the Final`);
        if(!placeFree(race.final!)) throw new Refusal(409,'There is no free place in the Final');
        const added:TeamEntry={id:randomUUID(),team:{id:team.id,number:team.number},legs:team.legs.map(leg=>({...leg,here:leg.wristband!==null}))};
        note=()=>writeChangeNote(client,phone,race.event.id,'add-team',`added Team ${team.number} to the ${raceName(race)}`,reason,[{raceId:id,entryId:added.id}]);
        return [...entries,added];
      });
      await note?.();
    });
  });
  // Done: That's everyone, Save the order, No more finishers. Once every step is done and nothing blocks it, the race is saved.
  action('POST','/api/races/:raceId/steps/:step/done','Volunteer',(request,_reply,phone)=>{
    const id=raceId(request);
    return write(phone,id,async(client,unchanged)=>{
      const race=await requireOpen(client,phone,id),step=requestedStep(request,race),part=stepParts[step];
      const blocker=doneBlocker(race,step);
      if(blocker) throw new Refusal(409,blocker);
      const marked=await client.query('UPDATE race_parts SET done_at=clock_timestamp(),done_by=$3 WHERE race_id=$1 AND part=$2 AND done_at IS NULL',[id,part,phone.id]);
      if(!marked.rowCount) unchanged();
    });
  });
  // Undo: reverses this person's own done mark, and the save it made, while nobody has changed the step since.
  action('POST','/api/races/:raceId/steps/:step/undone','Volunteer',(request,_reply,phone)=>{
    const id=raceId(request),version=(request.body as {version?:unknown}|null)?.version;
    if(!Number.isSafeInteger(version)) throw new Refusal(400,'Choose the step you saved');
    return write(phone,id,async client=>{
      const race=await readRace(client,phone.dayId,id),step=requestedStep(request,race),part=stepParts[step];
      requireRace(race,'undo');
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
