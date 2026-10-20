import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'cap-owner',resetTestDay:true});
  const people=await signInOwner(app,'cap-owner','Scoring'),owner=people.owner,day=people.day;await call(owner.token,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed Khan'),lead=await signInAs('Aisha Malik');await call(lead,'/api/become-lead',{code:day.leadCode});
  const read=async(id:string)=>(await call(lead,`/api/lead/races/${id}`)).json().race;
  return {owner:owner.token as string,volunteer,lead,setup:raceSetup(app),read};
}
const eight=[2001,2002,2003,2004,2005,2006,2007,2008];
const eightTimes=[1201,1215,1230,1244,1260,1275,1290,1305];

test('an ordinary race checks in 8 runners and records 8 places through finishing order and times',async()=>{
  const {volunteer,setup,read}=await start();
  const race=await setup.checkIn(volunteer,'R4',eight);
  expect(race.parts.runners.value!.map(runner=>runner.wristband)).toEqual(eight);
  await setup.order(volunteer,'R4',eight);await setup.times(volunteer,'R4',eightTimes);await setup.submit(volunteer,'R4');
  expect((await read(race.id!)).recording.results.map((row:any)=>[row.wristband,row.place,row.time])).toEqual(eight.map((number,index)=>[number,index+1,eightTimes[index]]));
});

test('a times save still checks each value when there are more than 6 places',async()=>{
  const {volunteer,setup}=await start();
  await setup.checkIn(volunteer,'R4',eight);
  const race=await setup.order(volunteer,'R4',eight);
  const refused=await call(volunteer,'/api/race-screen/R4/times',{raceId:race.id,version:0,places:[...eightTimes.slice(0,7),-1],keptWrong:[]});
  expect(refused.statusCode).toBe(400);expect(refused.json().message).toBe('Enter whole hundredths for every place');
});

test('a lead rules on 8 times and keeps warnings for more than 6 numbers in the race',async()=>{
  const {volunteer,lead,setup,read:leadRead}=await start();
  const race=await setup.record(volunteer,'R4',eight,eightTimes),retimed=eightTimes.map(time=>time+1);
  const ruled=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:race.parts.times.version,places:retimed});
  expect(ruled.statusCode).toBe(200);
  const read=(await leadRead(race.id!));expect(read.parts.times.value.places).toEqual(retimed);
  const runners=read.parts.runners.value.map((runner:any)=>({entryId:runner.id,wristband:runner.wristband}));
  const kept=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:read.parts.runners.version,finishVersion:read.parts.finish.version,runners:[...runners,{wristband:2009}],keptWarnings:[...eight,2009]});
  expect(kept.statusCode).toBe(200);
  expect((await leadRead(race.id!)).parts.runners.value).toHaveLength(9);
  const stranger=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:read.parts.runners.version+1,finishVersion:read.parts.finish.version,runners:[...runners,{wristband:2009}],keptWarnings:[3001]});
  expect(stranger.statusCode).toBe(400);expect(stranger.json().message).toBe('Choose Keep for a wristband number in this race');
});

test('a lead times correction refuses more places than the race has runners and still checks each value',async()=>{
  const {volunteer,lead,setup,read:leadRead}=await start();
  const race=await setup.record(volunteer,'R4',eight,eightTimes),baseVersion=race.parts.times.version;
  for(const places of [[...eightTimes,1320],[...eightTimes,null]]) {
    const refused=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion,places});
    expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('This race has 8 runners - enter no more places than that');
  }
  const invalid=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion,places:[...eightTimes.slice(0,7),-1]});
  expect(invalid.statusCode).toBe(400);expect(invalid.json().message).toBe('Enter whole hundredths or No finisher for every place');
  expect((await leadRead(race.id!)).parts.times.value.places).toEqual(eightTimes);
});

test('a lead trims leftover times beyond the runners after a runner is removed',async()=>{
  const {volunteer,lead,setup,read:leadRead}=await start();
  const race=await setup.record(volunteer,'R4',eight,eightTimes);
  let read=(await leadRead(race.id!));
  const seven=read.parts.runners.value.slice(0,7).map((runner:any)=>({entryId:runner.id,wristband:runner.wristband}));
  expect((await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:read.parts.runners.version,finishVersion:read.parts.finish.version,runners:seven})).statusCode).toBe(200);
  read=(await leadRead(race.id!));expect(read.parts.times.value.places).toEqual(eightTimes);
  const leftover=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:read.parts.times.version,places:eightTimes});
  expect(leftover.statusCode).toBe(409);expect(leftover.json().message).toBe('This race has 7 runners - enter no more places than that');
  const trimmed=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:read.parts.times.version,places:eightTimes.slice(0,7)});
  expect(trimmed.statusCode).toBe(200);
  expect((await leadRead(race.id!)).parts.times.value.places).toEqual(eightTimes.slice(0,7));
});

/** Heats of 8 and 6: the fastest 6 overall in seed order are 1023,1066,1088,1005,1012,1110; 1135 is 7th. */
async function finalWithHeats() {
  const tokens=await start();const {volunteer,lead}=tokens;
  const heats=[[1023,1088,1012,1135,1047,1101,1150,1160],[1066,1005,1110,1031,1092,1170]];
  const times=[[901,925,948,977,990,1024,1100,1110],[912,939,961,1003,1048,1120]];
  for(const [index,runners] of heats.entries()) {
    await tokens.setup.record(volunteer,'R3',runners,times[index]);
  }
  const complete=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(complete.statusCode).toBe(200);
  return {...tokens,results:complete.json().results};
}

test('a final is seeded with exactly the 6 fastest qualifiers in seed order',async()=>{
  const {results}=await finalWithHeats();
  expect(results.finalResults.entries.map((entry:any)=>[entry.seed,entry.heatWristband])).toEqual([[1,1023],[2,1066],[3,1088],[4,1005],[5,1012],[6,1110]]);
});

test('a final accepts a 7th runner added by a lead through finishing order, results and the day export',async()=>{
  const {owner,volunteer,lead,results,setup}=await finalWithHeats();const id=results.finalResults.raceId;
  let race:any=(await setup.screen(volunteer,'R3')).race;expect(race.id).toBe(id);
  // Lead corrections wait until the final is saved: the 7th runner is added then, with the finishing order.
  await setup.order(volunteer,'R3',[1023,1066,1088,1005,1012,1110]);race=(await setup.submit(volunteer,'R3')).race;
  const order=[1135,1023,1066,1088,1005,1012,1110];
  const added=await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[...race.parts.runners.value.map((runner:any)=>({entryId:runner.id,wristband:runner.wristband})),{wristband:1135}],finish:{order,didNotFinish:[]},comment:'Tie for 6th'});
  expect(added.statusCode).toBe(200);
  race=(await setup.screen(volunteer,'R3')).race;expect(race.final.entries).toHaveLength(7);
  expect(race.parts.runners.value).toHaveLength(7);
  const done=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'});expect(done.statusCode).toBe(200);
  expect(done.json().results.finalResults.leaderboard.map((row:any)=>[row.position,row.wristband])).toEqual(order.map((number,index)=>[index+1,number]));
  expect(done.json().results.inputRunning).toEqual({eventCode:'R3',first:1135,second:1023,third:1066});
  const sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);
  const finalRows=sheets[1].data.filter(row=>row[0]==='R3' && row[3]==='Final 1');
  expect(finalRows).toHaveLength(7);expect(finalRows.find(row=>row[5]===1135)?.[6]).toBe(1);
});
