import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'times-owner',resetTestDay:true});
  const people=await signInOwner(app,'times-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=await people.volunteer('Sam'),priya=await people.volunteer('Priya'),jo=await people.volunteer('Jo'),ali=await people.volunteer('Ali');
  return {owner:people.owner.token as string,sam:sam.token,priya:priya.token,jo:jo.token,ali:ali.token};
}
async function screen(token:string,code='R4'):Promise<RaceScreenRead> {
  const response=await call(token,`/api/race-screen/${code}`);
  expect(response.statusCode,response.body).toBe(200);
  return response.json();
}
const hold=(token:string,job:string,code='R4')=>call(token,`/api/race-screen/${code}/hold`,{job});
const takeOver=(token:string,job:string,code='R4')=>call(token,`/api/race-screen/${code}/take-over`,{job});
const times=(token:string,body:object,code='R4')=>call(token,`/api/race-screen/${code}/times`,{keptWrong:[],...body});
/** A race of three checked in by Sam, with Priya's order of the first `placed` of them. */
async function ordered(sam:string,priya:string,placed:number,code='R4') {
  await hold(sam,'check-in',code);
  const empty=await screen(sam,code);
  const checked=(await call(sam,`/api/race-screen/${code}/check-in`,{raceId:empty.race.id,version:0,runners:[2001,2002,2003].map(wristband=>({wristband}))})).json() as RaceScreenRead;
  const ids=checked.race.parts.runners.value!.map(runner=>runner.id);
  const response=await call(priya,`/api/race-screen/${code}/order`,{raceId:checked.race.id,version:0,order:ids.slice(0,placed),didNotFinish:[],didNotRun:[],added:[]});
  expect(response.statusCode,response.body).toBe(200);
  return response.json() as RaceScreenRead;
}

test('the times holder writes times by place; a time for a place with no wristband is refused, and a kept wrong time is stored for a lead',async()=>{
  const {owner,sam,priya,jo}=await start();
  const race=await ordered(sam,priya,2);
  await hold(jo,'times');
  const first=await times(jo,{raceId:race.race.id,version:0,places:[1295]});
  expect(first.statusCode,first.body).toBe(200);
  expect((first.json() as RaceScreenRead).race.parts.times).toEqual({version:1,value:{places:[1295],outOfOrder:false,keptWrong:[]}});
  // Only two places have a wristband, so a third time is refused.
  expect((await times(jo,{raceId:race.race.id,version:1,places:[1295,1312,1340]})).json()).toEqual({message:'Place 3 has no wristband yet'});
  expect((await times(jo,{raceId:race.race.id,version:1,places:[1295,null]})).json()).toEqual({message:'Enter whole hundredths for every place'});
  // A wrong time is stored as typed; Keep marks it, and only a wrong time can be kept.
  const kept=await times(jo,{raceId:race.race.id,version:1,places:[1295,1240],keptWrong:[1,0]});
  expect(kept.statusCode,kept.body).toBe(200);
  expect((kept.json() as RaceScreenRead).race.parts.times.value).toEqual({places:[1295,1240],outOfOrder:true,keptWrong:[1]});
  // Retyping it clears it, kept or not.
  expect((await times(jo,{raceId:race.race.id,version:2,places:[1295,1312],keptWrong:[1]})).json().race.parts.times.value).toEqual({places:[1295,1312],outOfOrder:false,keptWrong:[]});
  expect((await call(owner,`/api/lead/races/${race.race.id}`)).json().race.parts.times.value).toEqual({places:[1295,1312],outOfOrder:false,keptWrong:[]});
});
test('times left at places that lost their wristband stay as they are while earlier places are retyped, but cannot be changed',async()=>{
  const {sam,priya,jo}=await start();
  const race=await ordered(sam,priya,3);
  await hold(jo,'times');
  // A kept wrong time keeps the race from counting while its runner list changes.
  const timed=(await times(jo,{raceId:race.race.id,version:0,places:[1295,1240,1340],keptWrong:[1]})).json() as RaceScreenRead;
  expect(timed.race.parts.times.version).toBe(1);
  // Check-in takes 2003 off, so the 3rd place time has no wristband: retyping the 1st keeps it.
  const removed=await call(sam,'/api/race-screen/R4/check-in',{raceId:race.race.id,version:timed.race.parts.runners.version,runners:[2001,2002].map(wristband=>({wristband}))});
  expect(removed.statusCode,removed.body).toBe(200);
  const retyped=await times(jo,{raceId:race.race.id,version:1,places:[1290,1240,1340],keptWrong:[1]});
  expect(retyped.statusCode,retyped.body).toBe(200);
  expect((retyped.json() as RaceScreenRead).race.parts.times.value!.places).toEqual([1290,1240,1340]);
  expect((await times(jo,{raceId:race.race.id,version:2,places:[1290,1240,1345],keptWrong:[1]})).json()).toEqual({message:'Place 3 has no wristband yet'});
});
test('the times are refused in check-in\'s order and wording, as "the times"',async()=>{
  const {owner,sam,priya,jo,ali}=await start();
  const race=await ordered(sam,priya,1);
  await hold(jo,'times');
  // Not the holder comes before the version.
  expect((await times(ali,{raceId:race.race.id,version:7,places:[1295]})).json()).toEqual({message:'Jo took over the times'});
  expect((await times(jo,{raceId:race.race.id,version:7,places:[1295]})).json()).toEqual({message:'Not saved - check your entries and enter it again'});
  expect((await takeOver(ali,'times')).statusCode).toBe(200);
  expect((await times(jo,{raceId:race.race.id,version:0,places:[1295]})).json()).toEqual({message:'Ali took over the times'});
  expect((await times(ali,{raceId:race.race.id,version:0,places:'fast'})).json()).toEqual({message:'Enter whole hundredths for every place'});
  expect((await times(ali,{raceId:race.race.id,version:0,places:[1295],keptWrong:'all'})).json()).toEqual({message:'Choose the wrong times to keep'});
  expect((await times(ali,{raceId:null,version:0,places:[]},'R16')).json()).toEqual({message:'Check runners in before the times'});
  await call(owner,`/api/lead/races/${race.race.id}/delete`,{permanent:false});
  expect((await times(ali,{raceId:race.race.id,version:0,places:[1295]})).json()).toEqual({message:'A lead deleted Heat 1'});
  expect((await call(owner,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  expect((await times(ali,{raceId:race.race.id,version:0,places:[1295]},'R16')).json()).toEqual({message:'Stage complete - ask a lead'});
});
