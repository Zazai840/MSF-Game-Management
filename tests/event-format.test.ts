import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RacesRead } from '../src/shared/race-flow.js';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
import type { TeamEntry } from '../src/shared/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'format-owner',resetTestDay:true});
  const people=await signInOwner(app,'format-owner','Owner');await call(people.owner.token,'/api/day/confirm-events',{});
  const jo=(await people.volunteer('Jo')).token,lead=(await people.volunteer('Aisha')).token;
  await call(lead,'/api/become-lead',{code:people.day.leadCode});
  const event=async(code:string)=>(await call(lead,'/api/day')).json().events.find((item:any)=>item.code===code);
  const group=async(code:string)=>(await call(jo,'/api/races')).json<RacesRead>().groups.find(item=>item.event.code===code)!;
  const format=(code:string,body:unknown)=>call(lead,`/api/day/events/${code}/format`,body);
  return {jo,lead,setup:raceSetup(app),event,group,format};
}
test('a lead switches a heats event to Timed: its heats keep their times and medals go to the 3 fastest; switching back makes them heats again',async()=>{
  const {jo,lead,setup,event,group,format}=await start();
  expect(await event('R1')).toMatchObject({format:'heats',formatLock:null,races:[]});
  await setup.record(jo,'R1',[1001,1002],[950,1000]);
  await setup.record(jo,'R1',[1011,1012],[900,1100]);
  expect((await event('R1')).races).toEqual([1,2]);
  const switched=await format('R1',{format:'timed'});
  expect(switched.statusCode,switched.body).toBe(200);
  expect(await event('R1')).toMatchObject({format:'timed',formatLock:null});
  expect((await group('R1')).races.map(race=>[race.kind,race.number])).toEqual([['race',1],['race',2]]);
  const results=(await call(lead,'/api/lead/events/R1/results')).json().results;
  expect(results.medalPlaces.map((row:any)=>row.wristband)).toEqual([1011,1001,1002]);
  expect((await format('R1',{format:'heats'})).statusCode).toBe(200);
  expect((await group('R1')).races.map(race=>[race.kind,race.number])).toEqual([['heat',1],['heat',2]]);
  expect((await setup.makeFinal(lead,'R1')).race).toMatchObject({kind:'final'});
});
test('a relay switches to Timed too',async()=>{
  const {event,format}=await start();
  expect((await format('R19',{format:'timed'})).statusCode).toBe(200);
  expect((await event('R19')).format).toBe('timed');
});
test('the switch locks once the final is made or medals are decided, and refuses a wrong or unchanged format',async()=>{
  const {jo,lead,setup,event,format}=await start();
  await setup.record(jo,'R1',[1001,1002,1003],[950,1000,1050]);
  await setup.makeFinal(lead,'R1');
  expect((await event('R1')).formatLock).toBe('final');
  const final=await format('R1',{format:'timed'});
  expect(final.statusCode).toBe(409);
  expect(final.json().message).toBe('The final is made - reopen the heats in Results to change it');
  await setup.record(jo,'R13',[1001],[2500]);
  expect((await call(lead,'/api/lead/events/R13/complete-stage',{stage:'event'})).statusCode).toBe(200);
  expect((await event('R13')).formatLock).toBe('medals');
  expect((await format('R13',{format:'heats'})).json().message).toBe('Medals are decided - reopen them in Results to change it');
  expect((await format('R2',{format:'heats'})).json()).toMatchObject({message:'R2 is already Heats then final'});
  expect((await format('R2',{format:'fast'})).statusCode).toBe(400);
  expect((await format('R99',{format:'timed'})).statusCode).toBe(404);
  expect((await call(jo,'/api/day/events/R2/format',{format:'timed'})).statusCode).toBe(403);
});
test('a timed relay gives its medals to the 3 fastest teams across its races',()=>{
  const team=(number:number):TeamEntry=>({id:`t${number}`,team:{id:`team-${number}`,number},legs:[1,2,3,4].map(leg=>({wristband:2000+number*100+leg,warnings:[],here:true}))});
  const race=(number:number,teams:number[],times:number[]):ResultsRace=>({id:`race${number}`,kind:'race',number,checkedInAt:'2026-11-14T10:00:00Z',deleted:false,saved:true,
    runners:teams.map(team),finish:{order:teams.map(n=>`t${n}`),didNotFinish:[]},times:{places:times,outOfOrder:false}});
  const result=eventResults({event:{code:'R19',name:'4x50m Relay',section:'Boy Beavers',format:'timed'},races:[race(1,[1,2],[1400,1600]),race(2,[3,4],[1500,1700])],completedStages:['event']});
  expect(result.inputRunning?.teams?.map(entry=>entry?.number)).toEqual([1,3,2]);
});
