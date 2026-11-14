import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start(fields:number[][]=[[1023,1088,1012,1135,1047,1101],[1066,1005,1110,1031,1092]]) {
 app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-owner',resetTestDay:true});
 const people=await signInOwner(app,'final-owner','Owner'),owner=people.owner,day=people.day;
 const signInAs=async(name:string)=>(await people.volunteer(name)).token;
 const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
 const heats=[];const times=[[901,925,948,977,990,1024],[912,939,961,1003,1048]];
 const setup=raceSetup(app);
 for(const [i,runners] of fields.entries()) heats.push(await setup.record(volunteer,'R3',runners,times[i].slice(0,runners.length)));
 return {volunteer,lead,heats,setup,owner:owner.token as string};
}
/** R3's final as the race flow shows it now: attendance only, no heat provenance. */
async function finalRead(token:string) {
 const final=(await call(token,'/api/races')).json().groups.find((group:any)=>group.event.code==='R3').races.find((race:any)=>race.kind==='final');
 return final && (await call(token,`/api/races/${final.id}`)).json().race;
}
/** A check-in on R3's final: these wristbands Absent, everyone else Here. */
async function markAbsent(token:string,wristbands:number[]) {
 const race=await finalRead(token);
 const ids=(absent:boolean)=>race.final.entries.filter((entry:any)=>wristbands.includes(entry.wristband)===absent).map((entry:any)=>entry.finalEntryId);
 return call(token,`/api/races/${race.id}/absent`,{raceId:race.id,version:race.parts.runners.version,here:ids(false),absent:ids(true)});
}
test('heat-to-final attendance, audited next ranked callups, order-only podium and final locks',async()=>{
 const {volunteer,lead,setup}=await start();
 await setup.makeFinal(lead,'R3');
 expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(409);
 const result=(await call(lead,'/api/lead/events/R3/results')).json().results;expect(result.status).toBe('Heats complete - final to run');expect(result.finalResults.entries.map((e:any)=>e.heatWristband)).toEqual([1023,1066,1088,1005,1012,1110]);const id=result.finalResults.raceId;
 let final=await finalRead(volunteer);expect(final.id).toBe(id);expect(final.final.entries[0].heatRank).toBeUndefined();expect(final.final.entries[0].heatRaceId).toBeUndefined();expect(final.parts.runners.value).toEqual([]);
 expect((await call(volunteer,`/api/races/${id}/steps/times/done`,{})).json().message).toBe('A final has no times');
 expect((await markAbsent(volunteer,[1066,1088])).statusCode).toBe(200);
 final=await finalRead(volunteer);
 expect((await call(volunteer,`/api/races/${id}/check-in`,{raceId:id,version:final.parts.runners.version,runners:[{wristband:1023}]})).json().message).toBe("Mark the final's runners Here or Absent");
 // Any signed-in profile can call up (ADR 0003); a suggestion that is not the next-ranked runner is refused.
 expect((await call(volunteer,'/api/lead/events/R3/call-up',{expectedHeatEntryId:'none'})).statusCode).toBe(409);
 let read=(await call(lead,'/api/lead/events/R3/results')).json();expect(read.results.finalResults.nextCallUp.wristband).toBe(1135);
 // Only a lead's call-up carries a comment into the audit note.
 expect((await call(volunteer,'/api/lead/events/R3/call-up',{expectedHeatEntryId:read.results.finalResults.nextCallUp.entryId,comment:'typed by a volunteer'})).statusCode).toBe(403);
 expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.nextCallUp.wristband).toBe(1135);
 for(const number of [1135,1047]) {const next=read.results.finalResults.nextCallUp;expect(next.wristband).toBe(number);const save=await call(lead,'/api/lead/events/R3/call-up',{expectedHeatEntryId:next.entryId});expect(save.statusCode).toBe(200);read=save.json();}
 expect(read.results.finalResults.additionalEntries).toEqual([]);expect(read.results.finalResults.entries.filter((e:any)=>e.absent).map((e:any)=>e.heatWristband)).toEqual([1066,1088]);expect(read.auditNotes.filter((n:any)=>n.action==='call-up')).toHaveLength(2);
 // The called-up runners are Here at once.
 expect((await finalRead(volunteer)).parts.runners.value.map((r:any)=>r.wristband)).toEqual([1023,1005,1012,1110,1135,1047]);
 final=await finalRead(volunteer);const runners=final.parts.runners.value;const order=[1047,1023,1110,1135,1005,1012];
 await setup.order(volunteer,'R3',order);expect((await setup.submit(volunteer,'R3')).race.state).toBe('saved');
 const first=runners.find((r:any)=>r.wristband===1047);await call(lead,`/api/lead/races/${id}/runners/${first.id}/disqualify`,{reason:'Two false starts'});
 const done=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'});expect(done.statusCode).toBe(200);expect(done.json().results.inputRunning).toEqual({eventCode:'R3',first:1023,second:1110,third:1135});expect(done.json().results.finalResults.leaderboard.every((r:any)=>r.time===null)).toBe(true);
 await app.close();app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-owner'});const restarted=(await call(lead,'/api/lead/events/R3/results')).json();expect(restarted.results.finalResults.entries).toEqual(done.json().results.finalResults.entries);expect(restarted.results.inputRunning).toEqual(done.json().results.inputRunning);expect(restarted.auditNotes.filter((n:any)=>n.action==='call-up')).toHaveLength(2);
 for(const [what,body] of [['order',{raceId:id,version:1,order:[],didNotFinish:[],didNotRun:[],added:[]}],['check-in',{raceId:id,version:1,runners:[{wristband:1023}]}],['steps/positions/done',{}]] as const) {const refused=await call(volunteer,`/api/races/${id}/${what}`,body);expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('Boy Cubs final is finished. Ask a lead to change this race.');}
 const locked=await markAbsent(volunteer,[]);expect(locked.statusCode).toBe(409);expect(locked.json().message).toBe('Boy Cubs final is finished. Ask a lead to change this race.');
 expect((await call(volunteer,'/api/lead/events/R3/complete-stage',{stage:'heats'})).statusCode).toBe(403);expect((await call(volunteer,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(403);expect((await call(volunteer,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Correction'})).statusCode).toBe(403);expect((await call(volunteer,'/api/lead/events/R3/reopen-stage',{stage:'final',comment:'Correction'})).statusCode).toBe(403);
 const reopened=await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'final',comment:'Review final placing'});expect(reopened.statusCode).toBe(200);expect(reopened.json().results.inputRunning).toBeNull();expect(reopened.json().results.finalResults.hasRun).toBe(true);
});
test('Reopen heats removes the unrun final, not into Deleted races; + Final makes "Final" afresh; a saved final with cleared Finish prevents reopening heats',async()=>{
 const {lead,volunteer,heats,setup}=await start([[1023,1088]]);
 const made=await call(lead,'/api/races',{eventCode:'R3',kind:'final'});expect(made.statusCode).toBe(200);const oldId=made.json().race.id;const oldVersion=(await finalRead(volunteer)).parts.runners.version;
 const reopenedHeats=await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Late timer correction'});expect(reopenedHeats.statusCode).toBe(200);
 // The final has not run: it goes with its line-up, so the event is as one with no final, and nobody checks in on it.
 expect(reopenedHeats.json().results.finalResults).toBeNull();expect(await finalRead(volunteer)).toBeUndefined();
 expect((await call(lead,'/api/lead/events/R3/deleted-races')).json()).toEqual([]);
 expect(reopenedHeats.json().auditNotes[0]).toMatchObject({action:'reopen-stage',comment:'Late timer correction',message:'Aisha reopened Heats complete - Late timer correction'});
 expect((await call(volunteer,`/api/races/${oldId}/absent`,{raceId:oldId,version:oldVersion,here:[],absent:[]})).statusCode).toBe(404);
 const group=(await call(lead,'/api/races')).json().groups.find((group:any)=>group.event.code==='R3');
 expect(group).toMatchObject({heatsOpen:true,finalAvailable:true,nextHeat:2});expect(group.races.map((race:any)=>race.kind)).toEqual(['heat']);
 await call(lead,`/api/lead/races/${heats[0].id}/times`,{baseVersion:1,places:[1000,900],acceptOutOfOrder:true});
 const remade=await call(lead,'/api/races',{eventCode:'R3',kind:'final'});expect(remade.statusCode).toBe(200);const id=remade.json().race.id;
 expect(remade.json().race).toMatchObject({kind:'final',number:1});expect(id).not.toBe(oldId);
 const result=(await call(lead,'/api/lead/events/R3/results')).json().results;expect(result.finalResults.raceId).toBe(id);expect(result.finalResults.entries.map((e:any)=>e.heatWristband)).toEqual([1088,1023]);expect(result.finalResults.entries.every((e:any)=>!e.absent)).toBe(true);
 await markAbsent(volunteer,[]);await setup.order(volunteer,'R3',[1023,1088]);await setup.submit(volunteer,'R3');
 const race=await finalRead(volunteer);await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[...race.parts.runners.value.map((r:any)=>({entryId:r.id,wristband:r.wristband})),{wristband:1012}],comment:'Ran in lane 3'});
 // A saved final is read as a lead reads it after correcting its runners.
 const leadRead=async()=>(await call(lead,`/api/lead/races/${id}`)).json().race;
 const before=await leadRead();expect(before.parts.finish.value).toBeNull();expect(before.final.hasRun).toBe(true);
 const reopened=await call(lead,'/api/lead/events/R3/reopen-stage',{stage:'heats',comment:'Recheck heats'});expect(reopened.statusCode).toBe(409);expect(reopened.json()).toEqual({message:'The final has started - heats cannot be reopened'});const after=await leadRead();expect(after).toEqual(before);
 const rerun=await call(lead,`/api/lead/races/${id}/re-run`,{});expect(rerun.statusCode).toBe(200);expect(rerun.json().results.finalResults).toMatchObject({hasRun:false});expect(rerun.json().results.finalResults.entries[0]).toMatchObject({heatRaceId:heats[0].id,heatWristband:1088,seed:1});
 const newFinal=await finalRead(volunteer);expect(newFinal.id).toBe(rerun.json().newRaceId);expect(newFinal.final.entries.map((entry:any)=>entry.wristband)).toContain(1012);expect(newFinal.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([1088,1023,1012]);
});
test('an event with no heats run has no final to make',async()=>{
 const {lead,volunteer}=await start([]);const refused=await call(lead,'/api/races',{eventCode:'R3',kind:'final'});
 expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('The final opens when every heat has times');expect(await finalRead(volunteer)).toBeUndefined();
});
test('typed final additions and corrected numbers keep actual eligibility warnings without a heat-to-final repeat warning',async()=>{
 const {lead,volunteer,setup}=await start([[1023,1088]]);const id=(await setup.makeFinal(lead,'R3')).race.id;
 await markAbsent(volunteer,[]);await setup.attend(volunteer,'R3',undefined,[1088]);await setup.addRunner(volunteer,'R3',2005,[2005]);await setup.order(volunteer,'R3',[1023,2005]);await setup.submit(volunteer,'R3');
 const detail=(await call(lead,'/api/lead/events/R3/results')).json();expect(detail.results.needsYou.filter((item:any)=>item.kind==='warning')).toHaveLength(1);expect(detail.results.needsYou.some((item:any)=>item.kind==='ran-twice')).toBe(false);expect(detail.results.checkSheet.worthALook).toMatchObject([{kind:'warning',raceId:id}]);expect(detail.results.checkSheet.mustSettleFirst).toEqual([]);expect(detail.results.finalResults.leaderboard[1].flags).toContainEqual(expect.objectContaining({kind:'warning',warningKind:'wrong-section'}));
 const entry=detail.results.finalResults.leaderboard[0];const corrected=await call(lead,`/api/lead/races/${id}/runners/${entry.entryId}/correct-number`,{expectedWristband:1023,wristband:2010,keepWarnings:true,reason:{reason:'Wrong number',text:null}});expect(corrected.statusCode).toBe(200);expect(corrected.json().results.checkSheet.worthALook).toHaveLength(2);expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(200);
});
test('a runner a lead adds to a saved final reads Added at the finish and takes Mark addition checked',async()=>{
 const {lead,volunteer,setup}=await start([[1023,1088]]);const id=(await setup.makeFinal(lead,'R3')).race.id;
 await markAbsent(volunteer,[]);await setup.order(volunteer,'R3',[1023,1088]);await setup.submit(volunteer,'R3');
 const leadRace=async()=>(await call(lead,`/api/lead/races/${id}`)).json().race;
 const row=async()=>(await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.leaderboard.find((r:any)=>r.wristband===1012);
 const race=await leadRace();
 expect((await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[...race.parts.runners.value.map((r:any)=>({entryId:r.id,wristband:r.wristband})),{wristband:1012}],finish:{order:[1023,1088,1012],didNotFinish:[]},comment:'Ran in lane 3'})).statusCode).toBe(200);
 const added=await row();expect(added.flags).toContainEqual({kind:'added-at-finish',message:'Added at the finish'});
 expect((await call(lead,`/api/lead/races/${id}/runners/${added.entryId}/mark-added-checked`,{})).statusCode).toBe(200);
 expect((await row()).flags).toContainEqual(expect.objectContaining({kind:'added-at-finish',checked:true}));
 const again=await leadRace();
 expect((await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:again.parts.runners.version,finishVersion:again.parts.finish.version,runners:again.parts.runners.value.map((r:any)=>({entryId:r.id,wristband:r.wristband})),comment:'Checked again'})).statusCode).toBe(200);
 expect((await leadRace()).parts.runners.value.find((r:any)=>r.wristband===1012).addedAtFinish).toBe(true);
 expect((await row()).flags).toContainEqual(expect.objectContaining({kind:'added-at-finish',checked:true}));
});
test('authoritative final runner publications keep absence aligned through lead removal and Didn\'t run',async()=>{
 const {lead,volunteer,setup}=await start([[1023,1088]]);const id=(await setup.makeFinal(lead,'R3')).race.id;
 // The order holder says 1088 didn't run: the final's line-up shows them absent, until marked Here again.
 await markAbsent(volunteer,[]);await setup.order(volunteer,'R3',[1023],{didNotRun:[1088]});expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries[1].absent).toBe(true);
 await markAbsent(volunteer,[]);expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries[1].absent).toBe(false);
 // Once the final is saved, a lead taking a runner off marks them absent too.
 await setup.order(volunteer,'R3',[1023,1088]);await setup.submit(volunteer,'R3');
 const race=(await call(lead,`/api/lead/races/${id}`)).json().race,removed=race.parts.runners.value[1];
 expect((await call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[{entryId:race.parts.runners.value[0].id,wristband:1023}]})).statusCode).toBe(200);
 expect((await call(lead,'/api/lead/events/R3/results')).json().results.finalResults.entries.find((entry:any)=>entry.finalEntryId===removed.id).absent).toBe(true);
});
test('a stale Here / Absent list is not saved, and a lead\'s corrected number stays through Absent and back to Here',async()=>{
 const {lead,volunteer,setup}=await start([[1023,1088]]);const id=(await setup.makeFinal(lead,'R3')).race.id;
 await markAbsent(volunteer,[]);const before={race:await finalRead(volunteer)};
 await call(lead,`/api/lead/races/${id}/runners/${before.race.parts.runners.value[0].id}/correct-number`,{expectedWristband:1023,wristband:1050,reason:{reason:'Wrong number',text:null}});
 const stale=await call(volunteer,`/api/races/${id}/absent`,{raceId:id,version:before.race.parts.runners.version,here:[],absent:[]});
 expect(stale.statusCode).toBe(409);expect(stale.json().message).toBe('Aisha changed this a moment ago');
 expect((await markAbsent(volunteer,[1050])).json().race.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([1088]);
 const here=(await markAbsent(volunteer,[])).json();
 expect(here.race.parts.runners.value.map((runner:any)=>runner.wristband)).toEqual([1050,1088]);
 expect(here.race.final.entries.map((entry:any)=>[entry.wristband,entry.absent])).toEqual([[1050,false],[1088,false]]);
});
test('a lead\'s Correct number on a final runner needs a reason, kept as an audit note in the runner\'s Notes, the Notes tab and the export; on a heat it needs none',async()=>{
 const {volunteer,lead,heats,setup}=await start([[1023,1088]]);
 const entryOf=async(raceId:string,wristband:number)=>(await call(lead,`/api/lead/races/${raceId}`)).json().race.parts.runners.value.find((runner:any)=>runner.wristband===wristband).id;
 // A heat's Correct number asks no reason.
 const heat=await call(lead,`/api/lead/races/${heats[0].id}/runners/${await entryOf(heats[0].id,1088)}/correct-number`,{expectedWristband:1088,wristband:1089});
 expect(heat.statusCode).toBe(200);expect(heat.json().auditNotes[0].message).toBe('Aisha corrected 1088 to 1089 (Heat 1)');
 const id=(await setup.makeFinal(lead,'R3')).race.id;
 await markAbsent(volunteer,[]);await setup.order(volunteer,'R3',[1023,1089]);await setup.submit(volunteer,'R3');
 const correct=async(body:object)=>call(lead,`/api/lead/races/${id}/runners/${await entryOf(id,1023)}/correct-number`,{expectedWristband:1023,wristband:1050,...body});
 expect((await correct({})).json()).toEqual({message:'Choose why the change'});
 expect((await correct({reason:{reason:'Other',text:' '}})).json()).toEqual({message:'Write why for Other'});
 const saved=await correct({reason:{reason:'Wrong number',text:'Read off the wrong child'}});expect(saved.statusCode).toBe(200);
 const line='Aisha corrected 1023 to 1050 (Final) - Wrong number - Read off the wrong child';
 // The event's Notes tab and the runner's Notes.
 expect(saved.json().auditNotes[0].message).toBe(line);
 expect(saved.json().results.finalResults.leaderboard.find((row:any)=>row.wristband===1050).notes.map((note:any)=>note.message)).toEqual([line]);
 // The Day export: the Note column on the runner's Final row, and the Audit notes sheet.
 const sheets=await readExcelFile((await call(lead,'/api/day/export',{})).rawPayload);
 const all=sheets.find(sheet=>sheet.sheet==='All results')!.data,[race,wristband,note]=['Race','Wristband number','Note'].map(name=>all[0].indexOf(name));
 const rows=all.filter(row=>row[race]==='Final 1' && row[wristband]===1050);
 expect(rows).toHaveLength(1);expect(String(rows[0][note])).toContain(line);
 expect(sheets.find(sheet=>sheet.sheet==='Audit notes')!.data.flat().filter(cell=>cell===line)).toHaveLength(1);
});
test('a lead\'s Correct runner list adding a runner to a saved final, or changing a number, needs a comment; removing or reordering does not; on a saved heat it stays optional',async()=>{
 const {volunteer,lead,heats,setup}=await start([[1023,1088],[1066]]);
 const leadRace=async(raceId:string)=>(await call(lead,`/api/lead/races/${raceId}`)).json().race;
 const correct=async(raceId:string,added:number,body:object={})=>{
  const race=await leadRace(raceId),kept=race.parts.runners.value;
  const numberOf=(id:string)=>kept.find((runner:any)=>runner.id===id).wristband;
  return call(lead,`/api/lead/races/${raceId}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:[...kept.map((runner:any)=>({entryId:runner.id,wristband:runner.wristband})),{wristband:added}],
   finish:{order:race.parts.finish.value.order.map(numberOf),didNotFinish:[added]},...body});
 };
 expect((await correct(heats[1].id,1012)).statusCode).toBe(200);
 const id=(await setup.makeFinal(lead,'R3')).race.id;
 await markAbsent(volunteer,[]);await setup.order(volunteer,'R3',[1023,1066,1088]);await setup.submit(volunteer,'R3');
 for(const comment of [undefined,'  ']) expect((await correct(id,1110,comment===undefined?{}:{comment})).json()).toEqual({message:'Enter a comment explaining this ruling'});
 const saved=await correct(id,1110,{comment:'Ran in lane 6, missed at the start'});expect(saved.statusCode).toBe(200);
 expect(saved.json().auditNotes[0].message).toBe('Aisha corrected the runners for Final 1: 1023, 1066, 1088, 1110 - Ran in lane 6, missed at the start');
 // The list as it stands, each runner sent with a number (the same, or changed) in the order given.
 const list=async(numbers:Array<[number,number]>,body:object={})=>{
  const race=await leadRace(id),kept=race.parts.runners.value;
  return call(lead,`/api/lead/races/${id}/runners`,{baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,runners:numbers.map(([was,wristband])=>({entryId:kept.find((runner:any)=>runner.wristband===was).id,wristband})),...body});
 };
 // A changed number on an entry kept: a comment is needed, as for an addition.
 expect((await list([[1023,1024],[1066,1066],[1088,1088],[1110,1110]])).json()).toEqual({message:'Enter a comment explaining this ruling'});
 expect((await list([[1023,1024],[1066,1066],[1088,1088],[1110,1110]],{comment:'Read off the wrong child'})).statusCode).toBe(200);
 // Reordering or removing only: no comment.
 expect((await list([[1066,1066],[1024,1024],[1088,1088],[1110,1110]])).statusCode).toBe(200);
 expect((await list([[1066,1066],[1024,1024],[1088,1088]])).statusCode).toBe(200);
});
test('"+ Final" is the only way to make a final: the lead API no longer completes heats',async()=>{
 const {lead,volunteer}=await start([[1023,1088]]);
 const refused=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});
 expect(refused.statusCode).toBe(409);expect(refused.json().message).toBe('Make the final with + Final on Races');
 expect(await finalRead(volunteer)).toBeUndefined();
});
