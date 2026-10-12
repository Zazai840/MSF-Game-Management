import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'reset-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/join',payload:{code:'reset-owner',name:'Scoring'}})).json();
  const day=(await call(owner.token,'/api/day')).json();
  const join=async(name:string)=>(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name}})).json().token as string;
  const volunteer=await join('Ahmed'),lead=await join('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  return {owner:owner.token as string,volunteer,lead,day};
}
test('new day requires current Scoring permission, the confirmation word and an export of the last change',async()=>{
  const {owner,volunteer,lead}=await start();
  for(const token of [volunteer,lead]) expect((await call(token,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(403);
  let response=await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'});
  expect(response.statusCode).toBe(409);expect(response.json().message).toBe('Download a day export after the last change before starting a new day');
  await call(owner,'/api/day/export',{});
  for(const confirmation of [undefined,'','new day','RESET',123]) {
    response=await call(owner,'/api/day/start-new',{confirmation});expect(response.statusCode).toBe(400);expect(response.json().message).toBe('Type NEW DAY to confirm');
  }
  await call(owner,'/api/day/events/R4/rename',{name:'Changed sprint'});
  response=await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'});expect(response.statusCode).toBe(409);
  expect((await call(owner,'/api/day')).json().events.find((event:any)=>event.code==='R4').name).toBe('Changed sprint');
});
test('reset erases a populated day, retains only its initiating scoring phone and restores the built-in programme',async()=>{
  const {owner,volunteer,lead,day}=await start();const before=(await call(owner,'/api/me')).json();
  const otherScoring=(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name:'Other scoring'}})).json().token;
  await call(otherScoring,'/api/become-lead',{code:'reset-owner'});
  await call(owner,'/api/day/events',{code:'EXTRA',name:'Extra',section:'Girl Cubs',format:'timed'});
  await call(owner,'/api/day/events/R4/rename',{name:'Renamed'});await call(owner,'/api/day/events/R24/enabled',{enabled:false});await call(owner,'/api/day/confirm-events',{});
  const race=async(eventCode:string,runners:number[])=>{const response=await call(volunteer,'/api/races/check-in',{eventCode,runners});expect(response.statusCode).toBe(200);return response.json().race;};
  const record=async(eventCode:string,number:number)=>{const r=await race(eventCode,[number]);await call(volunteer,`/api/races/${r.id}/finish`,{baseVersion:0,runnersVersion:1,order:[number],didNotFinish:[],didNotRun:[],added:[]});await call(volunteer,`/api/races/${r.id}/times`,{baseVersion:0,places:[1000]});return r;};
  const first=await record('R7',101),second=await record('R7',102);
  const tied=(await call(lead,'/api/lead/events/R7/results')).json().results.ties[0];
  expect((await call(lead,'/api/lead/events/R7/settle-tie',{tieId:tied.id,outcome:'no-run-off'})).statusCode).toBe(200);
  await call(lead,`/api/lead/races/${first.id}/runners/${first.parts.runners.value[0].id}/disqualify`,{reason:'Obstruction'});
  await record('R3',1001);const complete=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(complete.statusCode).toBe(200);const finalId=complete.json().results.finalResults.raceId;
  const clashing=await race('R4',[2001]);await call(volunteer,`/api/races/${clashing.id}/runners`,{baseVersion:1,runners:[2002]});await call(lead,`/api/races/${clashing.id}/runners`,{baseVersion:1,runners:[2003]});
  expect((await call(lead,`/api/lead/races/${clashing.id}`)).json().clashes).toHaveLength(1);
  await call(lead,`/api/lead/races/${second.id}/delete`,{permanent:false});
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
  const reset=await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'});expect(reset.statusCode).toBe(200);
  const me=(await call(owner,'/api/me')).json();expect(me).toMatchObject({id:before.id,name:'Scoring',level:'Scoring team'});expect(me.dayId).not.toBe(before.dayId);
  const fresh=(await call(owner,'/api/day')).json();expect(fresh.dayCode).not.toBe(day.dayCode);expect(fresh.leadCode).not.toBe(day.leadCode);expect(fresh.eventsConfirmed).toBe(false);expect(fresh.exportedAt).toBeNull();expect(fresh.exportedRevision).toBeNull();expect(fresh.events).toHaveLength(20);expect(fresh.events.every((event:any)=>event.enabled)).toBe(true);expect(fresh.events.find((event:any)=>event.code==='R4').name).toBe('60m');expect(fresh.events.some((event:any)=>event.code==='EXTRA')).toBe(false);
  expect((await call(owner,'/api/home')).json()).toMatchObject({waiting:{'Start line':0,'Finish order':0,Times:0},needsYou:0});
  const phones=(await call(owner,'/api/day/phones')).json();expect(phones.phones).toMatchObject([{id:before.id,name:'Scoring',level:'Scoring team'}]);expect(phones.auditNotes).toEqual([]);
  for(const token of [volunteer,lead,otherScoring]) expect((await call(token,'/api/home')).statusCode).toBe(401);
  for(const id of [first.id,second.id,clashing.id,finalId]) expect((await call(owner,`/api/lead/races/${id}`)).statusCode).toBe(404);
  expect((await call(owner,'/api/lead/events/R7/deleted-races')).json()).toEqual([]);expect((await call(owner,'/api/lead/events/R7/results')).json().auditNotes).toEqual([]);expect((await call(owner,'/api/lead/events/R3/results')).json().results.finalResults).toBeNull();
  expect((await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name:'Ahmed'}})).statusCode).toBe(403);
  const joined=(await app.inject({method:'POST',url:'/api/join',payload:{code:fresh.dayCode,name:'Ahmed'}})).json();expect(joined.token).toBeTypeOf('string');expect((await call(joined.token,'/api/become-lead',{code:day.leadCode})).statusCode).toBe(403);
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(409);
  await call(owner,'/api/day/confirm-events',{});expect((await call(owner,'/api/races/check-in',{eventCode:'R7',runners:[101]})).json().race.number).toBe(1);
});
test('requests racing a reset never read the new day through an old phone or fail with a missing-day server error',async()=>{
  const {owner,volunteer,lead}=await start();await call(owner,'/api/day/export',{});
  const responses=await Promise.all([
    call(owner,'/api/day/start-new',{confirmation:'NEW DAY'}),
    ...Array.from({length:30},(_,i)=>call(i%2?lead:volunteer,i%2?'/api/lead/results':'/api/home')),
    app.inject({method:'POST',url:'/api/join',payload:{code:'wrong-old-code',name:'Queued'}}),
    call(volunteer,'/api/become-lead',{code:'wrong-old-code'})
  ]);
  expect(responses[0].statusCode).toBe(200);
  for(const response of responses.slice(1,31)) expect([200,401]).toContain(response.statusCode);
  expect(responses[31].statusCode).toBe(403);expect([401,403]).toContain(responses[32].statusCode);
  const fresh=(await call(owner,'/api/day')).json();expect(fresh.eventsConfirmed).toBe(false);expect((await call(owner,'/api/day/phones')).json().phones).toHaveLength(1);
});
test('joins, code rotations, recording and rulings each invalidate the reset export guard',async()=>{
  const {owner,volunteer,lead,day}=await start();await call(owner,'/api/day/confirm-events',{});
  const race=(await call(volunteer,'/api/races/check-in',{eventCode:'R7',runners:[101]})).json().race;
  const changes=[
    ()=>app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name:'Joined after export'}}),
    ()=>call(volunteer,'/api/become-lead',{code:day.leadCode}),
    ()=>call(owner,'/api/day/day-code',{}),
    ()=>call(owner,'/api/day/lead-code',{}),
    ()=>call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[1000]}),
    ()=>call(owner,`/api/lead/races/${race.id}/runners/${race.parts.runners.value[0].id}/disqualify`,{reason:'Obstruction'}),
    ()=>call(owner,`/api/lead/races/${race.id}/delete`,{permanent:false})
  ];
  for(const change of changes) {
    expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);expect((await change()).statusCode).toBe(200);
    expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(409);
    const current=(await call(owner,'/api/day')).json();expect(current.revision).toBeGreaterThan(current.exportedRevision);
  }
  expect((await call(lead,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(403);
});
test('a join racing reset is serialized entirely before or after the day switch, and a second reset cannot erase the fresh day',async()=>{
  const {owner,day}=await start();await call(owner,'/api/day/export',{});
  const [reset,join]=await Promise.all([call(owner,'/api/day/start-new',{confirmation:'NEW DAY'}),app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name:'Concurrent'}})]);
  if(reset.statusCode===200) {expect(join.statusCode).toBe(403);expect((await call(owner,'/api/day/phones')).json().phones).toHaveLength(1);}
  else {expect(reset.statusCode).toBe(409);expect(join.statusCode).toBe(200);expect((await call(owner,'/api/day')).json().dayCode).toBe(day.dayCode);}
  await call(owner,'/api/day/export',{});
  const resets=await Promise.all([call(owner,'/api/day/start-new',{confirmation:'NEW DAY'}),call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})]);
  expect(resets.filter(response=>response.statusCode===200)).toHaveLength(1);expect(resets.filter(response=>[401,409].includes(response.statusCode))).toHaveLength(1);
  expect((await call(owner,'/api/day')).json().exportedAt).toBeNull();
});
