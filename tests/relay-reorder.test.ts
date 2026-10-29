import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * A grip drop on a start-line team card: the teams sheet's Edit with `raceId`, the legs in their new order. It saves
 * the race and the team list together, each Here mark following its child, version-checked like any team Save.
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
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-reorder-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-reorder-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Noor')).token,lead=(await people.lead('Jo Evans')).token;
  return {sam,priya,lead,relays:relayFlowSetup(app)};
}
const teamOf=(race:Pick<RaceRead,'parts'>,number:number)=>(race.parts.runners.value||[]).filter(isTeamEntry).find(entry=>entry.team.number===number)!;
const team=(read:RaceFlowRead,number:number)=>read.teams!.find(item=>item.number===number)!;
const legsOf=(race:Pick<RaceRead,'parts'>,number:number)=>teamOf(race,number).legs.map(leg=>[leg.wristband,leg.here]);
/** A drop: the team's legs in their new order, sent as its Edit at check-in. */
const drop=(token:string,read:RaceFlowRead,number:number,legs:Array<number|null>)=>
  call(token,`/api/relays/${read.group.event.id}/teams/${team(read,number).id}`,{version:team(read,number).version,legs,keptWarnings:[],raceId:read.race.id});

test('a drop on a heat writes the race and the team list, Here following each child, a short team\'s empty leg moving, and Runners staying done',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,null]);
  await relays.tick(sam,'R22',1);
  await relays.here(sam,'R22',1,0);
  const seen=await relays.here(sam,'R22',1,2);
  const done=await ok(sam,`/api/races/${seen.race.id}/steps/runners/done`,{});
  expect(done.steps.runners!.state).toBe('done');
  // The empty 4th leg is dragged to 2nd: 2102 and 2103 move down a leg.
  const dropped=await drop(sam,done,1,[2101,null,2102,2103]);
  expect(dropped.statusCode).toBe(200);
  const read=dropped.json() as RaceFlowRead;
  expect(legsOf(read.race,1)).toEqual([[2101,true],[null,false],[2102,false],[2103,true]]);
  expect(team(read,1)).toMatchObject({version:team(done,1).version+1,legs:[{wristband:2101},{wristband:null},{wristband:2102},{wristband:2103}]});
  expect(read.steps.runners!.state).toBe('done');
});

test('two drops at once: the later is refused as changed, and the latest read shows the first',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const seen=await relays.tick(sam,'R22',1);
  const first=await drop(sam,seen,1,[2102,2101,2103,2104]);
  const second=await drop(priya,seen,1,[2101,2102,2104,2103]);
  expect(first.statusCode).toBe(200);
  expect(second.statusCode).toBe(409);
  expect(second.json()).toMatchObject({reason:'changed',by:'Sam Patel',message:'Sam Patel changed this a moment ago'});
  const latest=await ok(priya,`/api/races/${seen.race.id}`);
  expect(legsOf(latest.race,1).map(([wristband])=>wristband)).toEqual([2102,2101,2103,2104]);
  // Redone on the latest, it lands.
  expect((await drop(priya,latest,1,[2102,2101,2104,2103])).statusCode).toBe(200);
});

test('a drop on a final reorders the finalist team, and the heat it already ran keeps its order',async()=>{
  const {sam,lead,relays}=await start();
  for(const number of [1,2]) await relays.team(sam,'R22',[2100+number*10+1,2100+number*10+2,2100+number*10+3,2100+number*10+4]);
  for(const number of [1,2]) await relays.tick(sam,'R22',number);
  const heat=await relays.save(sam,'R22',[1,2],[1400,1500]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await ok(lead,'/api/races',{eventCode:'R22',kind:'final'});
  await ok(sam,`/api/races/${final.race.id}/teams/${team(final,2).id}/absent`,{mark:'here'});
  const marked=await ok(sam,`/api/races/${final.race.id}`);
  const dropped=await drop(sam,marked,2,[2124,2121,2122,2123]);
  expect(dropped.statusCode).toBe(200);
  expect(legsOf((dropped.json() as RaceFlowRead).race,2)).toEqual([[2124,true],[2121,true],[2122,true],[2123,true]]);
  expect(legsOf((await ok(sam,`/api/races/${heat.race.id}`)).race,2).map(([wristband])=>wristband)).toEqual([2121,2122,2123,2124]);
});

test('a saved race refuses a drop',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.tick(sam,'R22',1);
  const saved=await relays.save(sam,'R22',[1],[1400]);
  expect((await drop(sam,saved,1,[2102,2101,2103,2104])).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
});
