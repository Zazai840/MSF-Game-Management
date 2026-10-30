import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { relayFlowSetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'reset-owner',resetTestDay:true});
  const people=await signInOwner(app,'reset-owner','Owner'),owner=people.owner,day=people.day;
  const volunteer=(await people.volunteer('Ahmed')).token,lead=(await people.lead('Aisha')).token;
  return {owner:owner.token,volunteer,lead,day,people};
}
test('new day requires a current lead, the confirmation word and an export of the last change',async()=>{
  const {owner,volunteer,lead}=await start();
  let response=await call(volunteer,'/api/day/start-new',{confirmation:'NEW DAY'});
  expect(response.statusCode).toBe(403);expect(response.json().message).toBe('Lead access needed');
  response=await call(lead,'/api/day/start-new',{confirmation:'NEW DAY'});
  expect(response.statusCode).toBe(409);expect(response.json().message).toBe('Download a day export after the last change before starting a new day');
  await call(owner,'/api/day/export',{});
  for(const confirmation of [undefined,'','new day','RESET',123]) {
    response=await call(owner,'/api/day/start-new',{confirmation});expect(response.statusCode).toBe(400);expect(response.json().message).toBe('Type NEW DAY to confirm');
  }
  await call(owner,'/api/day/events/R4/rename',{name:'Changed sprint'});
  response=await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'});expect(response.statusCode).toBe(409);
  expect((await call(owner,'/api/day')).json().events.find((event:any)=>event.code==='R4').name).toBe('Changed sprint');
  expect((await call(lead,'/api/day/export',{})).statusCode).toBe(200);
  expect((await call(lead,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  expect((await call(lead,'/api/day')).json().events.find((event:any)=>event.code==='R4').name).toBe('60m');
});
test('reset erases a populated day, retains only its initiating lead phone and restores the built-in programme',async()=>{
  const {owner,volunteer,lead,day,people}=await start();const before=(await call(owner,'/api/me')).json();
  const otherOwner=(await people.volunteer('Other owner')).token;
  await call(otherOwner,'/api/become-lead',{code:'reset-owner'});
  await call(owner,'/api/day/events',{code:'EXTRA',name:'Extra',section:'Girl Cubs',format:'timed',type:'races'});
  await call(owner,'/api/day/events/R4/rename',{name:'Renamed'});await call(owner,'/api/day/events/R24/enabled',{enabled:false});await call(owner,'/api/day/confirm-events',{});
  const setup=raceSetup(app),record=(eventCode:string,number:number)=>setup.record(volunteer,eventCode,[number],[1000]);
  const first=await record('R7',101),second=await record('R7',102);
  const tied=(await call(lead,'/api/lead/events/R7/results')).json().results.ties[0];
  expect((await call(lead,'/api/lead/events/R7/settle-tie',{tieId:tied.id,outcome:'no-run-off'})).statusCode).toBe(200);
  await call(lead,`/api/lead/races/${first.id}/runners/${first.parts.runners.value![0].id}/disqualify`,{reason:'Obstruction'});
  await record('R3',1001);const complete=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(complete.statusCode).toBe(200);const finalId=complete.json().results.finalResults.raceId;
  // A race left in progress with a step done, and a relay with a team ticked into a heat and open on a phone: Start new day clears them all.
  const running=await setup.checkIn(volunteer,'R4',[2001]);await setup.order(lead,'R4',[2001]);
  expect((await call(volunteer,`/api/races/${running.id}/steps/runners/done`,{})).statusCode).toBe(200);
  const relays=relayFlowSetup(app);await relays.team(volunteer,'R19',[101,102,103,104]);await relays.tick(volunteer,'R19',1);
  const team=(await relays.teams(lead,'R19'))[0];await relays.post(lead,`/api/relays/${(await relays.race(lead,'R19'))!.group.event.id}/teams/${team.id}/open`,{});
  await call(lead,`/api/lead/races/${second.id}/delete`,{permanent:false});
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
  const reset=await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'});expect(reset.statusCode).toBe(200);
  const me=(await call(owner,'/api/me')).json();expect(me).toMatchObject({id:before.id,name:'Owner',level:'Lead'});expect(me.dayId).not.toBe(before.dayId);
  const fresh=(await call(owner,'/api/day')).json();expect(fresh.leadCode).not.toBe(day.leadCode);expect(fresh.eventsConfirmed).toBe(false);expect(fresh.exportedAt).toBeNull();expect(fresh.exportedRevision).toBeNull();expect(fresh.events).toHaveLength(26);expect(fresh.events.every((event:any)=>event.enabled)).toBe(true);expect(fresh.events.find((event:any)=>event.code==='R4').name).toBe('60m');expect(fresh.events.some((event:any)=>event.code==='EXTRA')).toBe(false);
  expect((await call(owner,'/api/home')).json()).toMatchObject({needsYou:0});
  expect(await setup.screen(owner,'R4')).toMatchObject({race:{id:null,number:1}});
  expect(await relays.race(owner,'R19')).toBeNull();expect(await relays.teams(owner,'R19')).toEqual([]);
  const phones=(await call(owner,'/api/day/phones')).json();expect(phones.phones).toMatchObject([{id:before.id,name:'Owner',level:'Lead'}]);expect(phones.auditNotes).toEqual([]);
  for(const token of [volunteer,lead,otherOwner]) expect((await call(token,'/api/home')).statusCode).toBe(401);
  for(const id of [first.id,second.id,running.id,finalId]) expect((await call(owner,`/api/lead/races/${id}`)).statusCode).toBe(404);
  expect((await call(owner,'/api/lead/events/R7/deleted-races')).json()).toEqual([]);expect((await call(owner,'/api/lead/events/R7/results')).json().auditNotes).toEqual([]);expect((await call(owner,'/api/lead/events/R3/results')).json().results.finalResults).toBeNull();
  const signedIn=await people.volunteer('Yusuf');expect((await call(signedIn.token,'/api/me')).json().dayId).toBe(me.dayId);expect((await call(signedIn.token,'/api/become-lead',{code:day.leadCode})).statusCode).toBe(403);
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(409);
  await call(owner,'/api/day/confirm-events',{});expect((await setup.checkIn(owner,'R7',[101])).number).toBe(1);
});
test('requests racing a reset never read the new day through an old phone or fail with a missing-day server error',async()=>{
  const {owner,volunteer,lead,people}=await start();await call(owner,'/api/day/export',{});
  const responses=await Promise.all([
    call(owner,'/api/day/start-new',{confirmation:'NEW DAY'}),
    ...Array.from({length:30},(_,i)=>call(i%2?lead:volunteer,i%2?'/api/lead/results':'/api/home')),
    app.inject({method:'POST',url:'/api/sign-in',payload:{pass:people.pass,profileId:'no-such-profile',secret:'wrong'}}),
    call(volunteer,'/api/become-lead',{code:'wrong-old-code'})
  ]);
  expect(responses[0].statusCode).toBe(200);
  for(const response of responses.slice(1,31)) expect([200,401]).toContain(response.statusCode);
  expect(responses[31].statusCode).toBe(401);expect([401,403]).toContain(responses[32].statusCode);
  const fresh=(await call(owner,'/api/day')).json();expect(fresh.eventsConfirmed).toBe(false);expect((await call(owner,'/api/day/phones')).json().phones).toHaveLength(1);
});
test('sign-ins, lead code rotations, recording and rulings each invalidate the reset export guard',async()=>{
  const {owner,volunteer,day,people}=await start();await call(owner,'/api/day/confirm-events',{});
  const race=await raceSetup(app).checkIn(volunteer,'R7',[101]),entry=race.parts.runners.value![0].id;
  const changes=[
    ()=>app.inject({method:'POST',url:'/api/profiles',payload:{pass:people.pass,name:'Signed in after export'}}),
    ()=>call(volunteer,'/api/become-lead',{code:day.leadCode}),
    ()=>call(owner,'/api/day/lead-code',{}),
    ()=>call(volunteer,`/api/races/${race.id}/order`,{raceId:race.id,version:race.parts.finish.version,order:[entry],didNotFinish:[],didNotRun:[],added:[]}),
    ()=>call(owner,`/api/lead/races/${race.id}/runners/${entry}/disqualify`,{reason:'Obstruction'}),
    ()=>call(owner,`/api/lead/races/${race.id}/delete`,{permanent:false})
  ];
  for(const change of changes) {
    expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);expect((await change()).statusCode).toBe(200);
    expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(409);
    const current=(await call(owner,'/api/day')).json();expect(current.revision).toBeGreaterThan(current.exportedRevision);
  }
  expect((await call(volunteer,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(403);
});
test('a sign-in racing reset is serialized entirely before or after the day switch, and a second reset cannot erase the fresh day',async()=>{
  const {owner,day,people}=await start();await call(owner,'/api/day/export',{});
  const [reset,signedIn]=await Promise.all([call(owner,'/api/day/start-new',{confirmation:'NEW DAY'}),people.volunteer('Concurrent')]);
  expect([200,409]).toContain(reset.statusCode);
  // Before the switch it bumps the revision so the reset is refused; after it, it lands on the fresh day.
  expect((await call(signedIn.token,'/api/me')).json().dayId).toBe((await call(owner,'/api/me')).json().dayId);
  expect((await call(owner,'/api/day')).json().leadCode===day.leadCode).toBe(reset.statusCode===409);
  await call(owner,'/api/day/export',{});
  const resets=await Promise.all([call(owner,'/api/day/start-new',{confirmation:'NEW DAY'}),call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})]);
  expect(resets.filter(response=>response.statusCode===200)).toHaveLength(1);expect(resets.filter(response=>[401,409].includes(response.statusCode))).toHaveLength(1);
  expect((await call(owner,'/api/day')).json().exportedAt).toBeNull();
});
