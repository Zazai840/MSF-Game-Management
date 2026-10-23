import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { relaySetup } from './support/relays.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import { isTeamEntry } from '../src/shared/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start(){
 app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'export-owner',resetTestDay:true});
 const people=await signInOwner(app,'export-owner','Scoring'),owner=people.owner,day=people.day;
 const signInAs=async(name:string)=>(await people.volunteer(name)).token;
 const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
 await call(owner.token,'/api/day/confirm-events',{});return {owner:owner.token as string,volunteer,lead};
}
test('Scoring downloads four value-only sheets and records its exact day revision without changing it',async()=>{
 const {owner,volunteer,lead}=await start();const before=(await call(owner,'/api/day')).json();expect(before.exportedAt).toBeNull();expect(before.exportedRevision).toBeNull();
 for(const token of [volunteer,lead]) expect((await call(token,'/api/day/export',{})).statusCode).toBe(403);
 const response=await call(owner,'/api/day/export',{});expect(response.statusCode).toBe(200);expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');expect(response.headers['content-disposition']).toMatch(/attachment; filename=".*\.xlsx"/);expect(response.headers['cache-control']).toBe('no-store');
 const sheets=await readExcelFile(response.rawPayload);expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes']);expect(sheets.every(sheet=>sheet.data.length>=1)).toBe(true);
 const after=(await call(owner,'/api/day')).json();expect(after.revision).toBe(before.revision);expect(after.exportedRevision).toBe(before.revision);expect(Date.parse(after.exportedAt)).toBeGreaterThan(0);
 await call(owner,'/api/day/export',{});expect((await call(owner,'/api/day')).json().revision).toBe(before.revision);
 await call(owner,'/api/day/events/R4/rename',{name:'Changed'});const changed=(await call(owner,'/api/day')).json();expect(changed.revision).toBeGreaterThan(changed.exportedRevision);
});
/** A race on the race screen, every warning kept: saved when it has places (the `dnf` runners Did not finish), else left checked in. */
async function race(token:string,eventCode:string,runners:number[],places?:number[],dnf:number[]=[]) {
 const setup=raceSetup(app),created:any=await setup.checkIn(token,eventCode,runners,runners);
 if(places){await setup.order(token,eventCode,runners.filter(n=>!dnf.includes(n)),{didNotFinish:dnf});await setup.times(token,eventCode,places);await setup.submit(token,eventCode);}
 return created;
}
test('the workbook keeps completed podium columns, every recorded/pending/deleted runner, rulings and literal audit text',async()=>{
 const {owner,lead,volunteer}=await start();
 const first=await race(volunteer,'R7',[101,102,103,104,1005],[900,950,1000,1100],[104]);
 const other=await race(volunteer,'R7',[105,101],[970,980]);await race(volunteer,'R7',[106],[950]);
 const deleted=await race(volunteer,'R7',[107],[800]);await call(lead,`/api/lead/races/${deleted.id}/delete`,{permanent:false,comment:'Wrong race'});
 await race(volunteer,'R8',[108]);
 const entry=(n:number)=>first.parts.runners.value.find((r:any)=>r.wristband===n).id;
 await call(lead,`/api/lead/races/${first.id}/runners/${entry(103)}/disqualify`,{reason:'Obstruction',comment:'=1+1'});
 await call(lead,`/api/lead/races/${first.id}/runners/${entry(1005)}/mark-warning-checked`,{comment:'Checked wristband < & >'});
 await call(lead,`/api/lead/races/${first.id}/runners/${entry(101)}/count-result`,{});
 const detail=(await call(lead,'/api/lead/events/R7/results')).json();const tie=detail.results.ties[0];expect(tie).toBeDefined();
 expect((await call(lead,'/api/lead/events/R7/settle-tie',{tieId:tie.id,outcome:'decided',comment:'Photo reviewed',order:[...tie.entries].reverse()})).statusCode).toBe(200);
 expect((await call(lead,'/api/lead/events/R7/complete-stage',{stage:'event'})).statusCode).toBe(200);
 await call(owner,'/api/day/lead-code',{});
 const sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);
 const input=sheets[0].data;expect(input).toHaveLength(2);expect(input[1]).toEqual(['R7',null,null,null,null,null,null,null,null,101,null,null,106,null,null,102]);
 const all=sheets[2].data;expect(all[0]).toEqual(['Event code','Event','Section','Race','Wristband number','Team','Leg','Time','Place in race','Event position','Status','Warning','Note']);expect(all).toHaveLength(11);expect(all.slice(1).every(values=>values[5]===null&&values[6]===null)).toBe(true);
 const row=(n:number,raceLabel='Race 1',code='R7')=>all.find(values=>values[0]===code&&values[3]===raceLabel&&values[4]===n)!;
 expect(row(101).slice(5,11)).toEqual([null,null,9,1,1,'1st']);expect(row(106,'Race 3')[10]).toContain('Tie settled');expect(row(104).slice(7,11)).toEqual([null,null,null,'Did not finish']);
 expect(row(103)[10]).toContain('Disqualified: Obstruction');expect(row(103)[12]).toContain('=1+1');expect(row(1005)[11]).toContain('Checked:');expect(row(1005)[12]).toContain('Checked wristband < & >');
 expect(row(101,'Race 2')[10]).toContain('Not counted');expect(row(107,'Race 4').slice(7,11)).toEqual([8,1,null,'Deleted race; Finished']);expect(row(108,'Race 1','R8')[10]).toContain('in progress');
 expect(sheets[3].data.some(values=>values[0]===null&&String(values[3]).includes('Changed the lead code'))).toBe(true);expect(sheets[3].data.some(values=>values[4]==='=1+1')).toBe(true);
 expect(other.id).not.toBe(first.id);
});
test('final export preserves absent seeds, sourced callups, corrected numbers, typed additions and deleted final generations',async()=>{
 const {owner,lead,volunteer}=await start();await race(volunteer,'R3',[1023,1066,1088,1005,1012,1110],[900,910,920,930,940,950]);await race(volunteer,'R3',[1135,1047],[960,970]);
 const completed=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(completed.statusCode).toBe(200);const id=completed.json().results.finalResults.raceId;
 const setup=raceSetup(app),current=async()=>(await setup.screen(volunteer,'R3')).race as any;
 let final=await current();expect(final.id).toBe(id);
 await call(volunteer,'/api/race-screen/R3/hold',{job:'check-in'});await call(volunteer,'/api/race-screen/R3/absent',{raceId:id,version:final.parts.runners.version,absent:[final.parts.runners.value.find((r:any)=>r.wristband===1066).id]});
 const detail=(await call(lead,'/api/lead/events/R3/results')).json();expect((await call(lead,'/api/lead/events/R3/call-up',{expectedHeatEntryId:detail.results.finalResults.nextCallUp.entryId})).statusCode).toBe(200);
 final=await current();const correctedId=final.parts.runners.value.find((r:any)=>r.wristband===1023).id;
 await call(lead,`/api/lead/races/${id}/runners/${correctedId}/correct-number`,{expectedWristband:1023,wristband:1050});final=await current();
 final=await setup.order(volunteer,'R3',[1135,1050,1005,1012,1110],{didNotFinish:[1001],didNotRun:[1088],added:[1001]});await setup.submit(volunteer,'R3');
 await call(lead,`/api/lead/races/${id}/runners/${final.parts.runners.value.find((r:any)=>r.wristband===1135).id}/disqualify`,{reason:'Two false starts'});
 expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(200);
 let sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);expect(sheets[0].data[1]).toEqual(['R3',null,null,null,null,null,null,null,null,1050,null,null,1005,null,null,1012]);
 const rows=sheets[1].data;expect(rows).toHaveLength(9);expect(rows[0]).toEqual(['Event code','Event','Section','Final','Seed','Wristband number','Team','Leg','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces']);expect(rows.find(row=>row[5]===1135)?.[13]).toBe('1066 (seed 2)');expect(rows.find(row=>row[5]===1066)?.slice(4,13)).toEqual([2,1066,null,null,null,'Absent; Qualifier','Heat 1',2,1066]);
 expect(rows.find(row=>row[5]===1050)?.slice(4,13)).toEqual([1,1050,null,null,1,'Qualifier','Heat 1',1,1023]);expect(rows.find(row=>row[5]===1135)?.slice(4,13)).toEqual([2,1135,null,null,null,'Call-up','Heat 2',7,1135]);expect(rows.find(row=>row[5]===1001)?.slice(4,13)).toEqual([null,1001,null,null,null,'Added',null,null,null]);
 const all=sheets[2].data;expect(all.some(row=>row[3]==='Heat 1'&&row[4]===1066&&String(row[10]).includes('Q'))).toBe(true);expect(all.some(row=>row[3]==='Final 1'&&row[4]===1066)).toBe(false);expect(all.filter(row=>row[3]==='Final 1').every(row=>row[7]===null)).toBe(true);
 const finalRow=(number:number)=>all.find(row=>row[3]==='Final 1'&&row[4]===number)!;expect(finalRow(1050).slice(7,11)).toEqual([null,2,1,'1st']);expect(finalRow(1005).slice(7,11)).toEqual([null,3,2,'2nd']);expect(finalRow(1012).slice(7,11)).toEqual([null,4,3,'3rd']);expect(finalRow(1135).slice(7,11)).toEqual([null,1,null,'Disqualified: Two false starts']);expect(finalRow(1001).slice(7,11)).toEqual([null,null,null,'Did not finish']);
 expect((await call(lead,`/api/lead/races/${id}/re-run`,{comment:'Run final again'})).statusCode).toBe(200);
 sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);expect(sheets[0].data).toHaveLength(1);expect(sheets[1].data).toHaveLength(17);expect(sheets[1].data.filter(row=>row[3]==='Final 1').every(row=>String(row[9]).startsWith('Deleted race'))).toBe(true);expect(sheets[1].data.filter(row=>row[3]==='Final 2')).toHaveLength(8);expect(sheets[2].data.some(row=>row[3]==='Final 1'&&String(row[10]).includes('Deleted race'))).toBe(true);expect(sheets[2].data.find(row=>row[3]==='Final 1'&&row[4]===1050)?.slice(7,11)).toEqual([null,2,null,'Deleted race; Finished']);expect(sheets[1].data.find(row=>row[3]==='Final 1'&&row[5]===1050)?.[8]).toBe(1);
});
test('concurrent export and mutation never record a revision newer than the workbook snapshot',async()=>{
 const {owner,volunteer}=await start();await race(volunteer,'R7',[101]);const before=(await call(owner,'/api/day')).json();
 const [download,changed]=await Promise.all([call(owner,'/api/day/export',{}),call(owner,'/api/day/events/R7/rename',{name:'Renamed during export'})]);expect(download.statusCode).toBe(200);expect(changed.statusCode).toBe(200);
 const sheets=await readExcelFile(download.rawPayload);const revision=Number(download.headers['x-day-revision']);expect([before.revision,before.revision+1]).toContain(revision);expect(sheets[2].data[1][1]).toBe(revision===before.revision?'60m Hurdles':'Renamed during export');
 const after=(await call(owner,'/api/day')).json();expect(after.revision).toBe(before.revision+1);expect(after.exportedRevision).toBe(revision);expect(after.exportedAt).toBe(download.headers['x-exported-at']);
});
test('removed and demoted Scoring phones cannot refresh export metadata',async()=>{
 const {owner,lead}=await start();const phone=(await call(lead,'/api/me')).json();await call(owner,`/api/day/phones/${phone.id}/role`,{role:'Scoring team'});expect((await call(lead,'/api/day/export',{})).statusCode).toBe(200);
 const before=(await call(owner,'/api/day')).json();await call(owner,`/api/day/phones/${phone.id}/role`,{role:'Lead'});expect((await call(lead,'/api/day/export',{})).statusCode).toBe(403);await call(owner,`/api/day/phones/${phone.id}/remove`,{});expect((await call(lead,'/api/day/export',{})).statusCode).toBe(401);
 const after=(await call(owner,'/api/day')).json();expect(after.exportedAt).toBe(before.exportedAt);expect(after.exportedRevision).toBe(before.exportedRevision);expect(after.revision).toBeGreaterThan(after.exportedRevision);
});
/** Boy Beavers relay R19's teams in leg order: Team 1 opens with a Girl Cub, Team 2 has no Beaver at all, the rest are Beavers. */
const relayTeams=[[2001,101,102,103],[3001,3002,3003,3004],[301,302,303,304],[401,402,403,404],[501,502,503,504],[601,602,603,604],[701,702,703,704]];
test('day export recomputes two-relay warnings from the current switched-on team lists',async()=>{
 const {owner,volunteer,lead}=await start(),relays=relaySetup(app);
 await relays.team(volunteer,'R22',[2101,2102,2103,2104]);
 await relays.tick(volunteer,'R22',1);
 for(let leg=0;leg<4;leg++) await relays.here(volunteer,'R22',1,leg);
 await relays.save(volunteer,'R22',[1],[1400]);
 // The second team list changes after the heat; its warning was never stored on the race's copy.
 await relays.team(volunteer,'R28',[4101,2101,4103,4104]);
 const detail=(await call(lead,'/api/lead/events/R22/results')).json() as EventResultsRead;
 const warning=detail.results.allResults[0].warning;
 expect(warning).toContain('2101');
 async function exportedWarning() {
  const response=await call(owner,'/api/day/export',{});expect(response.statusCode,response.body).toBe(200);
  const sheets=await readExcelFile(response.rawPayload);
  return sheets[2].data.find(row=>row[0]==='R22'&&row[4]===2101)![11];
 }
 expect(await exportedWarning()).toBe(warning);
 expect((await call(owner,'/api/day/events/R28/enabled',{enabled:false})).statusCode).toBe(200);
 expect(await exportedWarning()).toBeNull();
});

async function relayFinal(){
 const people=await start(),relays=relaySetup(app),{volunteer,lead}=people;
 for(const legs of relayTeams) await relays.team(volunteer,'R19',legs);
 for(const [placed,times] of [[[1,2,3,4],[1400,1500,1600,1900]],[[5,6,7],[1450,1550,1700]]]){for(const number of placed) await relays.tick(volunteer,'R19',number);await relays.save(volunteer,'R19',placed,times);}
 expect((await call(lead,'/api/lead/events/R19/complete-stage',{stage:'heats'})).statusCode).toBe(200);
 // Seeds: Team 1, 5, 2, 6, 3, 7. Team 7 is absent and Team 4 (heat rank 7) is called up; Team 2 swaps its 3rd leg at check-in.
 const seen=await relays.screen(volunteer,'R19'),team=(number:number)=>seen.teams!.find(item=>item.number===number)!;
 await relays.post(volunteer,'/api/race-screen/R19/absent-team',{raceId:seen.race.id,teamId:team(7).id,absent:true});
 const next=((await call(lead,'/api/lead/events/R19/results')).json() as EventResultsRead).results.finalResults!.nextCallUp!;
 expect((await call(lead,'/api/lead/events/R19/call-up',{expectedHeatEntryId:next.entryId})).statusCode).toBe(200);
 await relays.post(volunteer,'/api/race-screen/R19/edit-open',{raceId:seen.race.id,teamId:team(2).id});
 await relays.post(volunteer,'/api/race-screen/R19/edit-done',{raceId:seen.race.id,teamId:team(2).id,version:team(2).version,legs:[3001,3002,3099,3004],keptWarnings:[3001,3002,3099,3004]});
 const race=(await relays.post<any>(volunteer,'/api/race-screen/R19/take-over',{job:'order'})).race,id=(number:number)=>race.parts.runners.value.filter(isTeamEntry).find((entry:any)=>entry.team.number===number).id;
 await relays.post(volunteer,'/api/race-screen/R19/order',{raceId:race.id,version:race.parts.finish.version,order:[1,2,3,5,6,4].map(id),didNotFinish:[],didNotRun:[],added:[]});
 await relays.post(volunteer,'/api/race-screen/R19/submit',{raceId:race.id});
 const completed=await call(lead,'/api/lead/events/R19/complete-stage',{stage:'final'});expect(completed.statusCode,completed.body).toBe(200);
 return readExcelFile((await call(people.owner,'/api/day/export',{})).rawPayload);
}
test('a relay\'s Input - Running row names each medal team\'s first child of its own Section in J, M and P, falling back to the 1st leg, with the other three in U-W, AA-AC and AG-AI',async()=>{
 const sheets=await relayFinal();
 const row=sheets[0].data.find(values=>values[0]==='R19')!,at=(column:string)=>row[[...column].reduce((index,letter)=>index*26+letter.charCodeAt(0)-64,0)-1];
 // Team 1's 1st leg is a Girl Cub, so its first Beaver goes in J (Beavers of either gender share 1 to 999); Team 2 has no Beaver, so its 1st leg does.
 expect(['J','M','P'].map(at)).toEqual([101,3001,301]);
 expect(['U','V','W','AA','AB','AC','AG','AH','AI'].map(at)).toEqual([2001,102,103,3002,3099,3004,302,303,304]);
 expect(row.filter(value=>value!==null)).toHaveLength(13);
});
test('"Finals" and "All results" give a relay one row per child, with its Team and Leg after the wristband, and time, place and status repeated',async()=>{
 const sheets=await relayFinal();
 const finals=sheets[1].data;expect(finals[0]).toEqual(['Event code','Event','Section','Final','Seed','Wristband number','Team','Leg','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces']);
 const relay=finals.filter(values=>values[0]==='R19');expect(relay).toHaveLength(28);
 expect(relay.filter(values=>values[6]==='Team 2')).toEqual([[3001,1,3001],[3002,2,3002],[3099,3,3003],[3004,4,3004]].map(([wristband,leg,original])=>['R19','4x50m Relay','Boy Beavers','Final 1',3,wristband,'Team 2',leg,2,'Qualifier','Heat 1',3,original,null]));
 expect(relay.filter(values=>values[6]==='Team 7').map(values=>values.slice(4))).toEqual([701,702,703,704].map((wristband,index)=>[6,wristband,'Team 7',index+1,null,'Absent; Qualifier','Heat 2',6,wristband,null]));
 expect(relay.filter(values=>values[6]==='Team 4').map(values=>values.slice(4))).toEqual([401,402,403,404].map((wristband,index)=>[6,wristband,'Team 4',index+1,6,'Call-up','Heat 1',7,wristband,'Team 7 (seed 6)']));
 const all=sheets[2].data;expect(all[0]).toEqual(['Event code','Event','Section','Race','Wristband number','Team','Leg','Time','Place in race','Event position','Status','Warning','Note']);
 const rows=(race:string,team:string)=>all.filter(values=>values[0]==='R19'&&values[3]===race&&values[5]===team).map(values=>values.slice(4,11));
 expect(all.filter(values=>values[0]==='R19')).toHaveLength(28+24);
 expect(rows('Heat 1','Team 1')).toEqual([2001,101,102,103].map((wristband,index)=>[wristband,'Team 1',index+1,14,1,1,'Q']));
 expect(rows('Final 1','Team 2')).toEqual([3001,3002,3099,3004].map((wristband,index)=>[wristband,'Team 2',index+1,null,2,2,'2nd']));
 expect(rows('Final 1','Team 7')).toEqual([]);
});
