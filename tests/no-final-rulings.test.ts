import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import type { HomeSnapshot } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { relaySetup } from './support/relays.js';
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
test('once decided without a final the event is done for volunteers: Home shows it done, no further heat is offered and its heats need a lead',async()=>{
  const {lead,volunteer,setup,results}=await start();
  const heat=(await results()).results.leaderboard[0].raceId;
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:(await results()).results.noFinalTies[0].id,stage:'no-final',outcome:'no-run-off'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  // Any teams write answers Home as it then stands.
  const home=(await call(volunteer,'/api/teams/R19/hold',{})).json() as HomeSnapshot;
  expect(home.events.find(event=>event.code==='R4')).toMatchObject({done:true});
  // Nobody is left holding a job on it, as building a final clears them.
  const screen=await setup.screen(volunteer,'R4');
  expect(screen).toMatchObject({stageComplete:true,decidedWithoutFinal:true});
  expect(screen.holds).toEqual({});
  for(const [what,body] of [['hold',{job:'check-in'}],['check-in',{raceId:null,version:0,runners:[{wristband:2021}]}],['times',{raceId:heat,version:1,places:[900,980,1040],keptWrong:[]}]] as const) {
    const response=await call(volunteer,`/api/race-screen/R4/${what}`,body);
    expect(response.json()).toEqual({message:'Stage complete - ask a lead'});
  }
  expect((await call(lead,`/api/lead/races/${heat}/times`,{baseVersion:1,places:[920,980,1041]})).statusCode).toBe(200);
});
test('the day export has the podium from heat times and no Finals rows for an event decided without a final',async()=>{
  const {lead,results}=await start();
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:(await results()).results.noFinalTies[0].id,stage:'no-final',outcome:'no-run-off'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  const sheets=await readExcelFile((await call(lead,'/api/day/export',{})).rawPayload);
  expect(sheets[0].data.slice(1)).toEqual([['R4',null,null,null,null,null,null,null,null,2001,null,null,2011,null,null,2002]]);
  expect(sheets[1].data.filter(row=>row[0]==='R4')).toEqual([]);
});
test('a relay decided without a final locks its team list and refuses call-ups and added teams',async()=>{
  const {lead,volunteer}=await start();
  const relays=relaySetup(app);
  for(const number of [1,2,3]) await relays.team(volunteer,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));
  for(const number of [1,2,3]) {await relays.tick(volunteer,'R22',number);for(const leg of [0,1,2,3]) await relays.here(volunteer,'R22',number,leg);}
  await relays.save(volunteer,'R22',[2,1,3],[1400,1500,1700]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  expect((await call(volunteer,'/api/teams/R22/done',{legs:[2401,null,null,null]})).json()).toEqual({message:'Stage complete - ask a lead'});
  expect((await call(volunteer,'/api/teams/R22/hold',{})).json()).toEqual({message:'Stage complete - ask a lead'});
  const team=(await call(lead,'/api/lead/events/R22/results')).json().teams[0];
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:team.id})).statusCode).toBe(409);
  expect((await call(lead,'/api/lead/events/R22/call-up',{expectedHeatEntryId:'any'})).statusCode).toBe(409);
});
test('Reopen results needs a comment, clears the medals and opens the heats again, from where Heats complete builds a final',async()=>{
  const {lead,results}=await start();
  // Not decided yet: nothing to reopen.
  expect((await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Mistake'})).statusCode).toBe(409);
  const tie=(await results()).results.noFinalTies[0];
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,stage:'no-final',outcome:'no-run-off'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  expect((await results()).results.checkSheet).toMatchObject({stage:'no-final',completed:true});
  expect((await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final'})).statusCode).toBe(400);
  expect((await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:' '})).statusCode).toBe(400);
  const reopened=await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  expect(reopened.statusCode).toBe(200);
  const read=reopened.json() as EventResultsRead;
  expect(read.results).toMatchObject({status:'In progress - provisional',decidedWithoutFinal:false,inputRunning:null,medalPlaces:[],band:{lineLabel:'Qualifying line'},heatsCheckSheet:{completed:false},noFinalCheckSheet:{completed:false}});
  expect(read.results.leaderboard.slice(0,6).map(row=>[row.medalPlace,row.qualification])).toEqual(Array(6).fill([null,'Q']));
  expect(read.auditNotes[0]).toMatchObject({actor:'Aisha',action:'reopen-stage',comment:'Final fits after all',message:'Aisha reopened Results without a final - Final fits after all'});
  expect((await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Again'})).statusCode).toBe(409);
  const heats=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'});
  expect(heats.statusCode).toBe(200);
  expect(heats.json().results.finalResults).not.toBeNull();
});
test('after Reopen results, Results without a final can be chosen again',async()=>{
  const {lead,results}=await start();
  const tie=(await results()).results.noFinalTies[0];
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,stage:'no-final',outcome:'no-run-off'});
  await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect((await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Wrong event'})).statusCode).toBe(200);
  const again=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time after all'});
  expect(again.statusCode).toBe(200);
  expect(again.json().results).toMatchObject({status:'Complete',decidedWithoutFinal:true,inputRunning:{first:2001,second:2011,third:2002}});
});
/** Heats complete on R4 (its qualifying tie settled No run-off needed), then the medal tie settled from the Results without a final sheet. */
async function finalBuilt() {
  const started=await start(),{lead,results}=started;
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:(await results()).results.ties[0].id,outcome:'no-run-off'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:(await results()).results.noFinalTies[0].id,stage:'no-final',outcome:'no-run-off'});
  return {...started,final:(await results()).results.finalResults!.raceId};
}
test('after Heats complete, Results without a final discards the unrun final and its holds, and Reopen results then Heats complete builds Final 1 afresh',async()=>{
  const {lead,volunteer,setup,results,final}=await finalBuilt();
  expect((await results()).results).toMatchObject({checkSheet:{stage:'final'},heatsCheckSheet:{completed:true},noFinalCheckSheet:{stage:'no-final',mustSettleFirst:[]}});
  // Holding a job on the final does not start it.
  await setup.write(volunteer,'R4','take-over',{job:'check-in'});
  const done=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect(done.statusCode,done.body).toBe(200);
  expect(done.json().results).toMatchObject({status:'Complete',decidedWithoutFinal:true,finalResults:null,inputRunning:{first:2001,second:2011,third:2002}});
  expect((await call(lead,`/api/lead/races/${final}`)).statusCode).toBe(404);
  expect((await call(lead,'/api/lead/events/R4/deleted-races')).json()).toEqual([]);
  const screen=await setup.screen(volunteer,'R4');
  expect(screen).toMatchObject({stageComplete:true,decidedWithoutFinal:true});
  expect(screen.holds).toEqual({});
  // Reopen results puts the event back to heats open, not heats complete.
  const reopened=await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  expect(reopened.json().results).toMatchObject({status:'In progress - provisional',heatsCheckSheet:{completed:false},finalResults:null});
  const heats=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'});
  expect(heats.statusCode,heats.body).toBe(200);
  expect(heats.json().results.finalResults.raceId).not.toBe(final);
  expect((await setup.screen(volunteer,'R4')).race).toMatchObject({kind:'final',number:1});
});
test('once a finalist is marked Absent or a finishing order is recorded the option is gone and the route refuses',async()=>{
  const {lead,volunteer,setup,results}=await finalBuilt();
  const held=(await setup.write(volunteer,'R4','take-over',{job:'check-in'})).race;
  const away=await setup.write(volunteer,'R4','absent',{raceId:held.id,version:held.parts.runners.version,absent:held.final!.entries.filter(entry=>entry.wristband===2013).map(entry=>entry.finalEntryId)});
  expect((await results()).results.noFinalCheckSheet).toBeNull();
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).json()).toEqual({message:'The final has started - medals come from the final'});
  // Marked Here again, the order holder still records a finishing order.
  await setup.write(volunteer,'R4','absent',{raceId:held.id,version:away.race.parts.runners.version,absent:[]});
  expect((await results()).results.noFinalCheckSheet).not.toBeNull();
  await setup.order(volunteer,'R4',[2001,2011,2002,2012,2003,2013]);
  const refused=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect(refused.statusCode).toBe(409);
});
test('deleting a started final offers it again; the deleted final stays restorable once the results are reopened, and the next final is Final 2',async()=>{
  const {lead,volunteer,setup,results,final}=await finalBuilt();
  await setup.order(volunteer,'R4',[2001,2011,2002,2012,2003,2013]);
  expect((await results()).results.noFinalCheckSheet).toBeNull();
  expect((await call(lead,`/api/lead/races/${final}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await results()).results.noFinalCheckSheet).toMatchObject({stage:'no-final'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  expect((await call(lead,'/api/lead/events/R4/deleted-races')).json().map((race:{id:string})=>race.id)).toEqual([final]);
  // Decided without a final, the event takes no final back until its results are reopened.
  expect((await call(lead,`/api/lead/races/${final}/restore`,{})).json()).toEqual({message:'Results were decided without a final - reopen results first'});
  await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect((await setup.screen(volunteer,'R4')).race).toMatchObject({kind:'final',number:2});
});
test('a relay final with a team added and no child marked here is discarded; once a child is marked here it has started',async()=>{
  const {lead,volunteer}=await start();
  const relays=relaySetup(app);
  for(const number of [1,2,3,4]) await relays.team(volunteer,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));
  for(const number of [1,2,3]) {await relays.tick(volunteer,'R22',number);for(const leg of [0,1,2,3]) await relays.here(volunteer,'R22',number,leg);}
  await relays.save(volunteer,'R22',[2,1,3],[1400,1500,1700]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const team4=(await call(lead,'/api/lead/events/R22/results')).json().teams.find((team:{number:number})=>team.number===4).id;
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:team4})).statusCode).toBe(200);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  await call(lead,'/api/lead/events/R22/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  const rebuilt=await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'});
  expect(rebuilt.json().results.finalResults.runners.map((entry:{team:{number:number}})=>entry.team.number)).toEqual([2,1,3]);
  await relays.here(volunteer,'R22',2,0);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(409);
});
