import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start(fields:number[][]=[[1023,1088,1012,1135,1047,1101],[1066,1005,1110,1031,1092]]) {
 app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-owner',resetTestDay:true});
 const people=await signInOwner(app,'final-owner','Owner'),owner=people.owner,day=people.day;await call(owner.token,'/api/day/confirm-events',{});
 const signInAs=async(name:string)=>(await people.volunteer(name)).token;
 const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
 const heats=[];const times=[[901,925,948,977,990,1024],[912,939,961,1003,1048]];
 const setup=raceSetup(app);
 for(const [i,runners] of fields.entries()) heats.push(await setup.record(volunteer,'R3',runners,times[i].slice(0,runners.length)));
 return {volunteer,lead,heats,setup,owner:owner.token as string};
}
/** The final as R3's race screen shows it now: attendance only, no heat provenance. */
const finalRead=async(token:string)=>(await call(token,'/api/race-screen/R3')).json().race;
/** The check-in holder's Here / Absent list on R3's final race screen: these wristbands Absent, everyone else Here. */
async function markAbsent(token:string,wristbands:number[]) {
 await call(token,'/api/race-screen/R3/hold',{job:'check-in'});
 const read=(await call(token,'/api/race-screen/R3')).json();
 return call(token,'/api/race-screen/R3/absent',{raceId:read.race.id,version:read.race.parts.runners.version,absent:read.race.final.entries.filter((entry:any)=>wristbands.includes(entry.wristband)).map((entry:any)=>entry.finalEntryId)});
}
test('heat-to-final attendance, audited next ranked callups, order-only podium and final locks',async()=>{
 const {volunteer,lead,setup}=await start();
 const complete=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(complete.statusCode).toBe(200);
 expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(409);
 const result=complete.json().results;expect(result.status).toBe('Heats complete - final to run');expect(result.finalResults.entries.map((e:any)=>e.heatWristband)).toEqual([1023,1066,1088,1005,1012,1110]);const id=result.finalResults.raceId;
 let final=await finalRead(volunteer);expect(final.id).toBe(id);expect(final.final.entries[0].heatRank).toBeUndefined();expect(final.final.entries[0].heatRaceId).toBeUndefined();expect(final.parts.runners.value.map((r:any)=>r.warnings||[])).toEqual([[],[],[],[],[],[]]);
 expect((await call(volunteer,'/api/race-screen/R3/hold',{job:'times'})).json().message).toBe('A final has no times');
 expect((await markAbsent(volunteer,[1066,1088])).statusCode).toBe(200);
 final=await finalRead(volunteer);
 expect((await call(volunteer,'/api/race-screen/R3/check-in',{raceId:id,version:final.parts.runners.version,runners:[{wristband:1023}]})).json().message).toBe("Mark the final's runners Here or Absent");
 expect((await call(volunteer,'/api/lead/events/R3/call-up',{expectedHeatEntryId:'none'})).statusCode).toBe(403);
 let read=(await call(lead,'/api/lead/events/R3/results')).json();expect(read.results.finalResults.nextCallUp.wristband).toBe(1135);
 for(const number of [1135,1047]) {const next=read.results.finalResults.nextCallUp;expect(next.wristband).toBe(number);const save=await call(lead,'/api/lead/events/R3/call-up',{expectedHeatEntryId:next.entryId});expect(save.statusCode).toBe(200);read=save.json();}
 expect(read.results.finalResults.additionalEntries).toEqual([]);expect(read.results.finalResults.entries.filter((e:any)=>e.absent).map((e:any)=>e.heatWristband)).toEqual([1066,1088]);expect(read.auditNotes.filter((n:any)=>n.action==='call-up')).toHaveLength(2);
 final=await finalRead(volunteer);const runners=final.parts.runners.value;const order=[1047,1023,1110,1135,1005,1012];
 await setup.order(volunteer,'R3',order);expect((await setup.submit(volunteer,'R3')).race.state).toBe('saved');
 const first=runners.find((r:any)=>r.wristband===1047);await call(lead,`/api/lead/races/${id}/runners/${first.id}/disqualify`,{reason:'Two false starts'});
 const done=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'});expect(done.statusCode).toBe(200);expect(done.json().results.inputRunning).toEqual({eventCode:'R3',first:1023,second:1110,third:1135});expect(done.json().results.finalResults.leaderboard.every((r:any)=>r.time===null)).toBe(true);
 await app.close();app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-owner'});const restarted=(await call(lead,'/api/lead/events/R3/results')).json();expect(restarted.results.finalResults.entries).toEqual(done.json().results.finalResults.entries);expect(restarted.results.inputRunning).toEqual(done.json().results.inputRunning);expect(restarted.auditNotes.filter((n:any)=>n.action==='call-up')).toHaveLength(2);
 for(const [what,body] of [['order',{raceId:id,version:1,order:[],didNotFinish:[],didNotRun:[],added:[]}],['check-in',{raceId:id,version:1,runners:[{wristband:1023}]}],['not-yet',{raceId:id}]] as const) {const refused=await call(volunteer,`/api/race-screen/R3/${what}`,body);expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('Stage complete - ask a lead');}
 const locked=await markAbsent(volunteer,[]);expect(locked.statusCode).toBe(409);expect(locked.json().message).toBe('Stage complete - ask a lead');
 expect((await call(volunteer,'/api/lead/events/R3/complete-stage',{stage:'heats'})).statusCode).toBe(403);expect((await call(volunteer,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(403);expect((await call(volunteer,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Correction'})).statusCode).toBe(403);expect((await call(volunteer,'/api/lead/events/R3/reopen-stage',{stage:'final',comment:'Correction'})).statusCode).toBe(403);
 const reopened=await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'final',comment:'Review final placing'});expect(reopened.statusCode).toBe(200);expect(reopened.json().results.inputRunning).toBeNull();expect(reopened.json().results.finalResults.hasRun).toBe(true);
});
test('unstarted final rebuilds after heat correction; a saved final with cleared Finish prevents reopening heats',async()=>{
 const {lead,volunteer,heats,setup}=await start([[1023,1088]]);
 let result=(await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'})).json().results;const id=result.finalResults.raceId;let race=await finalRead(volunteer);const oldVersion=race.parts.runners.version;
 await call(volunteer,'/api/race-screen/R3/hold',{job:'check-in'});
 expect((await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Late timer correction'})).statusCode).toBe(200);
 await call(lead,`/api/lead/races/${heats[0].id}/times`,{baseVersion:1,places:[1000,900],acceptOutOfOrder:true});
 result=(await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'})).json().results;expect(result.finalResults.raceId).toBe(id);expect(result.finalResults.entries.map((e:any)=>e.heatWristband)).toEqual([1088,1023]);expect(result.finalResults.entries.every((e:any)=>!e.absent)).toBe(true);
 // A Here / Absent list written before the rebuild names the old line-up, so it is not saved.
 expect((await call(volunteer,'/api/race-screen/R3/absent',{raceId:id,version:oldVersion,absent:[]})).statusCode).toBe(409);
 await setup.order(volunteer,'R3',[1023,1088]);await setup.submit(volunteer,'R3');
 race=await finalRead(volunteer);await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[...race.parts.runners.value.map((r:any)=>({entryId:r.id,wristband:r.wristband})),{wristband:1012}]});
 // A saved final is read as a lead reads it after correcting its runners.
 const leadRead=async()=>(await call(lead,`/api/lead/races/${id}`)).json().race;
 const before=await leadRead();expect(before.parts.finish.value).toBeNull();expect(before.final.hasRun).toBe(true);
 const reopened=await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Recheck heats'});expect(reopened.statusCode).toBe(409);expect(reopened.json()).toEqual({message:'The final has started - heats cannot be reopened'});const after=await leadRead();expect(after).toEqual(before);
 const rerun=await call(lead,`/api/lead/races/${id}/re-run`,{});expect(rerun.statusCode).toBe(200);expect(rerun.json().results.finalResults).toMatchObject({hasRun:false});expect(rerun.json().results.finalResults.entries[0]).toMatchObject({heatRaceId:heats[0].id,heatWristband:1088,seed:1});
 const newFinal=await finalRead(volunteer);expect(newFinal.id).toBe(rerun.json().newRaceId);expect(newFinal.final.entries.map((entry:any)=>entry.wristband)).toContain(1012);expect(newFinal.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([1088,1023,1012]);
});
test('an empty event still creates an empty final and completes without fabricated podium',async()=>{
 const {lead,volunteer}=await start([]);const complete=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(complete.statusCode).toBe(200);
 // A final nobody qualified for has nothing to record or submit.
 expect(await finalRead(volunteer)).toMatchObject({kind:'final',parts:{runners:{value:[]}}});expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).json().results.inputRunning).toEqual({eventCode:'R3',first:null,second:null,third:null});
});
test('typed final additions and corrected numbers keep actual eligibility warnings without a heat-to-final repeat warning',async()=>{
 const {lead,volunteer,setup}=await start([[1023]]);let detail=(await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'})).json();const id=detail.results.finalResults.raceId;
 await setup.order(volunteer,'R3',[1023,2005],{added:[2005],keptWarnings:[2005]});await setup.submit(volunteer,'R3');
 detail=(await call(lead,'/api/lead/events/R3/results')).json();expect(detail.results.needsYou.filter((item:any)=>item.kind==='warning')).toHaveLength(1);expect(detail.results.needsYou.some((item:any)=>item.kind==='ran-twice')).toBe(false);expect(detail.results.checkSheet.worthALook).toMatchObject([{kind:'warning',raceId:id}]);expect(detail.results.checkSheet.mustSettleFirst).toEqual([]);expect(detail.results.finalResults.leaderboard[1].flags).toContainEqual(expect.objectContaining({kind:'warning',warningKind:'wrong-section'}));
 const entry=detail.results.finalResults.leaderboard[0];const corrected=await call(lead,`/api/lead/races/${id}/runners/${entry.entryId}/correct-number`,{expectedWristband:1023,wristband:2010,keepWarnings:true});expect(corrected.statusCode).toBe(200);expect(corrected.json().results.checkSheet.worthALook).toHaveLength(2);expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(200);
});
test('authoritative final runner publications keep absence aligned through lead removal and Didn\'t run',async()=>{
 const {lead,volunteer,setup}=await start([[1023,1088]]);const detail=(await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'})).json();const id=detail.results.finalResults.raceId;
 // The order holder says 1088 didn't run: the final's line-up shows them absent, until marked Here again.
 await setup.order(volunteer,'R3',[1023],{didNotRun:[1088]});expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries[1].absent).toBe(true);
 await markAbsent(volunteer,[]);expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries[1].absent).toBe(false);
 // Once the final is saved, a lead taking a runner off marks them absent too.
 await setup.order(volunteer,'R3',[1023,1088]);await setup.submit(volunteer,'R3');
 const race=(await call(lead,`/api/lead/races/${id}`)).json().race,removed=race.parts.runners.value[1];
 expect((await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[{entryId:race.parts.runners.value[0].id,wristband:1023}]})).statusCode).toBe(200);
 expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries.find((entry:any)=>entry.finalEntryId===removed.id).absent).toBe(true);
});
test('a stale Here / Absent list is not saved, and a lead\'s corrected number stays through Absent and back to Here',async()=>{
 const {lead,volunteer}=await start([[1023,1088]]);const detail=(await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'})).json(),id=detail.results.finalResults.raceId;
 const before=(await call(volunteer,'/api/race-screen/R3')).json();
 await call(lead,`/api/lead/races/${id}/runners/${before.race.parts.runners.value[0].id}/correct-number`,{expectedWristband:1023,wristband:1050});
 await call(volunteer,'/api/race-screen/R3/hold',{job:'check-in'});
 const stale=await call(volunteer,'/api/race-screen/R3/absent',{raceId:id,version:before.race.parts.runners.version,absent:[]});
 expect(stale.statusCode).toBe(409);expect(stale.json().message).toBe('Not saved - check your entries and enter it again');
 expect((await markAbsent(volunteer,[1050])).json().race.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([1088]);
 const here=(await markAbsent(volunteer,[])).json();
 expect(here.race.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([1050,1088]);
 expect(here.race.final.entries.map((entry:any)=>[entry.wristband,entry.absent])).toEqual([[1050,false],[1088,false]]);
});
