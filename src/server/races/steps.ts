import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { DayEvent } from '../../shared/day.js';
import type { Phone } from '../../shared/domain.js';
import { entryName,isTeamEntry,runnersOf,type RaceEntry,type RacePartName,type RaceRead,type TeamEntry } from '../../shared/races.js';
import type { RelayTeam } from '../../shared/teams.js';
import { finalMark,placeFree,type FinalField } from '../../shared/finals.js';
import { digitsForTime,timeRefusal,removedPlaces,timesOutOfOrder,timesWithoutPlaces } from '../../shared/time-entry.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { finishOf,onlyRunners,placesBoard,raceName,stepBlocker,stepParts,steps,stepsOf,type Step } from '../../shared/race-flow.js';
import { raceStatus } from '../../shared/race-status.js';
import { Refusal } from '../access/permissions.js';
import { joiningTeam,readTeamLists } from '../relays/teams.js';
import { readRace } from './records.js';
import { publishPart,sameRunnerSnapshot } from './versions.js';
import { markAbsentFinalists,markReplacement } from './final-field.js';
import { annotateRunners,keptWarningNumbers } from './warnings.js';
import { writeChangeNote } from '../rulings/records.js';
import { requireChangeReason } from '../rulings/validation.js';
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
/** A final's line-up as entries, a child finalist or a relay team: a seeded child never yet checked in is named by their heat wristband. */
const finalLineup=(final:FinalField):RaceEntry[]=>[...final.entries.flatMap(entry=>entry.runner?[entry.runner]:entry.heatWristband===null?[]:[{id:entry.finalEntryId,wristband:entry.heatWristband}]),...(final.additionalEntries||[]).map(entry=>entry.runner)];
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
  const lineup=finalLineup(final);
  if([...here,...absent].some(id=>!lineup.some(runner=>runner.id===id))) throw new Refusal(400,'Choose a runner from this final');
  const runners=lineup.filter(runner=>here.includes(runner.id)).map(runner=>previous.find(current=>current.id===runner.id)||runner);
  if(new Set(runners.map(entryName)).size!==runners.length) throw new Refusal(409,`Two ${runners.some(isTeamEntry)?'teams marked Here have the same team number':'runners marked Here have the same wristband number'}. Ask a lead to check the final.`);
  await publishPart(client,phone,race,'runners',runners);
  await markAbsentFinalists(client,race.id,id=>absent.includes(id));
  await dropFromOrder(client,target.race,runners);
}
export type AddRunnerInput=ReturnType<typeof addRunnerInput>;
/** "+ Runner" at a final's start line: the race and runners version the phone saw, the wristband, its kept warning and "Why the change?". */
export function addRunnerInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;wristband?:unknown;reason?:unknown};
  const {raceId,version}=seenRace(input,'Open the final before adding a runner');
  const refusal=runnerListRefusal([input.wristband as number]);
  if(refusal) throw new Refusal(400,refusal);
  const wristband=input.wristband as number;
  return {raceId,version,wristband,kept:keptWarningNumbers(input,[wristband]),reason:requireChangeReason(input.reason,false)};
}
/**
 * "+ Runner": any wristband joins an individual final while a place is free (`placeFree`), Here at once, so it is the
 * final's added entry ("Added"). The reason is kept as an audit note on that entry.
 */
export async function addRunner(client:pg.PoolClient,phone:Phone,{event,race}:WriteTarget,{wristband,kept,reason}:AddRunnerInput) {
  if(race.kind!=='final' || event.relay) throw new Refusal(409,'Only a final\'s start line adds a runner this way');
  const final=race.final!,name=raceName(race);
  if(!placeFree(final)) throw new Refusal(409,`No place is free in the ${name}`);
  if(final.entries.some(entry=>entry.wristband===wristband)) throw new Refusal(409,`${wristband} is already in the ${name}`);
  // A final's runners all ran in its heats, so "already ran in this event" does not apply.
  const [runner]=await annotateRunners(client,phone.dayId,event,[{id:randomUUID(),wristband}],kept,race.id,[],true);
  await publishPart(client,phone,await readRace(client,phone.dayId,race.id),'runners',[...race.parts.runners.value||[],runner]);
  await writeChangeNote(client,phone,event.id,'add-runner',`added ${wristband} to the ${name}`,reason,[{raceId:race.id,entryId:runner.id}]);
}
export type ReplaceInput=ReturnType<typeof replaceInput>;
/** A replace body: the final and runners version the phone saw, the finalist tapped, the new wristband, and why. */
export function replaceInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;finalEntryId?:unknown;wristband?:unknown;reason?:unknown};
  const {raceId,version}=seenRace(input,'Open the final before replacing a runner');
  if(typeof input.finalEntryId!=='string') throw new Refusal(400,'Choose a runner from this final');
  const refusal=runnerListRefusal([input.wristband as number]);
  if(refusal) throw new Refusal(400,refusal);
  const wristband=input.wristband as number;
  return {raceId,version,finalEntryId:input.finalEntryId,wristband,kept:keptWarningNumbers(input,[wristband]),reason:requireChangeReason(input.reason,true)};
}
/**
 * A final's runner replaced at the start line, in one write: the finalist tapped (Here or not marked) is Absent, and
 * the new wristband joins as an added runner, Here. No free place is needed. The reason is kept as an audit note on
 * both, the old one also on their heat entry, as a call-up's is. An added runner tapped is a typing error corrected:
 * their entry takes the new number in place, Here, and the note is on that entry.
 */
export async function replaceRunner(client:pg.PoolClient,phone:Phone,target:WriteTarget,{raceId,finalEntryId,wristband,kept,reason}:ReplaceInput) {
  if(raceId===null || target.race.kind!=='final' || target.event.relay) throw new Refusal(409,'Only a final has a replace');
  const race=await readRace(client,phone.dayId,raceId),final=race.final!,previous=runnersOf(race.parts.runners.value);
  const old=runnersOf(finalLineup(final)).find(runner=>runner.id===finalEntryId);
  if(!old) throw new Refusal(400,'Choose a runner from this final');
  const seeded=final.entries.find(entry=>entry.finalEntryId===finalEntryId),added=final.additionalEntries?.find(entry=>entry.runner.id===finalEntryId);
  if(finalMark({finalEntryId,absent:(seeded??added)!.absent},previous)==='absent') throw new Refusal(409,`${old.wristband} is Absent`);
  if(runnersOf(finalLineup(final)).some(runner=>runner.wristband===wristband)) throw new Refusal(400,`${wristband} is already in this race`);
  const [joining]=await annotateRunners(client,phone.dayId,target.event,[{id:added?finalEntryId:randomUUID(),wristband}],kept,raceId,[],true);
  const runners=[...previous.filter(runner=>runner.id!==finalEntryId),joining];
  await publishPart(client,phone,race,'runners',runners);
  if(added) return writeChangeNote(client,phone,target.event.id,'correct-runner',`corrected ${old.wristband} to ${wristband} (${raceName(race)})`,reason,[{raceId,entryId:finalEntryId}]);
  await markAbsentFinalists(client,raceId,(id,stored)=>id===finalEntryId || stored);
  await markReplacement(client,raceId,joining.id,finalEntryId);
  await dropFromOrder(client,target.race,runners);
  const touches=[{raceId,entryId:finalEntryId},{raceId,entryId:joining.id},...(seeded?[{raceId:seeded.heatRaceId,entryId:seeded.heatEntryId}]:[])];
  await writeChangeNote(client,phone,target.event.id,'replace-runner',`replaced ${old.wristband} with ${wristband} (${raceName(race)})`,reason,touches);
}
export type OrderInput=ReturnType<typeof orderInput>;
/**
 * An order body: the whole finishing order by entry, Did not finish, Didn't run, and runners (or on a relay teams) added
 * at the finish. `empty` are the places (from 0) emptied to fill again.
 */
export function orderInput(body:unknown) {
  const input=(body||{}) as {raceId?:unknown;version?:unknown;order?:unknown;didNotFinish?:unknown;didNotRun?:unknown;added?:unknown;addedTeams?:unknown;empty?:unknown};
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
  const empty=placeList(input.empty??[]);
  if(!empty || empty.some(place=>place>=order.length+empty.length)) throw new Refusal(400,unclassified);
  return {raceId,version,order,didNotFinish,didNotRun,added,kept:keptWarningNumbers(input,added),addedTeams:addedTeams as string[],empty};
}
/** A list of places (from 0), each named once, or null when the value is not one. */
export const placeList=(value:unknown)=>Array.isArray(value) && value.every(place=>Number.isSafeInteger(place) && place>=0) && new Set(value).size===value.length?value as number[]:null;
/** A removed place loses its time (`timesWithoutPlaces`); the times' version moves on, so a column sent before this is refused. */
async function dropTimes(client:pg.PoolClient,race:Pick<RaceRead,'id'|'parts'>,removed:readonly number[]) {
  const stored=race.parts.times.value,times=timesWithoutPlaces(stored,removed);
  if(times!==stored) await client.query(`UPDATE race_parts SET value=$1,version=version+1 WHERE race_id=$2 AND part='times'`,[JSON.stringify(times),race.id]);
}
/**
 * The Finishing order step's write. Runners the Runners step has since taken off are dropped, later places moving up.
 * A place only emptied keeps its time, also once it is filled again; a removed place loses it (`dropTimes`). The
 * removed places are never the phone's to name: an order with fewer places than the stored one removes the places of
 * the entries, and the empty places, it no longer has. One still shorter than that is refused.
 */
export async function writeOrder(client:pg.PoolClient,phone:Phone,target:WriteTarget,{raceId,order,didNotFinish,didNotRun,added,kept,addedTeams,empty}:OrderInput) {
  if(raceId===null) throw new Refusal(409,'Check runners in before the order');
  // Teams are never made at the finish: a new team is typed into the heat at the start line first.
  if(target.event.relay && added.length) throw new Refusal(409,'Choose the team from the list');
  if(!target.event.relay && addedTeams.length) throw new Refusal(409,'Only a relay has teams');
  // A final's runners and teams change at its start line, never at the finish.
  if(target.race.kind==='final' && (added.length || addedTeams.length)) throw new Refusal(409,target.event.relay?'Add a team to the Final at the start line':'Add a runner to the Final at the start line');
  const previous=target.race.parts.runners.value||[],race=await readRace(client,phone.dayId,raceId);
  const already=added.find(number=>runnersOf(previous).some(runner=>runner.wristband===number));
  if(already!==undefined) throw new Refusal(400,`${already} is already in this race`);
  const teams=addedTeams.length?(await readTeamLists(client,phone.dayId)).get(target.event.id)!.teams:[];
  const staying=previous.filter(runner=>!didNotRun.includes(runner.id)),atFinish=addedTeams.map(teamId=>addedAtFinish(teams,teamId));
  // A team keeps the warnings kept on it when it was typed in. A final's runners all ran in its heats, so "already ran in this event" does not apply.
  const runners=target.event.relay?[...staying,...atFinish]:await annotateRunners(client,phone.dayId,target.event,[...runnersOf(staying),...added.map(wristband=>({id:randomUUID(),wristband,addedAtFinish:true}))],kept,raceId,runnersOf(previous),target.race.kind==='final');
  if(!sameRunnerSnapshot(runners,previous)) await publishPart(client,phone,race,'runners',runners);
  const finish=onlyRunners(finishOf([...placesBoard({order,empty}),...atFinish.map(entry=>entry.id)],didNotFinish),runners);
  const before=placesBoard(target.race.parts.finish.value||{order:[]}),board=placesBoard(finish);
  const removed=board.length<before.length?removedPlaces(before,board):[];
  if(board.length<before.length-removed.length) throw new Refusal(409,'This race has changed - open it again');
  await publishPart(client,phone,race,'finish',finish.order.length || finish.didNotFinish.length?finish:null);
  await dropTimes(client,target.race,removed);
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
  const wrong=wrongTimes(places,target.event.name).map(item=>item.index),accepted=stored?.acceptedByLead && JSON.stringify(stored.places)===JSON.stringify(places);
  await publishPart(client,phone,await readRace(client,phone.dayId,raceId),'times',{places,outOfOrder:timesOutOfOrder(places),keptWrong:wrong.filter(index=>keptWrong.includes(index)),...(accepted?{acceptedByLead:true}:{})});
}
/**
 * A team added at the finish ("+ Team not on the list"): a copy of its four children and their kept warnings, each
 * child with a wristband marked here since they crossed the line. Only a team still to run can be added.
 */
function addedAtFinish(teams:readonly RelayTeam[],teamId:string):TeamEntry {
  const team=teams.find(item=>item.id===teamId);
  if(!team) throw new Refusal(404,'Team not found');
  return joiningTeam(team,{addedAtFinish:true});
}
/**
 * Saves a race whose steps are all done once nothing blocks it (finishers and times agree), with history naming who
 * marked each step done. A done mark checks, and so does every step write: a timer who drops a time left over saves a
 * race whose steps were already all done.
 */
export async function saveIfDone(client:pg.PoolClient,phone:Phone,raceId:string) {
  const race=await readRace(client,phone.dayId,raceId);
  if(raceStatus(race)!=='in progress') return false;
  const done=(await client.query('SELECT p.part,s.name FROM race_parts p LEFT JOIN sign_ins s ON s.id=p.done_by WHERE p.race_id=$1 AND p.done_at IS NOT NULL',[raceId])).rows as Array<{part:RacePartName;name:string|null}>;
  if(stepsOf(race).every(step=>done.some(row=>row.part===stepParts[step])) && !stepBlocker(race,race.event.relay)) {
    await saveRace(client,phone,race,step=>done.find(row=>row.part===stepParts[step])?.name??null);
    return true;
  }
  return false;
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
 * A removed place loses its time (`dropTimes`): a column the Timer sends before seeing this is refused, since saved
 * it would give each later place the time of the one above.
 */
export async function dropFromOrder(client:pg.PoolClient,race:Pick<RaceRead,'id'|'parts'>,runners:readonly RaceEntry[]) {
  const finish=race.parts.finish.value,left=finish && onlyRunners(finish,runners);
  if(!finish || JSON.stringify(left)===JSON.stringify(finish)) return;
  await client.query(`UPDATE race_parts SET value=$1 WHERE race_id=$2 AND part='finish'`,[JSON.stringify(left),race.id]);
  await dropTimes(client,race,removedPlaces(placesBoard(finish),placesBoard(left!)));
}
