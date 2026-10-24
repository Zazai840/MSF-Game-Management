import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
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
  return {owner:owner.token as string,volunteer,lead,setup:raceSetup(app)};
}
test('only leads read the ordered event list and live provisional results; a saved race appears on the next read',async()=>{
  const {owner,lead,volunteer,setup}=await start();
  for(const path of ['/api/lead/results','/api/lead/events/R4/results']) expect((await call(volunteer,path)).statusCode).toBe(403);
  const list=(await call(lead,'/api/lead/results')).json();
  expect(list.eventsConfirmed).toBe(true);expect(list.groups.map((group:any)=>group.name)).toEqual(['60m','60m Hurdles','200m','400m','4x50m Relay','4x100m Relay']);
  expect(list.groups[0].events.map((item:any)=>item.event.code)).toEqual(['R1','R2','R3','R4','R5','R6']);
  expect(list.groups[0].events[3]).toMatchObject({event:{code:'R4'},status:'Not started',raceCount:0});
  const race=await setup.checkIn(volunteer,'R4',[2001,3045]);
  const waiting=(await call(lead,'/api/lead/events/R4/results')).json();
  expect(waiting.results).toMatchObject({leaderboard:[],notRankedYet:[{race:{id:race.id},reasons:['in progress']}],raceCount:1,status:'In progress - provisional'});
  await setup.order(volunteer,'R4',[3045,2001]);await setup.times(volunteer,'R4',[1234,1334]);await setup.submit(volunteer,'R4');
  for(const token of [lead,owner]) {
    const updated=(await call(token,'/api/lead/events/R4/results')).json();
    expect(updated.results.leaderboard).toMatchObject([{position:1,wristband:3045,time:1234,qualification:'Q',flags:[{kind:'warning',message:'3045 belongs to Boy Scouts - this race is Girl Cubs'}]},{position:2,wristband:2001,time:1334}]);
    expect(updated.results.notRankedYet).toEqual([]);expect(updated).not.toHaveProperty('leadCode');
  }
  expect((await call(lead,'/api/lead/events/R404/results')).statusCode).toBe(404);
});
