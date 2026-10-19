import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'finish-owner',resetTestDay:true});
  const people=await signInOwner(app,'finish-owner'),owner=people.owner;
  await call(owner.token,'/api/day/confirm-events',{});
  const volunteer=(await people.volunteer('Ahmed')).token;
  const lead=(await people.lead('Maryam')).token;
  const checkIn=async(runners:number[],eventCode='R4')=>(await call(volunteer,'/api/races/check-in',{eventCode,runners})).json().race;
  return {owner:owner.token as string,volunteer,lead,checkIn};
}
test('Times saves before Finish order and automatically re-pairs children when either part is corrected',async()=>{
  const {volunteer,checkIn}=await start();const race=await checkIn([2001,2002]);
  const timed=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1234,1324]});
  expect(timed.statusCode).toBe(200);
  expect(timed.json().race.parts.times).toEqual({version:1,value:{places:[1234,1324],outOfOrder:false}});
  expect(timed.json().race.recording.readyForRanking).toBe(false);
  const finish=await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[]});
  expect(finish.json().race.recording).toMatchObject({readyForRanking:true,countMismatch:null,results:[{wristband:2001,place:1,time:1234},{wristband:2002,place:2,time:1324}]});
  const swapped=await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:1,runnersVersion:1,order:[2002,2001],didNotFinish:[],didNotRun:[],added:[]});
  expect(swapped.json().race.recording.results).toMatchObject([{wristband:2001,place:2,time:1324},{wristband:2002,place:1,time:1234}]);
  expect(swapped.json().race.parts.times).toEqual(timed.json().race.parts.times);
  const corrected=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:1,places:[1240,1330]});
  expect(corrected.json().race.recording.results).toMatchObject([{wristband:2001,place:2,time:1330},{wristband:2002,place:1,time:1240}]);
  expect((await call(volunteer,'/api/jobs/times')).json().waiting).toEqual([]);
});
test('count disagreement returns to the top of Times and fixing either list clears it; old null slots do not block readiness',async()=>{
  const {volunteer,checkIn}=await start();
  const oldest=await checkIn([2010]);const race=await checkIn([2001,2002,2003]);
  await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1234,null,null]});
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[2003],didNotRun:[],added:[]});
  const view=(await call(volunteer,'/api/jobs/times')).json();
  expect(view.waiting.map((item:any)=>item.id)).toEqual([race.id,oldest.id]);
  expect(view.waiting[0].recording).toMatchObject({countMismatch:'Finish order has 2 finishers, times have 1 - check the recording',readyForRanking:false});
  expect((await call(volunteer,'/api/home')).json().waiting.Times).toBe(2);
  const fixed=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:1,places:[1234,1300,null]});
  expect(fixed.json().race.recording).toMatchObject({countMismatch:null,readyForRanking:true});
  expect((await call(volunteer,'/api/jobs/times')).json().waiting.map((item:any)=>item.id)).toEqual([oldest.id]);
  await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:2,places:[1234,null,null]});
  const removed=await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:1,runnersVersion:1,order:[2001],didNotFinish:[2002],didNotRun:[2003],added:[]});
  expect(removed.json().race.recording).toMatchObject({countMismatch:null,readyForRanking:true});
  expect(removed.json().race.parts.times.value.places).toEqual([1234,null,null]);
  const trimmed=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:3,places:[1234,null,null]});
  expect(trimmed.statusCode).toBe(200);expect(trimmed.json().race.parts.times.value.places).toEqual([1234,null]);
  expect((await call(volunteer,'/api/jobs/times')).json().waiting.map((item:any)=>item.id)).toEqual([oldest.id]);
});
test('all signed-in levels may keep out-of-order times, but the race stays unranked until corrected; stale drafts remain as a clash',async()=>{
  const {owner,lead,volunteer,checkIn}=await start();const race=await checkIn([2001,2002]);
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[]});
  for(const [version,token] of [volunteer,lead,owner].entries()) {
    const saved=await call(token,`/api/races/${race.id}/times`,{baseVersion:version,places:[1300,1200],outOfOrder:false});
    expect(saved.statusCode).toBe(200);expect(saved.json().race.parts.times.value.outOfOrder).toBe(true);
    expect(saved.json().race.recording.readyForRanking).toBe(false);
    expect((await call(token,'/api/jobs/times')).json()).not.toHaveProperty('leadCode');
  }
  expect((await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1200,1300]})).json().status).toBe('clash');
  const fixed=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:3,places:[1200,1300]});
  expect(fixed.json().race.recording.readyForRanking).toBe(false);
  const read=(await call(lead,`/api/lead/races/${race.id}`)).json();
  const chosen=read.clashes[0].candidates.at(-1);
  await call(lead,`/api/lead/races/${race.id}/clashes/times`,{candidateId:chosen.id});
  expect((await call(volunteer,`/api/races/${race.id}`)).json().recording.readyForRanking).toBe(true);
  expect((await call('no-phone',`/api/races/${race.id}/times`,{baseVersion:4,places:[1200,1300]})).statusCode).toBe(401);
});
test.each([
  [[1234,null,1300],'No finisher belongs only at the bottom of the times'],
  [[1234,-1,null],'Enter whole hundredths or No finisher for every place'],
  [['12.34',1300,null],'Enter whole hundredths or No finisher for every place'],
  [[1234,1300.5,null],'Enter whole hundredths or No finisher for every place'],
])('Times refuses malformed answers without saving: %j',async(places,message)=>{
  const {volunteer,checkIn}=await start();const race=await checkIn([2001,2002,2003]);
  const response=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places});
  expect(response.statusCode).toBe(400);expect(response.json().message).toBe(message);
  expect((await call(volunteer,`/api/races/${race.id}`)).json().parts.times.value).toBeNull();
});
test('an empty race and an all-Did-not-finish race can both finish Times, while an added finisher requires another time',async()=>{
  const {volunteer,checkIn}=await start();const race=await checkIn([2001]);
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[],didNotFinish:[],didNotRun:[2001],added:[]});
  const empty=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[]});
  expect(empty.statusCode).toBe(200);expect(empty.json().race.recording.readyForRanking).toBe(true);
  const retained=await checkIn([2002]);
  await call(volunteer,`/api/races/${retained.id}/finish`,{baseVersion:0,runnersVersion:1,order:[],didNotFinish:[2002],didNotRun:[],added:[]});
  const nobody=await call(volunteer,`/api/races/${retained.id}/times`,{baseVersion:0,places:[null]});
  expect(nobody.statusCode).toBe(200);expect(nobody.json().race.recording.readyForRanking).toBe(true);
  const added=await checkIn([2003]);await call(volunteer,`/api/races/${added.id}/times`,{baseVersion:0,places:[1200]});
  const finished=await call(volunteer,`/api/races/${added.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2003,2004],didNotFinish:[],didNotRun:[],added:[2004]});
  expect(finished.json().race.recording).toMatchObject({readyForRanking:false,countMismatch:'Finish order has 2 finishers, times have 1 - check the recording'});
  expect((await call(volunteer,`/api/races/${added.id}/times`,{baseVersion:1,places:[1200,1300]})).json().race.recording.readyForRanking).toBe(true);
});
