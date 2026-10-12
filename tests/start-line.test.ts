import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start(confirmed=true) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'start-owner-fixture',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/join',payload:{code:'start-owner-fixture',name:'Aisha'}})).json();
  const day=(await call(owner.token,'/api/day')).json();
  if(confirmed) await call(owner.token,'/api/day/confirm-events',{});
  const volunteer=(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name:'Ahmed'}})).json();
  return {owner:owner.token as string,volunteer:volunteer.token as string,day};
}
test('a volunteer checks in a heat and a timed race with automatic numbers and wristband-only runners',async()=>{
  const {volunteer}=await start();
  const response=await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2001,2002]});
  expect(response.statusCode).toBe(200);
  const {race,status}=response.json();
  expect(status).toBe('saved');
  expect(race).toMatchObject({kind:'heat',number:1,event:{code:'R4',section:'Girl Cubs'},parts:{runners:{version:1,value:[{wristband:2001},{wristband:2002}]},finish:{version:0,value:null},times:{version:0,value:null}}});
  expect(race.parts.runners.value[0].id).toEqual(expect.any(String));
  expect((await call(volunteer,`/api/races/${race.id}`)).json()).toEqual(race);
  const timed=await call(volunteer,'/api/races/check-in',{eventCode:'R16',runners:[2003]});
  expect(timed.json().race).toMatchObject({kind:'race',number:1,event:{code:'R16'}});
});
test.each([
  [[2001,2001],'2001 is already in this race'],
  [[1,2,3,4,5,6,7],'Races hold up to 6 runners'],
  [[],'Enter at least one wristband number'],
  [[-1],'Enter a whole wristband number'],
  [['2001'],'Enter a whole wristband number']
])('Start line refuses invalid runner lists plainly: %j',async(runners,message)=>{
  const {volunteer}=await start();
  const response=await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners});
  expect(response.statusCode).toBe(400); expect(response.json().message).toBe(message);
});
test('Start line uses only the confirmed programme and enabled events',async()=>{
  const {owner,volunteer}=await start(false);
  expect((await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2001]})).json().message).toBe('Ask the scoring team to confirm the event list');
  await call(owner,'/api/day/events/R4/enabled',{enabled:false});
  await call(owner,'/api/day/confirm-events',{});
  const refused=await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2001]});
  expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('This event is switched off');
});
test('a volunteer corrects the runner list before finishing order, keeping unchanged runner identities',async()=>{
  const {volunteer}=await start();
  const first=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2001,2002]})).json().race;
  const response=await call(volunteer,`/api/races/${first.id}/runners`,{baseVersion:1,runners:[2002,2003]});
  expect(response.statusCode).toBe(200);
  const updated=response.json().race;
  expect(updated.parts.runners).toMatchObject({version:2,value:[{id:first.parts.runners.value[1].id,wristband:2002},{wristband:2003}]});
  expect((await call(volunteer,`/api/races/${first.id}`)).json()).toEqual(updated);
});
test('Deleted races leave waiting lists and permanent deletion never reuses a race number',async()=>{
  const {volunteer}=await start();
  const first=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2001]})).json().race;
  const second=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2002]})).json().race;
  expect((await call(volunteer,'/api/jobs/start-line')).json().waiting.map((race:any)=>race.id)).toEqual([first.id,second.id]);
  const moved=await call(volunteer,`/api/races/${first.id}/delete`,{permanent:false});
  expect(moved.statusCode).toBe(200);
  expect((await call(volunteer,`/api/races/${first.id}`)).json().deleted).toBe(true);
  expect((await call(volunteer,'/api/jobs/start-line')).json().waiting.map((race:any)=>race.id)).toEqual([second.id]);
  expect((await call(volunteer,`/api/races/${first.id}/runners`,{baseVersion:1,runners:[2003]})).statusCode).toBe(409);
  expect((await call(volunteer,`/api/races/${second.id}/delete`,{permanent:true})).statusCode).toBe(200);
  expect((await call(volunteer,`/api/races/${second.id}`)).statusCode).toBe(404);
  const third=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2003]})).json().race;
  expect(third.number).toBe(3);
  expect((await call(volunteer,'/api/home')).json().waiting).toEqual({'Start line':1,'Finish order':1,Times:1});
});
test('retrying the same check-in request returns the saved race instead of creating another',async()=>{
  const {owner,volunteer}=await start();
  const body={eventCode:'R4',runners:[2001],requestId:'phone-draft-one'};
  const first=(await call(volunteer,'/api/races/check-in',body)).json().race;
  const revision=(await call(owner,'/api/day')).json().revision;
  const retry=await call(volunteer,'/api/races/check-in',body);
  expect(retry.statusCode).toBe(200);expect(retry.json().race.id).toBe(first.id);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  expect((await call(volunteer,'/api/jobs/start-line')).json().waiting).toHaveLength(1);
});
test('all three permission levels use the same job and concurrent check-ins receive distinct numbers',async()=>{
  const {owner,volunteer,day}=await start();
  const lead=(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name:'Maryam'}})).json();
  await call(lead.token,'/api/become-lead',{code:day.leadCode});
  for(const [index,token] of [volunteer,lead.token,owner].entries()) {
    const response=await call(token,'/api/races/check-in',{eventCode:'R4',runners:[2001+index]});
    expect(response.statusCode).toBe(200);expect(response.json().race.number).toBe(index+1);
    const view=(await call(token,'/api/jobs/start-line')).json();
    expect(view).not.toHaveProperty('leadCode');expect(view).not.toHaveProperty('needsYou');expect(view).not.toHaveProperty('leaderboard');
  }
  const concurrent=await Promise.all([call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:[2004]}),call(lead.token,'/api/races/check-in',{eventCode:'R4',runners:[2005]})]);
  expect(concurrent.map(response=>response.json().race.number).sort()).toEqual([4,5]);
});
