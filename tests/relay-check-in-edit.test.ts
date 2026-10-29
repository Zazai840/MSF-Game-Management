import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead,RacesRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * A team changed at check-in: Edit saves the team list and the race's entry together (`raceId`), New team joins the
 * heat (`joinRaceId`), and while a phone has a team open (`/open`, `/close`) the others see who.
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
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'check-in-edit-owner',resetTestDay:true});
  const people=await signInOwner(app,'check-in-edit-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Noor')).token,lead=(await people.lead('Jo Evans')).token;
  return {owner:people.owner.token as string,sam,priya,lead,relays:relayFlowSetup(app)};
}
const teamsOf=(race:Pick<RaceRead,'parts'>)=>(race.parts.runners.value||[]).filter(isTeamEntry);
const team=(read:{teams?:RaceFlowRead['teams']},number:number)=>read.teams!.find(item=>item.number===number)!;

test('Edit at check-in saves the team list and this race\'s entry together, each child\'s Here mark following them',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const ticked=await relays.tick(sam,'R22',1);
  await relays.here(sam,'R22',1,0);
  const seen=await relays.here(sam,'R22',1,1),one=team(seen,1),url=`/api/relays/${seen.group.event.id}/teams/${one.id}`;
  // 2102 moves to the 1st leg and 2101 to the 3rd; 2199 takes 2103's place.
  const saved=await ok(priya,url,{version:one.version,legs:[2102,2199,2101,2104],keptWarnings:[],raceId:ticked.race.id});
  expect(saved.race.id).toBe(ticked.race.id);
  expect(teamsOf(saved.race)[0].legs.map(leg=>[leg.wristband,leg.here])).toEqual([[2102,true],[2199,false],[2101,true],[2104,false]]);
  expect(team(saved,1)).toMatchObject({version:one.version+1,changedBy:'Priya Noor',legs:[{wristband:2102},{wristband:2199},{wristband:2101},{wristband:2104}]});
  expect(saved.race.parts.runners.version).toBeGreaterThan(seen.race.parts.runners.version);
  // The Save is checked against the team's version, and the team must still be in this race.
  expect((await call(sam,url,{version:one.version,legs:[2101,null,null,null],keptWarnings:[],raceId:ticked.race.id})).json()).toMatchObject({reason:'changed',by:'Priya Noor'});
  for(let leg=0;leg<4;leg++) await relays.here(sam,'R22',1,leg,false);
  await relays.takeOff(sam,'R22',1);
  const other=await ok(sam,'/api/races',{eventCode:'R22',kind:'heat',number:2});
  expect((await call(sam,url,{version:one.version+1,legs:[2101,null,null,null],keptWarnings:[],raceId:other.race.id})).json()).toEqual({message:'Team 1 is no longer in Heat 2'});
});

test('New team at check-in takes the next number and the same checks, and joins this heat in the same write',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R28',[4001,null,null,null]);
  const heat=await relays.tick(sam,'R22',1),url=`/api/relays/${heat.group.event.id}/teams`;
  // The race read carries every switched-on relay's list, which the leg boxes' warnings look through.
  expect(heat.relays!.find(list=>list.code==='R28')).toMatchObject({name:'4x100m Relay',section:'Girl Scouts',teams:[{number:1}]});
  expect((await call(sam,url,{legs:[2201,2102,null,null],keptWarnings:[],joinRaceId:heat.race.id})).json()).toEqual({message:'2102 is already in Team 1. Check the wristband.'});
  expect((await call(sam,url,{legs:[6100,null,null,null],keptWarnings:[],joinRaceId:heat.race.id})).json()).toEqual({message:'6100 needs Fix number or Keep'});
  const joined=await ok(sam,url,{legs:[2201,2202,6100,null],keptWarnings:[6100],joinRaceId:heat.race.id});
  expect(joined.race.id).toBe(heat.race.id);
  expect(teamsOf(joined.race).map(entry=>[entry.team.number,entry.legs.map(leg=>leg.wristband)])).toEqual([[1,[2101,2102,2103,2104]],[2,[2201,2202,6100,null]]]);
  expect(team(joined,2).races).toMatchObject([{id:heat.race.id}]);
  // A refused join writes nothing: the team list is as it was.
  await relays.save(sam,'R22',[1,2],[1400,1500]);
  expect((await call(sam,url,{legs:[2301,null,null,null],keptWarnings:[],joinRaceId:heat.race.id})).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  expect((await relays.teams(sam,'R22')).map(item=>item.number)).toEqual([1,2]);
});

test('other phones see who has a team open, cleared on Save, Cancel or sign-out; opening never locks anyone out',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const heat=await relays.tick(sam,'R22',1),one=team(heat,1),url=`/api/relays/${heat.group.event.id}/teams/${one.id}`;
  const changing=async()=>team(await ok(sam,`/api/races/${heat.race.id}`),1).changing?.name??null;
  const opened=await ok<RacesRead>(priya,`${url}/open`,{});
  expect(opened.revision).toBeGreaterThan(heat.revision);
  expect(await changing()).toBe('Priya Noor');
  // Sam's close leaves Priya's mark alone; Sam opening moves it to him (nothing locks), and his Cancel clears it.
  await ok<RacesRead>(sam,`${url}/close`,{});
  expect(await changing()).toBe('Priya Noor');
  await ok<RacesRead>(sam,`${url}/open`,{});
  expect(await changing()).toBe('Sam Patel');
  await ok<RacesRead>(sam,`${url}/close`,{});
  expect(await changing()).toBeNull();
  // Save clears it.
  await ok<RacesRead>(priya,`${url}/open`,{});
  await ok(priya,url,{version:one.version,legs:[2101,2102,2103,2109],keptWarnings:[],raceId:heat.race.id});
  expect(await changing()).toBeNull();
  // Signing out clears it.
  await ok<RacesRead>(priya,`${url}/open`,{});
  expect((await call(priya,'/api/sign-out',{})).statusCode).toBe(200);
  expect(await changing()).toBeNull();
  expect((await call(sam,`/api/relays/${heat.group.event.id}/teams/nope/open`,{})).json()).toEqual({message:'Team not found'});
});

test('a final\'s team is changed at its check-in once the heats are complete, and keeps its new legs through Absent and back',async()=>{
  const {sam,lead,relays}=await start();
  for(const number of [1,2]) await relays.team(sam,'R22',[2100+number*10+1,2100+number*10+2,2100+number*10+3,2100+number*10+4]);
  for(const number of [1,2]) await relays.tick(sam,'R22',number);
  await relays.save(sam,'R22',[1,2],[1400,1500]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await ok(lead,'/api/races',{eventCode:'R22',kind:'final'}),two=team(final,2),url=`/api/relays/${final.group.event.id}/teams/${two.id}`;
  // From the teams sheet the list is frozen; from the final's check-in it is not.
  expect((await call(sam,url,{version:two.version,legs:[2121,2122,2199,2124],keptWarnings:[]})).json()).toEqual({message:'Girl Cubs heats are finished. Ask a lead to change the teams.'});
  await ok(sam,`/api/races/${final.race.id}/teams/${two.id}/absent`,{mark:'here'});
  const saved=await ok(sam,url,{version:two.version,legs:[2122,2121,2199,2124],keptWarnings:[],raceId:final.race.id});
  const legsOf=(read:RaceFlowRead)=>teamsOf(read.race).find(entry=>entry.team.id===two.id)!.legs.map(leg=>[leg.wristband,leg.here]);
  expect(legsOf(saved)).toEqual([[2122,true],[2121,true],[2199,false],[2124,true]]);
  await ok(sam,`/api/races/${final.race.id}/teams/${two.id}/absent`,{mark:'absent'});
  expect(legsOf(await ok(sam,`/api/races/${final.race.id}/teams/${two.id}/absent`,{mark:null}))).toEqual([[2122,false],[2121,false],[2199,false],[2124,false]]);
});
