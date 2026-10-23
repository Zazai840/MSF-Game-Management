import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { HomeEvent,HomeSnapshot } from '../src/shared/race-screen.js';
import type { RelayTeam } from '../src/shared/teams.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'teams-owner',resetTestDay:true});
  const people=await signInOwner(app,'teams-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=await people.volunteer('Sam Patel'),ali=await people.volunteer('Ali Khan'),priya=await people.volunteer('Priya Shah');
  return {owner:people.owner.token as string,sam:sam.token,ali:ali.token,priya:priya.token,samId:sam.phone.id,aliId:ali.phone.id,lead:people.lead};
}
/** A teams write as that phone; fails the test unless the server accepts it, and answers Home as it then stands. */
async function teams(token:string,code:string,what:string,body:object={}):Promise<HomeSnapshot> {
  const response=await call(token,`/api/teams/${code}/${what}`,body);
  expect(response.statusCode,response.body).toBe(200);
  return response.json();
}
/** A relay on Home, with its team list. */
const relay=(home:HomeSnapshot,code:string)=>home.events.find(event=>event.code===code) as HomeEvent & {teams:RelayTeam[]};

test('opening a relay\'s card takes its teams hold, two phones hold two relays at once, and the day revision rises',async()=>{
  const {sam,ali,priya,samId,aliId}=await start();
  const before=await teams(priya,'R22','hold');
  const held=await teams(sam,'R21','hold');
  expect(held.revision).toBeGreaterThan(before.revision);
  expect(relay(held,'R21').teamsHolder).toEqual({id:samId,name:'Sam Patel'});
  const both=await teams(ali,'R27','hold');
  expect(relay(both,'R21').teamsHolder).toMatchObject({name:'Sam Patel'});
  expect(relay(both,'R27').teamsHolder).toEqual({id:aliId,name:'Ali Khan'});
  // Someone else holding it, or holding it already, changes nothing.
  const again=await teams(priya,'R21','hold');
  expect(again.revision).toBe(both.revision);
  expect(relay(again,'R21').teamsHolder).toMatchObject({name:'Sam Patel'});
  // The teams hold is not a race job: the race screen and its Submit Race never see it.
  const screen=(await call(sam,'/api/race-screen/R21')).json();
  expect(screen.holds).toEqual({});
  expect(relay(again,'R21').holds).toEqual({});
  // Only relays have teams.
  expect((await call(sam,'/api/teams/R4/hold',{})).json()).toEqual({message:'Only a relay has teams'});
});
test('Done saves a team in one write: a new team takes the next number, half-typed teams are kept, and two added at once never clash',async()=>{
  const {sam,priya}=await start();
  const opened=await teams(sam,'R22','hold');
  const first=await teams(sam,'R22','done',{legs:[2101,2134,null,2150]});
  expect(first.revision).toBeGreaterThan(opened.revision);
  expect(relay(first,'R22').teams).toEqual([{id:expect.any(String),number:1,version:1,legs:[{wristband:2101,warnings:[]},{wristband:2134,warnings:[]},{wristband:null,warnings:[]},{wristband:2150,warnings:[]}]}]);
  // Two Done presses adding new teams at the same moment both land, with different numbers.
  await Promise.all([teams(sam,'R22','done',{legs:[2201,null,null,null]}),teams(sam,'R22','done',{legs:[2301,null,null,null]})]);
  const added=relay(await teams(priya,'R22','hold'),'R22').teams;
  expect(added.map(team=>team.number)).toEqual([1,2,3]);
  expect(added.slice(1).map(team=>team.legs[0].wristband).sort()).toEqual([2201,2301]);
  // Changing a team keeps its number and moves its version on.
  const team1=relay(first,'R22').teams[0];
  const changed=relay(await teams(sam,'R22','done',{teamId:team1.id,legs:[2101,2134,2187,2150]}),'R22').teams[0];
  expect(changed).toMatchObject({id:team1.id,number:1,version:2});
  expect(changed.legs.map(leg=>leg.wristband)).toEqual([2101,2134,2187,2150]);
  // Other relays' lists are their own.
  expect(relay(await teams(priya,'R21','hold'),'R21').teams).toEqual([]);
  for(const [body,message] of [[{legs:[null,null,null,null]},'Enter at least one wristband number'],[{legs:[2101,2102]},'Enter the four wristband boxes'],[{legs:[2101,'x',null,null]},'Enter the four wristband boxes'],[{teamId:'nope',legs:[2401,null,null,null]},'Team not found']] as const) {
    expect((await call(sam,'/api/teams/R22/done',body)).json()).toEqual({message});
  }
});
test('Take over passes a relay\'s teams hold with an audit note, and the old holder\'s Done is refused',async()=>{
  const {sam,ali,aliId,lead}=await start();
  // A Done with nobody holding the relay takes the hold, as opening its card would.
  expect(relay(await teams(sam,'R28','done',{legs:[4101,null,null,null]}),'R28').teamsHolder).toMatchObject({name:'Sam Patel'});
  const before=await teams(ali,'R28','hold');
  const taken=await teams(ali,'R28','take-over');
  expect(taken.revision).toBeGreaterThan(before.revision);
  expect(relay(taken,'R28').teamsHolder).toEqual({id:aliId,name:'Ali Khan'});
  expect((await call(sam,'/api/teams/R28/done',{legs:[4102,null,null,null]})).json()).toEqual({message:'Ali Khan took over the teams'});
  // Ali carries on from the list as it stands.
  expect(relay(await teams(ali,'R28','done',{legs:[4102,null,null,null]}),'R28').teams.map(team=>team.number)).toEqual([1,2]);
  const notes=(await call((await lead('Alex')).token,'/api/lead/events/R28/results')).json().auditNotes;
  expect(notes.map((note:{message:string})=>note.message)).toContain('Ali Khan took over the teams from Sam Patel on 4x100m Relay Girl Scouts');
  // Taking over your own hold changes nothing.
  const now=(await teams(ali,'R28','hold')).revision;
  expect((await teams(ali,'R28','take-over')).revision).toBe(now);
});
test('sign-out clears the teams hold, and the stage complete refuses team writes',async()=>{
  const {sam,ali,owner}=await start();
  await teams(sam,'R19','hold');
  expect((await call(sam,'/api/sign-out',{})).statusCode).toBe(200);
  expect(relay(await teams(ali,'R20','hold'),'R19').teamsHolder).toBeNull();
  expect((await call(owner,'/api/lead/events/R19/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect((await call(ali,'/api/teams/R19/done',{legs:[101,null,null,null]})).json()).toEqual({message:'Stage complete - ask a lead'});
  expect((await call(ali,'/api/teams/R19/hold',{})).json()).toEqual({message:'Stage complete - ask a lead'});
});
test('a wristband already in the team or another team of the relay is refused',async()=>{
  const {sam}=await start();
  await teams(sam,'R22','done',{legs:[2101,2134,null,null]});
  const team2=relay(await teams(sam,'R22','done',{legs:[2201,null,null,null]}),'R22').teams[1];
  const refused=async(body:object)=>(await call(sam,'/api/teams/R22/done',body)).json();
  expect(await refused({legs:[2301,2134,null,null]})).toEqual({message:'2134 is already in Team 1. Check the wristband.'});
  expect(await refused({teamId:team2.id,legs:[2201,2202,2202,null]})).toEqual({message:'2202 is already in this team. Check the wristband.'});
  // A team keeps its own numbers when it is changed.
  expect(relay(await teams(sam,'R22','done',{teamId:team2.id,legs:[2201,2202,null,null]}),'R22').teams[1].legs[1].wristband).toBe(2202);
  // Another relay's teams are a warning, not a refusal.
  expect((await call(sam,'/api/teams/R21/done',{legs:[2134,null,null,null],keptWarnings:[2134]})).statusCode).toBe(200);
});
test('a number that looks wrong needs Keep, and Done stores its kept warnings on the team',async()=>{
  const {sam,ali}=await start();
  await teams(ali,'R28','done',{legs:[4001,4002,4003,2134],keptWarnings:[2134]});
  const refused=async(body:object)=>(await call(sam,'/api/teams/R22/done',body)).json();
  expect(await refused({legs:[6100,null,null,null]})).toEqual({message:'6100 needs Fix number or Keep'});
  const kept=relay(await teams(sam,'R22','done',{legs:[6100,1045,2134,2150],keptWarnings:[6100,1045,2134]}),'R22').teams[0];
  expect(kept.legs).toEqual([
    {wristband:6100,warnings:[{kind:'unknown-number',message:'6100 is not a wristband number. Wristbands are 1 to 4999.',kept:true}]},
    {wristband:1045,warnings:[{kind:'wrong-section',message:'1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',kept:true}]},
    {wristband:2134,warnings:[{kind:'other-relay',message:'2134 is also in Team 1 of 4x100m Relay Girl Scouts.',kept:true}]},
    {wristband:2150,warnings:[]}
  ]);
  // Any Beaver number is in range for both Beaver relays.
  expect((await call(sam,'/api/teams/R19/done',{legs:[101,601,null,null]})).statusCode).toBe(200);
  expect((await call(sam,'/api/teams/R19/done',{legs:[102,null,null,null],keptWarnings:[103]})).json()).toEqual({message:'Choose Keep for a wristband number in this team'});
});
test('Start new day clears every team list and teams hold with the day',async()=>{
  const {owner,sam}=await start();
  await teams(owner,'R22','done',{legs:[2101,null,null,null]});
  await teams(sam,'R21','hold');
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  const fresh=await teams(owner,'R20','hold');
  expect(relay(fresh,'R22')).toMatchObject({teams:[],teamsHolder:null});
  expect(relay(fresh,'R21')).toMatchObject({teams:[],teamsHolder:null});
});
