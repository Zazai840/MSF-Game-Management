import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
/** R3 with its heats saved and its final made by a lead. */
async function start(fields:number[][]) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'last-heat-owner',resetTestDay:true});
  const people=await signInOwner(app,'last-heat-owner','Owner');
  const volunteer=(await people.volunteer('Ahmed')).token,lead=(await people.volunteer('Aisha')).token;await call(lead,'/api/become-lead',{code:people.day.leadCode});
  const setup=raceSetup(app),heats=[];
  for(const [heat,runners] of fields.entries()) heats.push(await setup.record(volunteer,'R3',runners,runners.map((_,place)=>900+heat*7+place*20)));
  const final=(await setup.makeFinal(lead,'R3')).race;
  return {volunteer,lead,heats,final,setup};
}
const group=async(token:string)=>(await call(token,'/api/races')).json().groups.find((group:any)=>group.event.code==='R3');
test('the last live heat is deleted with no started final: the heats are open, "+" makes Heat 1 and the final goes for good',async()=>{
  const {lead,volunteer,heats,final}=await start([[1023,1088],[1066,1005]]);
  // A heat that is not the last one leaves the event where it is.
  expect((await call(lead,`/api/lead/races/${heats[0].id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect(await group(lead)).toMatchObject({heatsOpen:false});expect((await group(lead)).races.map((race:any)=>race.kind)).toEqual(['heat','final']);
  const deleted=await call(lead,`/api/lead/races/${heats[1].id}/delete`,{permanent:false});expect(deleted.statusCode).toBe(200);
  expect(deleted.json().results).toMatchObject({status:'Not started',finalResults:null});
  expect(await group(lead)).toMatchObject({heatsOpen:true,nextHeat:1,finalAvailable:false,races:[]});
  // The final is removed as Reopen heats removes it: not into Deleted races, and a phone on it finds it gone.
  expect((await call(lead,'/api/lead/events/R3/deleted-races')).json().map((race:any)=>race.kind)).toEqual(['heat','heat']);
  expect((await call(volunteer,`/api/races/${final.id}`)).json()).toMatchObject({gone:true});
  const made=await call(volunteer,'/api/races',{eventCode:'R3',kind:'heat',number:1});expect(made.statusCode).toBe(200);expect(made.json().race).toMatchObject({kind:'heat',number:1});
});
test('Restore of the last heat puts the heats back, and "+ Final" makes the final again',async()=>{
  const {lead,heats,final}=await start([[1023,1088]]);
  expect((await call(lead,`/api/lead/races/${heats[0].id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${heats[0].id}/restore`,{})).statusCode).toBe(200);
  expect(await group(lead)).toMatchObject({heatsOpen:true,nextHeat:2,finalAvailable:true,races:[{kind:'heat',number:1,state:'saved'}]});
  const remade=await call(lead,'/api/races',{eventCode:'R3',kind:'final'});expect(remade.statusCode).toBe(200);expect(remade.json().race.id).not.toBe(final.id);
  expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries.map((entry:any)=>entry.heatWristband)).toEqual([1023,1088]);
});
test.each([false,true])('with a started final the delete of the last live heat is refused with "Delete the Final first" and nothing changes (for good: %s)',async permanent=>{
  const {lead,volunteer,heats,final,setup}=await start([[1023,1088]]);
  await setup.attend(volunteer,'R3',[1023],[1088]);
  const before=await group(lead),revision=(await call(lead,'/api/races')).json().revision;
  const refused=await call(lead,`/api/lead/races/${heats[0].id}/delete`,{permanent});
  expect([refused.statusCode,refused.json().message]).toEqual([409,'Delete the Final first']);
  expect(await group(lead)).toEqual(before);expect((await call(lead,'/api/races')).json().revision).toBe(revision);
  expect((await call(lead,'/api/lead/events/R3/deleted-races')).json()).toEqual([]);
  // Once the final is deleted the heat can go, and the event starts again.
  expect((await call(lead,`/api/lead/races/${final.id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${heats[0].id}/delete`,{permanent})).statusCode).toBe(200);
  expect(await group(lead)).toMatchObject({heatsOpen:true,nextHeat:1,races:[]});
});
