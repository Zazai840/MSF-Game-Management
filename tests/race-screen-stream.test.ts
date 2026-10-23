import { afterEach,expect,test } from 'vitest';
import { once } from 'node:events';
import { connect as connectSocket,type AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createApp,type AppSettings } from '../src/server/app.js';
import { frameData,newerSnapshot,splitFrames } from '../src/shared/live.js';
import { homeStatus,type HomeSnapshot,type RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
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

test('a race screen stream sends the whole race first, an empty next heat when nothing is stored',async()=>{
  const {volunteer}=await start();
  const stream=await openStream(volunteer,'race-screen/R4');
  expect(stream.response.status).toBe(200);
  expect(stream.response.headers.get('content-type')).toBe('text/event-stream');
  const first=await stream.snapshot();
  expect(first).toMatchObject({event:{code:'R4',name:'60m',section:'Girl Cubs'},race:{id:null,kind:'heat',number:1,parts:{runners:{version:0,value:null},finish:{version:0,value:null},times:{version:0,value:null}}}});
  expect(first.revision).toEqual(expect.any(Number));
  await stream.close();
});
test('an idle stream sends a heartbeat comment and ends itself at its limit, so the phone reconnects to a fresh one',async()=>{
  const {volunteer}=await start({streamHeartbeatMs:50,streamLimitMs:400});
  const stream=await openStream(volunteer,'race-screen/R4');
  await stream.snapshot();
  expect(await stream.frame()).toBe(': hb');
  expect(await stream.frame()).toBe(': hb');
  let next=await stream.frame();
  while(next===': hb') next=await stream.frame();
  expect(next).toBe('ended');
});
test('the stream refuses a phone that is not signed in, and an unknown event, before it starts',async()=>{
  const {volunteer}=await start();
  expect((await refusedStream('nobody','race-screen/R4')).status).toBe(401);
  expect(await refusedStream(volunteer,'race-screen/R99')).toEqual({status:404,refusal:{message:'Event not found'}});
});
test('a race write raises the day revision and reaches every open stream of the event, ending with the next heat on the same stream',async()=>{
  const {volunteer,other}=await start(),setup=raceSetup(app);
  // Sam holds every job before the stream opens, so each write below is one change.
  for(const job of ['check-in','order','times']) await call(volunteer,'/api/race-screen/R4/hold',{job});
  const watching=await openStream(other,'race-screen/R4');
  const empty=await watching.snapshot();
  const race=await setup.checkIn(volunteer,'R4',[2001,2002]);
  const checkedIn=await watching.snapshot();
  expect(checkedIn.revision).toBeGreaterThan(empty.revision);
  expect(checkedIn.race).toMatchObject({id:race.id,kind:'heat',number:1,parts:{runners:{version:1,value:[{wristband:2001},{wristband:2002}]}}});
  await setup.order(volunteer,'R4',[2002,2001]);
  const ordered=await watching.snapshot();
  expect(ordered.revision).toBeGreaterThan(checkedIn.revision);
  expect(ordered.race.parts.finish.value!.order).toEqual([race.parts.runners.value![1].id,race.parts.runners.value![0].id]);
  // Every placed wristband timed is not saved: Heat 1 stays current until Submit Race.
  await setup.times(volunteer,'R4',[1234,1301]);
  expect((await watching.snapshot()).race).toMatchObject({id:race.id,state:'in progress',parts:{times:{value:{places:[1234,1301]}}}});
  await setup.submit(volunteer,'R4');
  expect((await watching.snapshot()).race).toEqual({id:null,kind:'heat',number:2,state:'in progress',parts:{runners:{version:0,value:null},finish:{version:0,value:null},times:{version:0,value:null}}});
  await watching.close();
});
test('a change elsewhere in the day that leaves the revision alone sends nothing new, and a phone keeps the newest snapshot it holds',async()=>{
  const {owner,volunteer}=await start();
  const stream=await openStream(volunteer,'race-screen/R4');
  const first=await stream.snapshot();
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
test('Start new day ends the old day\'s streams, so their phones reconnect and are told a new day has started',async()=>{
  const {owner,volunteer}=await start();
  const stream=await openStream(volunteer,'race-screen/R4');
  await stream.snapshot();
  await call(owner,'/api/day/export',{});
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  expect(await stream.frame()).toBe('ended');
  expect(await refusedStream(volunteer,'race-screen/R4')).toMatchObject({status:401,refusal:{reason:'new-day'}});
});
test('taking a hold reaches every open stream with the holder\'s name, and a phone that signs out loses its holds and its stream',async()=>{
  const {volunteer,other}=await start();
  const watching=await openStream(other,'race-screen/R4'),holding=await openStream(volunteer,'race-screen/R4');
  const empty=await watching.snapshot();await holding.snapshot();
  expect(empty.holds).toEqual({});
  expect((await call(volunteer,'/api/race-screen/R4/hold',{job:'check-in'})).statusCode).toBe(200);
  const held=await watching.snapshot();
  expect(held.revision).toBeGreaterThan(empty.revision);
  expect(held.holds).toEqual({'check-in':{id:expect.any(String),name:'Sam'}});
  await holding.snapshot();
  expect((await call(volunteer,'/api/sign-out',{})).statusCode).toBe(200);
  expect((await watching.snapshot()).holds).toEqual({});
  expect(await holding.frame()).toBe('ended');
  expect(await refusedStream(volunteer,'race-screen/R4')).toMatchObject({status:401,refusal:{reason:'signed-out'}});
  await watching.close();
});
test('a timed event moves on to its next race, and a saved race no longer holds the screen',async()=>{
  const {volunteer}=await start();
  await raceSetup(app).record(volunteer,'R16',[2003],[2650]);
  const stream=await openStream(volunteer,'race-screen/R16');
  expect((await stream.snapshot()).race).toMatchObject({id:null,kind:'race',number:2});
  await stream.close();
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
  const {owner,volunteer,other}=await start(),setup=raceSetup(app);
  await call(owner,'/api/day/events/R5/enabled',{enabled:false});
  await setup.record(volunteer,'R4',[2001],[1234]);
  await setup.checkIn(other,'R7',[1001]);
  const stream=await openStream(other,'home');
  expect(stream.response.headers.get('content-type')).toBe('text/event-stream');
  const first=await stream.snapshot<HomeSnapshot>();
  expect(first.revision).toEqual(expect.any(Number));
  expect(first.events.map(event=>event.code)).toEqual(['R1','R2','R3','R4','R6','R7','R8','R9','R10','R11','R12','R13','R14','R15','R16','R17','R18','R23','R24']);
  expect(first.events[0]).toMatchObject({code:'R1',name:'60m',section:'Boy Beavers'});
  const line=(code:string)=>homeStatus(first.events.find(event=>event.code===code)!);
  expect(line('R1')).toBe('Heat 1');
  // Heat 1 is saved; Sam's holds carry over to Heat 2.
  expect(line('R4')).toBe('Heat 2 · Order and times · Sam');
  expect(line('R7')).toBe('Race 1 · Checking in · Priya');
  await stream.close();
  expect((await refusedStream('nobody','home')).status).toBe(401);
});
test('the Home stream reaches every phone on a check-in, a hold change and a Submit press, and says Done once the stage is complete',async()=>{
  const {owner,volunteer,other}=await start(),setup=raceSetup(app);
  const sam=await openStream(volunteer,'home'),priya=await openStream(other,'home');
  const empty=await priya.snapshot<HomeSnapshot>();await sam.snapshot();
  // Checking in on a free job takes it: one change.
  await setup.write(volunteer,'R4','check-in',{raceId:null,version:0,runners:[{wristband:2001},{wristband:2002}]});
  for(const stream of [sam,priya]) {
    const checkedIn=await stream.snapshot<HomeSnapshot>();
    expect(checkedIn.revision).toBeGreaterThan(empty.revision);
    expect(homeStatus(checkedIn.events.find(event=>event.code==='R4')!)).toBe('Heat 1 · Checking in · Sam');
  }
  await call(other,'/api/race-screen/R4/hold',{job:'order'});
  for(const stream of [sam,priya]) await homeLine(stream,'R4','Heat 1 · Order and times · Sam, Priya');
  await setup.order(other,'R4',[2002,2001]);await setup.times(volunteer,'R4',[1234,1301]);
  await setup.submit(volunteer,'R4');
  for(const stream of [sam,priya]) await homeLine(stream,'R4','Heat 1 · Waiting on 1 to submit · Priya');
  await setup.submit(other,'R4');
  await homeLine(priya,'R4','Heat 2 · Order and times · Sam, Priya');
  await setup.record(volunteer,'R16',[2003],[2650]);
  expect((await call(owner,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  for(const stream of [sam,priya]) await homeLine(stream,'R16','Done');
  await sam.close();await priya.close();
});
