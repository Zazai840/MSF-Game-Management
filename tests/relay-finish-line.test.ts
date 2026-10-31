import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * A relay heat's Finish line and Timer in the race flow, and the heat saving itself: whole teams are placed, a team
 * still to run is added at the finish, Didn't run sends a team back to still to run, and once every step is done the
 * heat saves with no Submit Race, Undo un-saving it.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function ok(token:string,url:string,body?:unknown) {
  const response=await call(token,url,body);
  if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
  return response.json() as RaceFlowRead;
}
const teamsOf=(race:Pick<RaceRead,'parts'>)=>(race.parts.runners.value||[]).filter(isTeamEntry);
/** A relay heat with Teams 1 to `count` ticked in, every child here, and Teams after that still to run. */
async function heat(ticked:number,listed:number) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-finish-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-finish-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Shah')).token,relays=relayFlowSetup(app);
  for(let number=1;number<=listed;number++) await relays.team(sam,'R22',[2100+number*10+1,2100+number*10+2,2100+number*10+3,2100+number*10+4]);
  let read=await ok(sam,'/api/races',{eventCode:'R22',kind:'heat',number:1});
  const id=read.race.id,teamId=(number:number)=>read.teams!.find(team=>team.number===number)!.id;
  for(let number=1;number<=ticked;number++) read=await ok(sam,`/api/races/${id}/teams/${teamId(number)}/tick`,{});
  return {sam,priya,id,teamId,read};
}

test('"+ Team not on the list" is refused for a team already in a heat or that someone is changing, and a wristband typed at the finish is refused',async()=>{
  const {sam,priya,id,teamId,read}=await heat(2,3);
  const order=(body:object)=>call(sam,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[],...body}).then(response=>response.json());
  expect(await order({addedTeams:[teamId(2)]})).toEqual({message:'Team 2 is already in Heat 1'});
  await ok(priya,`/api/relays/${read.group.event.id}/teams/${teamId(3)}/open`,{});
  expect(await order({addedTeams:[teamId(3)]})).toEqual({message:'Priya Shah is changing Team 3'});
  expect(await order({added:[2301],keptWarnings:[]})).toEqual({message:'Choose the team from the list'});
  expect(teamsOf((await ok(sam,`/api/races/${id}`)).race).map(entry=>entry.team.number)).toEqual([1,2]);
});

test('Did not finish keeps the whole team in the heat with no place and no time, and the heat saves with the others timed',async()=>{
  const {sam,id}=await heat(2,2);
  let read=await ok(sam,`/api/races/${id}/steps/runners/done`,{});
  const [one,two]=teamsOf(read.race);
  read=await ok(sam,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:[one.id],didNotFinish:[two.id],didNotRun:[],added:[]});
  expect(teamsOf(read.race).map(entry=>entry.team.number)).toEqual([1,2]);
  expect(read.race.parts.finish.value).toEqual({order:[one.id],didNotFinish:[two.id]});
  read=await ok(sam,`/api/races/${id}/steps/positions/done`,{});
  read=await ok(sam,`/api/races/${id}/times`,{raceId:id,version:read.race.parts.times.version,places:[1400],keptWrong:[]});
  expect((await ok(sam,`/api/races/${id}/steps/times/done`,{})).race.state).toBe('saved');
});

test('Save the order is refused while teams have no place, worded for teams',async()=>{
  const {sam,id}=await heat(2,2);
  const refused=await call(sam,`/api/races/${id}/steps/positions/done`,{});
  expect(refused.statusCode).toBe(409);
  expect(refused.json().message).toBe('2 teams have no place yet');
});

test('a relay heat saves itself once Runners, Finishing order and Times are done, with a team added at the finish and one that didn\'t run back to still to run, and Undo un-saves it',async()=>{
  const {sam,id,teamId}=await heat(2,3);
  let read=await ok(sam,`/api/races/${id}/steps/runners/done`,{});
  const [one,two]=teamsOf(read.race);
  // Team 2 placed 1st, Team 3 added at the finish from still to run, Team 1 didn't run.
  read=await ok(sam,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:[two.id],didNotFinish:[],didNotRun:[one.id],added:[],addedTeams:[teamId(3)]});
  expect(teamsOf(read.race).map(entry=>entry.team.number)).toEqual([2,3]);
  expect(read.teams!.find(team=>team.number===1)!.races).toEqual([]);
  read=await ok(sam,`/api/races/${id}/steps/positions/done`,{});
  read=await ok(sam,`/api/races/${id}/times`,{raceId:id,version:read.race.parts.times.version,places:[1400,1500],keptWrong:[]});
  expect(read.race.state).toBe('in progress');
  read=await ok(sam,`/api/races/${id}/steps/times/done`,{});
  expect(read.race.state).toBe('saved');
  read=await ok(sam,`/api/races/${id}/steps/times/undone`,{version:read.race.parts.times.version});
  expect(read.race.state).toBe('in progress');
  expect(read.steps.times!.state).toBe('in progress');
});
