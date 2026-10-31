import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { DayEvent } from '../../shared/day.js';
import type { Phone } from '../../shared/domain.js';
import { entryName,isTeamEntry,runnersOf,type RaceEntry,type RacePartName,type RaceRead,type TeamEntry } from '../../shared/races.js';
import type { RelayTeam } from '../../shared/teams.js';
import { digitsForTime,timeRefusal,timesOutOfOrder } from '../../shared/time-entry.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { onlyRunners,stepBlocker,stepParts,steps,stepsOf,type Step } from '../../shared/race-flow.js';
import { Refusal } from '../access/permissions.js';
import { joiningTeam,readTeamLists } from '../relays/teams.js';
import { readRace } from './records.js';
import { publishPart,sameRunnerSnapshot } from './versions.js';
import { markFinalAbsent } from './final-field.js';
import { annotateRunners,keptWarningNumbers } from './warnings.js';
/** What a step write acts on: the event and the race as it stands. */
export interface WriteTarget { event:DayEvent; race:RaceRead }
export type CheckInInput=ReturnType<typeof checkInInput>;
/** A check-in body: the race and runners version the phone saw, and its whole list of wristbands, a fixed number sent with its entry. */
export function checkInInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;runners?:unknown};
  const {raceId,version}=seenRace(input,'Open the race before checking runners in');
  const entries=(Array.isArray(input.runners)?input.runners:[]) as Array<{id?:unknown;wristband?:unknown}>;
  if(!Array.isArray(input.runners) || entries.some(entry=>!entry || typeof entry!=='object' || (entry.id!==undefined && typeof entry.id!=='string'))) throw new Refusal(400,'Enter the runner list');
  const numbers=entries.map(entry=>entry.wristband) as number[];
  // Taking the last runner off leaves the stored race with nobody checked in; only a first runner stores a race.
  const refusal=!numbers.length && raceId!==null?null:runnerListRefusal(numbers);
  if(refusal) throw new Refusal(400,refusal);
  const ids=entries.flatMap(entry=>typeof entry.id==='string'?[entry.id]:[]);
  if(new Set(ids).size!==ids.length) throw new Refusal(400,'Choose each runner only once');
  return {raceId,version,entries,ids,kept:keptWarningNumbers(input,numbers)};
}
/** The Runners step's write: the runner list as sent. */
export async function checkIn(client:pg.PoolClient,phone:Phone,target:WriteTarget,{entries,ids,kept}:CheckInInput) {
  if(target.race.kind==='final') throw new Refusal(409,"Mark the final's runners Here or Absent");
  // A relay's entries are teams, added and marked here one tap at a time: a list of wristbands would replace them.
  if(target.event.relay) throw new Refusal(409,'Add the teams that are running');
  const previous=runnersOf(target.race.parts.runners.value),id=target.race.id;
  // A fixed number keeps its entry, so its place follows it. A number sent without its entry keeps the entry
  // already holding that number. Unchanged numbers keep their warnings; a new or fixed one gets the server's.
  const input=entries.map(({id:entryId,wristband})=>{
    if(entryId===undefined) return previous.find(runner=>runner.wristband===wristband && !ids.includes(runner.id))||{id:randomUUID(),wristband:wristband as number};
    const old=previous.find(runner=>runner.id===entryId);
    if(!old) throw new Refusal(400,'Choose a runner from this race');
    return {...old,wristband:wristband as number};
  });
  const runners=await annotateRunners(client,phone.dayId,target.event,input,kept,id,previous);
  await publishPart(client,phone,await readRace(client,phone.dayId,id),'runners',runners);
  await dropFromOrder(client,target.race,runners);
}
export type AbsentInput=ReturnType<typeof absentInput>;
export function absentInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;here?:unknown;absent?:unknown};
  const {raceId,version}=seenRace(input,'Open the final before marking who is here');
  const ids=(value:unknown)=>Array.isArray(value) && value.every(id=>typeof id==='string')?value as string[]:null;
  const here=ids(input.here),absent=ids(input.absent);
  if(!here || !absent || new Set([...here,...absent]).size!==here.length+absent.length) throw new Refusal(400,'Mark each runner Here or Absent once');
  return {raceId,version,here,absent};
}
/** A final's Here / Absent: those Here are the runner list, those Absent are marked so, and everyone else is not marked yet. */
export async function markAbsent(client:pg.PoolClient,phone:Phone,target:WriteTarget,{raceId,here,absent}:AbsentInput) {
  if(raceId===null || target.race.kind!=='final') throw new Refusal(409,'Only a final has Here / Absent');
  const race=await readRace(client,phone.dayId,raceId),final=race.final!,previous=race.parts.runners.value||[];
  // A child finalist or a relay team: a seeded child never yet checked in is named by their heat wristband.
  const lineup:RaceEntry[]=[...final.entries.flatMap(entry=>entry.runner?[entry.runner]:entry.heatWristband===null?[]:[{id:entry.finalEntryId,wristband:entry.heatWristband}]),...(final.additionalEntries||[]).map(entry=>entry.runner)];
  if([...here,...absent].some(id=>!lineup.some(runner=>runner.id===id))) throw new Refusal(400,'Choose a runner from this final');
  const runners=lineup.filter(runner=>here.includes(runner.id)).map(runner=>previous.find(current=>current.id===runner.id)||runner);
  if(new Set(runners.map(entryName)).size!==runners.length) throw new Refusal(409,`Two ${runners.some(isTeamEntry)?'teams marked Here have the same team number':'runners marked Here have the same wristband number'}. Ask a lead to check the final.`);
  await publishPart(client,phone,race,'runners',runners);
  await markFinalAbsent(client,race.id,absent);
  await dropFromOrder(client,target.race,runners);
}
export type OrderInput=ReturnType<typeof orderInput>;
/** An order body: the whole finishing order by entry, Did not finish, Didn't run, and runners (or on a relay teams) added at the finish. */
export function orderInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;order?:unknown;didNotFinish?:unknown;didNotRun?:unknown;added?:unknown;addedTeams?:unknown};
  const {raceId,version}=seenRace(input,'Open the race before saving its finishing order');
  const unclassified="Choose a place, Did not finish or Didn't run for each runner";
  const entryIds=(value:unknown)=>{
    if(!Array.isArray(value) || value.some(id=>typeof id!=='string')) throw new Refusal(400,unclassified);
    return value as string[];
  };
  const order=entryIds(input.order),didNotFinish=entryIds(input.didNotFinish),didNotRun=entryIds(input.didNotRun),classified=[...order,...didNotFinish,...didNotRun];
  if(new Set(classified).size!==classified.length) throw new Refusal(400,unclassified);
  if(!Array.isArray(input.added)) throw new Refusal(400,'Enter the runners added at the finish');
  const added=input.added as number[],addedRefusal=added.length?runnerListRefusal(added):null;
  if(addedRefusal) throw new Refusal(400,addedRefusal);
  const addedTeams=input.addedTeams??[];
  if(!Array.isArray(addedTeams) || addedTeams.some(id=>typeof id!=='string') || new Set(addedTeams).size!==addedTeams.length) throw new Refusal(400,'Choose each team once');
  return {raceId,version,order,didNotFinish,didNotRun,added,kept:keptWarningNumbers(input,added),addedTeams:addedTeams as string[]};
}
/** The Finishing order step's write. Runners the Runners step has since taken off are dropped, later places moving up. */
export async function writeOrder(client:pg.PoolClient,phone:Phone,target:WriteTarget,{raceId,order,didNotFinish,didNotRun,added,kept,addedTeams}:OrderInput) {
  if(raceId===null) throw new Refusal(409,'Check runners in before the order');
  // Teams are never made at the finish: a team not on any list is added in the teams sheet first.
  if(target.event.relay && added.length) throw new Refusal(409,'Choose the team from the list');
  if(!target.event.relay && addedTeams.length) throw new Refusal(409,'Only a relay has teams');
  // A relay Final's teams are its seeds, call-ups and a lead's additions.
  if(target.race.kind==='final' && addedTeams.length) throw new Refusal(409,'Ask a lead to add a team to the Final');
  const previous=target.race.parts.runners.value||[],race=await readRace(client,phone.dayId,raceId);
  const already=added.find(number=>runnersOf(previous).some(runner=>runner.wristband===number));
  if(already!==undefined) throw new Refusal(400,`${already} is already in this race`);
  const teams=addedTeams.length?(await readTeamLists(client,phone.dayId)).get(target.event.id)!.teams:[];
  const staying=previous.filter(runner=>!didNotRun.includes(runner.id)),atFinish=addedTeams.map(teamId=>addedAtFinish(teams,teamId,phone.id));
  // A team keeps the warnings its team list gave it. A final's runners all ran in its heats, so "already ran in this event" does not apply.
  const runners=target.event.relay?[...staying,...atFinish]:await annotateRunners(client,phone.dayId,target.event,[...runnersOf(staying),...added.map(wristband=>({id:randomUUID(),wristband,addedAtFinish:true}))],kept,raceId,runnersOf(previous),target.race.kind==='final');
  if(!sameRunnerSnapshot(runners,previous)) await publishPart(client,phone,race,'runners',runners);
  const finish=onlyRunners({order:[...order,...atFinish.map(entry=>entry.id)],didNotFinish},runners);
  await publishPart(client,phone,race,'finish',finish.order.length || finish.didNotFinish.length?finish:null);
}
/**
 * Refuses a time no one can run (0.00, faster than 10 m/s for the event's distance) with the phone's words, for the
 * Times step and a lead's Correct times. Only a changed place is checked: a time saved before stays saved.
 */
export function refuseImpossibleTimes(places:readonly(number|null)[],stored:readonly(number|null)[]|undefined,eventName:string) {
  for(const [index,time] of places.entries()) {
    const refusal=time===null || time===stored?.[index]?null:timeRefusal(digitsForTime(time),eventName);
    if(refusal) throw new Refusal(400,refusal);
  }
}
export type TimesInput=ReturnType<typeof timesInput>;
/** A times body: the whole column by place in hundredths, and the places whose wrong time was kept. */
export function timesInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;places?:unknown;keptWrong?:unknown};
  const {raceId,version}=seenRace(input,'Open the race before saving its times');
  const hundredths=(value:unknown)=>Array.isArray(value) && value.every(item=>Number.isSafeInteger(item) && item>=0);
  if(!hundredths(input.places)) throw new Refusal(400,'Enter whole hundredths for every place');
  if(!hundredths(input.keptWrong)) throw new Refusal(400,'Choose the wrong times to keep');
  return {raceId,version,places:input.places as number[],keptWrong:input.keptWrong as number[]};
}
/**
 * The Times step's write. Times never waits for Finishing order: a time can go in before its place has a runner, up to
 * the race's runner count, and the race saves only once they agree.
 */
export async function writeTimes(client:pg.PoolClient,phone:Phone,target:WriteTarget,{raceId,places,keptWrong}:TimesInput) {
  if(raceId===null) throw new Refusal(409,'Check runners in before the times');
  const placed=target.race.parts.finish.value?.order.length||0,stored=target.race.parts.times.value;
  const limit=Math.max(placed,target.race.parts.runners.value?.length||0);
  const unplaced=places.findIndex((time,index)=>index>=limit && time!==stored?.places[index]);
  if(unplaced>=0) throw new Refusal(409,`This race has ${limit} ${limit===1?'runner':'runners'} - add the runner at the finish first`);
  refuseImpossibleTimes(places,stored?.places,target.event.name);
  const wrong=wrongTimes(places).map(item=>item.index),accepted=stored?.acceptedByLead && JSON.stringify(stored.places)===JSON.stringify(places);
  await publishPart(client,phone,await readRace(client,phone.dayId,raceId),'times',{places,outOfOrder:timesOutOfOrder(places),keptWrong:wrong.filter(index=>keptWrong.includes(index)),...(accepted?{acceptedByLead:true}:{})});
}
/**
 * A team added at the finish ("Add team"): a copy of its four children and their kept warnings, those on
 * the list marked here since they crossed the line. Only a team still to run that nobody else is changing can be added.
 */
function addedAtFinish(teams:readonly RelayTeam[],teamId:string,me:string):TeamEntry {
  const team=teams.find(item=>item.id===teamId);
  if(!team) throw new Refusal(404,'Team not found');
  return joiningTeam(team,{here:true,addedAtFinish:true,me});
}
/**
 * Saves a race whose steps are all done once nothing blocks it (finishers and times agree), with history naming who
 * marked each step done. A done mark checks, and so does every step write: a timer who drops a time left over saves a
 * race whose steps were already all done.
 */
export async function saveIfDone(client:pg.PoolClient,phone:Phone,raceId:string) {
  const race=await readRace(client,phone.dayId,raceId);
  if(race.state!=='in progress' || race.deleted) return;
  const done=(await client.query('SELECT p.part,s.name FROM race_parts p LEFT JOIN sign_ins s ON s.id=p.done_by WHERE p.race_id=$1 AND p.done_at IS NOT NULL',[raceId])).rows as Array<{part:RacePartName;name:string|null}>;
  if(stepsOf(race).every(step=>done.some(row=>row.part===stepParts[step])) && !stepBlocker(race,race.event.relay)) {
    await saveRace(client,phone,race,step=>done.find(row=>row.part===stepParts[step])?.name??null);
  }
}
/** Saves a race: its saved mark (who saved it, and when), and a history row per part naming who marked its step done. */
async function saveRace(client:pg.PoolClient,phone:Phone,race:Pick<RaceRead,'id'|'parts'>,doneBy:(step:Step)=>string|null) {
  const runners=JSON.stringify(race.parts.runners.value||[]);
  await client.query("UPDATE races SET state='saved',saved_at=clock_timestamp(),saved_by=$2 WHERE id=$1",[race.id,phone.name]);
  for(const step of steps) {
    const part=stepParts[step],{version,value}=race.parts[part];
    await client.query('INSERT INTO race_part_history(race_id,part,version,value,runners,held_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(race_id,part,version) DO UPDATE SET held_by=EXCLUDED.held_by,saved_at=coalesce(race_part_history.saved_at,EXCLUDED.saved_at)',[race.id,part,version,JSON.stringify(value),runners,doneBy(step)]);
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
export async function dropFromOrder(client:pg.PoolClient,race:Pick<RaceRead,'id'|'parts'>,runners:readonly RaceEntry[]) {
  const finish=race.parts.finish.value,left=finish && onlyRunners(finish,runners);
  if(finish && JSON.stringify(left)!==JSON.stringify(finish)) await client.query(`UPDATE race_parts SET value=$1 WHERE race_id=$2 AND part='finish'`,[JSON.stringify(left),race.id]);
}
