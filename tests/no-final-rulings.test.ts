import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** Girl Cubs 60m (R4) with two heats run: a tie at 9.80 between 2002 and 2012 for 3rd and 4th. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'no-final-owner',resetTestDay:true});
  const people=await signInOwner(app,'no-final-owner','Owner');await call(people.owner.token,'/api/day/confirm-events',{});
  const volunteer=(await people.volunteer('Ahmed')).token,lead=(await people.lead('Aisha')).token;
  const setup=raceSetup(app);
  await setup.record(volunteer,'R4',[2001,2002,2003],[920,980,1040]);
  await setup.record(volunteer,'R4',[2011,2012,2013],[935,980,1060]);
  const results=async()=>(await call(lead,'/api/lead/events/R4/results')).json() as EventResultsRead;
  return {owner:people.owner.token as string,lead,volunteer,setup,results};
}
test('a lead awards medals from heat times with a comment, after settling a qualifying tie that now decides 3rd',async()=>{
  const {owner,lead,results}=await start();
  const tie=(await results()).results.ties[0];
  expect((await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,outcome:'no-run-off'})).statusCode).toBe(200);
  const before=(await results()).results;
  expect(before.ties).toEqual([]);
  expect(before.noFinalCheckSheet?.mustSettleFirst).toMatchObject([{kind:'tie',tieId:tie.id}]);
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(409);
  const settled=await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,stage:'no-final',outcome:'decided',comment:'Photo finish',order:[...before.noFinalTies[0].entries].reverse().map(({raceId,entryId})=>({raceId,entryId}))});
  expect(settled.statusCode).toBe(200);
  expect(settled.json().results.noFinalCheckSheet.mustSettleFirst).toEqual([]);
  const revision=(await call(owner,'/api/day')).json().revision;
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final'})).statusCode).toBe(400);
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:' '})).statusCode).toBe(400);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  const done=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect(done.statusCode).toBe(200);
  const read=done.json() as EventResultsRead;
  expect(read.results).toMatchObject({status:'Complete',decidedWithoutFinal:true,noFinalCheckSheet:null,heatsCheckSheet:null,finalResults:null,band:{lineLabel:'Medal line'},inputRunning:{eventCode:'R4',first:2001,second:2011,third:2012}});
  expect(read.results.leaderboard.slice(0,4).map(row=>[row.wristband,row.medalPlace,row.qualification])).toEqual([[2001,1,null],[2011,2,null],[2012,3,null],[2002,null,null]]);
  expect(read.auditNotes[0]).toMatchObject({actor:'Aisha',action:'complete-stage',comment:'Out of time',message:'Aisha marked Results without a final - Out of time'});
  const list=(await call(lead,'/api/lead/results')).json();
  expect(list.groups.flatMap((group:any)=>group.events).find((item:any)=>item.event.code==='R4')).toMatchObject({status:'Complete',decidedWithoutFinal:true});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Again'})).statusCode).toBe(409);
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(409);
});
test('No run-off needed chosen on the Results without a final sheet is judged against medal places, so the tie stays settled there',async()=>{
  const {lead,results}=await start();
  const tie=(await results()).results.noFinalTies[0];
  const settled=await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,stage:'no-final',outcome:'no-run-off'});
  expect(settled.statusCode).toBe(200);
  expect(settled.json().results.noFinalCheckSheet.mustSettleFirst).toEqual([]);
  expect(settled.json().results.noFinalCheckSheet.creates.map((place:{wristband:number})=>place.wristband)).toEqual([2001,2011,2002]);
});
test('only a lead may choose it, and never on a timed event',async()=>{
  const {lead,volunteer,setup}=await start();
  expect((await call(volunteer,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(403);
  await setup.record(volunteer,'R16',[2001],[1000]);
  expect((await call(lead,'/api/lead/events/R16/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(409);
});
