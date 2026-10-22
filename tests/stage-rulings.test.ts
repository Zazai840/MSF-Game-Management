import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'stages-owner',resetTestDay:true});
  const people=await signInOwner(app,'stages-owner','Scoring'),owner=people.owner,day=people.day;await call(owner.token,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  const setup=raceSetup(app),recorded=await setup.record(volunteer,'R16',[2001,2002],[1000,1100]);
  return {owner:owner.token as string,lead,volunteer,setup,race:(await call(lead,`/api/lead/races/${recorded.id}`)).json().race};
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
test('completion refuses every race screen write and new race, while reopen restores entry',async()=>{
  const {lead,volunteer,setup}=await start();
  await call(lead,'/api/lead/events/R16/complete-stage',{stage:'event'});
  const next=await setup.screen(volunteer,'R16');
  expect(next).toMatchObject({stageComplete:true,race:{id:null,number:2}});
  const bodies:[string,unknown][]=[
    ['hold',{job:'check-in'}],['take-over',{job:'times'}],
    ['check-in',{raceId:null,version:0,runners:[{wristband:2003}]}],
    ['order',{raceId:null,version:0,order:[],didNotFinish:[],didNotRun:[],added:[]}],
    ['times',{raceId:null,version:0,places:[],keptWrong:[]}],
    ['submit',{raceId:null}],['not-yet',{raceId:null}]
  ];
  for(const [what,body] of bodies) {
    const response=await call(volunteer,`/api/race-screen/R16/${what}`,body);expect(response.statusCode).toBe(409);expect(response.json().message).toBe('Stage complete - ask a lead');
  }
  await call(lead,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:'One more race'});
  expect((await setup.checkIn(volunteer,'R16',[2003])).number).toBe(2);
});
test('permissions, missing comments and newly blocking recordings are rechecked without notes or revision changes',async()=>{
  const {owner,lead,volunteer}=await start();
  const path='/api/lead/events/R16/complete-stage';
  expect((await call(volunteer,path,{stage:'event'})).statusCode).toBe(403);
  expect((await call(volunteer,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:'Correction'})).statusCode).toBe(403);
  const preview=(await call(lead,'/api/lead/events/R16/results')).json();expect(preview.results.checkSheet.mustSettleFirst).toEqual([]);
  await raceSetup(app).checkIn(volunteer,'R16',[2003]);
  const revision=(await call(owner,'/api/day')).json().revision;
  const refused=await call(lead,path,{stage:'event'});expect(refused.statusCode).toBe(409);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  expect((await call(lead,'/api/lead/events/R16/results')).json().auditNotes).toEqual([]);
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'event'})).statusCode).toBe(409);
  expect((await call(lead,path,{stage:'invalid'})).statusCode).toBe(400);
  expect((await call(lead,'/api/lead/events/R16/reopen-stage',{stage:'event',comment:' '})).statusCode).toBe(400);
});
test.each(['tie','ran-twice'] as const)('the server refuses completion while a %s remains',async kind=>{
  const {lead,volunteer,setup}=await start();
  const number=kind==='tie'?2003:2001;
  await setup.record(volunteer,'R16',[number],[kind==='tie'?1000:1200],{keptWarnings:[number]});
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
  expect((await call(volunteer,'/api/race-screen/R16/times',{raceId:race.id,version:2,places:[1000,1300],keptWrong:[]})).json().message).toBe('Stage complete - ask a lead');
});
