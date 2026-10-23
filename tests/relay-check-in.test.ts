import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import type { TeamEntry } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=await people.volunteer('Sam Patel'),priya=await people.volunteer('Priya Shah');
  return {owner:people.owner.token as string,sam:sam.token,priya:priya.token,relays:relaySetup(app)};
}

test('the first tick on the empty next heat creates the race, copying the team\'s four children into one race entry',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2134,null,1045]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  const before=await relays.screen(priya,'R22');
  expect(before.race).toMatchObject({id:null,kind:'heat',number:1});
  expect(before.teams!.map(team=>[team.number,team.races])).toEqual([[1,[]],[2,[]]]);
  const ticked=await relays.tick(priya,'R22',1);
  expect(ticked.revision).toBeGreaterThan(before.revision);
  expect(ticked.race).toMatchObject({id:expect.any(String),kind:'heat',number:1,state:'in progress'});
  expect(ticked.race.parts.runners.value).toEqual([{id:expect.any(String),team:{id:before.teams![0].id,number:1},legs:[
    {wristband:2101,here:false,warnings:[]},{wristband:2134,here:false,warnings:[]},{wristband:null,here:false,warnings:[]},
    {wristband:1045,here:false,warnings:[{kind:'wrong-section',message:'1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',kept:true}]}]}]);
  // The team list says which race holds each team.
  expect(ticked.teams!.map(team=>[team.number,team.races])).toEqual([[1,[{id:ticked.race.id,kind:'heat',number:1,state:'in progress'}]],[2,[]]]);
  // A second tick, from another phone, joins the same race: there is no cap and no hold.
  const both=await relays.tick(sam,'R22',2);
  expect(both.race.id).toBe(ticked.race.id);
  expect(both.race.parts.runners.value!.map(entry=>'team' in entry && entry.team.number)).toEqual([1,2]);
  expect(both.holds).toEqual({});
});
test('a here mark and Cancel: the last tap on a child wins, a repeated tap changes nothing, and a team with a child here can\'t be taken off',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R21',[3101,3102,3103,null]);
  const ticked=await relays.tick(sam,'R21',1),teamId=ticked.teams![0].id;
  const here=await relays.here(priya,'R21',1,2);
  expect(here.revision).toBeGreaterThan(ticked.revision);
  const marks=(read:RaceScreenRead)=>(read.race.parts.runners.value![0] as TeamEntry).legs.map(leg=>leg.here);
  expect(marks(here)).toEqual([false,false,true,false]);
  // The same tap again, and a tick of a team already in, change nothing: the day revision stays.
  expect((await relays.here(sam,'R21',1,2)).revision).toBe(here.revision);
  expect((await relays.tick(priya,'R21',1)).revision).toBe(here.revision);
  const refused=(what:string,body:object)=>call(sam,`/api/race-screen/R21/${what}`,{raceId:here.race.id,teamId,...body}).then(response=>response.json().message);
  expect(await refused('take-off',{})).toBe('Team 1 has children marked here - unmark them first');
  // Unmarked, it comes off and is still to run again; taking it off again changes nothing.
  expect(marks(await relays.here(sam,'R21',1,2,false))).toEqual([false,false,false,false]);
  const off=await relays.takeOff(priya,'R21',1);
  expect(off.race.parts.runners.value).toEqual([]);
  expect(off.teams![0].races).toEqual([]);
  expect((await relays.takeOff(sam,'R21',1)).revision).toBe(off.revision);
  // A here mark on a team someone has since taken off is refused.
  expect(await refused('here',{leg:0,here:true})).toBe('Team 1 is no longer in Heat 1');
  await relays.tick(sam,'R21',1);
  expect(await refused('here',{leg:3,here:true})).toBe('Choose a child in this team');
  expect(await refused('here',{leg:4,here:true})).toBe('Choose a child and whether they are here');
  expect(await refused('here',{leg:0})).toBe('Choose a child and whether they are here');
  expect(await refused('tick',{teamId:undefined})).toBe('Choose a team');
  expect(await refused('tick',{raceId:3})).toBe('Choose a race');
  expect(await refused('tick',{teamId:'nope'})).toBe('Team not found');
});
test('taps from two phones at once on different children of one race all land',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  await relays.tick(sam,'R22',1);
  await Promise.all([relays.tick(priya,'R22',2),relays.here(sam,'R22',1,0),relays.here(priya,'R22',1,1),relays.here(sam,'R22',1,3)]);
  await Promise.all([relays.here(sam,'R22',2,0),relays.here(priya,'R22',2,3)]);
  const entries=(await relays.screen(sam,'R22')).race.parts.runners.value as TeamEntry[];
  expect(entries.map(entry=>[entry.team.number,entry.legs.map(leg=>leg.here)])).toEqual([[1,[true,true,false,true]],[2,[true,false,false,true]]]);
});
test('check-in taps are refused in order: signed out, stage complete, race deleted, saved or submitted, then a team that has already run',async()=>{
  const {owner,sam,priya,relays}=await start();
  await relays.team(sam,'R20',[201,202,203,204]);
  await relays.team(sam,'R20',[301,302,303,304]);
  const heat1=await relays.tick(sam,'R20',1),[team1,team2]=heat1.teams!;
  const tap=(what:string,body:object)=>call(sam,`/api/race-screen/R20/${what}`,body).then(response=>response.json().message);
  // Priya does the order and Sam the times: Sam's press leaves heat 1 submitted, waiting on Priya.
  const order=(await relays.post<RaceScreenRead>(priya,'/api/race-screen/R20/take-over',{job:'order'})).race;
  await relays.post(priya,'/api/race-screen/R20/order',{raceId:order.id,version:order.parts.finish.version,order:[order.parts.runners.value![0].id],didNotFinish:[],didNotRun:[],added:[]});
  const times=(await relays.post<RaceScreenRead>(sam,'/api/race-screen/R20/take-over',{job:'times'})).race;
  await relays.post(sam,'/api/race-screen/R20/times',{raceId:times.id,version:times.parts.times.version,places:[1234],keptWrong:[]});
  expect((await relays.post<RaceScreenRead>(sam,'/api/race-screen/R20/submit',{raceId:heat1.race.id})).race.state).toBe('submitted');
  expect(await tap('here',{raceId:heat1.race.id,teamId:team1.id,leg:0,here:true})).toBe('Heat 1 is submitted - tap Not yet to change it');
  expect(await tap('tick',{raceId:heat1.race.id,teamId:team2.id})).toBe('Heat 1 is submitted - tap Not yet to change it');
  await relays.post(priya,'/api/race-screen/R20/submit',{raceId:heat1.race.id});
  expect(await tap('tick',{raceId:heat1.race.id,teamId:team2.id})).toBe('Heat 1 is saved - ask a lead to change it');
  // Team 1 ran in heat 1: it can't be ticked into heat 2.
  const next=await relays.screen(sam,'R20');
  expect(next.race).toMatchObject({id:null,number:2});
  expect(next.teams!.map(team=>team.races.map(race=>race.state))).toEqual([['saved'],[]]);
  expect(await tap('tick',{raceId:null,teamId:team1.id})).toBe('Team 1 has already run');
  // A lead deleted the race the phone saw; its team is still to run again.
  const heat2=await relays.tick(priya,'R20',2);
  expect((await call(owner,`/api/lead/races/${heat2.race.id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect(await tap('take-off',{raceId:heat2.race.id,teamId:team2.id})).toBe('A lead deleted Heat 2');
  expect((await relays.screen(sam,'R20')).teams![1].races).toEqual([]);
  // Stage complete comes before the race's own refusals; signed out before everything.
  expect((await call(owner,'/api/lead/events/R20/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect(await tap('take-off',{raceId:heat2.race.id,teamId:team2.id})).toBe('Stage complete - ask a lead');
  expect((await call(sam,'/api/sign-out',{})).statusCode).toBe(200);
  expect(await tap('take-off',{raceId:heat2.race.id,teamId:team2.id})).toBe('You are signed out. Sign in again');
});
test('a relay never gets a check-in hold, and only a relay takes team taps',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R19',[101,102,103,104]);
  await relays.tick(sam,'R19',1);
  for(const what of ['hold','take-over']) expect((await call(sam,`/api/race-screen/R19/${what}`,{job:'check-in'})).json()).toEqual({message:'Anyone can check a relay in: tick its teams'});
  expect((await call(sam,'/api/race-screen/R19/check-in',{raceId:null,version:0,runners:[{wristband:105}]})).json()).toEqual({message:'Anyone can check a relay in: tick its teams'});
  expect((await relays.screen(sam,'R19')).holds).toEqual({});
  expect((await call(sam,'/api/race-screen/R4/tick',{raceId:null,teamId:'x'})).json()).toEqual({message:'Only a relay has teams'});
});
