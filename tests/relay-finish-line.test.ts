import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
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
  const sam=(await people.volunteer('Sam Patel')).token,relays=relaySetup(app);
  for(let number=1;number<=listed;number++) await relays.team(sam,'R22',[2100+number*10+1,2100+number*10+2,2100+number*10+3,2100+number*10+4]);
  let read=await ok(sam,'/api/races',{eventCode:'R22',kind:'heat',number:1});
  const id=read.race.id,teamId=(number:number)=>read.teams!.find(team=>team.number===number)!.id;
  for(let number=1;number<=ticked;number++) {
    read=await ok(sam,`/api/races/${id}/teams/${teamId(number)}/tick`,{});
    for(const leg of [0,1,2,3]) read=await ok(sam,`/api/races/${id}/teams/${teamId(number)}/here`,{leg,here:true});
  }
  return {sam,id,teamId,read};
}

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
