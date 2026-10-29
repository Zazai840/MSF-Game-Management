import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { isTeamEntry } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
/**
 * The race screen is a relay's (ADR 0003): its jobs are held one phone at a time, with Take over, and a race saves on
 * Submit Race. These were the race screen's own tests on individual events, which now work race by race in the race flow.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
const code='R22';
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-screen-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-screen-owner','Aisha'),owner=people.owner.token as string;
  await call(owner,'/api/day/confirm-events',{});
  const [sam,priya,jo,ali]=await Promise.all(['Sam','Priya','Jo','Ali'].map(name=>people.volunteer(name)));
  const relays=relaySetup(app),alex=(await people.lead('Alex')).token;
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204],[2301,2302,2303,2304]]) await relays.team(ali.token,code,legs);
  return {owner,alex,relays,sam:sam.token,priya:priya.token,jo:jo.token,ali:ali.token,ids:{sam:sam.phone.id,priya:priya.phone.id,jo:jo.phone.id,ali:ali.phone.id}};
}
const screen=async(token:string):Promise<RaceScreenRead>=>(await call(token,`/api/race-screen/${code}`)).json();
const hold=(token:string,job:string)=>call(token,`/api/race-screen/${code}/hold`,{job});
const takeOver=(token:string,job:string)=>call(token,`/api/race-screen/${code}/take-over`,{job});
const order=(token:string,read:RaceScreenRead,teams:number[])=>call(token,`/api/race-screen/${code}/order`,{raceId:read.race.id,version:read.race.parts.finish.version,
  order:teams.map(number=>read.race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===number)!.id),didNotFinish:[],didNotRun:[],added:[]});
const times=(token:string,read:RaceScreenRead,places:number[])=>call(token,`/api/race-screen/${code}/times`,{raceId:read.race.id,version:read.race.parts.times.version,places,keptWrong:[]});
const submit=(token:string,raceId:string|null)=>call(token,`/api/race-screen/${code}/submit`,{raceId});
/** Teams 1 and 2 ticked in, Priya's order and Jo's times: a heat ready to submit. */
async function worked({relays,sam,priya,jo}:Awaited<ReturnType<typeof start>>) {
  await relays.tick(sam,code,1);await relays.tick(sam,code,2);
  await hold(priya,'order');await order(priya,await screen(priya),[2,1]);
  await hold(jo,'times');
  return (await times(jo,await screen(jo),[1520,1610])).json() as RaceScreenRead;
}
const names=(holders:Array<{name:string}>)=>holders.map(holder=>holder.name).sort();

test('the race screen is a relay\'s: an individual event is opened from Races',async()=>{
  const {sam}=await start();
  for(const path of ['/api/race-screen/R4','/api/live/race-screen/R4']) expect((await call(sam,path)).json()).toEqual({message:'Open this race from Races'});
  expect((await call(sam,'/api/race-screen/R4/hold',{job:'order'})).json()).toEqual({message:'Open this race from Races'});
  expect((await call(sam,'/api/race-screen/R4/check-in',{raceId:null,version:0,runners:[{wristband:2001}]})).statusCode).toBe(409);
});
test('opening a free job takes its hold, the race screen names the holder, and the day revision rises',async()=>{
  const {jo,ali,ids}=await start();
  const before=await screen(ali);
  expect(before.holds).toEqual({});
  const taken=(await hold(jo,'order')).json() as RaceScreenRead;
  expect(taken.holds).toEqual({order:{id:ids.jo,name:'Jo'}});
  const after=await screen(ali);
  expect(after.holds).toEqual({order:{id:ids.jo,name:'Jo'}});
  expect(after.revision).toBeGreaterThan(before.revision);
  // Holding it already, or someone else holding it, changes nothing.
  expect((await hold(jo,'order')).json().revision).toBe(after.revision);
  expect((await hold(ali,'order')).json()).toMatchObject({revision:after.revision,holds:{order:{name:'Jo'}}});
  expect((await hold(jo,'relay')).json()).toEqual({message:'Choose check-in, the order or the times'});
  expect((await hold(jo,'check-in')).json()).toEqual({message:'Anyone can check a relay in: tick its teams'});
});
test('two phones claiming a free job at the same moment end with exactly one holder',async()=>{
  const {jo,ali}=await start();
  const [first,second]=await Promise.all([hold(jo,'times'),hold(ali,'times')]);
  const holder=(await screen(jo)).holds.times!;
  expect(['Jo','Ali']).toContain(holder.name);
  expect(first.json().holds.times).toEqual(holder);expect(second.json().holds.times).toEqual(holder);
});
test('Take over passes the hold with an audit note, the new holder carries on, and the old holder\'s next entry is refused',async()=>{
  const context=await start(),{relays,sam,priya,ali,alex,ids}=context;
  await relays.tick(sam,code,1);await relays.tick(sam,code,2);
  await hold(priya,'order');
  const first=(await order(priya,await screen(priya),[2])).json() as RaceScreenRead;
  const taken=(await takeOver(ali,'order')).json() as RaceScreenRead;
  expect(taken.holds.order).toEqual({id:ids.ali,name:'Ali'});
  expect(taken.revision).toBeGreaterThan(first.revision);
  expect((await order(ali,taken,[2,1])).statusCode).toBe(200);
  expect((await order(priya,first,[1])).json()).toEqual({message:'Ali took over the order'});
  const notes=(await call(alex,`/api/lead/events/${code}/results`)).json().auditNotes;
  expect(notes.map((note:{message:string})=>note.message)).toContain('Ali took over the order from Priya on 4x50m Relay Girl Cubs Heat 1');
  // Taking over a job nobody holds just takes it; taking over your own changes nothing.
  expect((await takeOver(priya,'times')).json().holds.times.name).toBe('Priya');
  expect((await takeOver(priya,'times')).json().revision).toBe((await screen(priya)).revision);
});
test('a job\'s writes are refused in order: race deleted, saved or submitted, not the holder, version behind',async()=>{
  const context=await start(),{owner,priya,jo,ali}=context;
  const race=await worked(context);
  // Not the holder comes before the version.
  expect((await times(ali,{...race,race:{...race.race,parts:{...race.race.parts,times:{version:7,value:null}}}},[1500])).json()).toEqual({message:'Jo took over the times'});
  expect((await times(jo,{...race,race:{...race.race,parts:{...race.race.parts,times:{version:7,value:null}}}},[1500])).json()).toEqual({message:'Not saved - check your entries and enter it again'});
  await submit(priya,race.race.id);
  expect((await times(ali,race,[1500])).json()).toEqual({message:'Heat 1 is submitted - tap Not yet to change it'});
  await submit(jo,race.race.id);
  expect((await times(ali,race,[1500])).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  await call(owner,`/api/lead/races/${race.race.id}/delete`,{permanent:false});
  expect((await times(ali,race,[1500])).json()).toEqual({message:'A lead deleted Heat 1'});
});
test('signing out clears the phone\'s holds and raises the day revision, by the phone itself, by a lead and by Start new day',async()=>{
  const {owner,jo,ali,ids}=await start();
  await hold(jo,'order');await hold(ali,'times');
  const before=await screen(owner);
  expect((await call(ali,'/api/sign-out',{})).statusCode).toBe(200);
  const afterSelf=await screen(owner);
  expect(afterSelf.holds).toEqual({order:{id:ids.jo,name:'Jo'}});
  expect(afterSelf.revision).toBeGreaterThan(before.revision);
  expect((await call(owner,`/api/day/phones/${ids.jo}/remove`,{})).statusCode).toBe(200);
  expect((await screen(owner)).holds).toEqual({});
  await hold(owner,'order');
  await call(owner,'/api/day/export',{});
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  expect((await screen(owner)).holds).toEqual({});
});
test('Not yet sends a submitted race back to in progress, clears every press and leaves an audit note',async()=>{
  const context=await start(),{priya,jo,ali,alex}=context;
  const race=await worked(context);
  await submit(priya,race.race.id);
  const back=await call(ali,`/api/race-screen/${code}/not-yet`,{raceId:race.race.id});
  expect(back.json()).toMatchObject({race:{id:race.race.id,state:'in progress'},pressed:[]});
  expect((await call(ali,`/api/race-screen/${code}/not-yet`,{raceId:race.race.id})).json().revision).toBe(back.json().revision);
  expect((await times(jo,await screen(jo),[1500,1610])).statusCode).toBe(200);
  const notes=(await call(alex,`/api/lead/events/${code}/results`)).json().auditNotes;
  expect(notes[0]).toMatchObject({action:'not-yet',actor:'Ali',message:'Ali tapped Not yet on 4x50m Relay Girl Cubs Heat 1'});
});
test('Take over while submitted removes the old holder\'s press, so the new holder must press',async()=>{
  const context=await start(),{priya,jo,ali,ids}=context;
  const race=await worked(context);
  await submit(jo,race.race.id);
  const taken=(await takeOver(ali,'times')).json() as RaceScreenRead;
  expect(taken.race.state).toBe('submitted');
  expect(names(taken.asked)).toEqual(['Ali','Priya']);
  expect(taken.pressed).toEqual([]);
  await submit(priya,race.race.id);
  expect((await screen(ali)).race.state).toBe('submitted');
  expect((await submit(ali,race.race.id)).json().lastSaved).toMatchObject({number:1,by:'Ali'});
  expect(ids.ali).toBeTruthy();
});
test('Save as lead is for leads only, refused by Submit Race\'s blockers, and saves with an audit note',async()=>{
  const {relays,sam,priya,jo,alex}=await start();
  await relays.tick(sam,code,1);await relays.tick(sam,code,2);
  const ticked=await screen(sam),save=(token:string)=>call(token,`/api/race-screen/${code}/save-as-lead`,{raceId:ticked.race.id});
  expect((await save(sam)).statusCode).toBe(403);
  expect((await save(alex)).json()).toEqual({message:'2 teams have no place yet'});
  await hold(priya,'order');await order(priya,await screen(priya),[1,2]);
  await hold(jo,'times');await times(jo,await screen(jo),[1500,1600]);
  const saved=(await save(alex)).json() as RaceScreenRead;
  expect(saved.lastSaved).toMatchObject({kind:'heat',number:1,by:'Alex'});
  const notes=(await call(alex,`/api/lead/events/${code}/results`)).json().auditNotes;
  expect(notes[0]).toMatchObject({action:'save-as-lead',message:"Saved by Alex without Priya and Jo's Submit on 4x50m Relay Girl Cubs Heat 1"});
});
