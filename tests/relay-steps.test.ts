import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/storage.js';
import { jobRace,raceChange,readRace } from '../src/server/races/records.js';
import { absentInput,checkIn,checkInInput,markAbsent,orderInput,saveIfDone,timesInput,writeOrder,writeTimes } from '../src/server/races/steps.js';
import type { Phone } from '../src/shared/domain.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * The race flow's step writers on a relay race: each keeps the race's team entries. The flow hands a writer only the
 * event and the race (no team list), so these call the writers as the flow does.
 */
let app:FastifyInstance,pool:pg.Pool|undefined;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();await pool?.end();pool=undefined;});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-steps-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-steps-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=await people.volunteer('Sam Patel'),lead=(await people.lead('Jo Evans')).token;
  pool=await openDatabase(process.env.TEST_DATABASE_URL!);
  return {sam:sam.token,phone:sam.phone,lead,relays:relayFlowSetup(app)};
}
/** Runs a step writer as the race flow does: under the day lock, on the race as it stands, given its event and the race only. */
function step(phone:Phone,raceId:string,write:(client:pg.PoolClient,target:{event:RaceRead['event'];race:RaceRead})=>Promise<unknown>) {
  return raceChange(pool!,phone,async client=>{const race=await readRace(client,phone.dayId,raceId);await write(client,{event:race.event,race:jobRace(race)});});
}
const teamsOf=(race:Pick<RaceRead,'parts'>)=>(race.parts.runners.value||[]).filter(isTeamEntry);

test('the finishing order adds a team still to run at the finish, from the relay\'s own team list, after the teams placed',async()=>{
  const {sam,phone,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,null,2204]);
  const ticked=await relays.tick(sam,'R22',1),raceId=ticked.race.id!,first=teamsOf(ticked.race)[0];
  await step(phone,raceId,(client,target)=>writeOrder(client,phone,target,orderInput({raceId,version:target.race.parts.finish.version,order:[first.id],didNotFinish:[],didNotRun:[],added:[],addedTeams:[ticked.teams![1].id]})));
  const {race}=(await relays.race(sam,'R22'))!,teams=teamsOf(race);
  expect(teams.map(entry=>entry.team.number)).toEqual([1,2]);
  expect(teams[1]).toMatchObject({addedAtFinish:true,legs:[{wristband:2201,here:true},{wristband:2202,here:true},{wristband:null,here:false},{wristband:2204,here:true}]});
  expect(race.parts.finish.value).toEqual({order:[first.id,teams[1].id],didNotFinish:[]});
});
test('a relay final\'s Here / Absent keeps its seeded teams: those Here are its entries, those Absent are marked so',async()=>{
  const {sam,phone,lead,relays}=await start();
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204]]) await relays.team(sam,'R22',legs);
  for(const number of [1,2]) await relays.tick(sam,'R22',number);
  await relays.save(sam,'R22',[2,1],[3400,3500]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const seeded=(await relays.race(sam,'R22'))!.race,raceId=seeded.id!,[fastest,second]=seeded.final!.entries;
  expect([fastest.team?.number,second.team?.number]).toEqual([2,1]);
  await step(phone,raceId,(client,target)=>markAbsent(client,phone,target,absentInput({raceId,version:target.race.parts.runners.version,here:[second.finalEntryId],absent:[fastest.finalEntryId]})));
  const {race}=(await relays.race(sam,'R22'))!;
  expect(teamsOf(race).map(entry=>[entry.id,entry.team.number])).toEqual([[second.finalEntryId,1]]);
  expect(race.final!.entries.map(entry=>[entry.team?.number,entry.absent])).toEqual([[2,true],[1,false]]);
});
test('a wristband check-in never replaces a relay heat\'s teams: a relay checks in by team',async()=>{
  const {sam,phone,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const ticked=await relays.tick(sam,'R22',1),raceId=ticked.race.id!;
  await expect(step(phone,raceId,(client,target)=>checkIn(client,phone,target,checkInInput({raceId,version:target.race.parts.runners.version,runners:[{wristband:2101}]}))))
    .rejects.toMatchObject({statusCode:409,message:'Add the teams that are running'});
  expect((await relays.race(sam,'R22'))!.race.parts.runners).toEqual(ticked.race.parts.runners);
});
test('a relay heat saves itself once every step is done and each team is placed and timed, naming who marked each step done',async()=>{
  const {sam,phone,lead,relays}=await start();
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204]]) await relays.team(sam,'R22',legs);
  await relays.tick(sam,'R22',1);
  const ticked=await relays.tick(sam,'R22',2),raceId=ticked.race.id!,[one,two]=teamsOf(ticked.race);
  await step(phone,raceId,(client,target)=>writeOrder(client,phone,target,orderInput({raceId,version:target.race.parts.finish.version,order:[two.id],didNotFinish:[],didNotRun:[],added:[]})));
  await step(phone,raceId,(client,target)=>writeTimes(client,phone,target,timesInput({raceId,version:target.race.parts.times.version,places:[3400],keptWrong:[]})));
  await pool!.query('UPDATE race_parts SET done_at=clock_timestamp(),done_by=$2 WHERE race_id=$1',[raceId,phone.id]);
  // Team 1 has no place yet, so the heat waits.
  await step(phone,raceId,client=>saveIfDone(client,phone,raceId));
  expect((await relays.race(sam,'R22'))!.race.state).toBe('in progress');
  await step(phone,raceId,(client,target)=>writeOrder(client,phone,target,orderInput({raceId,version:target.race.parts.finish.version,order:[two.id,one.id],didNotFinish:[],didNotRun:[],added:[]})));
  await step(phone,raceId,(client,target)=>writeTimes(client,phone,target,timesInput({raceId,version:target.race.parts.times.version,places:[3400,3500],keptWrong:[]})));
  await step(phone,raceId,client=>saveIfDone(client,phone,raceId));
  const saved=(await call(lead,`/api/lead/races/${raceId}`)).json() as {race:RaceRead;history:Array<{part:string;author:string|null;at:string|null}>};
  expect(saved.race.state).toBe('saved');
  expect(teamsOf(saved.race).map(entry=>entry.team.number)).toEqual([1,2]);
  expect(saved.history.map(row=>[row.part,row.author])).toEqual([['runners','Sam Patel'],['finish','Sam Patel'],['times','Sam Patel']]);
});
