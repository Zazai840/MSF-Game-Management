import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'race-owner',resetTestDay:true});
  const people=await signInOwner(app,'race-owner','Owner'),owner=people.owner,day=people.day;await call(owner.token,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  // Saved with its out-of-order times kept, as the timer typed them.
  const setup=raceSetup(app),recorded=await setup.record(volunteer,'R10',[2001,2002],[1300,1200],{keptWrong:[1]});
  const race=(await call(lead,`/api/lead/races/${recorded.id}`)).json().race;
  // The race as a lead reads it now.
  const leadRead=async(id:string)=>(await call(lead,`/api/lead/races/${id}`)).json().race;
  return {owner:owner.token as string,volunteer,lead,race,setup,leadRead,read:async()=>(await call(lead,'/api/lead/events/R10/results')).json()};
}
test('a lead corrects or explicitly accepts out-of-order times',async()=>{
  const {lead,race,read,leadRead}=await start();
  expect((await read()).results.notRankedYet[0].reasons).toEqual(['times out of order']);
  const corrected=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1200,1300]});expect(corrected.statusCode).toBe(200);
  expect(corrected.json().results.leaderboard.map((row:any)=>[row.wristband,row.time])).toEqual([[2001,1200],[2002,1300]]);
  const accepted=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:2,places:[1300,1200],acceptOutOfOrder:true});expect(accepted.statusCode).toBe(200);
  expect(accepted.json().results.leaderboard.map((row:any)=>[row.wristband,row.time])).toEqual([[2002,1200],[2001,1300]]);
  expect((await leadRead(race.id)).parts.times.value.acceptedByLead).toBe(true);
  const changed=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:3,places:[1400,1300]});expect(changed.statusCode).toBe(200);
  expect((await leadRead(race.id)).parts.times.value.acceptedByLead).not.toBe(true);
  expect((await read()).auditNotes.map((note:any)=>note.action)).toEqual(['correct-times','accept-times','correct-times']);
});
test('lead deletion, restoration and permanent deletion work after Finish and preserve audit notes',async()=>{
  const {lead,volunteer,race,read}=await start();
  await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1200,1300]});
  expect((await call(volunteer,`/api/races/${race.id}/delete`,{permanent:false})).statusCode).toBe(404);
  const deleted=await call(lead,`/api/lead/races/${race.id}/delete`,{permanent:false,comment:'Mistaken race'});expect(deleted.statusCode).toBe(200);
  expect(deleted.json().results.raceCount).toBe(0);
  const removed=(await call(lead,'/api/lead/events/R10/deleted-races')).json();expect(removed.map((item:any)=>item.id)).toEqual([race.id]);
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().race.deleted).toBe(true);
  const restored=await call(lead,`/api/lead/races/${race.id}/restore`,{});expect(restored.statusCode).toBe(200);expect(restored.json().results.leaderboard).toHaveLength(2);
  expect((await call(lead,'/api/lead/events/R10/deleted-races')).json()).toEqual([]);
  const permanent=await call(lead,`/api/lead/races/${race.id}/delete`,{permanent:true});expect(permanent.statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${race.id}`)).statusCode).toBe(404);
  expect((await read()).auditNotes.map((note:any)=>note.action)).toEqual(['delete-race-permanently','restore-race','delete-race','correct-times']);
});
test('a re-run deletes the old record with its reason and creates a new numbered prefilled race without already-ran warnings',async()=>{
  const {owner,lead,volunteer,race,read,leadRead}=await start();
  const rerun=await call(lead,`/api/lead/races/${race.id}/re-run`,{comment:'Recording lost'});expect(rerun.statusCode).toBe(200);
  const newId=rerun.json().newRaceId;expect(newId).not.toBe(race.id);
  const fresh=await leadRead(newId);
  expect(fresh).toMatchObject({number:2,kind:'race',deleted:false,parts:{finish:{value:null},times:{value:null}}});
  expect(fresh.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([2001,2002]);
  expect(fresh.parts.runners.value.flatMap((runner:any)=>runner.warnings).some((warning:any)=>warning.kind==='already-ran')).toBe(false);
  expect(fresh.parts.runners.value[0].id).not.toBe(race.parts.runners.value[0].id);
  expect((await call(volunteer,`/api/races/${newId}`)).json().race).toMatchObject({id:newId,state:'in progress'});
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().race).toMatchObject({deleted:true,deleteReason:'re-run'});
  expect((await read()).auditNotes[0]).toMatchObject({action:'re-run',actor:'Aisha',comment:'Recording lost',touches:[{raceId:race.id},{raceId:newId}]});
  const before=await read();
  const revision=(await call(owner,'/api/day')).json().revision;
  const restored=await call(lead,`/api/lead/races/${race.id}/restore`,{});
  expect(restored.statusCode).toBe(409);
  expect(restored.json().message).toBe('This race was replaced by a re-run and cannot be restored');
  expect(await read()).toEqual(before);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().race).toMatchObject({deleted:true,deleteReason:'re-run'});

});
test('a race replaced by a re-run names its replacing race from the audit note, or says a re-run when that race is gone',async()=>{
  const {lead,race,setup}=await start();
  const newId=(await call(lead,`/api/lead/races/${race.id}/re-run`,{})).json().newRaceId;
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().race.replacedBy).toBe('Heat 2');
  expect((await call(lead,'/api/lead/events/R10/deleted-races')).json()).toMatchObject([{id:race.id,replacedBy:'Heat 2'}]);
  const ordinary=await setup.checkIn(lead,'R10',[2003]);
  await call(lead,`/api/lead/races/${ordinary.id}/delete`,{permanent:false});
  expect((await call(lead,`/api/lead/races/${ordinary.id}`)).json().race.replacedBy).toBeUndefined();
  expect((await call(lead,`/api/lead/races/${newId}/delete`,{permanent:true})).statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().race).toMatchObject({deleted:true,deleteReason:'re-run',replacedBy:null});
});
test('lead runner correction preserves replacement identities and time pairing, removes dangling Finish IDs, and invalidates unclassified additions',async()=>{
  const {lead,race,leadRead}=await start();
  const first=race.parts.runners.value[0],second=race.parts.runners.value[1];
  const corrected=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:2,finishVersion:1,runners:[{entryId:first.id,wristband:2001},{entryId:second.id,wristband:4045}],keptWarnings:[4045]});expect(corrected.statusCode).toBe(200);
  let current=(await leadRead(race.id));
  expect(current.parts.runners.value[1]).toMatchObject({id:second.id,wristband:4045,warnings:[{kind:'wrong-section',kept:true}]});
  expect(current.recording.results[1]).toMatchObject({entryId:second.id,wristband:4045,place:2,time:1200});
  expect(current.parts.finish.version).toBe(1);
  const removed=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:3,finishVersion:1,runners:[{entryId:second.id,wristband:4045}]});expect(removed.statusCode).toBe(200);
  current=(await leadRead(race.id));expect(current.parts.finish.value).toEqual({order:[second.id],didNotFinish:[]});expect(current.parts.times.value.places).toEqual([1300,1200]);expect(current.recording.countMismatch).toContain('1 finishers, times have 2');
  const added=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:4,finishVersion:2,runners:[{entryId:second.id,wristband:4045},{wristband:2003}]});expect(added.statusCode).toBe(200);
  current=(await leadRead(race.id));expect(current.parts.finish.value).toBeNull();expect(current.parts.times.value.places).toEqual([1300,1200]);
  const newEntry=current.parts.runners.value[1];
  const classified=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:5,finishVersion:3,runners:[{entryId:second.id,wristband:4045},{entryId:newEntry.id,wristband:2003}],finish:{order:[4045],didNotFinish:[2003]}});expect(classified.statusCode).toBe(200);
  expect((await leadRead(race.id)).parts.finish.value).toEqual({order:[second.id],didNotFinish:[newEntry.id]});
});
test('all lead race commands refuse volunteer phones and invalid corrections leave revision and audit untouched',async()=>{
  const {owner,lead,volunteer,race,read}=await start();
  const revision=(await call(owner,'/api/day')).json().revision;
  for(const command of ['times','runners','re-run','delete','restore']) expect((await call(volunteer,`/api/lead/races/${race.id}/${command}`,{})).statusCode).toBe(403);
  expect((await call(volunteer,'/api/lead/events/R10/deleted-races')).statusCode).toBe(403);
  const runners=race.parts.runners.value.map((runner:any)=>({entryId:runner.id,wristband:runner.wristband}));
  for(const body of [null,[],{}, {baseVersion:2,finishVersion:1,runners:[runners[0],runners[0]]}, {baseVersion:2,finishVersion:1,runners:[...runners,{wristband:2001}]}, {baseVersion:2,finishVersion:1,runners,finish:{order:[2001],didNotFinish:[]}}]) expect((await call(lead,`/api/lead/races/${race.id}/runners`,body)).statusCode).toBe(400);
  expect((await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:0,finishVersion:1,runners})).statusCode).toBe(400);
  expect((await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:1,finishVersion:1,runners})).statusCode).toBe(409);
  for(const body of [{baseVersion:1,places:[1200,null,1300]},{baseVersion:1,places:[1200,'1300']},{baseVersion:1,places:[1200,1300],acceptOutOfOrder:'yes'}]) expect((await call(lead,`/api/lead/races/${race.id}/times`,body)).statusCode).toBe(400);
  expect((await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:0,places:[1200,1300]})).statusCode).toBe(409);
  expect((await read()).auditNotes).toEqual([]);expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  await call(lead,`/api/lead/races/${race.id}/delete`,{permanent:false});
  for(const command of ['times','runners','re-run']) expect((await call(lead,`/api/lead/races/${race.id}/${command}`,command==='times'?{baseVersion:1,places:[1200,1300]}:command==='runners'?{baseVersion:1,finishVersion:1,runners}:{})).statusCode).toBe(409);
});
test('a lead corrects the finishing order: wristbands move, times stay by place, with an audit note and a history row',async()=>{
  const {lead,race,read,leadRead}=await start();
  await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1200,1300]});
  const corrected=await call(lead,`/api/lead/races/${race.id}/finish-order`,{baseVersion:1,runnersVersion:2,order:[2002,2001],didNotFinish:[],didNotRun:[],comment:'Photo checked'});expect(corrected.statusCode).toBe(200);
  expect(corrected.json().results.leaderboard.map((row:any)=>[row.wristband,row.time])).toEqual([[2002,1200],[2001,1300]]);
  expect((await leadRead(race.id)).parts.finish.version).toBe(2);
  expect((await read()).auditNotes[0]).toMatchObject({action:'correct-finish-order',message:'Aisha corrected the finishing order for Heat 1: 2002, 2001 - Photo checked'});
  const history=(await call(lead,`/api/lead/races/${race.id}`)).json().history;expect(history.at(-1)).toMatchObject({part:'finish',version:2,author:'Aisha'});
});
test('a finishing order correction at a stale version is refused with today\'s wording and changes nothing',async()=>{
  const {lead,volunteer,race,read}=await start();
  for(const body of [{baseVersion:0,runnersVersion:2},{baseVersion:1,runnersVersion:1}]) {
    const stale=await call(lead,`/api/lead/races/${race.id}/finish-order`,{...body,order:[2002,2001],didNotFinish:[],didNotRun:[]});
    expect(stale.statusCode).toBe(409);expect(stale.json().message).toBe('This race has changed - open it again');
  }
  for(const body of [{},{baseVersion:1,runnersVersion:2,order:[2002],didNotFinish:[],didNotRun:[]},{baseVersion:1,runnersVersion:2,order:[2002,2002],didNotFinish:[],didNotRun:[]},{baseVersion:1,runnersVersion:2,order:[2002,2003],didNotFinish:[],didNotRun:[]},{baseVersion:1,runnersVersion:2,order:[2002],didNotFinish:[],didNotRun:['2001']}]) expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,body)).statusCode).toBe(400);
  expect((await call(volunteer,`/api/lead/races/${race.id}/finish-order`,{baseVersion:1,runnersVersion:2,order:[2002,2001],didNotFinish:[],didNotRun:[]})).statusCode).toBe(403);
  expect((await read()).auditNotes).toEqual([]);
});
test('Did not finish or Didn\'t run leaves times the finishers don\'t agree with until the lead clears the leftover places',async()=>{
  const {lead,race,read,leadRead}=await start();
  await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1200,1300]});
  const reasons=async()=>(await read()).results.notRankedYet.flatMap((item:any)=>item.reasons);
  expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,{baseVersion:1,runnersVersion:2,order:[2001],didNotFinish:[2002],didNotRun:[]})).statusCode).toBe(200);
  expect(await reasons()).toEqual(["finishers and times don't agree"]);
  await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:2,places:[1200,null]});
  expect(await reasons()).toEqual([]);
  expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,{baseVersion:2,runnersVersion:2,order:[2002],didNotFinish:[],didNotRun:[2001]})).statusCode).toBe(200);
  const current=(await leadRead(race.id));expect(current.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([2002]);
  expect(current.parts.finish.value).toEqual({order:[current.parts.runners.value[0].id],didNotFinish:[]});
  expect((await read()).auditNotes[0].message).toBe('Aisha corrected the finishing order for Heat 1: 2002; Didn\'t run 2001');
  expect(await reasons()).toEqual([]);
});
test('one writer per job leaves nothing to choose between: the lead race read has no clash candidates and the clash route is gone',async()=>{
  const {lead,race}=await start();
  const read=(await call(lead,`/api/lead/races/${race.id}`)).json();
  expect(read).not.toHaveProperty('clashes');expect(read.race.parts.times).toEqual({version:1,value:expect.any(Object)});
  expect((await call(lead,`/api/lead/races/${race.id}/clashes/times`,{candidateId:race.id})).statusCode).toBe(404);
});
