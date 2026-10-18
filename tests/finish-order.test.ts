import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'finish-owner',resetTestDay:true});
  const people=await signInOwner(app,'finish-owner','Aisha'),owner=people.owner,day=people.day;
  await call(owner.token,'/api/day/confirm-events',{});
  const join=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await join('Ahmed');
  const lead=await join('Maryam');await call(lead,'/api/become-lead',{code:day.leadCode});
  const checkIn=async(runners:number[],eventCode='R4')=>(await call(volunteer,'/api/races/check-in',{eventCode,runners})).json().race;
  return {owner:owner.token as string,volunteer,lead,checkIn};
}
test('Finish order opens oldest first, saves places by stable entry, updates waits and closes Start line edits',async()=>{
  const {volunteer,checkIn}=await start();
  const first=await checkIn([2001,2002]);const second=await checkIn([2003]);
  expect((await call(volunteer,'/api/jobs/finish-order')).json().waiting.map((race:any)=>race.id)).toEqual([first.id,second.id]);
  const response=await call(volunteer,`/api/races/${first.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2002,2001],didNotFinish:[],didNotRun:[],added:[]});
  expect(response.statusCode).toBe(200);
  const saved=response.json().race;
  expect(saved.parts.finish).toEqual({version:1,value:{order:[first.parts.runners.value[1].id,first.parts.runners.value[0].id],didNotFinish:[]}});
  expect(saved.parts.runners).toEqual(first.parts.runners);expect(saved.parts.times).toEqual(first.parts.times);
  expect((await call(volunteer,`/api/races/${first.id}`)).json()).toEqual(saved);
  expect((await call(volunteer,'/api/jobs/finish-order')).json()).toMatchObject({waiting:[{id:second.id}],recent:[{id:first.id}]});
  expect((await call(volunteer,'/api/home')).json().waiting).toEqual({'Start line':1,'Finish order':1,Times:2});
  expect((await call(volunteer,`/api/races/${first.id}/runners`,{baseVersion:1,runners:[2001]})).json().message).toBe('Finishing order already recorded - ask a lead');
  expect((await call(volunteer,`/api/races/${first.id}/delete`,{permanent:true})).statusCode).toBe(409);
});
test('Finish order adds a missing runner with kept warnings, retains Did not finish and removes Did not run',async()=>{
  const {volunteer,checkIn}=await start();
  const race=await checkIn([2001,2002,2003]);
  const response=await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[3045,2001],didNotFinish:[2002],didNotRun:[2003],added:[3045],keptWarnings:[3045]});
  expect(response.statusCode).toBe(200);
  const saved=response.json().race;
  expect(saved.parts.runners.version).toBe(2);
  expect(saved.parts.runners.value).toHaveLength(3);
  expect(saved.parts.runners.value[0]).toEqual(race.parts.runners.value[0]);
  expect(saved.parts.runners.value[1]).toEqual(race.parts.runners.value[1]);
  expect(saved.parts.runners.value[2]).toMatchObject({wristband:3045,addedAtFinish:true,warnings:[{kind:'wrong-section',kept:true}]});
  expect(saved.parts.finish.value).toEqual({order:[saved.parts.runners.value[2].id,race.parts.runners.value[0].id],didNotFinish:[race.parts.runners.value[1].id]});
  expect((await call(volunteer,'/api/wristband-check',{eventCode:'R4',wristband:2003})).json().warnings).toEqual([]);
  expect((await call(volunteer,'/api/wristband-check',{eventCode:'R4',wristband:2002})).json().warnings).toMatchObject([{kind:'already-ran'}]);
  const later=await checkIn([2003]);expect(later.parts.runners.value[0].warnings).toEqual([]);
});
test('all joined levels can correct Finish order while stale drafts are kept for a lead instead of overwriting either part',async()=>{
  const {owner,lead,volunteer,checkIn}=await start();
  const race=await checkIn([2001,2002]);
  for(const [version,token] of [volunteer,lead,owner].entries()) {
    const order=version%2?[2001,2002]:[2002,2001];
    const response=await call(token,`/api/races/${race.id}/finish`,{baseVersion:version,runnersVersion:1,order,didNotFinish:[],didNotRun:[],added:[]});
    expect(response.statusCode).toBe(200);expect(response.json().race.parts.finish.version).toBe(version+1);
    expect((await call(token,'/api/jobs/finish-order')).json()).not.toHaveProperty('leadCode');
  }
  const old=await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[]});
  expect(old.statusCode).toBe(200);expect(old.json().status).toBe('clash');
  const waiting=await checkIn([2003]);
  await call(volunteer,`/api/races/${waiting.id}/runners`,{baseVersion:1,runners:[2003,2004]});
  expect((await call(volunteer,`/api/races/${waiting.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2003],didNotFinish:[],didNotRun:[],added:[]})).json().status).toBe('clash');
  expect((await call('not-joined','/api/jobs/finish-order')).statusCode).toBe(401);
  expect((await call('not-joined',`/api/races/${race.id}/finish`,{})).statusCode).toBe(401);
});
test.each([
  [{order:[2001,2001],didNotFinish:[],didNotRun:[],added:[]},'Choose a place, Did not finish or Did not run for every runner'],
  [{order:[2001],didNotFinish:[],didNotRun:[],added:[]},'Choose a place, Did not finish or Did not run for every runner'],
  [{order:[2001,2002],didNotFinish:[],didNotRun:[],added:[2001]},'2001 is already in this race'],
  [{order:['2001',2002],didNotFinish:[],didNotRun:[],added:[]},'Choose a wristband number for every runner'],
])('Finish order refuses malformed or incomplete answers and repeated runners: %j',async(body,message)=>{
  const {volunteer,checkIn}=await start();const race=await checkIn([2001,2002]);
  const response=await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,...body});
  expect(response.statusCode).toBe(400);expect(response.json().message).toBe(message);
  expect((await call(volunteer,`/api/races/${race.id}`)).json().parts.finish.value).toBeNull();
});
