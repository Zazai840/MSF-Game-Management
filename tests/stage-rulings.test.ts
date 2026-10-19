import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'stages-owner',resetTestDay:true});
  const people=await signInOwner(app,'stages-owner','Scoring'),owner=people.owner,day=people.day;await call(owner.token,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  const check=await call(volunteer,'/api/races/check-in',{eventCode:'R16',runners:[2001,2002]});const race=check.json().race;
  await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[]});
  await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1000,1100]});
  return {owner:owner.token as string,lead,volunteer,race:(await call(volunteer,`/api/races/${race.id}`)).json()};
}
test('a lead completes a timed event with durable official podium and audit, then reopens with a comment',async()=>{
  const {owner,lead,race}=await start();const revision=(await call(owner,'/api/day')).json().revision;
  const complete=await call(lead,'/api/lead/events/R16/complete-stage',{stage:'event'});
  expect(complete.statusCode).toBe(200);
  expect(complete.json().results).toMatchObject({status:'Complete',provisional:false,inputRunning:{eventCode:'R16',first:2001,second:2002,third:null}});
  expect(complete.json().auditNotes[0]).toMatchObject({actor:'Aisha',action:'complete-stage',message:'Aisha marked Event complete',touches:[{raceId:race.id}]});
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
  await app.close();app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'stages-owner'});
  expect((await call(lead,'/api/lead/events/R16/results')).json().results.status).toBe('Complete');
  const reopened=await call(lead,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:'Late correction'});
  expect(reopened.statusCode).toBe(200);
  expect(reopened.json().results).toMatchObject({status:'In progress - provisional',provisional:true,inputRunning:null});
  expect(reopened.json().auditNotes[0]).toMatchObject({action:'reopen-stage',comment:'Late correction',message:'Aisha reopened Event complete - Late correction'});
});
test('completion refuses every job mutation and new race, while reopen restores saving without rebasing versions',async()=>{
  const {lead,volunteer,race}=await start();
  await call(lead,'/api/lead/events/R16/complete-stage',{stage:'event'});
  const bodies:[string,unknown][]=[
    [`/api/races/${race.id}/runners`,{baseVersion:1,runners:[2001,2002]}],
    [`/api/races/${race.id}/finish`,{baseVersion:1,runnersVersion:1,order:[2002,2001],didNotFinish:[],didNotRun:[],added:[]}],
    [`/api/races/${race.id}/times`,{baseVersion:1,places:[1000,1200]}],
    [`/api/races/${race.id}/delete`,{permanent:false}],
    ['/api/races/check-in',{eventCode:'R16',runners:[2003]}]
  ];
  for(const [path,body] of bodies) {
    const response=await call(volunteer,path,body);expect(response.statusCode).toBe(409);expect(response.json().message).toBe('Stage complete - ask a lead');
  }
  expect((await call(volunteer,`/api/races/${race.id}`)).json()).toMatchObject({stageComplete:true,parts:race.parts});
  for(const job of ['start-line','finish-order','times']) {
    const response=(await call(volunteer,`/api/jobs/${job}`)).json();
    expect(response.completedStages).toMatchObject([{eventId:race.event.id,eventCode:'R16',stage:'event'}]);
    expect(response.waiting.some((item:any)=>item.id===race.id)).toBe(false);
    expect(response.results).toBeUndefined();
  }
  await call(lead,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:'Correct time'});
  expect((await call(volunteer,bodies[2][0],bodies[2][1])).json().status).toBe('saved');
  expect((await call(lead,'/api/jobs/times')).statusCode).toBe(200);
});
test('permissions, missing comments and newly blocking recordings are rechecked without notes or revision changes',async()=>{
  const {owner,lead,volunteer}=await start();
  const path='/api/lead/events/R16/complete-stage';
  expect((await call(volunteer,path,{stage:'event'})).statusCode).toBe(403);
  expect((await call(volunteer,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:'Correction'})).statusCode).toBe(403);
  const preview=(await call(lead,'/api/lead/events/R16/results')).json();expect(preview.results.checkSheet.mustSettleFirst).toEqual([]);
  await call(volunteer,'/api/races/check-in',{eventCode:'R16',runners:[2003]});
  const revision=(await call(owner,'/api/day')).json().revision;
  const refused=await call(lead,path,{stage:'event'});expect(refused.statusCode).toBe(409);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  expect((await call(lead,'/api/lead/events/R16/results')).json().auditNotes).toEqual([]);
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'event'})).statusCode).toBe(409);
  expect((await call(lead,path,{stage:'invalid'})).statusCode).toBe(400);
  expect((await call(lead,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:' '})).statusCode).toBe(400);
});
test.each(['tie','ran-twice','clash'] as const)('the server refuses completion while a %s remains',async kind=>{
  const {lead,volunteer,race}=await start();
  if(kind==='clash') await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1000,1200]});
  else {
    const number=kind==='tie'?2003:2001;
    const checked=(await call(volunteer,'/api/races/check-in',{eventCode:'R16',runners:[number],keptWarnings:[number]})).json().race;
    await call(volunteer,`/api/races/${checked.id}/finish`,{baseVersion:0,runnersVersion:1,order:[number],didNotFinish:[],didNotRun:[],added:[]});
    await call(volunteer,`/api/races/${checked.id}/times`,{baseVersion:0,places:[kind==='tie'?1000:1200]});
  }
  const preview=(await call(lead,'/api/lead/events/R16/results')).json();
  expect(preview.results.checkSheet.mustSettleFirst.some((item:any)=>item.kind===kind)).toBe(true);
  expect((await call(lead,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(409);
  expect((await call(lead,'/api/lead/events/R16/results')).json().auditNotes).toEqual([]);
});
test('an open kept warning does not prevent completion, and leads can correct a locked race through rulings',async()=>{
  const {lead,volunteer,race}=await start();
  const changed=await call(lead,`/api/lead/races/${race.id}/runners/${race.parts.runners.value[1].id}/correct-number`,{expectedWristband:2002,wristband:1234,keepWarnings:true});
  expect(changed.statusCode).toBe(200);
  expect(changed.json().results.checkSheet.worthALook).toHaveLength(1);
  expect((await call(lead,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  const corrected=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1000,1200]});
  expect(corrected.statusCode).toBe(200);expect(corrected.json().results.status).toBe('Complete');
  expect((await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:2,places:[1000,1300]})).statusCode).toBe(409);
  await call(lead,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:'Compare the timer draft'});
  const stale=await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:1,places:[1000,1300]});
  expect(stale.json().status).toBe('clash');expect(stale.json().race.parts.times).toMatchObject({clash:true,value:{places:[1000,1200]}});
});
