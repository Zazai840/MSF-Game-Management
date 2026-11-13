import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
/**
 * Boy Cubs 60m (R3) with three heats run and the final made. Fastest first: 1023, 1066, 1088, 1005, 1012, 1110 (the
 * line-up), then 1135, 1047, 1031, 1101, 1092. Heat 2 holds 1066, 1005, 1110 and 1031.
 */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'line-up-owner',resetTestDay:true});
  const people=await signInOwner(app,'line-up-owner','Owner');
  const volunteer=(await people.volunteer('Ahmed')).token,lead=(await people.lead('Aisha')).token,setup=raceSetup(app);
  const heats=[
    await setup.record(volunteer,'R3',[1023,1088,1012,1135],[901,925,948,977]),
    await setup.record(volunteer,'R3',[1066,1005,1110,1031],[912,939,961,1003]),
    await setup.record(volunteer,'R3',[1047,1101,1092],[990,1024,1048])
  ];
  const final=(await setup.makeFinal(lead,'R3')).race.id;
  /** The line-up as the start line reads it: each finalist's wristband with its mark, in seed order. */
  const lineUp=async()=>{
    const {race}=(await call(volunteer,`/api/races/${final}`)).json() as RaceFlowRead,here=new Set(race.parts.runners.value!.map(runner=>runner.id));
    return race.final!.entries.map(entry=>[entry.wristband,here.has(entry.finalEntryId)?'here':entry.absent?'absent':null]);
  };
  const remove=(heat:{id:string},permanent=false)=>call(lead,`/api/lead/races/${heat.id}/delete`,{permanent});
  const restore=(heat:{id:string})=>call(lead,`/api/lead/races/${heat.id}/restore`,{});
  return {volunteer,lead,setup,heats,final,lineUp,remove,restore};
}
const unmarked=(wristbands:number[])=>wristbands.map(wristband=>[wristband,null]);
test('a heat deleted before the final starts: the line-up is the fastest 6 of the live heats, and finalists who stay keep Here and Absent',async()=>{
  const {volunteer,setup,heats,lineUp,remove}=await start();
  await setup.attend(volunteer,'R3',[1023],[1088]);
  expect(await lineUp()).toEqual([[1023,'here'],[1066,null],[1088,'absent'],[1005,null],[1012,null],[1110,null]]);
  expect((await remove(heats[1])).statusCode).toBe(200);
  // Nobody of the deleted Heat 2 is a finalist; the new finalists 1135, 1047 and 1101 have no mark.
  expect(await lineUp()).toEqual([[1023,'here'],[1088,'absent'],[1012,null],[1135,null],[1047,null],[1101,null]]);
});
test('a heat restored before the final starts: its fast runners are finalists again with no mark, and the marks of those who stay are kept',async()=>{
  const {volunteer,setup,heats,lineUp,remove,restore}=await start();
  await remove(heats[1]);
  await setup.attend(volunteer,'R3',[1023,1135],[1088]);
  expect((await restore(heats[1])).statusCode).toBe(200);
  expect(await lineUp()).toEqual([[1023,'here'],[1066,null],[1088,'absent'],[1005,null],[1012,null],[1110,null]]);
});
test('a heat deleted for good makes the line-up again by the same rule',async()=>{
  const {heats,lineUp,remove}=await start();
  expect((await remove(heats[1],true)).statusCode).toBe(200);
  expect(await lineUp()).toEqual(unmarked([1023,1088,1012,1135,1047,1101]));
});
test.each(['a finishing order','a saved final'])('a final started with %s keeps its line-up when a heat is deleted or restored',async started=>{
  const {volunteer,setup,heats,lineUp,remove,restore}=await start();
  await setup.attend(volunteer,'R3',undefined,[1088]);
  await setup.order(volunteer,'R3',[1023,1066,1005,1012,1110]);
  if(started==='a saved final') await setup.submit(volunteer,'R3');
  const before=await lineUp();
  expect(before).toEqual([[1023,'here'],[1066,'here'],[1088,'absent'],[1005,'here'],[1012,'here'],[1110,'here']]);
  expect((await remove(heats[1])).statusCode).toBe(200);
  expect(await lineUp()).toEqual(before);
  expect((await restore(heats[1])).statusCode).toBe(200);
  expect(await lineUp()).toEqual(before);
});
test('a heat with no saved times is not restored while the heats are complete: "Reopen the heats first"',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'line-up-owner',resetTestDay:true});
  const people=await signInOwner(app,'line-up-owner','Owner');
  const volunteer=(await people.volunteer('Ahmed')).token,lead=(await people.lead('Aisha')).token,setup=raceSetup(app);
  await setup.record(volunteer,'R3',[1023,1088,1012],[901,925,948]);
  const unsaved=await setup.checkIn(volunteer,'R3',[1066,1005]);
  expect((await call(lead,`/api/lead/races/${unsaved.id}/delete`,{permanent:false})).statusCode).toBe(200);
  const final=(await setup.makeFinal(lead,'R3')).race;
  const refused=await call(lead,`/api/lead/races/${unsaved.id}/restore`,{});
  expect([refused.statusCode,refused.json()]).toEqual([409,{message:'Reopen the heats first'}]);
  // The heat stays in Deleted races and the final is as it was.
  expect((await call(lead,'/api/lead/events/R3/deleted-races')).json().map((race:{id:string})=>race.id)).toEqual([unsaved.id]);
  expect(((await call(volunteer,`/api/races/${final.id}`)).json() as RaceFlowRead).race.final!.entries.map(entry=>entry.wristband)).toEqual([1023,1088,1012]);
  // With the heats open again it is restored as any heat is.
  expect((await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Heat 2 to finish'})).statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${unsaved.id}/restore`,{})).statusCode).toBe(200);
});
