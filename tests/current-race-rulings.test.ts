import { afterEach,expect,test } from 'vitest';
import { isRunner } from '../src/shared/races.js';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** R1 (heats) with Heat 1 saved by Jo, who holds every job; Aisha is a lead. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'current-owner',resetTestDay:true});
  const people=await signInOwner(app,'current-owner','Owner');await call(people.owner.token,'/api/day/confirm-events',{});
  const jo=(await people.volunteer('Jo')).token,lead=(await people.volunteer('Aisha')).token;await call(lead,'/api/become-lead',{code:people.day.leadCode});
  const setup=raceSetup(app),heat1=await setup.record(jo,'R1',[1001,1002,1003],[1000,1100,1200]);
  const revision=async()=>(await call(people.owner.token,'/api/day')).json().revision;
  return {jo,lead,setup,heat1,revision,screen:(code='R1')=>setup.screen(jo,code)};
}
test('a re-run becomes the current race with its check-in pre-filled and Order and Times empty, and the empty next heat comes back once it is saved',async()=>{
  const {jo,lead,setup,heat1,screen}=await start();
  expect((await screen()).race).toMatchObject({id:null,number:2});
  const rerun=await call(lead,`/api/lead/races/${heat1.id}/re-run`,{comment:'False start'});expect(rerun.statusCode,rerun.body).toBe(200);
  const current=(await screen()).race;
  expect(current).toMatchObject({id:rerun.json().newRaceId,number:2,state:'in progress',parts:{finish:{value:null},times:{value:null}}});
  expect(current.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband)).toEqual([1001,1002,1003]);
  // The check-in holder can change the pre-filled list.
  expect((await setup.checkIn(jo,'R1',[1001,1002])).parts.runners.value!.filter(isRunner).map(runner=>runner.wristband)).toEqual([1001,1002]);
  await setup.order(jo,'R1',[1002,1001]);await setup.times(jo,'R1',[1000,1100]);await setup.submit(jo,'R1');
  expect((await screen()).race).toMatchObject({id:null,number:3});
});
test('Re-run is refused while the current race has check-ins, and changes nothing',async()=>{
  const {jo,lead,setup,heat1,revision,screen}=await start();
  await setup.checkIn(jo,'R1',[1004]);
  const before=await revision();
  const refused=await call(lead,`/api/lead/races/${heat1.id}/re-run`,{});
  expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe("Heat 2 is in progress - re-run after it's saved");
  expect(await revision()).toBe(before);
  expect((await screen()).race.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband)).toEqual([1004]);
  // A race not saved yet is the current race, so it is refused the same way.
  const current=(await screen()).race.id!;
  expect((await call(lead,`/api/lead/races/${current}/re-run`,{})).json().message).toBe("Heat 2 is in progress - re-run after it's saved");
});
test('race numbers are never reused: delete an unsaved Heat 2 and Heat 3 shows next; Restore brings Heat 2 back as the current race, entries as they were',async()=>{
  const {jo,lead,setup,screen}=await start();
  const heat2=await setup.checkIn(jo,'R1',[1004,1005]);await setup.order(jo,'R1',[1005]);
  expect((await call(lead,`/api/lead/races/${heat2.id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await screen()).race).toMatchObject({id:null,number:3});
  const restored=await call(lead,`/api/lead/races/${heat2.id}/restore`,{});expect(restored.statusCode,restored.body).toBe(200);
  const current=(await screen()).race;
  expect(current).toMatchObject({id:heat2.id,number:2,state:'in progress'});
  expect(current.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband)).toEqual([1004,1005]);
  expect(current.parts.finish.value?.order).toEqual([current.parts.runners.value![1].id]);
  await setup.order(jo,'R1',[1005,1004]);await setup.times(jo,'R1',[1000,1100]);await setup.submit(jo,'R1');
  expect((await screen()).race).toMatchObject({id:null,number:3});
});
test('Restore of a race deleted before it was saved is refused while the current race has check-ins; a saved race restores as today',async()=>{
  const {jo,lead,setup,heat1,revision,screen}=await start();
  const heat2=await setup.checkIn(jo,'R1',[1004]);
  await call(lead,`/api/lead/races/${heat2.id}/delete`,{permanent:false});
  const heat3=await setup.checkIn(jo,'R1',[1005]);expect(heat3.number).toBe(3);
  const before=await revision();
  const refused=await call(lead,`/api/lead/races/${heat2.id}/restore`,{});
  expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe("Heat 3 is in progress - restore after it's saved");
  expect(await revision()).toBe(before);
  // A saved race is not the current race when it comes back, so it restores whatever is in progress.
  await call(lead,`/api/lead/races/${heat1.id}/delete`,{permanent:false});
  expect((await call(lead,`/api/lead/races/${heat1.id}/restore`,{})).statusCode).toBe(200);
  expect((await screen()).race.id).toBe(heat3.id);
  // With Heat 3's last runner taken off, Heat 2 can come back, and is the current race; the empty Heat 3 follows it.
  await setup.checkIn(jo,'R1',[]);
  expect((await call(lead,`/api/lead/races/${heat2.id}/restore`,{})).statusCode).toBe(200);
  expect((await screen()).race.id).toBe(heat2.id);
  await setup.order(jo,'R1',[1004]);await setup.times(jo,'R1',[1000]);await setup.submit(jo,'R1');
  expect((await screen()).race).toMatchObject({id:heat3.id,number:3});
});
test('Heats complete waits on a heat with check-ins, ignores an empty current heat, and the event shows its Final',async()=>{
  const {jo,lead,setup,screen}=await start();
  const heat2=await setup.checkIn(jo,'R1',[1004,1005,1006,1007]);
  const sheet=(await call(lead,'/api/lead/events/R1/results')).json().results.heatsCheckSheet;
  expect(sheet.mustSettleFirst).toEqual([{id:`race:${heat2.id}`,kind:'incomplete',raceId:heat2.id,message:'Heat 2 is in progress (4 checked in) - submit it or delete it'}]);
  expect((await call(lead,'/api/lead/events/R1/complete-stage',{stage:'heats'})).json().message).toBe('Must settle first - open the completion check sheet');
  // Every runner taken off: Heat 2 is the empty current heat again, and heats complete over it.
  await setup.checkIn(jo,'R1',[]);
  expect((await call(lead,'/api/lead/events/R1/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=(await screen()).race;
  expect(final).toMatchObject({kind:'final',state:'in progress'});
  expect(final.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband).sort()).toEqual([1001,1002,1003]);
});
test('Heats complete with the empty next heat never stored',async()=>{
  const {lead,screen}=await start();
  expect((await screen()).race).toMatchObject({id:null,kind:'heat',number:2});
  expect((await call(lead,'/api/lead/events/R1/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect((await screen()).race).toMatchObject({kind:'final'});
});
test('Delete, Re-run and Restore leave the holds as they are',async()=>{
  const {jo,lead,setup,heat1,screen}=await start();
  const holds=(await screen()).holds;expect(Object.keys(holds).sort()).toEqual(['check-in','order','times']);
  const heat2=await setup.checkIn(jo,'R1',[1004]);
  await call(lead,`/api/lead/races/${heat2.id}/delete`,{permanent:false});expect((await screen()).holds).toEqual(holds);
  await call(lead,`/api/lead/races/${heat1.id}/re-run`,{});expect((await screen()).holds).toEqual(holds);
  await call(lead,`/api/lead/races/${(await screen()).race.id}/delete`,{permanent:false});
  await call(lead,`/api/lead/races/${heat2.id}/restore`,{});expect((await screen()).race.id).toBe(heat2.id);expect((await screen()).holds).toEqual(holds);
});
