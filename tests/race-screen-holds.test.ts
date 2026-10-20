import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'holds-owner',resetTestDay:true});
  const people=await signInOwner(app,'holds-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const jo=await people.volunteer('Jo'),ali=await people.volunteer('Ali');
  return {owner:people.owner.token as string,jo:jo.token,ali:ali.token,joId:jo.phone.id,aliId:ali.phone.id,lead:people.lead};
}
/** The race screen as the phone sees it now: one snapshot from the event's stream. */
async function screen(token:string,code='R4'):Promise<RaceScreenRead> {
  const response=await call(token,`/api/race-screen/${code}`);
  expect(response.statusCode,response.body).toBe(200);
  return response.json();
}
const hold=(token:string,job:string,code='R4')=>call(token,`/api/race-screen/${code}/hold`,{job});
const takeOver=(token:string,job:string,code='R4')=>call(token,`/api/race-screen/${code}/take-over`,{job});
const checkIn=(token:string,body:{raceId:string|null;version:number;runners:number[];keptWarnings?:number[]},code='R4')=>call(token,`/api/race-screen/${code}/check-in`,{...body,runners:body.runners.map(wristband=>({wristband}))});

test('opening a free job takes its hold, the race screen names the holder, and the day revision rises',async()=>{
  const {jo,ali,joId}=await start();
  const before=await screen(ali);
  expect(before.holds).toEqual({});
  const taken=await hold(jo,'check-in');
  expect(taken.statusCode,taken.body).toBe(200);
  expect((taken.json() as RaceScreenRead).holds).toEqual({'check-in':{id:joId,name:'Jo'}});
  const after=await screen(ali);
  expect(after.holds).toEqual({'check-in':{id:joId,name:'Jo'}});
  expect(after.revision).toBeGreaterThan(before.revision);
  // Holding it already, or someone else holding it, changes nothing.
  expect((await hold(jo,'check-in')).json().revision).toBe(after.revision);
  expect((await hold(ali,'check-in')).json()).toMatchObject({revision:after.revision,holds:{'check-in':{name:'Jo'}}});
  expect((await hold(jo,'relay')).json()).toEqual({message:'Choose check-in, the order or the times'});
});
test('two phones claiming a free job at the same moment end with exactly one holder',async()=>{
  const {jo,ali}=await start();
  const [first,second]=await Promise.all([hold(jo,'order'),hold(ali,'order')]);
  expect([first.statusCode,second.statusCode]).toEqual([200,200]);
  const holder=(await screen(jo)).holds.order!;
  expect(['Jo','Ali']).toContain(holder.name);
  expect(first.json().holds.order).toEqual(holder);expect(second.json().holds.order).toEqual(holder);
});
test('Take over passes the hold to the new phone with an audit note, and the old holder\'s next entry is refused',async()=>{
  const {jo,ali,aliId,lead}=await start();
  await hold(jo,'check-in');
  const first=(await checkIn(jo,{raceId:null,version:0,runners:[2001,2002]})).json() as RaceScreenRead;
  const taken=await takeOver(ali,'check-in');
  expect(taken.statusCode,taken.body).toBe(200);
  const after=taken.json() as RaceScreenRead;
  expect(after.holds['check-in']).toEqual({id:aliId,name:'Ali'});
  expect(after.revision).toBeGreaterThan(first.revision);
  // Ali carries on from what Jo entered.
  const carried=await checkIn(ali,{raceId:first.race.id,version:first.race.parts.runners.version,runners:[2001,2002,2003]});
  expect(carried.statusCode,carried.body).toBe(200);
  expect(carried.json().race.parts.runners.value.map((runner:{wristband:number})=>runner.wristband)).toEqual([2001,2002,2003]);
  expect((await checkIn(jo,{raceId:first.race.id,version:2,runners:[2001]})).json()).toEqual({message:'Ali took over check-in'});
  const leadToken=(await lead('Alex')).token;
  const notes=(await call(leadToken,'/api/lead/events/R4/results')).json().auditNotes;
  expect(notes.map((note:{message:string})=>note.message)).toContain('Ali took over check-in from Jo on 60m Girl Cubs Heat 1');
  // Taking over a job nobody holds just takes it; taking over your own changes nothing.
  expect((await takeOver(jo,'order')).json().holds.order.name).toBe('Jo');
  expect((await takeOver(jo,'order')).json().revision).toBe((await screen(jo)).revision);
});
test('the first check-in on the empty next heat creates the race, and the next heat keeps the holds',async()=>{
  const {jo,joId}=await start();
  await hold(jo,'check-in');
  const response=await checkIn(jo,{raceId:null,version:0,runners:[2001,3045],keptWarnings:[3045]});
  expect(response.statusCode,response.body).toBe(200);
  const read=response.json() as RaceScreenRead;
  expect(read.race).toMatchObject({id:expect.any(String),kind:'heat',number:1,parts:{runners:{version:1}}});
  expect(read.race.parts.runners.value).toMatchObject([{wristband:2001,warnings:[]},{wristband:3045,warnings:[{kind:'wrong-section',kept:true}]}]);
  // A later write keeps each unchanged runner's entry; taking every runner off leaves the race stored, empty.
  const again=(await checkIn(jo,{raceId:read.race.id,version:1,runners:[3045,2002]})).json() as RaceScreenRead;
  expect(again.race.parts.runners.value![0]).toEqual(read.race.parts.runners.value![1]);
  const emptied=(await checkIn(jo,{raceId:read.race.id,version:2,runners:[]})).json() as RaceScreenRead;
  expect(emptied.race).toMatchObject({id:read.race.id,parts:{runners:{version:3,value:[]}}});
  expect(emptied.holds).toEqual({'check-in':{id:joId,name:'Jo'}});
  expect((await checkIn(jo,{raceId:null,version:0,runners:[]})).json()).toEqual({message:'Enter at least one wristband number'});
  expect((await checkIn(jo,{raceId:read.race.id,version:3,runners:[2001,2001]})).json()).toEqual({message:'2001 is already in this race'});
});
test('check-in writes are refused in order: stage complete, race deleted, race saved, race submitted, not the holder, version behind',async()=>{
  const {owner,jo,ali}=await start();
  await hold(jo,'check-in');
  const heat=(await checkIn(jo,{raceId:null,version:0,runners:[2001]})).json() as RaceScreenRead;
  // Not the holder comes before the version: Ali's stale write is told who has it.
  expect((await checkIn(ali,{raceId:null,version:0,runners:[2005]})).json()).toEqual({message:'Jo took over check-in'});
  expect((await checkIn(jo,{raceId:null,version:0,runners:[2005]})).json()).toEqual({message:'Not saved - check your entries and enter it again'});
  expect((await checkIn(jo,{raceId:heat.race.id,version:0,runners:[2005]})).json()).toEqual({message:'Not saved - check your entries and enter it again'});
  // A submitted race says so before who holds the job; a saved one and a deleted one say so, even to someone who never held it.
  const setup=raceSetup(app);
  await setup.order(jo,'R4',[2001]);await setup.times(jo,'R4',[1234]);
  await call(owner,'/api/race-screen/R4/submit',{raceId:heat.race.id});
  expect((await checkIn(ali,{raceId:heat.race.id,version:1,runners:[2001,2002]})).json()).toEqual({message:'Heat 1 is submitted - tap Not yet to change it'});
  await setup.submit(jo,'R4');
  expect((await checkIn(ali,{raceId:heat.race.id,version:1,runners:[2001,2002]})).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  await call(owner,`/api/lead/races/${heat.race.id}/delete`,{permanent:false});
  expect((await checkIn(ali,{raceId:heat.race.id,version:1,runners:[2001,2002]})).json()).toEqual({message:'A lead deleted Heat 1'});
  expect((await checkIn(ali,{raceId:'00000000-0000-4000-8000-000000000000',version:1,runners:[2001]})).json()).toEqual({message:'A lead deleted this race'});
  // The stage being complete comes first of all.
  expect((await call(owner,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  expect((await checkIn(jo,{raceId:'00000000-0000-4000-8000-000000000000',version:9,runners:[2001]},'R16')).json()).toEqual({message:'Stage complete - ask a lead'});
  expect((await hold(jo,'check-in','R16')).json()).toEqual({message:'Stage complete - ask a lead'});
  expect((await screen(jo,'R16')).stageComplete).toBe(true);
});
test('signing out clears the phone\'s holds and raises the day revision, by the phone itself, by a lead and by Start new day',async()=>{
  const {owner,jo,ali,joId}=await start();
  await hold(jo,'check-in');await hold(ali,'order');await hold(ali,'times','R16');
  const before=await screen(owner);
  expect((await call(ali,'/api/sign-out',{})).statusCode).toBe(200);
  const afterSelf=await screen(owner);
  expect(afterSelf.holds).toEqual({'check-in':{id:joId,name:'Jo'}});
  expect((await screen(owner,'R16')).holds).toEqual({});
  expect(afterSelf.revision).toBeGreaterThan(before.revision);
  expect((await call(owner,`/api/day/phones/${joId}/remove`,{})).statusCode).toBe(200);
  expect((await screen(owner)).holds).toEqual({});
  await hold(owner,'check-in');
  await call(owner,'/api/day/export',{});
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  expect((await screen(owner)).holds).toEqual({});
});
test('storing the final clears all of the event\'s holds: the final starts with nobody holding anything',async()=>{
  const {owner,jo}=await start();
  await hold(jo,'check-in');await hold(jo,'order');
  await checkIn(jo,{raceId:null,version:0,runners:[2001,2002]});
  const setup=raceSetup(app);
  await setup.order(jo,'R4',[2001,2002]);await setup.times(jo,'R4',[1234,1301]);await setup.submit(jo,'R4');
  expect((await screen(jo)).holds).toMatchObject({'check-in':{name:'Jo'},order:{name:'Jo'},times:{name:'Jo'}});
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await screen(jo);
  expect(final.race.kind).toBe('final');
  expect(final.holds).toEqual({});
  expect((await hold(jo,'times')).json()).toEqual({message:'A final has no times'});
});
