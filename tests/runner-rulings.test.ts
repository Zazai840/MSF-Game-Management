import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { resultNotes } from '../src/shared/result-notes.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'runner-owner',resetTestDay:true});
  const people=await signInOwner(app,'runner-owner','Owner'),owner=people.owner,day=people.day;await call(owner.token,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  const setup=raceSetup(app);
  const race=(numbers:number[],places:number[]):Promise<any>=>setup.record(volunteer,'R4',numbers,places,{keptWarnings:numbers});
  const first=await race([2001,3045],[1100,1200]),second=await race([2001],[1300]);
  const path=(race:any,number:number)=>`/api/lead/races/${race.id}/runners/${race.parts.runners.value.find((runner:any)=>runner.wristband===number).id}`;
  return {owner:owner.token as string,lead,volunteer,first,second,path,read:async()=>(await call(lead,'/api/lead/events/R4/results')).json()};
}
test('a lead marks an eligibility warning checked without changing the ranking; ran-twice cannot be marked checked',async()=>{
  const {lead,first,second,path,read}=await start();
  const saved=await call(lead,path(first,3045)+'/mark-warning-checked',{});expect(saved.statusCode).toBe(200);
  const data=saved.json();expect(data.results.leaderboard[1]).toMatchObject({wristband:3045,position:2,flags:[{kind:'warning',checked:true,warningKind:'wrong-section'}],hasNote:false});
  expect(data.auditNotes[0]).toMatchObject({action:'mark-warning-checked',actor:'Aisha'});expect(data.auditNotes[0].message).toContain('3045');
  expect((await call(lead,path(second,2001)+'/mark-warning-checked',{})).statusCode).toBe(409);
  expect((await read()).auditNotes).toHaveLength(1);
});
test('correcting a number retains the stable entry, finishing place and time, reruns checks and reopens new warnings',async()=>{
  const {lead,first,second,path,read}=await start();
  await call(lead,path(first,3045)+'/mark-warning-checked',{});
  const saved=await call(lead,path(first,3045)+'/correct-number',{expectedWristband:3045,wristband:2003});expect(saved.statusCode).toBe(200);
  const row=saved.json().results.leaderboard.find((row:any)=>row.wristband===2003);
  expect(row).toMatchObject({entryId:first.parts.runners.value[1].id,place:2,time:1200,flags:[],hasNote:true});
  const race=(await call(lead,`/api/lead/races/${first.id}`)).json().race;
  expect(race.parts.runners.value[1]).toMatchObject({id:row.entryId,wristband:2003});expect(race.parts.runners.version).toBe(2);
  expect(race.parts.finish.value.order).toEqual(first.parts.runners.value.map((runner:any)=>runner.id));expect(race.parts.times.value.places).toEqual([1100,1200]);
  const duplicateFixed=await call(lead,path(second,2001)+'/correct-number',{expectedWristband:2001,wristband:2004});expect(duplicateFixed.statusCode).toBe(200);
  expect(duplicateFixed.json().results.leaderboard.flatMap((row:any)=>row.flags).some((flag:any)=>flag.kind==='ran-twice')).toBe(false);
  const wrongSection=await call(lead,path(first,3045)+'/correct-number',{expectedWristband:2003,wristband:4045,keepWarnings:true});expect(wrongSection.statusCode).toBe(200);
  expect(wrongSection.json().results.leaderboard.find((entry:any)=>entry.entryId===row.entryId)).toMatchObject({place:2,time:1200,flags:[{warningKind:'wrong-section',checked:false,message:'4045 belongs to Girl Scouts - this race is Girl Cubs'}]});
  const before=(await read()).auditNotes.length;
  expect((await call(lead,path(first,3045)+'/correct-number',{expectedWristband:2003,wristband:2005})).statusCode).toBe(409);
  expect((await call(lead,path(first,3045)+'/correct-number',{expectedWristband:4045,wristband:2001})).statusCode).toBe(400);
  expect((await read()).auditNotes).toHaveLength(before);
});
test('choosing a result counts that stable entry, excludes the other, clears duplicate flags and can be changed or corrected later',async()=>{
  const {lead,first,second,path,read}=await start();
  const saved=await call(lead,path(second,2001)+'/count-result',{});expect(saved.statusCode).toBe(200);
  const data=saved.json();
  expect(data.results.leaderboard.map((row:any)=>[row.wristband,row.status,row.position])).toEqual([[3045,'Finished',1],[2001,'Finished',2],[2001,'Not counted',null]]);
  expect(data.results.qualifiers.map((row:any)=>row.entryId)).toEqual([first.parts.runners.value[1].id,second.parts.runners.value[0].id]);
  expect(data.results.leaderboard.flatMap((row:any)=>row.flags).some((flag:any)=>flag.kind==='ran-twice')).toBe(false);
  expect(data.auditNotes[0]).toMatchObject({action:'count-result',actor:'Aisha',touches:[{raceId:first.id,entryId:first.parts.runners.value[0].id},{raceId:second.id,entryId:second.parts.runners.value[0].id}]});
  const changed=(await call(lead,path(first,2001)+'/count-result',{})).json();
  expect(changed.results.leaderboard[0]).toMatchObject({entryId:first.parts.runners.value[0].id,position:1});
  expect(changed.results.leaderboard[2]).toMatchObject({entryId:second.parts.runners.value[0].id,status:'Not counted'});
  const corrected=await call(lead,path(second,2001)+'/correct-number',{expectedWristband:2001,wristband:2004});expect(corrected.statusCode).toBe(200);
  expect(corrected.json().results.leaderboard[2]).toMatchObject({wristband:2004,status:'Finished',position:3,notCounted:false});
  expect((await call(lead,path(first,2001)+'/count-result',{})).statusCode).toBe(409);
  expect((await read()).auditNotes.map((note:any)=>note.action)).toEqual(['correct-number','count-result','count-result']);
});
test('runner rulings refuse volunteers and malformed corrections without audit changes; disqualification also settles duplicate flags',async()=>{
  const {owner,lead,volunteer,first,second,path,read}=await start();
  const target=path(first,3045);
  for(const command of ['mark-warning-checked','correct-number','count-result']) expect((await call(volunteer,`${target}/${command}`,{})).statusCode).toBe(403);
  const revision=(await call(owner,'/api/day')).json().revision;
  for(const body of [null,[],{}, {wristband:'2005',expectedWristband:3045},{wristband:2005},{wristband:-1,expectedWristband:3045},{wristband:2005,expectedWristband:3045,keepWarnings:'yes'}]) expect((await call(lead,target+'/correct-number',body)).statusCode).toBe(400);
  expect((await read()).auditNotes).toEqual([]);expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  const saved=await call(lead,path(second,2001)+'/disqualify',{reason:'Two false starts'});expect(saved.statusCode).toBe(200);
  expect(saved.json().results.leaderboard.flatMap((row:any)=>row.flags).some((flag:any)=>flag.kind==='ran-twice')).toBe(false);
  expect((await call(lead,path(second,2001)+'/count-result',{})).statusCode).toBe(409);
  expect((await call(lead,'/api/race-screen/R4')).statusCode).toBe(200);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
});
test('Mark checked records the lead who checked it, when, and the trimmed note on the warning',async()=>{
  const {lead,first,path}=await start();
  const data=(await call(lead,path(first,3045)+'/mark-warning-checked',{comment:'  Saw the wristband, wrong band issued  '})).json();
  const row=data.results.leaderboard.find((row:any)=>row.wristband===3045);
  expect(row.flags).toEqual([{kind:'warning',warningKind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs',checked:true,checkedBy:{name:'Aisha',at:data.auditNotes[0].at,noteId:data.auditNotes[0].id,note:'Saw the wristband, wrong band issued'}}]);
  expect(data.auditNotes[0].comment).toBe('Saw the wristband, wrong band issued');
});
test('Mark addition checked with no note records who and when, and no note',async()=>{
  const {lead,volunteer}=await start();
  const setup=raceSetup(app);await setup.checkIn(volunteer,'R4',[2002]);
  const race=await setup.order(volunteer,'R4',[2002,2010],{added:[2010]});await setup.times(volunteer,'R4',[1000,1100]);await setup.submit(volunteer,'R4');
  const added=race.parts.runners.value!.find((runner:any)=>runner.wristband===2010)!;
  const data=(await call(lead,`/api/lead/races/${race.id}/runners/${added.id}/mark-added-checked`,{comment:'   '})).json();
  const flag=data.results.leaderboard.find((row:any)=>row.entryId===added.id).flags.find((flag:any)=>flag.kind==='added-at-finish');
  expect(flag).toEqual({kind:'added-at-finish',message:'Added at the finish',checked:true,checkedBy:{name:'Aisha',at:data.auditNotes[0].at,noteId:data.auditNotes[0].id}});
});
test('a "Wrong section or age" disqualification settles the warning by disqualification, not by a check',async()=>{
  const {lead,first,path}=await start();
  const data=(await call(lead,path(first,3045)+'/disqualify',{reason:'Wrong section or age'})).json();
  expect(data.results.leaderboard.find((row:any)=>row.wristband===3045).flags).toEqual([{kind:'warning',warningKind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs',checked:true,settledByDisqualification:true}]);
});
test('a child\'s notes are the audit notes on them or their whole race, oldest first, kept through a corrected number; the note badge shows exactly when there are some',async()=>{
  const {lead,first,path,read}=await start();
  const row=async(entryId:string)=>(await read()).results.leaderboard.find((row:any)=>row.entryId===entryId);
  const child=first.parts.runners.value.find((runner:any)=>runner.wristband===3045).id,other=first.parts.runners.value.find((runner:any)=>runner.wristband===2001).id;
  expect(await row(child)).toMatchObject({notes:[],hasNote:false});
  await call(lead,path(first,3045)+'/mark-warning-checked',{comment:'Saw the wristband, wrong band issued'});
  expect((await call(lead,`/api/lead/races/${first.id}/times`,{baseVersion:first.parts.times.version,places:[1100,1250],comment:'Stopwatch misread'})).statusCode).toBe(200);
  expect((await call(lead,path(first,3045)+'/correct-number',{expectedWristband:3045,wristband:2045})).statusCode).toBe(200);
  const notes=(await row(child)).notes;
  expect(notes.map((note:any)=>[note.action,note.actor,note.comment])).toEqual([['mark-warning-checked','Aisha','Saw the wristband, wrong band issued'],['correct-times','Aisha','Stopwatch misread'],['correct-number','Aisha',null]]);
  expect(notes[0].message).toBe('Aisha checked the warning for 3045 (Heat 1): 3045 belongs to Boy Scouts - this race is Girl Cubs - Saw the wristband, wrong band issued');
  expect(Date.parse(notes[0].at)).toBeLessThanOrEqual(Date.parse(notes[2].at));
  expect(await row(child)).toMatchObject({wristband:2045,hasNote:true});
  // The other child in the race has only the whole race's note.
  expect((await row(other)).notes.map((note:any)=>note.action)).toEqual(['correct-times']);
});
test('a child\'s Notes are each warning with who settled it, then the audit notes, leaving out a check\'s note already on its warning\'s line',async()=>{
  const {lead,first,path,read}=await start();
  const notes=async(entryId:string)=>resultNotes((await read()).results.leaderboard.find((row:any)=>row.entryId===entryId)).map(({text,detail,open})=>({text,detail,open}));
  const child=first.parts.runners.value.find((runner:any)=>runner.wristband===3045).id;
  expect(await notes(child)).toEqual([{text:'3045 belongs to Boy Scouts - this race is Girl Cubs',detail:'Not checked yet',open:true}]);
  await call(lead,path(first,3045)+'/mark-warning-checked',{comment:'Saw the wristband'});
  expect((await call(lead,`/api/lead/races/${first.id}/times`,{baseVersion:first.parts.times.version,places:[1100,1250],comment:'Stopwatch misread'})).statusCode).toBe(200);
  expect(await notes(child)).toEqual([
    {text:'3045 belongs to Boy Scouts - this race is Girl Cubs',detail:expect.stringMatching(/^Checked by Aisha · \d{2}:\d{2} - Saw the wristband$/),open:false},
    {text:expect.stringContaining('Stopwatch misread'),detail:expect.stringMatching(/^\d{2}:\d{2}$/),open:false}
  ]);
});
test('an already-ran warning on a child whose other result no longer counts reads as settled that way in Notes, not as checked by a lead',async()=>{
  const {lead,second,path,read}=await start();
  await call(lead,path(second,2001)+'/count-result',{});
  const row=(await read()).results.leaderboard.find((row:any)=>row.entryId===second.parts.runners.value[0].id);
  expect(resultNotes(row)[0]).toMatchObject({text:'2001 already ran in this event',detail:'Settled: only one result counts',open:false});
});
test('the note badge leaves out a plain check, already on its warning\'s line, but shows for a check with the lead\'s note',async()=>{
  const {lead,volunteer,first,path,read}=await start();
  const other=await raceSetup(app).record(volunteer,'R4',[3046],[1400],{keptWarnings:[3046]});
  const row=async(race:any,number:number)=>(await read()).results.leaderboard.find((row:any)=>row.wristband===number && row.raceId===race.id);
  await call(lead,path(first,3045)+'/mark-warning-checked',{});
  expect(await row(first,3045)).toMatchObject({flags:[{checked:true}],hasNote:false});
  await call(lead,path(other,3046)+'/mark-warning-checked',{comment:'Saw the wristband'});
  expect(await row(other,3046)).toMatchObject({flags:[{checked:true}],hasNote:true});
});
