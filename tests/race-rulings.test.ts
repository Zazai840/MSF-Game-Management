import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'race-owner',resetTestDay:true});
  const people=await signInOwner(app,'race-owner','Owner'),owner=people.owner,day=people.day;
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
test('Correct times refuses a time no one can run, with the phone\'s words, but never checks a time saved before',async()=>{
  const {owner,lead,race,leadRead}=await start();
  const correct=(places:number[])=>call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:race.parts.times.version,places});
  for(const [places,message] of [[[1200,0],'0.00 is not a time. Check the timer and type it again.'],[[21,1300],'0.21 is too fast for 60m Hurdles. No one runs 60m in under 6.00. For 21 seconds, type 2100.'],[[599,1300],'5.99 is too fast for 60m Hurdles. No one runs 60m in under 6.00. Check the timer and type it again.']] as const) {
    const response=await correct([...places]);expect(response.statusCode).toBe(400);expect(response.json().message).toBe(message);
  }
  expect((await leadRead(race.id)).parts.times.value.places).toEqual([1300,1200]);
  await call(owner,'/api/day/events/R10/rename',{name:'Sack race'});
  expect((await correct([21,1300])).statusCode).toBe(200);
  await call(owner,'/api/day/events/R10/rename',{name:'60m Hurdles'});
  expect((await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:race.parts.times.version+1,places:[21,1250]})).statusCode).toBe(200);
});
test('lead deletion, restoration and permanent deletion work after Finish and preserve audit notes',async()=>{
  const {lead,volunteer,race,read}=await start();
  await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1200,1300]});
  expect((await call(volunteer,`/api/races/${race.id}/delete`,{permanent:false})).statusCode).toBe(404);
  const deleted=await call(lead,`/api/lead/races/${race.id}/delete`,{permanent:false,comment:'Mistaken race'});expect(deleted.statusCode).toBe(200);
  expect(deleted.json().results.raceCount).toBe(0);
  const removed=(await call(lead,'/api/lead/events/R10/deleted-races')).json();expect(removed.map((item:any)=>item.id)).toEqual([race.id]);
  // The deleted race's page says who deleted it and why, from the audit note.
  expect((await call(lead,`/api/lead/races/${race.id}`)).json()).toMatchObject({race:{deleted:true},deletion:{by:'Aisha',comment:'Mistaken race'}});
  const restored=await call(lead,`/api/lead/races/${race.id}/restore`,{});expect(restored.statusCode).toBe(200);expect(restored.json().results.leaderboard).toHaveLength(2);
  expect(restored.json().number).toBe(1);
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().deletion).toBeNull();
  expect((await call(lead,'/api/lead/events/R10/deleted-races')).json()).toEqual([]);
  const permanent=await call(lead,`/api/lead/races/${race.id}/delete`,{permanent:true});expect(permanent.statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${race.id}`)).statusCode).toBe(404);
  expect((await read()).auditNotes.map((note:any)=>note.action)).toEqual(['delete-race-permanently','restore-race','delete-race','correct-times']);
});
test('a re-run deletes the old record with its reason and creates a prefilled race with its number, without already-ran warnings',async()=>{
  const {owner,lead,volunteer,race,read,leadRead}=await start();
  const rerun=await call(lead,`/api/lead/races/${race.id}/re-run`,{comment:'Recording lost'});expect(rerun.statusCode).toBe(200);
  const newId=rerun.json().newRaceId;expect(newId).not.toBe(race.id);
  const fresh=await leadRead(newId);
  expect(fresh).toMatchObject({number:1,kind:'race',deleted:false,parts:{finish:{value:null},times:{value:null}}});
  expect(fresh.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([2001,2002]);
  expect(fresh.parts.runners.value.flatMap((runner:any)=>runner.warnings).some((warning:any)=>warning.kind==='already-ran')).toBe(false);
  expect(fresh.parts.runners.value[0].id).not.toBe(race.parts.runners.value[0].id);
  expect((await call(volunteer,`/api/races/${newId}`)).json().race).toMatchObject({id:newId,state:'in progress'});
  expect((await call(lead,`/api/lead/races/${race.id}`)).json()).toMatchObject({race:{deleted:true,deleteReason:'re-run'},deletion:{by:'Aisha',comment:'Recording lost'}});
  expect((await read()).auditNotes[0]).toMatchObject({action:'re-run',actor:'Aisha',comment:'Recording lost',message:'Aisha called a re-run of Heat 1: Recording lost',touches:[{raceId:race.id},{raceId:newId}]});
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
  expect((await call(lead,`/api/lead/races/${race.id}`)).json().race.replacedBy).toBe('Heat 1');
  expect((await call(lead,'/api/lead/events/R10/deleted-races')).json()).toMatchObject([{id:race.id,replacedBy:'Heat 1'}]);
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
  // The removed 1st place's time goes with it: the child who was 2nd keeps their own.
  current=(await leadRead(race.id));expect(current.parts.finish.value).toEqual({order:[second.id],didNotFinish:[]});expect(current.parts.times.value.places).toEqual([1200]);expect(current.recording.countMismatch).toBeNull();
  const added=await call(lead,`/api/lead/races/${race.id}/runners`,{baseVersion:4,finishVersion:2,runners:[{entryId:second.id,wristband:4045},{wristband:2003}]});expect(added.statusCode).toBe(200);
  current=(await leadRead(race.id));expect(current.parts.finish.value).toBeNull();expect(current.parts.times.value.places).toEqual([1200]);
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
test('Did not finish or Didn\'t run takes the removed place\'s time with it, so the finishers and times still agree and nobody inherits a time',async()=>{
  const {lead,race,read,leadRead}=await start();
  await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion:1,places:[1200,1300]});
  const reasons=async()=>(await read()).results.notRankedYet.flatMap((item:any)=>item.reasons);
  expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,{baseVersion:1,runnersVersion:2,order:[2001],didNotFinish:[2002],didNotRun:[]})).statusCode).toBe(200);
  expect((await leadRead(race.id)).parts.times.value.places).toEqual([1200]);
  expect(await reasons()).toEqual([]);
  // 2001 didn't run and 2002 gets a place after all: 2001's time goes with 2001, and 2002's place waits for its own.
  expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,{baseVersion:2,runnersVersion:2,order:[2002],didNotFinish:[],didNotRun:[2001]})).statusCode).toBe(200);
  const current=(await leadRead(race.id));expect(current.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([2002]);
  expect(current.parts.finish.value).toEqual({order:[current.parts.runners.value[0].id],didNotFinish:[]});
  expect(current.parts.times.value.places).toEqual([]);
  expect((await read()).auditNotes[0].message).toBe('Aisha corrected the finishing order for Heat 1: 2002; Didn\'t run 2001');
  expect(await reasons()).toEqual(["finishers and times don't agree"]);
});
/** A second saved heat of six, each child with their own time, and what the results and the Day export then say of it. */
async function heatOfSix() {
  const started=await start(),{lead,volunteer,setup}=started,runners=[2003,2004,2005,2006,2007,2008];
  const recorded=await setup.record(volunteer,'R10',runners,[1000,1100,1200,1300,1400,1500]),race=await started.leadRead(recorded.id);
  const post=async(command:string,body:object)=>{const response=await call(lead,`/api/lead/races/${race.id}/${command}`,body);expect(response.statusCode,response.body).toBe(200);};
  /** Each child's time in the results, whether the race counts, and each child's time (in seconds) in the Day export's All results. */
  async function said() {
    const {results}=await started.read(),sheets=await readExcelFile((await call(lead,'/api/day/export',{})).rawPayload);
    return {times:(await started.leadRead(race.id)).parts.times.value.places as number[],
      leaderboard:results.leaderboard.filter((row:any)=>row.raceId===race.id).map((row:any)=>[row.wristband,row.time]),
      counts:!results.notRankedYet.some((item:any)=>item.race.id===race.id),
      exported:sheets[2].data.filter(row=>row[3]==='Heat 2').map(row=>[row[4],row[7]])};
  }
  return {...started,race,post,said,entries:race.parts.runners.value.map((runner:any)=>({entryId:runner.id,wristband:runner.wristband}))};
}
test('a lead removes the 4th of 6 children with Correct runner list: the 5th and 6th keep their own times, no time is left over, and the race still counts',async()=>{
  const {race,post,said,entries}=await heatOfSix();
  await post('runners',{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:entries.filter((entry:any)=>entry.wristband!==2006)});
  expect(await said()).toEqual({times:[1000,1100,1200,1400,1500],counts:true,
    leaderboard:[[2003,1000],[2004,1100],[2005,1200],[2007,1400],[2008,1500]],
    exported:[[2003,10],[2004,11],[2005,12],[2007,14],[2008,15]]});
});
test('a lead gives a placed and timed child Did not finish, then another Didn\'t run, with Correct finishing order: every other child keeps their own time and the race still counts',async()=>{
  const {race,post,said}=await heatOfSix();
  await post('finish-order',{baseVersion:race.parts.finish.version,runnersVersion:race.parts.runners.version,order:[2003,2004,2005,2007,2008],didNotFinish:[2006],didNotRun:[]});
  expect(await said()).toEqual({times:[1000,1100,1200,1400,1500],counts:true,
    leaderboard:[[2003,1000],[2004,1100],[2005,1200],[2007,1400],[2008,1500],[2006,null]],
    exported:[[2003,10],[2004,11],[2005,12],[2006,null],[2007,14],[2008,15]]});
  await post('finish-order',{baseVersion:race.parts.finish.version+1,runnersVersion:race.parts.runners.version,order:[2003,2005,2007,2008],didNotFinish:[2006],didNotRun:[2004]});
  expect(await said()).toEqual({times:[1000,1200,1400,1500],counts:true,
    leaderboard:[[2003,1000],[2005,1200],[2007,1400],[2008,1500],[2006,null]],
    exported:[[2003,10],[2005,12],[2006,null],[2007,14],[2008,15]]});
});
test('a lead drags children to a new order with Correct finishing order: times stay by place',async()=>{
  const {race,post,said}=await heatOfSix();
  await post('finish-order',{baseVersion:race.parts.finish.version,runnersVersion:race.parts.runners.version,order:[2008,2003,2004,2005,2006,2007],didNotFinish:[],didNotRun:[]});
  expect(await said()).toMatchObject({times:[1000,1100,1200,1300,1400,1500],counts:true,leaderboard:[[2008,1000],[2003,1100],[2004,1200],[2005,1300],[2006,1400],[2007,1500]]});
});
test('a new order and No place in one correction: the screen names the place it took away, as the lead saw it, and that place\'s time goes',async()=>{
  const {lead,race,post,said}=await heatOfSix();
  // 2008 dragged to 1st, so 2006 is 5th (14.00) when it gets No place.
  const body={baseVersion:race.parts.finish.version,runnersVersion:race.parts.runners.version,order:[2008,2003,2004,2005,2007],didNotFinish:[2006],didNotRun:[]};
  for(const removedPlaces of [[4,4],[-1],['4'],4]) expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,{...body,removedPlaces})).statusCode).toBe(400);
  // Every entry that leaves the order takes a place, and each place named is one the saved order has.
  for(const removedPlaces of [[],[6]]) expect((await call(lead,`/api/lead/races/${race.id}/finish-order`,{...body,removedPlaces})).statusCode).toBe(400);
  await post('finish-order',{...body,removedPlaces:[4]});
  expect(await said()).toMatchObject({times:[1000,1100,1200,1300,1500],counts:true,leaderboard:[[2008,1000],[2003,1100],[2004,1200],[2005,1300],[2007,1500],[2006,null]]});
});
test('one writer per job leaves nothing to choose between: the lead race read has no clash candidates and the clash route is gone',async()=>{
  const {lead,race}=await start();
  const read=(await call(lead,`/api/lead/races/${race.id}`)).json();
  expect(read).not.toHaveProperty('clashes');expect(read.race.parts.times).toEqual({version:1,value:expect.any(Object)});
  expect((await call(lead,`/api/lead/races/${race.id}/clashes/times`,{candidateId:race.id})).statusCode).toBe(404);
});
