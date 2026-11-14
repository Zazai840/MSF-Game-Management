import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * The export of a whole final day (spec #364): an individual final with a call-up, an added runner and a replaced
 * runner, and a relay final with an added team and a replaced leg. The workbook has no new sheet and no new column.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function ok<T=RaceFlowRead>(token:string,url:string,body?:unknown) {
  const response=await call(token,url,body);
  expect(response.statusCode,`${url} ${response.body}`).toBe(200);
  return response.json() as T;
}
/** Team N of R22 (Girl Cubs) is 2N01-2N04. */
const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);
test('the export of a final day shows each add, replace and call-up in Finals, Note and Audit notes, with no new sheet or column',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-export-owner',resetTestDay:true});
  const people=await signInOwner(app,'final-export-owner','Aisha'),owner=people.owner.token as string,sam=(await people.volunteer('Sam')).token as string,priya=(await people.volunteer('Priya')).token as string;
  const races=raceSetup(app),relays=relayFlowSetup(app);
  // R4: 2001-2006 are the six fastest, 2007 is 7th. R22: Teams 2, 5, 1, 6, 3, 7 are the six fastest, Team 8 never ran.
  for(const runners of [[2001,2002,2003,2004,2005,2006],[2007,2008]]) await races.record(owner,'R4',runners,runners.map(wristband=>1000+wristband-2000));
  await races.makeFinal(owner,'R4');
  for(let number=1;number<=8;number++) await relays.team(sam,'R22',legs(number));
  for(const [placed,times] of [[[2,1,3,4],[3400,3500,3700,3900]],[[5,6,7],[3450,3600,3800]]]){for(const number of placed) await relays.tick(sam,'R22',number);await relays.save(sam,'R22',placed,times);}
  await races.makeFinal(owner,'R22');
  // Individual final: 2002 absent, 2007 called up (no reason); 2004 absent, 2050 added; 2006 replaced by 2051.
  const first=await races.attend(sam,'R4',[2001,2003,2004,2005,2006],[2002]),raceId=first.id,read=()=>ok(sam,`/api/races/${raceId}`);
  await ok(sam,'/api/lead/events/R4/call-up',{expectedHeatEntryId:(await read()).callUp!.entryId});
  await races.attend(sam,'R4',[2001,2003,2005,2006,2007],[2002,2004]);
  await races.addRunner(sam,'R4',2050);
  const sixth=(await read()).race.final!.entries.find(entry=>entry.wristband===2006)!.finalEntryId;
  await ok(priya,`/api/races/${raceId}/replace`,{raceId,version:(await read()).race.parts.runners.version,finalEntryId:sixth,wristband:2051,keptWarnings:[],reason:{reason:'Hurt',text:null}});
  // Relay final: Team 7 absent, Team 8 added; Team 2's 3rd leg 2203 replaced by 2198.
  await relays.attend(sam,'R22',[7]);
  const final=(await relays.race(sam,'R22'))!,team=(number:number)=>final.teams!.find(item=>item.number===number)!;
  await ok(sam,`/api/races/${final.race.id}/teams/${team(8).id}/add`,{reason:{reason:'Not found',text:null}});
  await ok(priya,`/api/relays/${final.group.event.id}/teams/${team(2).id}`,{raceId:final.race.id,version:team(2).version,legs:[2201,2202,2198,2204],keptWarnings:[2201,2202,2198,2204],reason:{reason:'Did not want to run',text:null}});

  const sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);
  // Nothing new: the five sheets and the header rows the export had before this spec.
  expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes','Day details']);
  expect(sheets[1].data[0]).toEqual(['Event code','Event','Section','Final','Seed','Wristband number','Team','Leg','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces']);
  expect(sheets[2].data[0]).toEqual(['Event code','Event','Section','Race','Wristband number','Team','Leg','Time','Place in race','Event position','Status','Warning','Note']);

  // Finals: a replaced finalist is "Absent; Qualifier", the new runner and the added team "Added", the call-up "Call-up".
  const finals=sheets[1].data,row=(code:string,wristband:number)=>finals.find(values=>values[0]===code&&values[5]===wristband)!;
  expect([2002,2004,2006].map(wristband=>row('R4',wristband)[9])).toEqual(['Absent; Qualifier','Absent; Qualifier','Absent; Qualifier']);
  expect(row('R4',2007).slice(9,14)).toEqual(['Call-up','Heat 2',7,2007,'2002 (seed 2)']);
  expect([2050,2051].map(wristband=>row('R4',wristband).slice(4,14))).toEqual([2050,2051].map(wristband=>[null,wristband,null,null,null,'Added',null,null,null,null]));
  expect(finals.filter(values=>values[6]==='Team 8').map(values=>values[9])).toEqual(['Added','Added','Added','Added']);
  expect(finals.filter(values=>values[6]==='Team 7').map(values=>values[9])).toEqual(Array(4).fill('Absent; Qualifier'));
  // A replaced leg keeps its team's row as a Qualifier, and the heat's own wristband in "Original heat wristband".
  expect(finals.find(values=>values[6]==='Team 2'&&values[7]===3)!.slice(5,14)).toEqual([2198,'Team 2',3,null,'Qualifier','Heat 1',1,2203,null]);
  // All results: the Note of each changed row says who, what and why; the call-up has no reason.
  const notes=(code:string,wristband:number)=>sheets[2].data.filter(values=>values[0]===code&&String(values[3]).startsWith('Final')&&values[4]===wristband).map(values=>String(values[12]).replace(/^\S+ /,''));
  expect(notes('R4',2007)).toEqual(['Sam: Sam called up 2007 (heat rank 7) for absent 2002']);
  expect(notes('R4',2050)).toEqual(['Sam: Sam added 2050 to the Final - Not found']);
  expect(notes('R4',2051)).toEqual(['Priya: Priya replaced 2006 with 2051 (Final) - Hurt']);
  expect(notes('R22',2803)).toEqual(["Sam: Sam added Team 8 to the Final - Not found"]);
  expect(notes('R22',2198)).toEqual(["Priya: Priya changed Team 2's 3rd leg from 2203 to 2198 (Final) - Did not want to run"]);
  expect(sheets[2].data.filter(values=>values[0]==='R4'&&values[3]==='Final 1'&&values[4]===2001).every(values=>values[12]===null)).toBe(true);
  // Audit notes: one line each, with the reason as the Comment; the call-up's Comment is empty.
  const audit=sheets[3].data;expect(audit[0]).toEqual(['Event code','Time','Who','Action','Comment']);
  expect(audit.slice(1).filter(values=>values[3]!=='Aisha marked Heats complete').map(values=>[values[0],values[2],values[3],values[4]])).toEqual([
    ['R4','Sam','Sam called up 2007 (heat rank 7) for absent 2002',null],
    ['R4','Sam','Sam added 2050 to the Final - Not found','Not found'],
    ['R4','Priya','Priya replaced 2006 with 2051 (Final) - Hurt','Hurt'],
    ['R22','Sam','Sam added Team 8 to the Final - Not found','Not found'],
    ['R22','Priya',"Priya changed Team 2's 3rd leg from 2203 to 2198 (Final) - Did not want to run",'Did not want to run'],
  ]);
});
