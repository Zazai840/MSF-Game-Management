import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RacesRead } from '../src/shared/race-flow.js';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** R1 (heats) on a fresh day: Jo and Sam volunteer, Aisha is a lead. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'numbers-owner',resetTestDay:true});
  const people=await signInOwner(app,'numbers-owner','Owner');await call(people.owner.token,'/api/day/confirm-events',{});
  const jo=(await people.volunteer('Jo')).token,sam=(await people.volunteer('Sam')).token,lead=(await people.volunteer('Aisha')).token;
  await call(lead,'/api/become-lead',{code:people.day.leadCode});
  const group=async()=>(await call(jo,'/api/races')).json<RacesRead>().groups.find(item=>item.event.code==='R1')!;
  return {jo,sam,lead,setup:raceSetup(app),group,remove:(id:string)=>call(lead,`/api/lead/races/${id}/delete`,{permanent:false})};
}
test('deleting the newest heat frees its number: the next heat, "+" and the "Heat N is next" check take it again',async()=>{
  const {jo,sam,setup,group,remove}=await start();
  const mistake=await setup.checkIn(jo,'R1',[1001]);
  expect((await remove(mistake.id)).statusCode).toBe(200);
  expect((await group()).nextHeat).toBe(1);
  expect((await call(jo,'/api/races',{eventCode:'R1',kind:'heat',number:2})).json()).toMatchObject({message:'Heat 1 is next',next:1});
  // Two phones press "+" at once: one makes Heat 1, the other opens it.
  const [first,second]=await Promise.all([jo,sam].map(token=>call(token,'/api/races',{eventCode:'R1',kind:'heat',number:1})));
  expect(first.json().race).toMatchObject({kind:'heat',number:1});
  expect(second.json().race.id).toBe(first.json().race.id);
  expect(first.json().race.id).not.toBe(mistake.id);
  expect((await group()).races.map(race=>[race.id,race.number])).toEqual([[first.json().race.id,1]]);
  // A phone still inside the deleted heat is told so, by that heat's number.
  expect((await call(sam,`/api/races/${mistake.id}`)).json().message).toBe('A lead deleted Heat 1');
});
test('restoring a heat whose number a live heat now has brings it back with the next number, and Notes say so; with no clash it keeps its own',async()=>{
  const {jo,lead,setup,group,remove}=await start();
  const mistake=await setup.checkIn(jo,'R1',[1001]);await remove(mistake.id);
  const heat1=await setup.checkIn(jo,'R1',[1002]);expect(heat1.number).toBe(1);
  const restored=await call(lead,`/api/lead/races/${mistake.id}/restore`,{});
  expect(restored.statusCode,restored.body).toBe(200);
  expect(restored.json().auditNotes[0].message).toBe('Aisha restored Heat 1 as Heat 2');
  expect((await group()).races.map(race=>[race.id,race.number])).toEqual([[heat1.id,1],[mistake.id,2]]);
  await remove(heat1.id);
  expect((await call(lead,`/api/lead/races/${heat1.id}/restore`,{})).json().auditNotes[0].message).toBe('Aisha restored Heat 1');
  expect((await group()).races.map(race=>[race.id,race.number])).toEqual([[heat1.id,1],[mistake.id,2]]);
});
test('a deleted middle heat leaves its gap: with Heats 1-3 and Heat 2 deleted, the next heat is Heat 4',async()=>{
  const {jo,setup,group,remove}=await start();
  const heats=[];
  for(const wristband of [1001,1002,1003]) heats.push(await setup.record(jo,'R1',[wristband],[1000]));
  expect(heats.map(heat=>heat.number)).toEqual([1,2,3]);
  await remove(heats[1]!.id);
  expect((await group()).nextHeat).toBe(4);
  expect((await setup.checkIn(jo,'R1',[1004])).number).toBe(4);
});
test('a race stores when it was deleted, by a lead or by a re-run; Deleted races show it, and a restore clears it',async()=>{
  const {jo,lead,setup,remove}=await start();
  const deleted=async()=>(await call(lead,'/api/lead/events/R1/deleted-races')).json<{id:string;deletedAt:string|null}[]>().map(race=>[race.id,race.deletedAt]);
  const mistake=await setup.checkIn(jo,'R1',[1001]),before=Date.now();
  await remove(mistake.id);
  const [[,at]]=await deleted() as [[string,string]];
  expect(Date.parse(at)).toBeGreaterThanOrEqual(before-1000);expect(Date.parse(at)).toBeLessThanOrEqual(Date.now()+1000);
  const heat=await setup.record(jo,'R1',[1002],[1200]);
  expect((await call(lead,`/api/lead/races/${heat.id}/re-run`,{})).statusCode).toBe(200);
  const rows=await deleted();
  expect(rows.map(([id])=>id).sort()).toEqual([mistake.id,heat.id].sort());
  expect(rows.every(([,at])=>typeof at==='string')).toBe(true);
  await call(lead,`/api/lead/races/${mistake.id}/restore`,{});
  expect((await call(lead,`/api/lead/races/${mistake.id}`)).json().race.deletedAt).toBeNull();
});
