import { afterEach,expect,test } from 'vitest';
import { isRunner } from '../src/shared/races.js';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'order-owner',resetTestDay:true});
  const people=await signInOwner(app,'order-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=await people.volunteer('Sam'),priya=await people.volunteer('Priya'),ali=await people.volunteer('Ali');
  return {owner:people.owner.token as string,sam:sam.token,priya:priya.token,ali:ali.token,samId:sam.phone.id,priyaId:priya.phone.id};
}
async function screen(token:string,code='R4'):Promise<RaceScreenRead> {
  const response=await call(token,`/api/race-screen/${code}`);
  expect(response.statusCode,response.body).toBe(200);
  return response.json();
}
const hold=(token:string,job:string,code='R4')=>call(token,`/api/race-screen/${code}/hold`,{job});
const takeOver=(token:string,job:string,code='R4')=>call(token,`/api/race-screen/${code}/take-over`,{job});
/** Writes the whole check-in list; a number carries its entry id when it is a fixed one. */
async function checkIn(token:string,read:RaceScreenRead,runners:Array<number|{id:string;wristband:number}>,code='R4'):Promise<RaceScreenRead> {
  const response=await call(token,`/api/race-screen/${code}/check-in`,{raceId:read.race.id,version:read.race.parts.runners.version,runners:runners.map(runner=>typeof runner==='number'?{wristband:runner}:runner)});
  expect(response.statusCode,response.body).toBe(200);
  return response.json();
}
const order=(token:string,body:object,code='R4')=>call(token,`/api/race-screen/${code}/order`,{order:[],didNotFinish:[],didNotRun:[],added:[],...body});
/** The entry id of a checked-in wristband. */
const idOf=(read:RaceScreenRead,wristband:number)=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
/** The finishing order as wristbands, place by place. */
const placed=(read:RaceScreenRead)=>(read.race.parts.finish.value?.order||[]).map(id=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.id===id)?.wristband??id);

test('the order holder writes the order by entry, and a runner check-in removes drops out with later places moving up, even from an order sent before the removal',async()=>{
  const {sam,priya}=await start();
  await hold(sam,'check-in');
  const checked=await checkIn(sam,await screen(sam),[2001,2002,2003]);
  await hold(priya,'order');
  const first=await order(priya,{raceId:checked.race.id,version:0,order:[idOf(checked,2002),idOf(checked,2001)]});
  expect(first.statusCode,first.body).toBe(200);
  const ordered=first.json() as RaceScreenRead;
  expect(placed(ordered)).toEqual([2002,2001]);
  expect(ordered.race.parts.finish.version).toBe(1);
  // Check-in takes 2002 off: it drops out of the order at once, and 2001 moves up to 1st.
  const removed=await checkIn(sam,ordered,[2001,2003]);
  expect(placed(removed)).toEqual([2001]);
  expect(removed.race.parts.finish.version).toBe(1);
  // Priya, not yet showing the removal, places 2003 third: saved without 2002, and later places move up.
  const stale=await order(priya,{raceId:checked.race.id,version:1,order:[idOf(checked,2002),idOf(checked,2001),idOf(checked,2003)]});
  expect(stale.statusCode,stale.body).toBe(200);
  expect(placed(stale.json())).toEqual([2001,2003]);
});
test('a fixed check-in number keeps its entry, so its place follows the fix, and the new number is checked again',async()=>{
  const {sam,priya}=await start();
  await hold(sam,'check-in');
  const checked=await checkIn(sam,await screen(sam),[2001,2002]);
  const ordered=(await order(priya,{raceId:checked.race.id,version:0,order:[idOf(checked,2002),idOf(checked,2001)]})).json() as RaceScreenRead;
  const fixed=await checkIn(sam,ordered,[2001,{id:idOf(checked,2002),wristband:3045}]);
  expect(placed(fixed)).toEqual([3045,2001]);
  expect(fixed.race.parts.runners.value![1]).toMatchObject({id:idOf(checked,2002),wristband:3045,warnings:[{kind:'wrong-section',kept:false}]});
  // An entry that is not in this race is refused.
  expect((await call(sam,'/api/race-screen/R4/check-in',{raceId:fixed.race.id,version:fixed.race.parts.runners.version,runners:[{id:'gone',wristband:2009}]})).json()).toEqual({message:'Choose a runner from this race'});
});
test('Did not finish stays in the race, Didn\'t run takes the runner off, and a runner added at the finish joins it with warnings, refused at check-in as already in this race',async()=>{
  const {sam,priya}=await start();
  await hold(sam,'check-in');
  const checked=await checkIn(sam,await screen(sam),[2001,2002,2003]);
  const added=(await order(priya,{raceId:checked.race.id,version:0,order:[idOf(checked,2001)],added:[3045],keptWarnings:[3045]})).json() as RaceScreenRead;
  expect(added.race.parts.runners.value!.at(-1)).toMatchObject({wristband:3045,addedAtFinish:true,warnings:[{kind:'wrong-section',kept:true}]});
  expect(added.race.parts.runners.version).toBe(2);
  const response=await order(priya,{raceId:checked.race.id,version:1,order:[idOf(checked,2001),idOf(added,3045)],didNotFinish:[idOf(checked,2002)],didNotRun:[idOf(checked,2003)]});
  expect(response.statusCode,response.body).toBe(200);
  const settled=response.json() as RaceScreenRead;
  expect(settled.race.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband)).toEqual([2001,2002,3045]);
  expect(placed(settled)).toEqual([2001,3045]);
  expect(settled.race.parts.finish.value!.didNotFinish).toEqual([idOf(checked,2002)]);
  expect((await order(priya,{raceId:checked.race.id,version:2,added:[2001]})).json()).toEqual({message:'2001 is already in this race'});
  // The runner added at the finish is in the race: typing it at check-in is refused as already in it.
  expect((await call(sam,'/api/race-screen/R4/check-in',{raceId:settled.race.id,version:settled.race.parts.runners.version,runners:[2001,2002,3045,3045].map(wristband=>({wristband}))})).json()).toEqual({message:'3045 is already in this race'});
  // Taking every place back leaves no finishing order.
  expect((await order(priya,{raceId:checked.race.id,version:2})).json().race.parts.finish).toEqual({version:3,value:null});
});
test('one person may hold check-in, the order and the times; the order is refused in check-in\'s order and wording, as "the order"',async()=>{
  const {owner,sam,priya,ali,samId}=await start();
  for(const job of ['check-in','order','times']) expect((await hold(sam,job)).statusCode).toBe(200);
  expect((await screen(priya)).holds).toEqual({'check-in':{id:samId,name:'Sam'},order:{id:samId,name:'Sam'},times:{id:samId,name:'Sam'}});
  const checked=await checkIn(sam,await screen(sam),[2001,2002]);
  // Not the holder comes before the version.
  expect((await order(priya,{raceId:checked.race.id,version:7})).json()).toEqual({message:'Sam took over the order'});
  expect((await order(sam,{raceId:checked.race.id,version:7})).json()).toEqual({message:'Not saved - check your entries and enter it again'});
  expect((await takeOver(priya,'order')).statusCode).toBe(200);
  const first=await order(priya,{raceId:checked.race.id,version:0,order:[idOf(checked,2001)]});
  expect(first.statusCode,first.body).toBe(200);
  expect((await order(sam,{raceId:checked.race.id,version:1,order:[idOf(checked,2002)]})).json()).toEqual({message:'Priya took over the order'});
  // Writing an order nobody holds takes it.
  await call(owner,`/api/day/phones/${(await screen(priya)).holds.order!.id}/remove`,{});
  const taken=await order(ali,{raceId:checked.race.id,version:1,order:[idOf(checked,2002),idOf(checked,2001)]});
  expect(taken.statusCode,taken.body).toBe(200);
  expect((taken.json() as RaceScreenRead).holds.order!.name).toBe('Ali');
  // A saved or deleted race and a complete stage refuse it, as they do check-in.
  await call(sam,'/api/race-screen/R4/times',{raceId:checked.race.id,version:0,places:[1234,1301],keptWrong:[]});
  await call(sam,'/api/race-screen/R4/submit',{raceId:checked.race.id});
  await call(ali,'/api/race-screen/R4/submit',{raceId:checked.race.id});
  expect((await order(ali,{raceId:checked.race.id,version:2})).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  await call(owner,`/api/lead/races/${checked.race.id}/delete`,{permanent:false});
  expect((await order(ali,{raceId:checked.race.id,version:2})).json()).toEqual({message:'A lead deleted Heat 1'});
  expect((await call(owner,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  expect((await order(ali,{raceId:checked.race.id,version:2},'R16')).json()).toEqual({message:'Stage complete - ask a lead'});
});
