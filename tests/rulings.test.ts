import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'rulings-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/join',payload:{code:'rulings-owner',name:'Scoring'}})).json();
  const day=(await call(owner.token,'/api/day')).json();await call(owner.token,'/api/day/confirm-events',{});
  const join=async(name:string)=>(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name}})).json().token as string;
  const volunteer=await join('Ahmed'),lead=await join('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  const race=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2001,2002]})).json().race;
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[]});
  await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1234,1334]});
  const path=`/api/lead/races/${race.id}/runners/${race.parts.runners.value[0].id}`;
  return {owner:owner.token as string,volunteer,lead,race,path};
}
test('a lead disqualifies and lifts one stable runner, with immediate re-ranking and durable newest-first audit notes',async()=>{
  const {owner,lead,path,race}=await start();
  const revision=(await call(owner,'/api/day')).json().revision;
  const saved=await call(lead,`${path}/disqualify`,{reason:'Obstruction',comment:'Blocked the inside lane'});
  expect(saved.statusCode).toBe(200);
  const disqualified=saved.json();
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
  expect(disqualified.results.leaderboard).toMatchObject([{wristband:2002,position:1},{wristband:2001,position:null,status:'Disqualified',disqualification:{reason:'Obstruction',comment:'Blocked the inside lane'},hasNote:true}]);
  expect(disqualified.auditNotes).toMatchObject([{actor:'Aisha',action:'disqualify',message:'Aisha disqualified 2001 (Heat 1): Obstruction — Blocked the inside lane',comment:'Blocked the inside lane',touches:[{raceId:race.id,entryId:race.parts.runners.value[0].id}]}]);
  expect(disqualified.auditNotes[0].at).toMatch(/^\d{4}-\d\d-\d\dT/);
  const list=(await call(lead,'/api/lead/results')).json();
  expect(list.groups[0].events[3].latestNoteAt).toBe(disqualified.auditNotes[0].at);
  const lifted=(await call(lead,`${path}/lift-disqualification`,{comment:'Photo confirmed a clear lane'})).json();
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+2);
  expect(lifted.results.leaderboard).toMatchObject([{wristband:2001,position:1,status:'Finished',disqualification:null,hasNote:true},{wristband:2002,position:2,hasNote:false}]);
  expect(lifted.auditNotes.map((note:any)=>note.action)).toEqual(['lift-disqualification','disqualify']);
  expect(lifted.auditNotes[0].message).toBe('Aisha lifted the disqualification of 2001 (Heat 1): Photo confirmed a clear lane');
  await app.close();app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'rulings-owner'});
  expect((await call(lead,'/api/lead/events/R4/results')).json().auditNotes).toEqual(lifted.auditNotes);
});
test('volunteers cannot make rulings, required comments and reasons are plain refusals, and refusals leave no audit note',async()=>{
  const {owner,lead,volunteer,path}=await start();
  for(const command of ['disqualify','lift-disqualification']) {
    expect((await call(volunteer,`${path}/${command}`,{reason:'Obstruction',comment:'Not permitted'})).statusCode).toBe(403);
  }
  for(const body of [null,[],{}, {reason:'DQ'},{reason:'Other'},{reason:'Other',comment:'  '},{reason:'Baton',comment:123},{reason:'Baton',comment:'x'.repeat(1001)}]) {
    const refusal=await call(lead,`${path}/disqualify`,body);
    expect(refusal.statusCode).toBe(400);expect(typeof refusal.json().message).toBe('string');
  }
  expect((await call(lead,`${path}/lift-disqualification`,{comment:'Not disqualified'})).statusCode).toBe(409);
  expect((await call(lead,'/api/lead/events/R4/results')).json().auditNotes).toEqual([]);
  expect((await call(owner,`${path}/disqualify`,{reason:'Other',comment:'  Stepped onto another track  '})).statusCode).toBe(200);
  for(const body of [{},{comment:' '},null]) expect((await call(lead,`${path}/lift-disqualification`,body)).statusCode).toBe(400);
  expect((await call(lead,`${path}/disqualify`,{reason:'Baton'})).statusCode).toBe(409);
  const result=(await call(lead,'/api/lead/events/R4/results')).json();
  expect(result.auditNotes).toHaveLength(1);expect(result.auditNotes[0]).toMatchObject({actor:'Scoring',comment:'Stepped onto another track'});
  expect((await call(lead,'/api/jobs/start-line')).statusCode).toBe(200);
  expect((await call(lead,'/api/jobs/finish-order')).statusCode).toBe(200);
  expect((await call(lead,'/api/jobs/times')).statusCode).toBe(200);
  expect((await call(volunteer,'/api/races/'+result.results.leaderboard[0].raceId)).json()).not.toHaveProperty('auditNotes');
});
test('concurrent rulings create one disqualification and one note; checked-in runners can be disqualified before their recording is complete',async()=>{
  const {lead,volunteer,path}=await start();
  const outcomes=await Promise.all([call(lead,`${path}/disqualify`,{reason:'Out of lane'}),call(lead,`${path}/disqualify`,{reason:'Two false starts'})]);
  expect(outcomes.map(response=>response.statusCode).sort()).toEqual([200,409]);
  expect((await call(lead,'/api/lead/events/R4/results')).json().auditNotes).toHaveLength(1);
  const race=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2003]})).json().race;
  const pendingPath=`/api/lead/races/${race.id}/runners/${race.parts.runners.value[0].id}`;
  expect((await call(lead,`${pendingPath}/disqualify`,{reason:'Wrong section or age'})).statusCode).toBe(200);
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2003],didNotFinish:[],didNotRun:[],added:[]});
  await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1000]});
  const result=(await call(lead,'/api/lead/events/R4/results')).json();
  expect(result.results.leaderboard.find((row:any)=>row.wristband===2003)).toMatchObject({status:'Disqualified',position:null,disqualification:{reason:'Wrong section or age'},hasNote:true});
  expect(result.auditNotes).toHaveLength(2);
  expect((await call(lead,pendingPath.replace(race.parts.runners.value[0].id,'missing')+'/disqualify',{reason:'Obstruction'})).statusCode).toBe(404);
});
