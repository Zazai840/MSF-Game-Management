import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsGridRead,ResultsRead } from '../src/shared/lead-results.js';
import { cardState,leadCardLine,leadSections,type RacesRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
/** Results' event grid: each card says what the event's Races card says, in the same words, switched-off events too. */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
test('a Results card gives the same status words and colour as its Races card, and a switched-off event keeps its card',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'grid-owner',resetTestDay:true});
  const people=await signInOwner(app,'grid-owner','Owner');
  const volunteer=(await people.volunteer('Ahmed')).token as string,lead=(await people.lead('Aisha')).token as string;
  const setup=raceSetup(app);
  // R4 Girl Cubs 60m: a heat and the final saved. R7 (timed hurdles): Heat 1 saved, Heat 2 checking in. R16 (200m, real paces): a time to check. R5: a heat saved, then switched off.
  await setup.record(volunteer,'R4',[2001,2002],[1100,1200]);
  expect((await call(lead,'/api/races',{eventCode:'R4',kind:'final'})).statusCode).toBe(200);
  await setup.attend(volunteer,'R4');await setup.order(volunteer,'R4',[2002,2001]);await setup.submit(volunteer,'R4');
  await setup.record(volunteer,'R7',[1,2],[1000,1100]);await setup.checkIn(volunteer,'R7',[3,4]);
  await setup.record(volunteer,'R16',[2001,2002],[3600,3305],{keptWrong:[1]});
  await setup.record(volunteer,'R5',[3001,3002],[1100,1200]);
  const read=async()=>{
    const grid=(await call(lead,'/api/lead/results')).json() as ResultsGridRead,cards=grid.groups.flatMap(group=>group.events);
    return {grid,cards,card:(code:string)=>cards.find(item=>item.event.code===code)!};
  };
  /** Action required as a lead's Races reads it (the races list with the lead's open issues), beside what Results says. */
  const actionRequired=async()=>{
    const groups=((await call(lead,'/api/races')).json() as RacesRead).groups,issues=((await call(lead,'/api/lead')).json() as ResultsRead).needsYou;
    const {cards}=await read(),onRaces=leadSections(groups,issues).ready.map(group=>group.event.code);
    for(const group of groups) expect(cards.find(item=>item.event.code===group.event.code)!.card.actionRequired,group.event.code).toBe(onRaces.includes(group.event.code));
    return cards.filter(item=>item.card.actionRequired).map(item=>item.event.code);
  };
  const {grid,card}=await read(),races=((await call(lead,'/api/races')).json() as RacesRead).groups;
  for(const group of races) expect(card(group.event.code).card).toMatchObject({state:cardState(group),line:leadCardLine(group,grid.needsYou)});
  expect(card('R4').card).toMatchObject({state:'running',line:'Final saved · confirm the medals'});
  expect(card('R7').card).toMatchObject({state:'running',line:'Heat 2 in progress · Heat 1 saved'});
  expect(card('R16').card).toMatchObject({state:'running',line:'Heat 1: 1 time to check'});
  expect(card('R6').card).toEqual({state:'not-started',line:'No races yet',actionRequired:false});
  // A problem (R16) and medals that wait (R4) are in Action required on both screens; a running event (R7) is not.
  expect(await actionRequired()).toEqual(['R4','R16']);
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'final'})).statusCode).toBe(200);
  expect((await call(people.owner.token,'/api/day/events/R5/enabled',{enabled:false})).statusCode).toBe(200);
  const after=await read();
  expect(after.card('R4').card).toEqual({state:'done',line:'Medals decided',actionRequired:false});
  expect(await actionRequired()).toEqual(['R16']);
  expect(after.card('R5').event.enabled).toBe(false);
  expect(after.card('R5').card.state).toBe('running');
  expect(after.card('R5').card.line).toMatch(/Heat 1 saved/);
});
