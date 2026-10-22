import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** Sam checks in, Priya does the order and Jo the times on R4 (a heats event); Alex is a lead. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'save-as-lead-owner',resetTestDay:true});
  const people=await signInOwner(app,'save-as-lead-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const [sam,priya,jo]=await Promise.all(['Sam','Priya','Jo'].map(name=>people.volunteer(name)));
  const alex=await people.lead('Alex');
  return {sam:sam.token,priya:priya.token,jo:jo.token,alex:alex.token,ids:{sam:sam.phone.id,priya:priya.phone.id,jo:jo.phone.id},setup:raceSetup(app)};
}
const saveAsLead=(token:string,raceId:string|null)=>call(token,'/api/race-screen/R4/save-as-lead',{raceId});

test('Save as lead is for leads only, and is refused by the same blockers as Submit Race',async()=>{
  const {sam,priya,alex,setup}=await start();
  const checked=await setup.checkIn(sam,'R4',[2001,2002]);
  expect((await saveAsLead(sam,checked.id)).statusCode).toBe(403);
  expect((await saveAsLead(alex,checked.id)).json()).toEqual({message:'2 runners have no place yet'});
  await setup.order(priya,'R4',[2001,2002]);
  expect((await saveAsLead(alex,checked.id)).json()).toEqual({message:'Place 1 has no time'});
  expect((await call(alex,'/api/race-screen/R4')).json().race.state).toBe('in progress');
});

test('Save as lead saves a race waiting on a Submit, with an audit note, and drops only the holds of those it waited on',async()=>{
  const {sam,priya,jo,alex,ids,setup}=await start();
  await setup.checkIn(sam,'R4',[2001,2002]);
  await setup.order(priya,'R4',[2001,2002]);
  const race=await setup.times(jo,'R4',[1295,1312]);
  await setup.submit(sam,'R4');await setup.submit(priya,'R4');
  const saved=(await saveAsLead(alex,race.id)).json() as RaceScreenRead;
  expect(saved.race).toMatchObject({id:null,number:2});
  expect(saved.lastSaved).toMatchObject({kind:'heat',number:1,by:'Alex'});
  // Jo had not pressed, so Jo's hold goes; Sam and Priya keep theirs on the next heat.
  expect(saved.holds).toEqual({'check-in':{id:ids.sam,name:'Sam'},order:{id:ids.priya,name:'Priya'}});
  const results=(await call(alex,'/api/lead/events/R4/results')).json();
  expect(results.results.leaderboard.map((row:{wristband:number;position:number|null})=>[row.wristband,row.position])).toEqual([[2001,1],[2002,2]]);
  expect(results.auditNotes[0]).toMatchObject({action:'save-as-lead',actor:'Alex',message:"Saved by Alex without Jo's Submit on 60m Girl Cubs Heat 1",touches:[{raceId:race.id}]});
  // A saved race takes no second save.
  expect((await saveAsLead(alex,race.id)).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
});

test('lead corrections and Re-run wait until the race is saved; Delete works at any time',async()=>{
  const {sam,priya,alex,setup}=await start();
  await setup.checkIn(sam,'R4',[2001,2002]);
  const race=await setup.order(priya,'R4',[2001,2002]);
  const unsaved='Heat 1 is in progress - open the race screen';
  expect((await call(alex,`/api/lead/races/${race.id}/times`,{baseVersion:0,places:[1200,1300]})).json()).toEqual({message:unsaved});
  expect((await call(alex,`/api/lead/races/${race.id}/runners`,{baseVersion:1,finishVersion:1,runners:[{wristband:2001}]})).json()).toEqual({message:unsaved});
  expect((await call(alex,`/api/lead/races/${race.id}/finish-order`,{baseVersion:1,runnersVersion:1,order:[2002,2001],didNotFinish:[],didNotRun:[]})).json()).toEqual({message:unsaved});
  // A race not saved yet is the current race, so Re-run says when it can run again.
  expect((await call(alex,`/api/lead/races/${race.id}/re-run`,{})).json()).toEqual({message:"Heat 1 is in progress - re-run after it's saved"});
  expect((await call(alex,`/api/lead/races/${race.id}/delete`,{permanent:false})).statusCode).toBe(200);
});
