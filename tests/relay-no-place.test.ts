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
/**
 * Girl Cubs relay R22 with three teams typed by Ali (Team 3's 1st leg a Boy Cubs number he kept, its 3rd box empty), Teams 1 and 2 ticked
 * into heat 1 by Sam, and Priya holding the order.
 */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const [sam,priya,ali]=await Promise.all(['Sam Patel','Priya Shah','Ali Khan'].map(async name=>(await people.volunteer(name)).token));
  const relays=relaySetup(app);
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204],[1045,2302,null,2304]]) await relays.team(ali,'R22',legs);
  for(const number of [1,2]) await relays.tick(sam,'R22',number);
  await relays.post(priya,'/api/race-screen/R22/take-over',{job:'order'});
  /** Priya's order write on the heat as she sees it now, by team number; `addedTeams` names teams by number too. */
  async function order(placed:number[],{didNotFinish=[],didNotRun=[],addedTeams=[]}:{didNotFinish?:number[];didNotRun?:number[];addedTeams?:number[]}={}) {
    const screen=await relays.screen(priya,'R22'),entries=screen.race.parts.runners.value!.filter(isTeamEntry);
    const id=(number:number)=>entries.find(entry=>entry.team.number===number)!.id,teamId=(number:number)=>screen.teams!.find(team=>team.number===number)!.id;
    return call(priya,'/api/race-screen/R22/order',{raceId:screen.race.id,version:screen.race.parts.finish.version,order:placed.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[],addedTeams:addedTeams.map(teamId)});
  }
  return {sam,priya,ali,relays,order};
}
const teamsOf=(screen:RaceScreenRead)=>screen.race.parts.runners.value!.filter(isTeamEntry);

test('Did not finish keeps the team in the race with no place and no time, and Give a place undoes it',async()=>{
  const {priya,relays,order}=await start();
  const answer=(await order([1],{didNotFinish:[2]})).json() as RaceScreenRead,[one,two]=teamsOf(answer);
  expect(teamsOf(answer).map(entry=>entry.team.number)).toEqual([1,2]);
  expect(answer.race.parts.finish.value).toEqual({order:[one.id],didNotFinish:[two.id]});
  await relays.post(priya,'/api/race-screen/R22/take-over',{job:'times'});
  const timed=await relays.screen(priya,'R22');
  expect((await call(priya,'/api/race-screen/R22/times',{raceId:timed.race.id,version:timed.race.parts.times.version,places:[1520,1610],keptWrong:[]})).json()).toEqual({message:'Place 2 has no team yet'});
  // Give a place sends Team 2 back into the order.
  expect(((await order([1,2])).json() as RaceScreenRead).race.parts.finish.value).toEqual({order:[one.id,two.id],didNotFinish:[]});
});

test('Didn\'t run takes the team off the race: it is still to run again and can be ticked into a heat',async()=>{
  const {sam,relays,order}=await start();
  const answer=(await order([1],{didNotRun:[2]})).json() as RaceScreenRead;
  expect(teamsOf(answer).map(entry=>entry.team.number)).toEqual([1]);
  expect(answer.teams!.map(team=>[team.number,team.races.length])).toEqual([[1,1],[2,0],[3,0]]);
  expect(teamsOf(await relays.tick(sam,'R22',2)).map(entry=>entry.team.number)).toEqual([1,2]);
});

test('"Add team" adds a team still to run, marked added at the finish, at the next place, with the four children on its list',async()=>{
  const {order}=await start();
  const answer=(await order([2],{addedTeams:[3]})).json() as RaceScreenRead,entries=teamsOf(answer);
  expect(entries.map(entry=>entry.team.number)).toEqual([1,2,3]);
  const added=entries[2],listed=answer.teams!.find(team=>team.number===3)!;
  expect(added).toMatchObject({team:{id:listed.id,number:3},addedAtFinish:true});
  // The children crossed the line, so those on the list are here; the empty box stays empty.
  expect(added.legs.map(leg=>[leg.wristband,leg.here])).toEqual([[1045,true],[2302,true],[null,false],[2304,true]]);
  expect(answer.race.parts.finish.value).toEqual({order:[entries[1].id,added.id],didNotFinish:[]});
  expect(listed.races.map(race=>`${race.kind} ${race.number}`)).toEqual(['heat 1']);
  // The race keeps the team's kept warnings with its children.
  expect(added.legs[0].warnings).toEqual([expect.objectContaining({kind:'wrong-section',kept:true})]);
});

test('"Add team" is refused for a team that has already run, or that someone is changing; a wristband typed at the finish is refused',async()=>{
  const {priya,ali,relays,order}=await start();
  // A team in this heat is no longer still to run.
  expect((await order([1],{addedTeams:[2]})).json()).toEqual({message:'Team 2 has already run'});
  await relays.post(ali,'/api/teams/R22/open',{teamId:(await relays.screen(ali,'R22')).teams!.find(team=>team.number===3)!.id});
  expect((await order([1],{addedTeams:[3]})).json()).toEqual({message:'Ali Khan is changing Team 3'});
  const screen=await relays.screen(priya,'R22');
  const typed=await call(priya,'/api/race-screen/R22/order',{raceId:screen.race.id,version:screen.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[2301],keptWarnings:[]});
  expect(typed.json()).toEqual({message:'Choose the team from the list'});
  // Nothing changed.
  expect(teamsOf(await relays.screen(priya,'R22')).map(entry=>entry.team.number)).toEqual([1,2]);
});
