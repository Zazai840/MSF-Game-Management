import { afterEach,expect,test } from 'vitest';
import { once } from 'node:events';
import pg from 'pg';
import { connect as connectSocket,type AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createApp,type AppSettings } from '../src/server/app.js';
import { dayChanged } from '../src/server/live/changes.js';
import { frameData,newerSnapshot,splitFrames } from '../src/shared/live.js';
import type { RaceFlowRead,RacesRead } from '../src/shared/race-flow.js';
import { homeStatus,type HomeSnapshot,type RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { relaySetup } from './support/relays.js';
/**
 * The live streams: the races list and a race (the race flow), and Home and a relay's race screen. Each sends a whole
 * snapshot first and again after each change that raises the day revision.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start(settings:Partial<AppSettings>={}) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'stream-owner',resetTestDay:true,...settings});
  await app.listen({port:0,host:'127.0.0.1'});
  const people=await signInOwner(app,'stream-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const volunteer=(await people.volunteer('Sam')).token,other=(await people.volunteer('Priya')).token;
  return {owner:people.owner.token as string,volunteer,other};
}
/** Opens a stream the way a phone does (fetch with the bearer header) and hands out its frames one at a time. */
function connect(token:string,path:string) {
  const {port}=app.server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}/api/live/${path}`,{headers:{authorization:`Bearer ${token}`}});
}
/** A stream the server refuses before it starts: its status and reply. */
async function refusedStream(token:string,path:string) {
  const response=await connect(token,path);
  return {status:response.status,refusal:await response.json()};
}
async function openStream(token:string,path:string) {
  const response=await connect(token,path);
  const reader=response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer='';const waiting:string[]=[];
  async function frame(timeout=2000):Promise<string|'ended'> {
    const deadline=Date.now()+timeout;
    while(!waiting.length) {
      const read=await Promise.race([reader.read(),new Promise<'late'>(resolve=>setTimeout(()=>resolve('late'),Math.max(0,deadline-Date.now())))]);
      if(read==='late') throw new Error('No frame in time');
      if(read.done) return 'ended';
      const split=splitFrames(buffer+read.value);buffer=split.rest;waiting.push(...split.frames);
    }
    return waiting.shift()!;
  }
  /** The next snapshot, skipping heartbeats. */
  async function snapshot<T=RaceScreenRead>(timeout?:number):Promise<T> {
    for(;;) {
      const next=await frame(timeout);
      if(next==='ended') throw new Error('The stream ended');
      const data=frameData(next);if(data) return JSON.parse(data);
    }
  }
  return {response,frame,snapshot,close:()=>reader.cancel()};
}
/** A new empty Heat 1 of R4 (Girl Cubs 60m), as New race makes it. */
const newHeat=async(token:string)=>((await call(token,'/api/races',{eventCode:'R4',kind:'heat',number:1})).json() as RaceFlowRead).race;
/** Girl Cubs 4x50m Relay (R22), and three teams entered on it. */
const relay='R22';
async function withTeams(token:string) {
  const relays=relaySetup(app);
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204],[2301,2302,2303,2304]]) await relays.team(token,relay,legs);
  return relays;
}

test('a race stream sends the whole race first, and the races stream every event group but the relays',async()=>{
  const {volunteer}=await start();
  const race=await newHeat(volunteer);
  const stream=await openStream(volunteer,`races/${race.id}`);
  expect(stream.response.status).toBe(200);
  expect(stream.response.headers.get('content-type')).toBe('text/event-stream');
  const first=await stream.snapshot<RaceFlowRead>();
  expect(first).toMatchObject({group:{event:{code:'R4',name:'60m',section:'Girl Cubs'}},race:{id:race.id,kind:'heat',number:1,parts:{runners:{value:[]},finish:{version:0,value:null},times:{version:0,value:null}}}});
  expect(first.revision).toEqual(expect.any(Number));
  await stream.close();
  const list=await openStream(volunteer,'races');
  const groups=(await list.snapshot<RacesRead>()).groups;
  expect(groups.find(group=>group.event.code==='R4')!.races.map(item=>item.id)).toEqual([race.id]);
  expect(groups.some(group=>group.event.relay)).toBe(false);
  await list.close();
});
test('a relay\'s race screen stream sends its current race first, an empty next heat when nothing is stored',async()=>{
  const {volunteer}=await start();
  const stream=await openStream(volunteer,`race-screen/${relay}`);
  expect((await stream.snapshot()).race).toMatchObject({id:null,kind:'heat',number:1,parts:{runners:{version:0,value:null},finish:{version:0,value:null},times:{version:0,value:null}}});
  await stream.close();
});
test('an idle stream sends a heartbeat comment and ends itself at its limit, so the phone reconnects to a fresh one',async()=>{
  const {volunteer}=await start({streamHeartbeatMs:50,streamLimitMs:400});
  const stream=await openStream(volunteer,'races');
  await stream.snapshot();
  expect(await stream.frame()).toBe(': hb');
  expect(await stream.frame()).toBe(': hb');
  let next=await stream.frame();
  while(next===': hb') next=await stream.frame();
  expect(next).toBe('ended');
});
test('the stream refuses a phone that is not signed in, an unknown event and an unknown race, before it starts',async()=>{
  const {volunteer}=await start();
  for(const path of ['races','race-screen/R4']) expect((await refusedStream('nobody',path)).status).toBe(401);
  expect(await refusedStream(volunteer,'race-screen/R99')).toEqual({status:404,refusal:{message:'Event not found'}});
  expect((await refusedStream(volunteer,'races/00000000-0000-0000-0000-000000000000')).status).toBe(404);
});
test('a race write raises the day revision and reaches every open stream of the race, through to saved',async()=>{
  const {volunteer,other}=await start(),setup=raceSetup(app);
  const made=await newHeat(volunteer);
  const watching=await openStream(other,`races/${made.id}`);
  const empty=await watching.snapshot<RaceFlowRead>();
  const race=await setup.checkIn(volunteer,'R4',[2001,2002]);
  const checkedIn=await watching.snapshot<RaceFlowRead>();
  expect(checkedIn.revision).toBeGreaterThan(empty.revision);
  expect(checkedIn.race).toMatchObject({id:made.id,parts:{runners:{value:[{wristband:2001},{wristband:2002}]}}});
  await setup.order(volunteer,'R4',[2002,2001]);
  const ordered=await watching.snapshot<RaceFlowRead>();
  expect(ordered.revision).toBeGreaterThan(checkedIn.revision);
  expect(ordered.race.parts.finish.value!.order).toEqual([race.parts.runners.value![1].id,race.parts.runners.value![0].id]);
  await setup.times(volunteer,'R4',[1234,1301]);
  expect((await watching.snapshot<RaceFlowRead>()).race).toMatchObject({state:'in progress',parts:{times:{value:{places:[1234,1301]}}}});
  // Each done mark is a change, and the last one saves the race.
  await setup.submit(volunteer,'R4');
  let next=await watching.snapshot<RaceFlowRead>();
  while(next.race.state!=='saved') next=await watching.snapshot<RaceFlowRead>();
  expect(next.steps).toMatchObject({runners:{state:'done'},positions:{state:'done'},times:{state:'done'}});
  await watching.close();
});
test('a change elsewhere in the day that leaves the revision alone sends nothing new, and a phone keeps the newest snapshot it holds',async()=>{
  const {owner,volunteer}=await start();
  const stream=await openStream(volunteer,'races');
  const first=await stream.snapshot<RacesRead>();
  // The day export changes nothing a phone shows and keeps the revision.
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
  await expect(stream.snapshot(300)).rejects.toThrow('No frame in time');
  await stream.close();
  const older={...first,revision:first.revision-1},newer={...first,revision:first.revision+1};
  expect(newerSnapshot(first,older)).toBe(false);
  expect(newerSnapshot(first,first)).toBe(true);
  expect(newerSnapshot(first,newer)).toBe(true);
  expect(newerSnapshot(null,older)).toBe(true);
});
test('a change made while a stream reads its first snapshot still reaches it',async()=>{
  const {volunteer}=await start();
  const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  try {
    const dayId=(await db.query('SELECT id FROM olympics_days WHERE active')).rows[0].id as string;
    // Hold the stream's first read part way, after its snapshot is taken, by locking a table it reads later.
    const lock=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await lock.connect();
    await lock.query('BEGIN');await lock.query('LOCK TABLE race_counters IN ACCESS EXCLUSIVE MODE');
    const opening=openStream(volunteer,'races');
    const waiting=async()=>(await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%race_counters%'")).rowCount;
    while(!(await waiting())) await new Promise(resolve=>setTimeout(resolve,10));
    // A change commits and is told while the read is held.
    await db.query('UPDATE olympics_days SET revision=revision+1 WHERE id=$1',[dayId]);dayChanged(dayId);
    await lock.query('ROLLBACK');await lock.end();
    const stream=await opening,first=await stream.snapshot<RacesRead>();
    expect((await stream.snapshot<RacesRead>()).revision).toBeGreaterThan(first.revision);
    await stream.close();
  } finally {await db.end();}
});
test('Start new day ends the old day\'s streams, so their phones reconnect and are told a new day has started',async()=>{
  const {owner,volunteer}=await start();
  const race=await newHeat(volunteer);
  const streams=[await openStream(volunteer,'races'),await openStream(volunteer,`races/${race.id}`)];
  for(const stream of streams) await stream.snapshot();
  await call(owner,'/api/day/export',{});
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  for(const stream of streams) expect(await stream.frame()).toBe('ended');
  expect(await refusedStream(volunteer,'races')).toMatchObject({status:401,refusal:{reason:'new-day'}});
});
test('taking a hold on a relay reaches every open stream with the holder\'s name, and a phone that signs out loses its holds and its stream',async()=>{
  const {volunteer,other}=await start();
  const watching=await openStream(other,`race-screen/${relay}`),holding=await openStream(volunteer,`race-screen/${relay}`);
  const empty=await watching.snapshot();await holding.snapshot();
  expect(empty.holds).toEqual({});
  expect((await call(volunteer,`/api/race-screen/${relay}/hold`,{job:'order'})).statusCode).toBe(200);
  const held=await watching.snapshot();
  expect(held.revision).toBeGreaterThan(empty.revision);
  expect(held.holds).toEqual({order:{id:expect.any(String),name:'Sam'}});
  await holding.snapshot();
  expect((await call(volunteer,'/api/sign-out',{})).statusCode).toBe(200);
  expect((await watching.snapshot()).holds).toEqual({});
  expect(await holding.frame()).toBe('ended');
  expect(await refusedStream(volunteer,`race-screen/${relay}`)).toMatchObject({status:401,refusal:{reason:'signed-out'}});
  await watching.close();
});
/** Reads a Home stream's snapshots until the event's status line reads `line`, and answers that snapshot. */
async function homeLine(stream:Awaited<ReturnType<typeof openStream>>,code:string,line:string) {
  for(;;) {
    const next=await stream.snapshot<HomeSnapshot>();
    if(homeStatus(next.events.find(event=>event.code===code)!)===line) return next;
  }
}
test('shutting down does not wait on a connection that never sent a request, such as a browser\'s spare one',async()=>{
  await start();
  const {port}=app.server.address() as AddressInfo;
  // Shutting down resets it.
  const accepted=once(app.server,'connection');
  connectSocket({port,host:'127.0.0.1'}).on('error',()=>{});await accepted;
  const started=Date.now();await app.close();
  expect(Date.now()-started).toBeLessThan(1000);
});
test('the Home stream sends every switched-on event first, in programme order, each with its status line',async()=>{
  const {owner,volunteer,other}=await start();
  await call(owner,'/api/day/events/R5/enabled',{enabled:false});
  const relays=await withTeams(volunteer);
  await relays.tick(other,relay,1);
  await call(other,`/api/race-screen/${relay}/hold`,{job:'order'});
  const stream=await openStream(other,'home');
  expect(stream.response.headers.get('content-type')).toBe('text/event-stream');
  const first=await stream.snapshot<HomeSnapshot>();
  expect(first.revision).toEqual(expect.any(Number));
  expect(first.events.map(event=>event.code)).toEqual(['R1','R2','R3','R4','R6','R7','R8','R9','R10','R11','R12','R13','R14','R15','R16','R17','R18','R23','R24','R19','R20','R21','R22','R27','R28']);
  // The relay mark says which tab of Home shows the event.
  expect(first.events[0]).toMatchObject({code:'R1',name:'60m',section:'Boy Beavers',relay:false});
  expect(first.events.find(event=>event.code==='R27')).toMatchObject({name:'4x100m Relay',section:'Boy Scouts',relay:true});
  const line=(code:string)=>homeStatus(first.events.find(event=>event.code===code)!);
  expect(line('R19')).toBe('No teams yet');
  expect(line(relay)).toBe('Heat 1 · Order and times · Priya');
  await stream.close();
  expect((await refusedStream('nobody','home')).status).toBe(401);
});
test('the Home stream reaches every phone on a relay tick, a hold change and a Submit press, and says Done once the stage is complete',async()=>{
  const {owner,volunteer,other}=await start(),setup=raceSetup(app);
  const relays=await withTeams(volunteer);
  const sam=await openStream(volunteer,'home'),priya=await openStream(other,'home');
  const empty=await priya.snapshot<HomeSnapshot>();await sam.snapshot();
  await relays.tick(volunteer,relay,1);
  for(const stream of [sam,priya]) {
    const ticked=await stream.snapshot<HomeSnapshot>();
    expect(ticked.revision).toBeGreaterThan(empty.revision);
    expect(homeStatus(ticked.events.find(event=>event.code===relay)!)).toBe('Heat 1 · Checking in · 1 team');
  }
  await relays.tick(volunteer,relay,2);
  await call(other,`/api/race-screen/${relay}/hold`,{job:'order'});
  for(const stream of [sam,priya]) await homeLine(stream,relay,'Heat 1 · Order and times · Priya');
  const seen=await relays.screen(other,relay),id=(number:number)=>seen.race.parts.runners.value!.find(entry=>'team' in entry && entry.team.number===number)!.id;
  await relays.post(other,`/api/race-screen/${relay}/order`,{raceId:seen.race.id,version:seen.race.parts.finish.version,order:[2,1].map(id),didNotFinish:[],didNotRun:[],added:[]});
  await call(volunteer,`/api/race-screen/${relay}/hold`,{job:'times'});
  const timed=await relays.screen(volunteer,relay);
  await relays.post(volunteer,`/api/race-screen/${relay}/times`,{raceId:timed.race.id,version:timed.race.parts.times.version,places:[1520,1610],keptWrong:[]});
  await relays.post(volunteer,`/api/race-screen/${relay}/submit`,{raceId:timed.race.id});
  for(const stream of [sam,priya]) await homeLine(stream,relay,'Heat 1 · Waiting on 1 to submit · Priya');
  await relays.post(other,`/api/race-screen/${relay}/submit`,{raceId:timed.race.id});
  await homeLine(priya,relay,'Heat 2 · 1 team to run');
  await setup.record(volunteer,'R16',[2003],[2650]);
  expect((await call(owner,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  for(const stream of [sam,priya]) await homeLine(stream,'R16','Done');
  await sam.close();await priya.close();
});
