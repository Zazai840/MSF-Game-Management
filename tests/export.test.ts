import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start(){
 app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'export-owner',resetTestDay:true});
 const people=await signInOwner(app,'export-owner','Scoring'),owner=people.owner,day=people.day;
 const join=async(name:string)=>(await people.volunteer(name)).token;
 const volunteer=await join('Ahmed'),lead=await join('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
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
async function race(token:string,eventCode:string,runners:number[],places?:Array<number|null>,dnf:number[]=[]) {
 const response=await call(token,'/api/races/check-in',{eventCode,runners,keptWarnings:runners});expect(response.statusCode).toBe(200);const created=response.json().race;
 if(places){expect((await call(token,`/api/races/${created.id}/finish`,{baseVersion:0,runnersVersion:1,order:runners.filter(n=>!dnf.includes(n)),didNotFinish:dnf,didNotRun:[],added:[]})).statusCode).toBe(200);expect((await call(token,`/api/races/${created.id}/times`,{baseVersion:0,places})).statusCode).toBe(200);}
 return created;
}
test('the workbook keeps completed podium columns, every recorded/pending/deleted runner, rulings and literal audit text',async()=>{
 const {owner,lead,volunteer}=await start();
 const first=await race(volunteer,'R7',[101,102,103,104,1005],[900,950,1000,1100,null],[104]);
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
 const all=sheets[2].data;expect(all[0]).toEqual(['Event code','Event','Section','Race','Wristband number','Time','Place in race','Event position','Status','Warning','Note']);expect(all).toHaveLength(11);
 const row=(n:number,raceLabel='Race 1',code='R7')=>all.find(values=>values[0]===code&&values[3]===raceLabel&&values[4]===n)!;
 expect(row(101).slice(5,9)).toEqual([9,1,1,'1st']);expect(row(106,'Race 3')[8]).toContain('Tie settled');expect(row(104).slice(5,9)).toEqual([null,null,null,'Did not finish']);
 expect(row(103)[8]).toContain('Disqualified: Obstruction');expect(row(103)[10]).toContain('=1+1');expect(row(1005)[9]).toContain('Checked:');expect(row(1005)[10]).toContain('Checked wristband < & >');
 expect(row(101,'Race 2')[8]).toContain('Not counted');expect(row(107,'Race 4').slice(5,9)).toEqual([8,1,null,'Deleted race; Finished']);expect(row(108,'Race 1','R8')[8]).toContain('checked in');
 expect(sheets[3].data.some(values=>values[0]===null&&String(values[3]).includes('Changed the lead code'))).toBe(true);expect(sheets[3].data.some(values=>values[4]==='=1+1')).toBe(true);
 expect(other.id).not.toBe(first.id);
});
test('final export preserves absent seeds, sourced callups, corrected numbers, typed additions and deleted final generations',async()=>{
 const {owner,lead,volunteer}=await start();await race(volunteer,'R3',[1023,1066,1088,1005,1012,1110],[900,910,920,930,940,950]);await race(volunteer,'R3',[1135,1047],[960,970]);
 const completed=await call(lead,'/api/lead/events/R3/complete-stage',{stage:'heats'});expect(completed.statusCode).toBe(200);const id=completed.json().results.finalResults.raceId;
 let final=(await call(volunteer,`/api/races/${id}`)).json();
 await call(volunteer,`/api/races/${id}/presence`,{baseVersion:final.parts.runners.version,generation:final.final.generation,lineup:final.final.entries.map((entry:any)=>entry.finalEntryId),absent:[final.parts.runners.value.find((r:any)=>r.wristband===1066).id]});
 const detail=(await call(lead,'/api/lead/events/R3/results')).json();expect((await call(lead,'/api/lead/events/R3/call-up',{expectedHeatEntryId:detail.results.finalResults.nextCallUp.entryId})).statusCode).toBe(200);
 final=(await call(volunteer,`/api/races/${id}`)).json();const correctedId=final.parts.runners.value.find((r:any)=>r.wristband===1023).id;
 await call(lead,`/api/lead/races/${id}/runners/${correctedId}/correct-number`,{expectedWristband:1023,wristband:1050});final=(await call(volunteer,`/api/races/${id}`)).json();
 expect((await call(volunteer,`/api/races/${id}/finish`,{baseVersion:final.parts.finish.version,runnersVersion:final.parts.runners.version,order:[1135,1050,1005,1012,1110],didNotFinish:[1001],didNotRun:[1088],added:[1001]})).statusCode).toBe(200);
 final=(await call(volunteer,`/api/races/${id}`)).json();await call(lead,`/api/lead/races/${id}/runners/${final.parts.runners.value.find((r:any)=>r.wristband===1135).id}/disqualify`,{reason:'Two false starts'});
 expect((await call(lead,'/api/lead/events/R3/complete-stage',{stage:'final'})).statusCode).toBe(200);
 let sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);expect(sheets[0].data[1]).toEqual(['R3',null,null,null,null,null,null,null,null,1050,null,null,1005,null,null,1012]);
 const rows=sheets[1].data;expect(rows).toHaveLength(9);expect(rows[0]).toEqual(['Event code','Event','Section','Final','Seed','Wristband number','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces']);expect(rows.find(row=>row[5]===1135)?.[11]).toBe('1066 (seed 2)');expect(rows.find(row=>row[5]===1066)?.slice(4,11)).toEqual([2,1066,null,'Absent; Qualifier','Heat 1',2,1066]);
 expect(rows.find(row=>row[5]===1050)?.slice(4,11)).toEqual([1,1050,1,'Qualifier','Heat 1',1,1023]);expect(rows.find(row=>row[5]===1135)?.slice(4,11)).toEqual([2,1135,null,'Call-up','Heat 2',7,1135]);expect(rows.find(row=>row[5]===1001)?.slice(4,11)).toEqual([null,1001,null,'Added',null,null,null]);
 const all=sheets[2].data;expect(all.some(row=>row[3]==='Heat 1'&&row[4]===1066&&String(row[8]).includes('Q'))).toBe(true);expect(all.some(row=>row[3]==='Final 1'&&row[4]===1066)).toBe(false);expect(all.filter(row=>row[3]==='Final 1').every(row=>row[5]===null)).toBe(true);
 const finalRow=(number:number)=>all.find(row=>row[3]==='Final 1'&&row[4]===number)!;expect(finalRow(1050).slice(5,9)).toEqual([null,2,1,'1st']);expect(finalRow(1005).slice(5,9)).toEqual([null,3,2,'2nd']);expect(finalRow(1012).slice(5,9)).toEqual([null,4,3,'3rd']);expect(finalRow(1135).slice(5,9)).toEqual([null,1,null,'Disqualified: Two false starts']);expect(finalRow(1001).slice(5,9)).toEqual([null,null,null,'Did not finish']);
 expect((await call(lead,`/api/lead/races/${id}/re-run`,{comment:'Run final again'})).statusCode).toBe(200);
 sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);expect(sheets[0].data).toHaveLength(1);expect(sheets[1].data).toHaveLength(17);expect(sheets[1].data.filter(row=>row[3]==='Final 1').every(row=>String(row[7]).startsWith('Deleted race'))).toBe(true);expect(sheets[1].data.filter(row=>row[3]==='Final 2')).toHaveLength(8);expect(sheets[2].data.some(row=>row[3]==='Final 1'&&String(row[8]).includes('Deleted race'))).toBe(true);expect(sheets[2].data.find(row=>row[3]==='Final 1'&&row[4]===1050)?.slice(5,9)).toEqual([null,2,null,'Deleted race; Finished']);expect(sheets[1].data.find(row=>row[3]==='Final 1'&&row[5]===1050)?.[6]).toBe(1);
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
