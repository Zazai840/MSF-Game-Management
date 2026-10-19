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
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed');
  const lead=await signInAs('Maryam');await call(lead,'/api/become-lead',{code:day.leadCode});
  const checkIn=async(runners:number[],eventCode='R4')=>(await call(volunteer,'/api/races/check-in',{eventCode,runners})).json().race;
  return {owner:owner.token as string,volunteer,lead,checkIn};
}
test('only leads read the ordered event list and live provisional results; a completed race appears on the next read',async()=>{
  const {owner,lead,volunteer,checkIn}=await start();
  for(const path of ['/api/lead/results','/api/lead/events/R4/results']) expect((await call(volunteer,path)).statusCode).toBe(403);
  const list=(await call(lead,'/api/lead/results')).json();
  expect(list.eventsConfirmed).toBe(true);expect(list.groups.map((group:any)=>group.name)).toEqual(['60m','60m Hurdles','200m','400m']);
  expect(list.groups[0].events.map((item:any)=>item.event.code)).toEqual(['R1','R2','R3','R4','R5','R6']);
  expect(list.groups[0].events[3]).toMatchObject({event:{code:'R4'},status:'Not started',raceCount:0});
  const race=await checkIn([2001,3045]);
  const waiting=(await call(lead,'/api/lead/events/R4/results')).json();
  expect(waiting.results).toMatchObject({leaderboard:[],notRankedYet:[{race:{id:race.id},reasons:['checked in']}],raceCount:1,status:'In progress - provisional'});
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[3045,2001],didNotFinish:[],didNotRun:[],added:[]});
  await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1234,1334]});
  for(const token of [lead,owner]) {
    const updated=(await call(token,'/api/lead/events/R4/results')).json();
    expect(updated.results.leaderboard).toMatchObject([{position:1,wristband:3045,time:1234,qualification:'Q',flags:[{kind:'warning',message:'3045 belongs to Boy Scouts - this race is Girl Cubs'}]},{position:2,wristband:2001,time:1334}]);
    expect(updated.results.notRankedYet).toEqual([]);expect(updated).not.toHaveProperty('leadCode');
  }
  expect((await call(lead,'/api/lead/events/R404/results')).statusCode).toBe(404);
  expect((await call(lead,'/api/jobs/times')).statusCode).toBe(200);
});
