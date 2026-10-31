import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import { groupStatus,leadLine,leadSections,medalsToConfirm,raceSections,type RacesRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
/**
 * The lead's Races home once an event's medals wait on the lead's Confirm in Results (Final complete, or Event complete
 * on a timed event): the event sits in the lead's Action required saying so, until the Confirm moves it to Done as "Medals decided".
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'medals-owner',resetTestDay:true});
  const people=await signInOwner(app,'medals-owner','Owner');await call(people.owner.token,'/api/day/confirm-events',{});
  const volunteer=(await people.volunteer('Ahmed')).token as string,lead=(await people.lead('Aisha')).token as string;
  const setup=raceSetup(app);
  const complete=async(code:string,stage:string)=>expect((await call(lead,`/api/lead/events/${code}/complete-stage`,{stage,comment:'Out of time'})).statusCode).toBe(200);
  /** Races home as a lead reads it: the races list with the lead's open issues. */
  async function home() {
    const groups=((await call(lead,'/api/races')).json() as RacesRead).groups,issues=((await call(lead,'/api/lead')).json() as ResultsRead).needsYou;
    const sections=leadSections(groups,issues),codes=(list:typeof groups)=>list.map(group=>group.event.code);
    const card=(code:string)=>{const group=groups.find(item=>item.event.code===code)!;return {line:leadLine(group,issues),confirm:medalsToConfirm(group,issues)};};
    return {ready:codes(sections.ready),inProgress:codes(sections.inProgress),done:codes(sections.done),card};
  }
  /** Girl Cubs 60m (R4): one heat, then the lead's final, checked in and placed, which saves it. */
  async function savedFinal() {
    await setup.record(volunteer,'R4',[2001,2002],[1100,1200]);
    expect((await call(lead,'/api/races',{eventCode:'R4',kind:'final'})).statusCode).toBe(200);
    await setup.attend(volunteer,'R4');await setup.order(volunteer,'R4',[2002,2001]);await setup.submit(volunteer,'R4');
  }
  return {volunteer,lead,setup,complete,home,savedFinal};
}
test('a saved final sits in the lead\'s Action required to confirm the medals, and Final complete moves it to Done as Medals decided',async()=>{
  const {complete,home,savedFinal}=await start();
  await savedFinal();
  let now=await home();
  expect(now.ready).toEqual(['R4']);
  expect(now.card('R4')).toEqual({line:'Final saved · confirm the medals',confirm:'final'});
  await complete('R4','final');
  now=await home();
  expect(now.ready).toEqual([]);
  expect(now.done).toEqual(['R4']);
  expect(now.card('R4')).toEqual({line:'Medals decided',confirm:null});
});
test('a timed event with every race so far saved waits on Event complete, in the day\'s programme with the final, and Results without a final never waits',async()=>{
  const {volunteer,setup,complete,home,savedFinal}=await start();
  // Boy Cubs 60m Hurdles (R7), timed: two heats saved.
  await setup.record(volunteer,'R7',[1,2],[1000,1100]);await setup.record(volunteer,'R7',[3,4],[1050,1150]);
  // Girl Cubs 60m (R5) with a heat saved and no final.
  await setup.record(volunteer,'R5',[3001,3002],[1100,1200]);
  let now=await home();
  expect(now.ready).toEqual(['R7']);
  expect(now.card('R7')).toEqual({line:'Every race saved · confirm the medals after the last race',confirm:'event'});
  expect(now.inProgress).toContain('R5');
  // Another heat is running: the medals wait on it, not on the lead.
  await setup.checkIn(volunteer,'R7',[5,6]);
  now=await home();
  expect(now.ready).toEqual([]);
  expect(now.card('R7')).toEqual({line:'Heat 3 in progress · Heats 1 and 2 saved',confirm:null});
  await setup.record(volunteer,'R7',[5,6],[1080,1180]);
  // Then the final is saved: the 60m comes before the hurdles, as in the day's programme.
  await savedFinal();
  expect((await home()).ready).toEqual(['R4','R7']);
  await complete('R7','event');await complete('R5','no-final');
  now=await home();
  expect(now.ready).toEqual(['R4']);
  expect(now.done).toEqual(expect.arrayContaining(['R7','R5']));
  expect(now.card('R5')).toEqual({line:'Medals decided',confirm:null});
});
test('an event with something in To check shows that line first, and the confirm wording only once To check is clear; a volunteer\'s cards are unchanged',async()=>{
  const {volunteer,lead,setup,home}=await start();
  // Girl Cubs 200m (R16), timed: 2nd place's kept time is faster than 1st's.
  const race=await setup.record(volunteer,'R16',[2001,2002],[3600,3305],{keptWrong:[1]});
  let now=await home();
  expect(now.ready).toEqual(['R16']);
  expect(now.card('R16')).toEqual({line:'Heat 1: 1 time to check',confirm:null});
  const groups=((await call(volunteer,'/api/races')).json() as RacesRead).groups,group=groups.find(item=>item.event.code==='R16')!;
  expect(raceSections(groups,'start').inProgress.map(item=>item.event.code)).toEqual(['R16']);
  expect(groupStatus(group,'start')).toBe('Heat 1 done');
  const version=((await call(lead,`/api/races/${race.id}`)).json()).race.parts.times.version;
  expect((await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:version,places:[3305,3600]})).statusCode).toBe(200);
  now=await home();
  expect(now.ready).toEqual(['R16']);
  expect(now.card('R16')).toEqual({line:'Every race saved · confirm the medals after the last race',confirm:'event'});
});
