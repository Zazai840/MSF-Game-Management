import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { isTeamEntry } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body:unknown)=>app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},payload:JSON.stringify(body)});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const [sam,priya,jo,ali]=await Promise.all(['Sam Patel','Priya Shah','Jo Evans','Ali Khan'].map(name=>people.volunteer(name)));
  const relays=relaySetup(app);
  /** The relay's current heat as that phone sees it, and its team entries' ids by team number. */
  const seen=async(token:string,code:string)=>{const screen=await relays.screen(token,code);return {screen,id:(number:number)=>screen.race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===number)!.id};};
  /** The order as that phone, by team number, taking the order hold. */
  async function order(token:string,code:string,placed:number[],{didNotFinish=[],didNotRun=[]}:{didNotFinish?:number[];didNotRun?:number[]}={}) {
    await relays.post(token,`/api/race-screen/${code}/take-over`,{job:'order'});
    const {screen,id}=await seen(token,code);
    return relays.post<RaceScreenRead>(token,`/api/race-screen/${code}/order`,{raceId:screen.race.id,version:screen.race.parts.finish.version,order:placed.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[]});
  }
  /** The times by place as that phone, taking the times hold. */
  async function times(token:string,code:string,places:number[],keptWrong:number[]=[]) {
    const race=(await relays.post<RaceScreenRead>(token,`/api/race-screen/${code}/take-over`,{job:'times'})).race;
    return call(token,`/api/race-screen/${code}/times`,{raceId:race.id,version:race.parts.times.version,places,keptWrong});
  }
  const submit=async(token:string,code:string)=>call(token,`/api/race-screen/${code}/submit`,{raceId:(await relays.screen(token,code)).race.id});
  return {sam:sam.token,priya:priya.token,jo:jo.token,ali:ali.token,relays,order,times,submit};
}

test('Submit Race on a relay asks only the order and times holders, and the saved heat\'s teams are no longer still to run',async()=>{
  const {sam,priya,jo,ali,relays,order,times,submit}=await start();
  // Ali types the teams and keeps the relay's teams hold; Sam checks them in, Priya does the order and Jo the times.
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204],[2301,2302,2303,2304]]) await relays.team(ali,'R22',legs);
  await relays.tick(sam,'R22',1);await relays.tick(sam,'R22',2);
  await relays.here(sam,'R22',1,0);
  await order(priya,'R22',[2,1]);
  expect((await times(jo,'R22',[1520,1610])).statusCode).toBe(200);
  const before=await relays.screen(jo,'R22');
  expect(before.asked.map(holder=>holder.name)).toEqual(['Priya Shah','Jo Evans']);
  // Neither the one who ticked the teams nor the teams holder is asked.
  for(const token of [sam,ali]) expect((await submit(token,'R22')).json()).toEqual({message:"Only the people doing this race's jobs submit it"});
  const submitted=(await submit(priya,'R22')).json() as RaceScreenRead;
  expect(submitted.race.state).toBe('submitted');
  expect(submitted.pressed.map(holder=>holder.name)).toEqual(['Priya Shah']);
  const saved=(await submit(jo,'R22')).json() as RaceScreenRead;
  expect(saved.lastSaved).toMatchObject({kind:'heat',number:1,by:'Jo Evans'});
  // The next heat is empty and offers only Team 3: Teams 1 and 2 ran in heat 1.
  expect(saved.race).toMatchObject({id:null,kind:'heat',number:2});
  expect(saved.teams!.map(team=>[team.number,team.races.map(race=>`${race.number} ${race.state}`)])).toEqual([[1,['1 saved']],[2,['1 saved']],[3,[]]]);
  expect((await call(sam,'/api/race-screen/R22/tick',{raceId:null,teamId:saved.teams![0].id})).json()).toEqual({message:'Team 1 has already run'});
  expect((await relays.tick(sam,'R22',3)).race).toMatchObject({kind:'heat',number:2,parts:{runners:{value:[{team:{number:3}}]}}});
});

test('Submit Race on a relay is blocked, in team words, until every ticked team has a place and every place a good or kept time',async()=>{
  const {sam,priya,relays,order,times,submit}=await start();
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,null],[2301,2302,2303,2304]]) await relays.team(sam,'R22',legs);
  const blocked=async()=>(await submit(priya,'R22')).json();
  expect(await blocked()).toEqual({message:'No team is ticked yet'});
  // A heat whose only team was taken off again is empty too.
  await relays.tick(sam,'R22',1);await relays.takeOff(sam,'R22',1);
  expect(await blocked()).toEqual({message:'No team is ticked yet'});
  for(const number of [1,2,3]) await relays.tick(sam,'R22',number);
  expect(await blocked()).toEqual({message:'3 teams have no place yet'});
  await order(priya,'R22',[2,1]);
  expect(await blocked()).toEqual({message:'Team 3 has no place yet'});
  // Did not finish needs no place; a placed team needs a time.
  await order(priya,'R22',[2,1],{didNotFinish:[3]});
  expect(await blocked()).toEqual({message:'Place 1 has no time'});
  expect((await times(priya,'R22',[1520,1610,1700])).json()).toEqual({message:'Place 3 has no team yet'});
  await times(priya,'R22',[1520]);
  expect(await blocked()).toEqual({message:'Place 2 has no time'});
  // A time faster than the place before it waits for Fix time or Keep.
  await times(priya,'R22',[1520,1480]);
  expect(await blocked()).toEqual({message:"2nd place's time needs Fix time or Keep"});
  // Kept, it no longer blocks; nor does Team 2's empty 4th box, nor its children never marked here.
  await times(priya,'R22',[1520,1480],[1]);
  expect(((await submit(priya,'R22')).json() as RaceScreenRead).lastSaved).toMatchObject({kind:'heat',number:1});
});

test('Didn\'t run takes a team off the heat, so it neither blocks Submit Race nor counts as run',async()=>{
  const {sam,priya,relays,order,times,submit}=await start();
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204]]) await relays.team(sam,'R22',legs);
  for(const number of [1,2]) await relays.tick(sam,'R22',number);
  await order(priya,'R22',[1],{didNotRun:[2]});
  await times(priya,'R22',[1520]);
  const saved=(await submit(priya,'R22')).json() as RaceScreenRead;
  expect(saved.lastSaved).toMatchObject({kind:'heat',number:1});
  expect(saved.teams!.map(team=>[team.number,team.races.length])).toEqual([[1,1],[2,0]]);
});
