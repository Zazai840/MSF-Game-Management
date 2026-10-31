import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import { groupDone,type RaceFlowRead,type RaceGroup } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { relayFlowSetup } from './support/relays.js';
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
/** R4's event group as the races list shows it now. */
const group=async(token:string)=>((await call(token,'/api/races')).json().groups as RaceGroup[]).find(item=>item.event.code==='R4')!;
/** A Here / Absent list on the final, at the version the phone sees now: these final entries Absent, everyone else Here. */
async function absent(token:string,id:string,which:(entries:NonNullable<RaceFlowRead['race']['final']>['entries'])=>string[]=()=>[]) {
  const {race}=(await call(token,`/api/races/${id}`)).json() as RaceFlowRead;
  const marked=which(race.final!.entries),here=race.final!.entries.map(entry=>entry.finalEntryId).filter(entry=>!marked.includes(entry));
  const response=await call(token,`/api/races/${id}/absent`,{raceId:id,version:race.parts.runners.version,here,absent:marked});
  expect(response.statusCode,response.body).toBe(200);
  return response.json() as RaceFlowRead;
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
test('once decided without a final the event is done for volunteers: Races shows it done, no further heat is offered and its heats need a lead',async()=>{
  const {lead,volunteer,results}=await start();
  const heat=(await results()).results.leaderboard[0].raceId;
  await call(lead,'/api/lead/events/R4/settle-tie',{tieId:(await results()).results.noFinalTies[0].id,stage:'no-final',outcome:'no-run-off'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  const races=await group(volunteer);
  expect(groupDone(races)).toBe(true);
  expect((await call(volunteer,'/api/races',{eventCode:'R4',kind:'heat',number:races.nextHeat})).json()).toEqual({message:'Girl Cubs heats are finished. Ask a lead to add another heat.'});
  expect((await call(lead,'/api/races',{eventCode:'R4',kind:'final'})).statusCode).toBe(409);
  expect((await call(volunteer,`/api/races/${heat}/times`,{raceId:heat,version:1,places:[900,980,1040],keptWrong:[]})).json()).toEqual({message:'Girl Cubs heats are finished. Ask a lead to change this race.'});
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
  const relays=relayFlowSetup(app);
  for(const number of [1,2,3]) await relays.team(volunteer,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));
  for(const number of [1,2,3]) {await relays.tick(volunteer,'R22',number);for(const leg of [0,1,2,3]) await relays.here(volunteer,'R22',number,leg);}
  await relays.save(volunteer,'R22',[2,1,3],[1400,1500,1700]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  const relay=(await call(volunteer,'/api/races')).json().groups.find((group:{event:{code:string}})=>group.event.code==='R22').event.id;
  expect((await call(volunteer,`/api/relays/${relay}/teams`,{legs:[2401,null,null,null]})).json()).toEqual({message:'Girl Cubs heats are finished. Ask a lead to change the teams.'});
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
test('after Heats complete, Results without a final discards the unrun final, and Reopen results then Heats complete builds Final 1 afresh',async()=>{
  const {lead,volunteer,setup,results,final}=await finalBuilt();
  expect((await results()).results).toMatchObject({checkSheet:{stage:'final'},heatsCheckSheet:{completed:true},noFinalCheckSheet:{stage:'no-final',mustSettleFirst:[]}});
  // Opening the final does not start it.
  expect((await call(volunteer,`/api/races/${final}`)).statusCode).toBe(200);
  const done=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect(done.statusCode,done.body).toBe(200);
  expect(done.json().results).toMatchObject({status:'Complete',decidedWithoutFinal:true,finalResults:null,inputRunning:{first:2001,second:2011,third:2002}});
  expect((await call(lead,`/api/lead/races/${final}`)).statusCode).toBe(404);
  expect((await call(lead,'/api/lead/events/R4/deleted-races')).json()).toEqual([]);
  expect(await group(volunteer)).toMatchObject({finalAvailable:false});
  expect((await group(volunteer)).races.some(race=>race.kind==='final')).toBe(false);
  // Reopen results puts the event back to heats open, not heats complete.
  const reopened=await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  expect(reopened.json().results).toMatchObject({status:'In progress - provisional',heatsCheckSheet:{completed:false},finalResults:null});
  const heats=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'});
  expect(heats.statusCode,heats.body).toBe(200);
  expect(heats.json().results.finalResults.raceId).not.toBe(final);
  expect((await setup.screen(volunteer,'R4')).race).toMatchObject({kind:'final',number:1});
});
test('once a finalist is marked Absent then Here the option stays gone and the route refuses',async()=>{
  const {lead,volunteer,results,final}=await finalBuilt();
  await absent(volunteer,final,entries=>entries.filter(entry=>entry.wristband===2013).map(entry=>entry.finalEntryId));
  expect((await results()).results.noFinalCheckSheet).toBeNull();
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).json()).toEqual({message:'The final has started - medals come from the final'});
  // Returning the absent finalist must not make Results without a final available again.
  await absent(volunteer,final);
  expect((await results()).results).toMatchObject({noFinalCheckSheet:null,finalResults:{started:true}});
  const refused=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect(refused.statusCode).toBe(409);
});
test('publishing every individual finalist Here starts the final and retains the marker through absence and restart',async()=>{
  const {lead,volunteer,results,final}=await finalBuilt();
  expect((await results()).results).toMatchObject({noFinalCheckSheet:{stage:'no-final'},finalResults:{started:false}});
  await absent(volunteer,final);
  expect((await results()).results).toMatchObject({noFinalCheckSheet:null,finalResults:{started:true,hasRun:false}});
  await absent(volunteer,final,entries=>entries.map(entry=>entry.finalEntryId));
  expect((await results()).results.finalResults!.entries.every(entry=>entry.wasHere && entry.absent)).toBe(true);
  await absent(volunteer,final);
  await app.close();
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'no-final-owner'});
  const restarted=(await results()).results;
  expect(restarted).toMatchObject({noFinalCheckSheet:null,finalResults:{started:true,hasRun:false}});
  expect(restarted.finalResults!.entries.every(entry=>entry.wasHere && !entry.absent)).toBe(true);
  const refused=await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'});
  expect(refused.statusCode).toBe(409);
  expect(refused.json()).toEqual({message:'The final has started - medals come from the final'});
});
test.each(['Here','Absent','order','DNF'])('heats cannot reopen after final %s, preserving the line-up, audit notes and revision',async(kind)=>{
  const {owner,lead,volunteer,setup,results,final}=await finalBuilt();
  if(kind==='Here' || kind==='Absent') {
    await absent(volunteer,final,entries=>kind==='Absent'?entries.map(entry=>entry.finalEntryId):[]);
  } else {
    const runners=[2001,2011,2002,2012,2003,2013];
    await setup.attend(volunteer,'R4');await setup.order(volunteer,'R4',kind==='order'?runners:[],{didNotFinish:kind==='DNF'?runners:[]});
  }
  const before=await results(),screen=await setup.screen(volunteer,'R4'),revision=(await call(owner,'/api/day')).json().revision;
  expect(before.results.finalResults).toMatchObject({started:true,hasRun:false});
  const refused=await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'heats',comment:'Recheck heats'});
  expect(refused.statusCode).toBe(409);
  expect(refused.json()).toEqual({message:'The final has started - heats cannot be reopened'});
  expect(await results()).toEqual(before);
  expect(await setup.screen(volunteer,'R4')).toEqual(screen);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
});
test('deleting a started final offers it again; the deleted final stays restorable once the results are reopened, and the next final is Final 1 again',async()=>{
  const {lead,volunteer,setup,results,final}=await finalBuilt();
  await setup.attend(volunteer,'R4');await setup.order(volunteer,'R4',[2001,2011,2002,2012,2003,2013]);
  expect((await results()).results.noFinalCheckSheet).toBeNull();
  expect((await call(lead,`/api/lead/races/${final}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await results()).results.noFinalCheckSheet).toMatchObject({stage:'no-final'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  expect((await call(lead,'/api/lead/events/R4/deleted-races')).json().map((race:{id:string})=>race.id)).toEqual([final]);
  // Decided without a final, the event takes no final back until its results are reopened.
  expect((await call(lead,`/api/lead/races/${final}/restore`,{})).json()).toEqual({message:'Results were decided without a final - reopen results first'});
  await call(lead,'/api/lead/events/R4/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  expect((await call(lead,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect((await setup.screen(volunteer,'R4')).race).toMatchObject({kind:'final',number:1});
});
test('a relay final with a team added and no child marked here is discarded; once a team is marked Here it has started',async()=>{
  const {lead,volunteer}=await start();
  const relays=relayFlowSetup(app);
  for(const number of [1,2,3,4]) await relays.team(volunteer,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));
  for(const number of [1,2,3]) {await relays.tick(volunteer,'R22',number);for(const leg of [0,1,2,3]) await relays.here(volunteer,'R22',number,leg);}
  await relays.save(volunteer,'R22',[2,1,3],[1400,1500,1700]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const team4=(await call(lead,'/api/lead/events/R22/results')).json().teams.find((team:{number:number})=>team.number===4).id;
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:team4})).statusCode).toBe(200);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(200);
  await call(lead,'/api/lead/events/R22/reopen-stage',{stage:'no-final',comment:'Final fits after all'});
  const rebuilt=await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'});
  // Rebuilt from the heats alone: the added team is gone, and nobody runs it until marked Here.
  expect(rebuilt.json().results.finalResults.entries.map((entry:{runner:{team:{number:number}}})=>entry.runner.team.number)).toEqual([2,1,3]);
  expect(rebuilt.json().results.finalResults.additionalEntries).toEqual([]);
  const final=(await relays.race(volunteer,'R22'))!;
  await relays.post(volunteer,`/api/races/${final.race.id}/teams/${final.race.final!.entries.find(entry=>entry.team?.number===2)!.team!.id}/absent`,{mark:'here'});
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'no-final',comment:'Out of time'})).statusCode).toBe(409);
});
