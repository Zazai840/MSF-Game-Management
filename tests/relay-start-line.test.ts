import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import type { RaceFlowRead,RacesRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { toCheckWording } from '../src/shared/to-check.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * A relay heat's Start line in the race flow: New race makes the heat, and anyone ticks teams in, takes them off and
 * marks each child here, the last tap winning (ADR 0002). That's everyone marks Runners done.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function ok<T=RaceFlowRead>(token:string,url:string,body?:unknown) {
  const response=await call(token,url,body);
  if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
  return response.json() as T;
}
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-start-line-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-start-line-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Shah')).token,lead=(await people.lead('Jo Evans')).token;
  return {sam,priya,lead,relays:relayFlowSetup(app)};
}
const newHeat=(token:string,number:number,eventCode='R22')=>ok(token,'/api/races',{eventCode,kind:'heat',number});
const teamId=(read:RaceFlowRead,number:number)=>read.teams!.find(team=>team.number===number)!.id;
/** A Start line tap on Team `number` of the race: tick, take-off or here. */
async function tap(token:string,read:RaceFlowRead,what:'tick'|'take-off'|'here',number:number,body:object={}) {
  return call(token,`/api/races/${read.race.id}/teams/${teamId(read,number)}/${what}`,body);
}
const teamsOf=(race:Pick<RaceRead,'parts'>)=>(race.parts.runners.value||[]).filter(isTeamEntry);

test('the race flow lists relays and makes the next heat, several heats open at once, each read carrying the team list',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const list=await ok<RacesRead>(sam,'/api/races');
  expect(list.groups.find(group=>group.event.code==='R22')).toMatchObject({event:{relay:true,type:'relays'},races:[],nextHeat:1});
  const one=await newHeat(sam,1),two=await newHeat(sam,2);
  expect([one.race,two.race]).toMatchObject([{kind:'heat',number:1,state:'in progress'},{kind:'heat',number:2,state:'in progress'}]);
  expect(two.teams!.map(team=>team.number)).toEqual([1]);
  expect((await ok(sam,`/api/races/${one.race.id}`)).group.races.map(race=>race.number)).toEqual([1,2]);
});

test('Add puts a team still to run into the heat, and Take off works only while none of its children is here',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  const heat=await newHeat(sam,1);
  const ticked=(await tap(sam,heat,'tick',1)).json() as RaceFlowRead;
  expect(teamsOf(ticked.race).map(entry=>[entry.team.number,entry.legs.map(leg=>leg.here)])).toEqual([[1,[false,false,false,false]]]);
  expect(ticked.teams!.find(team=>team.number===1)!.races).toMatchObject([{id:heat.race.id}]);
  expect(ticked.race.parts.runners.version).toBeGreaterThan(heat.race.parts.runners.version);
  // A team already in a heat is not still to run, so a second heat cannot take it: the refusal says where it is.
  const other=await newHeat(sam,2);
  expect((await tap(sam,other,'tick',1)).json()).toMatchObject({message:'Team 1 is already in Heat 1'});
  expect((await tap(sam,heat,'here',1,{leg:0,here:true})).statusCode).toBe(200);
  const refused=await tap(sam,heat,'take-off',1);
  expect(refused.statusCode).toBe(409);
  expect(refused.json().message).toBe('Team 1 has children marked here - unmark them first');
  await tap(sam,heat,'here',1,{leg:0,here:false});
  const off=(await tap(sam,heat,'take-off',1)).json() as RaceFlowRead;
  expect(teamsOf(off.race)).toEqual([]);
  expect(off.teams!.find(team=>team.number===1)!.races).toEqual([]);
});

test('Here taps from two phones at once both land, with no version refusal, the last tap on a child winning',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const heat=await newHeat(sam,1),ticked=(await tap(sam,heat,'tick',1)).json() as RaceFlowRead;
  // Both phones tap on the race as they last saw it.
  const answers=await Promise.all([tap(sam,ticked,'here',1,{leg:0,here:true}),tap(priya,ticked,'here',1,{leg:2,here:true}),tap(priya,ticked,'here',1,{leg:3,here:true})]);
  expect(answers.map(answer=>answer.statusCode)).toEqual([200,200,200]);
  const read=await ok(sam,`/api/races/${heat.race.id}`);
  expect(teamsOf(read.race)[0].legs.map(leg=>leg.here)).toEqual([true,false,true,true]);
  await tap(sam,ticked,'here',1,{leg:3,here:false});
  expect(teamsOf((await ok(priya,`/api/races/${heat.race.id}`)).race)[0].legs.map(leg=>leg.here)).toEqual([true,false,true,false]);
});

test('a team short of four never blocks: That\'s everyone marks Runners done, the heat saves, and the lead gets A team ran short',async()=>{
  const {sam,lead,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,null,2104]);
  const heat=await newHeat(sam,1);
  await tap(sam,heat,'tick',1);
  for(const leg of [0,1,3]) await tap(sam,heat,'here',1,{leg,here:true});
  expect((await call(sam,`/api/races/${heat.race.id}/steps/runners/done`,{})).statusCode).toBe(200);
  let read=await ok(sam,`/api/races/${heat.race.id}`);
  expect(read.steps.runners!.state).toBe('done');
  const entry=teamsOf(read.race)[0];
  read=await ok(sam,`/api/races/${heat.race.id}/order`,{raceId:heat.race.id,version:read.race.parts.finish.version,order:[entry.id],didNotFinish:[],didNotRun:[],added:[]});
  read=await ok(sam,`/api/races/${heat.race.id}/times`,{raceId:heat.race.id,version:read.race.parts.times.version,places:[3400],keptWrong:[]});
  for(const step of ['positions','times']) expect((await call(sam,`/api/races/${heat.race.id}/steps/${step}/done`,{})).statusCode).toBe(200);
  expect((await ok(sam,`/api/races/${heat.race.id}`)).race.state).toBe('saved');
  const items=((await call(lead,'/api/lead/results')).json() as ResultsRead).needsYou.filter(item=>item.event.code==='R22');
  expect(items.map(item=>toCheckWording(item))).toMatchObject([{title:'A team ran short',explanation:'Team 1 ran with 3 of 4 children marked here.'}]);
});

test('a team tap on a race that is not a relay\'s is refused',async()=>{
  const {sam}=await start();
  const race=await newHeat(sam,1,'R4');
  const refused=await call(sam,`/api/races/${race.race.id}/teams/00000000-0000-0000-0000-000000000000/tick`,{});
  expect(refused.statusCode).toBe(409);
  expect(refused.json().message).toBe('Only a relay has teams');
});
test('a team someone else is changing in the teams sheet can\'t be added until they save or cancel; this phone\'s own open team can',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  const heat=await newHeat(priya,1),teams=`/api/relays/${heat.group.event.id}/teams/${teamId(heat,1)}`;
  await ok(sam,`${teams}/open`,{});
  expect((await tap(priya,heat,'tick',1)).json()).toEqual({message:'Sam Patel is changing Team 1'});
  await ok(sam,`${teams}/close`,{});
  expect((await tap(priya,heat,'tick',1)).statusCode).toBe(200);
  // As its cards show it, a team this phone has open is not someone else changing it.
  await ok(priya,`/api/relays/${heat.group.event.id}/teams/${teamId(heat,2)}/open`,{});
  expect((await tap(priya,heat,'tick',2)).statusCode).toBe(200);
});
