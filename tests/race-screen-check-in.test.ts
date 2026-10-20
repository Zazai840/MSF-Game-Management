import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start(confirmed=true) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'check-in-owner',resetTestDay:true});
  const people=await signInOwner(app,'check-in-owner'),owner=people.owner.token as string;
  if(confirmed) await call(owner,'/api/day/confirm-events',{});
  return {owner,volunteer:(await people.volunteer('Ahmed')).token,setup:raceSetup(app)};
}
const checkIn=(token:string,runners:unknown[],code='R4')=>call(token,`/api/race-screen/${code}/check-in`,{raceId:null,version:0,runners:runners.map(wristband=>({wristband}))});
test.each([
  [[2001,2001],'2001 is already in this race'],
  [[],'Enter at least one wristband number'],
  [[-1],'Enter a whole wristband number'],
  [['2001'],'Enter a whole wristband number']
])('check-in refuses invalid runner lists plainly: %j',async(runners,message)=>{
  const {volunteer}=await start();
  const response=await checkIn(volunteer,runners);
  expect(response.statusCode).toBe(400);expect(response.json().message).toBe(message);
});
test('check-in works on any switched-on event while programme confirmation remains a reminder, and a switched-off one refuses its first runner',async()=>{
  const {owner,volunteer,setup}=await start(false);
  expect((await setup.checkIn(volunteer,'R4',[2001])).number).toBe(1);
  await call(owner,'/api/day/events/R16/rename',{name:'200m sprint'});
  expect((await setup.screen(volunteer,'R16')).event.name).toBe('200m sprint');
  await call(owner,'/api/day/events/R16/enabled',{enabled:false});
  const refused=await checkIn(volunteer,[2003],'R16');
  expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('This event is switched off');
});
test('number checks warn about another race in this event, but ignore this race, deleted races and other events',async()=>{
  const {owner,volunteer,setup}=await start();
  const first=await setup.record(volunteer,'R4',[2001],[1200]);
  const check=(body:object)=>call(volunteer,'/api/wristband-check',{eventCode:'R4',wristband:2001,...body});
  const repeated=await check({});
  expect(repeated.statusCode).toBe(200);
  expect(repeated.json().warnings).toEqual([{kind:'already-ran',message:'2001 already ran in this event'}]);
  expect((await check({raceId:first.id})).json().warnings).toEqual([]);
  expect((await check({eventCode:'R16'})).json().warnings).toEqual([]);
  expect((await check({eventCode:'R99'})).statusCode).toBe(404);
  await call(owner,`/api/lead/races/${first.id}/delete`,{permanent:false});
  expect((await check({})).json().warnings).toEqual([]);
  expect((await setup.checkIn(volunteer,'R4',[2001])).parts.runners.value![0].warnings).toEqual([]);
});
