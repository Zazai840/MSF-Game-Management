import { afterEach,expect,test } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { frameData,splitFrames } from '../src/shared/live.js';
import { isRunner } from '../src/shared/races.js';
import type { RaceFlowRead,RacesRead,Step } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'race-flow-owner',resetTestDay:true});
  const people=await signInOwner(app,'race-flow-owner'),owner=people.owner.token as string;
  await call(owner,'/api/day/confirm-events',{});
  return {owner,ahmed:(await people.volunteer('Ahmed')).token,tom:(await people.volunteer('Tom Barker')).token,lena:(await people.lead('Lena')).token};
}
async function ok<T=RaceFlowRead>(token:string,url:string,body?:unknown) {
  const response=await call(token,url,body);
  if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
  return response.json() as T;
}
const newHeat=(token:string,eventCode:string,number:number)=>ok(token,'/api/races',{eventCode,kind:'heat',number});
const ids=(read:RaceFlowRead,wristbands:number[])=>wristbands.map(wristband=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id);
const order=(token:string,read:RaceFlowRead,wristbands:number[])=>ok(token,`/api/races/${read.race.id}/order`,{raceId:read.race.id,version:read.race.parts.finish.version,order:ids(read,wristbands),didNotFinish:[],didNotRun:[],added:[]});
const times=(token:string,read:RaceFlowRead,places:number[])=>ok(token,`/api/races/${read.race.id}/times`,{raceId:read.race.id,version:read.race.parts.times.version,places,keptWrong:[]});
const done=(token:string,read:RaceFlowRead,step:Step)=>call(token,`/api/races/${read.race.id}/steps/${step}/done`,{});
/** A heat with its runners checked in, placed in that order and timed, as one phone; marked done only when asked. */
async function heat(token:string,eventCode:string,number:number,runners:number[],places:number[],markDone:readonly Step[]=[]) {
  const made=await newHeat(token,eventCode,number);
  let read=await ok(token,`/api/races/${made.race.id}/check-in`,{raceId:made.race.id,version:made.race.parts.runners.version,runners:runners.map(wristband=>({wristband})),keptWarnings:runners});
  read=await times(token,await order(token,read,runners),places);
  for(const step of markDone) read=(await done(token,read,step)).json();
  return read;
}
const steps:Step[]=['runners','positions','times'];
test('the races list has every switched-on event that is not a relay, each with its races and their steps',async()=>{
  const {ahmed}=await start();
  const empty=await ok<RacesRead>(ahmed,'/api/races');
  expect(empty.groups.some(group=>group.event.relay)).toBe(false);
  expect(empty.groups.find(group=>group.event.code==='R7')!.event.type).toBe('hurdles');
  expect(empty.groups.find(group=>group.event.code==='R4')).toMatchObject({event:{type:'races'},races:[],nextHeat:1,finalAvailable:false,heatsOpen:true});
  const made=await newHeat(ahmed,'R4',1);
  expect(made.race).toMatchObject({kind:'heat',number:1,state:'in progress'});
  expect(made.steps.runners).toMatchObject({state:'not started',count:0});
  expect(Object.keys(made.steps)).toEqual(steps);
  const list=await ok<RacesRead>(ahmed,'/api/races');
  expect(list.groups.find(group=>group.event.code==='R4')).toMatchObject({nextHeat:2,races:[{id:made.race.id,number:1}]});
});
test('two phones making the same next heat at once get one race, and a heat that is not next is refused',async()=>{
  const {ahmed,tom}=await start();
  const [first,second]=await Promise.all([newHeat(ahmed,'R4',1),newHeat(tom,'R4',1)]);
  expect(second.race.id).toBe(first.race.id);
  expect((await ok<RacesRead>(ahmed,'/api/races')).groups.find(group=>group.event.code==='R4')!.races).toHaveLength(1);
  const skipped=await call(ahmed,'/api/races',{eventCode:'R4',kind:'heat',number:3});
  expect(skipped.statusCode).toBe(409);expect(skipped.json()).toMatchObject({message:'Heat 2 is next',next:2});
  // A 200m run is stored as a race, and named a heat.
  expect((await newHeat(ahmed,'R16',1)).race).toMatchObject({kind:'race',number:1});
  expect((await call(ahmed,'/api/races',{eventCode:'R19',kind:'heat',number:1})).json().message).toBe('Relays use the relay race screen');
});
test('anyone writes any step with no hold, and a write made on an older version names who changed it',async()=>{
  const {ahmed,tom}=await start();
  const made=await newHeat(ahmed,'R4',1),id=made.race.id,seen=made.race.parts.runners.version;
  const checked=await ok(ahmed,`/api/races/${id}/check-in`,{raceId:id,version:seen,runners:[{wristband:2001},{wristband:2002}]});
  const ordered=await order(tom,checked,[2002,2001]);
  expect(ordered.steps.positions).toMatchObject({state:'in progress',count:2,expected:2,by:'Tom Barker'});
  const fromTom=await call(tom,`/api/races/${id}/check-in`,{raceId:id,version:seen,runners:[{wristband:2001}]});
  expect(fromTom.statusCode).toBe(409);
  expect(fromTom.json()).toMatchObject({message:'Ahmed changed this a moment ago',reason:'changed',by:'Ahmed'});
  // My own older version (another tab) is not someone else's change.
  expect((await call(ahmed,`/api/races/${id}/check-in`,{raceId:id,version:seen,runners:[{wristband:2001}]})).json().message).toBe('Not saved - check your entries and enter it again');
});
test('a race saves itself once every step is done, and a step that is not complete cannot be marked done',async()=>{
  const {owner,ahmed,tom}=await start();
  const made=await newHeat(ahmed,'R4',1),id=made.race.id;
  expect((await done(ahmed,made,'runners')).json().message).toBe('Nobody is checked in yet');
  const checked=await ok(ahmed,`/api/races/${id}/check-in`,{raceId:id,version:1,runners:[{wristband:2001},{wristband:2002}]});
  expect((await done(ahmed,checked,'runners')).json().steps.runners).toMatchObject({state:'done',doneBy:'Ahmed'});
  const partly=await order(tom,checked,[2001]);
  expect((await done(tom,partly,'positions')).json().message).toBe('2002 has no place yet');
  const placed=await order(tom,partly,[2001,2002]);
  expect((await done(tom,placed,'positions')).json().race.state).toBe('in progress');
  const wrong=await times(ahmed,placed,[1200,1100]);
  expect((await done(ahmed,wrong,'times')).json().message).toBe("2nd place's time needs Fix time or Keep");
  const saved=(await done(ahmed,await times(ahmed,wrong,[1100,1200]),'times')).json() as RaceFlowRead;
  expect(saved.race.state).toBe('saved');
  const history=(await ok<{history:Array<{part:string;author:string}>}>(owner,`/api/lead/races/${id}`)).history;
  expect(history.map(row=>[row.part,row.author])).toEqual([['runners','Ahmed'],['finish','Tom Barker'],['times','Ahmed']]);
  expect((await call(tom,`/api/races/${id}/order`,{raceId:id,version:2,order:[],didNotFinish:[],didNotRun:[],added:[]})).json().message).toBe('Heat 1 is saved - ask a lead to change it');
});
test('Undo reverses only my own done mark and the save it made, and steps aside once someone else changed the step',async()=>{
  const {ahmed,tom}=await start();
  const saved=await heat(ahmed,'R4',1,[2001,2002],[1100,1200],steps),id=saved.race.id;
  expect(saved.race.state).toBe('saved');
  const version=saved.steps.times!.version;
  expect((await call(tom,`/api/races/${id}/steps/times/undone`,{version})).statusCode).toBe(409);
  const undone=await ok(ahmed,`/api/races/${id}/steps/times/undone`,{version});
  expect(undone.race.state).toBe('in progress');
  expect(undone.steps.times!.state).toBe('in progress');
  expect(undone.steps.positions!.state).toBe('done');
  expect((await ok(ahmed,`/api/races/${id}`)).race.state).toBe('in progress');
  // Ahmed marks Times done again, but Tom retypes a time before Ahmed's Undo: it would wipe out Tom's work.
  const second=await heat(ahmed,'R4',2,[2003,2004],[1100,1200],['times']);
  await times(tom,second,[1100,1250]);
  const late=await call(ahmed,`/api/races/${second.race.id}/steps/times/undone`,{version:second.steps.times!.version});
  expect(late.statusCode).toBe(409);
  expect(late.json()).toMatchObject({message:'Tom Barker changed this since. Open the race to edit it.',reason:'changed-since'});
});
test('only a lead makes the final, once every heat is saved, seeded with the fastest 6, and a tie blocks it',async()=>{
  const {ahmed,lena}=await start();
  await heat(ahmed,'R4',1,[2001,2002,2003,2004,2005],[1100,1200,1300,1400,1500],steps);
  const running=await heat(ahmed,'R4',2,[2006,2007],[1000,1600]);
  expect((await call(lena,'/api/races',{eventCode:'R4',kind:'final'})).json().message).toBe('The final opens when every heat has times');
  expect((await ok<RacesRead>(ahmed,'/api/races')).groups.find(group=>group.event.code==='R4')!.finalAvailable).toBe(false);
  await done(ahmed,running,'runners');await done(ahmed,running,'positions');await done(ahmed,running,'times');
  // An empty heat made by mistake does not hold the final back.
  await newHeat(ahmed,'R4',3);
  expect((await ok<RacesRead>(ahmed,'/api/races')).groups.find(group=>group.event.code==='R4')!.finalAvailable).toBe(true);
  // A volunteer's phone cannot make it, whatever it sends: the heats stay open.
  const refused=await call(ahmed,'/api/races',{eventCode:'R4',kind:'final'});
  expect(refused.statusCode).toBe(403);
  expect(refused.json().message).toBe('Ask a lead to make the final');
  expect((await ok<RacesRead>(ahmed,'/api/races')).groups.find(group=>group.event.code==='R4')).toMatchObject({heatsOpen:true,finalAvailable:true});
  const final=await ok(lena,'/api/races',{eventCode:'R4',kind:'final'});
  expect(final.race.kind).toBe('final');
  expect(final.race.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband)).toEqual([2006,2001,2002,2003,2004,2005]);
  expect(Object.keys(final.steps)).toEqual(['runners','positions']);
  // Making the final completes the heats: the group offers no more heats.
  expect((await ok<RacesRead>(ahmed,'/api/races')).groups.find(group=>group.event.code==='R4')!.heatsOpen).toBe(false);
  expect((await ok(lena,'/api/races',{eventCode:'R4',kind:'final'})).race.id).toBe(final.race.id);
  // Boy Beavers: 6th and 7th tie on time across two heats, so who takes the last place in the final is not decided.
  await heat(ahmed,'R1',1,[1,2,3,4,5,6],[1000,1100,1200,1300,1400,1500],steps);
  await heat(ahmed,'R1',2,[7],[1500],steps);
  const tied=await call(lena,'/api/races',{eventCode:'R1',kind:'final'});
  expect(tied.statusCode).toBe(409);
  expect(tied.json()).toMatchObject({message:'Heat 1 has a tie to settle first',step:'times'});
  expect((await call(lena,'/api/races',{eventCode:'R16',kind:'final'})).json().message).toBe('This event has no final');
});
test("the races read gives a lead's final the reason it would be refused, the same one making it gives, naming the race and step",async()=>{
  const {ahmed,lena}=await start();
  const group=async(code:string)=>(await ok<RacesRead>(lena,'/api/races')).groups.find(group=>group.event.code===code)!;
  // Heat 1 keeps a wrong time: the heats are saved, but the final waits on a lead.
  const made=await newHeat(ahmed,'R4',1);
  let first=await ok(ahmed,`/api/races/${made.race.id}/check-in`,{raceId:made.race.id,version:1,runners:[{wristband:2001},{wristband:2002}]});
  first=await order(ahmed,first,[2001,2002]);
  first=await ok(ahmed,`/api/races/${first.race.id}/times`,{raceId:first.race.id,version:first.race.parts.times.version,places:[1300,1200],keptWrong:[1]});
  for(const step of steps) await done(ahmed,first,step);
  await heat(ahmed,'R4',2,[2003,2004],[1100,1400],steps);
  const reason={raceId:first.race.id,step:'times',line:'Heat 1 has a time to check first'};
  expect(await group('R4')).toMatchObject({finalAvailable:true,finalReason:reason});
  const refused=await call(lena,'/api/races',{eventCode:'R4',kind:'final'});
  expect(refused.statusCode).toBe(409);
  expect(refused.json()).toMatchObject({message:reason.line,raceId:reason.raceId,step:reason.step});
  // Once the lead accepts the time, nothing holds the final back.
  await ok(lena,`/api/lead/races/${first.race.id}/times`,{baseVersion:first.race.parts.times.version,places:[1300,1200],acceptOutOfOrder:true});
  expect(await group('R4')).toMatchObject({finalAvailable:true,finalReason:null});
  // Wristband 1 ran in both heats of Boy Beavers: which result counts is chosen in Results, so the reason has no step.
  const twice=await heat(ahmed,'R1',1,[1,2],[1000,1100],steps);
  await heat(ahmed,'R1',2,[1,3],[1050,1200],steps);
  expect((await group('R1')).finalReason).toEqual({raceId:twice.race.id,step:null,line:'1 ran twice: choose which result counts first'});
  expect((await call(lena,'/api/races',{eventCode:'R1',kind:'final'})).json()).toMatchObject({message:'1 ran twice: choose which result counts first',step:null});
});
test('the races list and a race come live: a write from another phone reaches an open stream',async()=>{
  const {ahmed,tom}=await start();
  await app.listen({port:0,host:'127.0.0.1'});
  const made=await newHeat(ahmed,'R4',1),{port}=app.server.address() as AddressInfo;
  async function open(path:string) {
    const reader=(await fetch(`http://127.0.0.1:${port}/api/live/${path}`,{headers:{authorization:`Bearer ${ahmed}`}})).body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer='';
    return async function next<T>():Promise<T> {
      for(;;) {
        const split=splitFrames(buffer);
        const data=split.frames.map(frameData).find(item=>item!==null);
        if(data) {buffer=split.rest;return JSON.parse(data) as T;}
        const read=await reader.read();
        if(read.done) throw new Error('The stream ended');
        buffer+=read.value;
      }
    };
  }
  const race=await open(`races/${made.race.id}`),list=await open('races');
  expect((await race<RaceFlowRead>()).steps.runners!.count).toBe(0);
  expect((await list<RacesRead>()).groups.find(group=>group.event.code==='R4')!.races).toHaveLength(1);
  await ok(tom,`/api/races/${made.race.id}/check-in`,{raceId:made.race.id,version:1,runners:[{wristband:2001}]});
  expect((await race<RaceFlowRead>()).steps.runners).toMatchObject({count:1,by:'Tom Barker'});
  expect((await list<RacesRead>()).groups.find(group=>group.event.code==='R4')!.races[0].steps.runners!.count).toBe(1);
});
test('the timer types times before the finish line places anyone, up to the runner count, and the race saves once they agree',async()=>{
  const {ahmed,tom}=await start();
  const made=await newHeat(ahmed,'R4',1),id=made.race.id;
  const checked=await ok(ahmed,`/api/races/${id}/check-in`,{raceId:id,version:1,runners:[{wristband:2001},{wristband:2002}]});
  const timed=await times(tom,checked,[1100,1200]);
  expect(timed.steps.times).toMatchObject({count:2,expected:2});
  expect((await call(tom,`/api/races/${id}/times`,{raceId:id,version:timed.race.parts.times.version,places:[1100,1200,1300],keptWrong:[]})).json().message).toBe('This race has 2 runners - add the runner at the finish first');
  await done(tom,timed,'times');await done(ahmed,timed,'runners');
  const partly=await order(ahmed,timed,[2001]);
  expect((await done(ahmed,partly,'positions')).statusCode).toBe(409);
  const saved=(await done(ahmed,await order(ahmed,partly,[2001,2002]),'positions')).json() as RaceFlowRead;
  expect(saved.race.state).toBe('saved');
});
test('an event group says its medals are decided only once a lead has Event complete, Final complete or Results without a final',async()=>{
  const {ahmed,lena}=await start();
  const decided=async(code:string)=>(await ok<RacesRead>(ahmed,'/api/races')).groups.find(group=>group.event.code===code)!.medalsDecided;
  const complete=(code:string,stage:string)=>call(lena,`/api/lead/events/${code}/complete-stage`,{stage,comment:'Out of time'});
  // 60m Hurdles, decided by time: every heat saved is not the medals.
  await heat(ahmed,'R7',1,[1,2],[1000,1100],steps);await heat(ahmed,'R7',2,[3,4],[1050,1150],steps);
  expect(await decided('R7')).toBe(false);
  expect((await complete('R7','event')).statusCode).toBe(200);
  expect(await decided('R7')).toBe(true);
  // 60m with a final: the heats complete and the final saved are not the medals; Final complete is.
  await heat(ahmed,'R4',1,[2001,2002],[1100,1200],steps);
  const final=await ok(lena,'/api/races',{eventCode:'R4',kind:'final'});
  await done(ahmed,final,'runners');await done(ahmed,await order(ahmed,final,[2001,2002]),'positions');
  expect((await ok(ahmed,`/api/races/${final.race.id}`)).race.state).toBe('saved');
  expect(await decided('R4')).toBe(false);
  expect((await complete('R4','final')).statusCode).toBe(200);
  expect(await decided('R4')).toBe(true);
  // Results without a final.
  await heat(ahmed,'R5',1,[3001,3002,3003],[1100,1200,1300],steps);
  expect(await decided('R5')).toBe(false);
  expect((await complete('R5','no-final')).statusCode).toBe(200);
  expect(await decided('R5')).toBe(true);
});
test('Times expects every runner until the finishing order is saved, then only the finishers',async()=>{
  const {ahmed,tom}=await start();
  const made=await newHeat(ahmed,'R4',1),id=made.race.id;
  const checked=await ok(ahmed,`/api/races/${id}/check-in`,{raceId:id,version:1,runners:[{wristband:2001},{wristband:2002},{wristband:2003}]});
  const ordered=await ok(tom,`/api/races/${id}/order`,{raceId:id,version:checked.race.parts.finish.version,order:ids(checked,[2002,2001]),didNotFinish:ids(checked,[2003]),didNotRun:[],added:[]});
  expect(ordered.steps.times).toMatchObject({count:0,expected:3});
  const saved=(await done(tom,ordered,'positions')).json() as RaceFlowRead;
  expect(saved.steps.positions).toMatchObject({state:'done',count:3,expected:3,didNotFinish:1});
  expect(saved.steps.times).toMatchObject({count:0,expected:2});
  const list=await ok<RacesRead>(ahmed,'/api/races');
  expect(list.groups.find(group=>group.event.code==='R4')!.races[0].steps.times).toMatchObject({expected:2});
});
