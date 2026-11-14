import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
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
/** Team N of R22 (Girl Cubs) is 2N01-2N04. */
const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);
test('the export of a final day shows each add, replace and call-up in Finals, Note and Audit notes, with no new sheet or column',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-export-owner',resetTestDay:true});
  const people=await signInOwner(app,'final-export-owner','Aisha'),owner=people.owner.token as string,sam=(await people.volunteer('Sam')).token as string,priya=(await people.volunteer('Priya')).token as string;
  const races=raceSetup(app),relays=relayFlowSetup(app),post=relays.post;
  // R4: 2001-2006 are the six fastest, 2007 is 7th. R22: Teams 2, 5, 1, 6, 3, 7 are the six fastest, Team 8 never ran.
  for(const runners of [[2001,2002,2003,2004,2005,2006],[2007,2008]]) await races.record(owner,'R4',runners,runners.map(wristband=>1000+wristband-2000));
  await races.makeFinal(owner,'R4');
  for(let number=1;number<=8;number++) await relays.team(sam,'R22',legs(number));
  for(const [placed,times] of [[[2,1,3,4],[3400,3500,3700,3900]],[[5,6,7],[3450,3600,3800]]]){for(const number of placed) await relays.tick(sam,'R22',number);await relays.save(sam,'R22',placed,times);}
  await races.makeFinal(owner,'R22');
  // Individual final: 2002 absent, 2007 called up (no reason); 2004 absent, 2050 added; 2006 replaced by 2051.
  const first=await races.attend(sam,'R4',[2001,2003,2004,2005,2006],[2002]),raceId=first.id,read=()=>races.screen(sam,'R4');
  await post(sam,'/api/lead/events/R4/call-up',{expectedHeatEntryId:(await read()).callUp!.entryId});
  await races.attend(sam,'R4',[2001,2003,2005,2006,2007],[2002,2004]);
  await races.addRunner(sam,'R4',2050);
  const sixth=(await read()).race.final!.entries.find(entry=>entry.wristband===2006)!.finalEntryId;
  await post(priya,`/api/races/${raceId}/replace`,{raceId,version:(await read()).race.parts.runners.version,finalEntryId:sixth,wristband:2051,keptWarnings:[],reason:{reason:'Hurt',text:null}});
  // Relay final: Team 7 absent, Team 8 added; Team 2's 3rd leg 2203 replaced by 2198.
  await relays.attend(sam,'R22',[7]);
  const final=(await relays.race(sam,'R22'))!,team=(number:number)=>final.teams!.find(item=>item.number===number)!;
  await post(sam,`/api/races/${final.race.id}/teams/${team(8).id}/add`,{reason:{reason:'Not found',text:null}});
  await post(priya,`/api/relays/${final.group.event.id}/teams/${team(2).id}`,{raceId:final.race.id,version:team(2).version,legs:[2201,2202,2198,2204],keptWarnings:[2201,2202,2198,2204],reason:{reason:'Did not want to run',text:null}});

  const sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);
  // Nothing new: the five sheets and the header rows the export had before this spec.
  expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes','Day details']);
  expect(sheets.map(sheet=>sheet.data[0])).toEqual([
    ['Event code',null,null,null,null,null,null,null,null,'1st',null,null,'2nd',null,null,'3rd'],
    ['Event code','Event','Section','Final','Seed','Wristband number','Team','Leg','Final position','Attendance / role','Source heat','Heat rank','Original heat wristband','Replaces'],
    ['Event code','Event','Section','Race','Wristband number','Team','Leg','Time','Place in race','Event position','Status','Warning','Note'],
    ['Event code','Time','Who','Action','Comment'],
    ['Year','Region','Day','Downloaded at','Downloaded by'],
  ]);
  // Finals, whole rows from Seed on: a replaced finalist is "Absent; Qualifier", the new runner and the added team "Added",
  // the call-up "Call-up", the runner who replaces a finalist names them in "Replaces" as a call-up does, and a replaced leg keeps its team a Qualifier with the heat's wristband in "Original heat wristband".
  const finals=(code:string,teams:string[]=[])=>sheets[1].data.filter(values=>values[0]===code&&(!teams.length||teams.includes(values[6] as string))).map(values=>values.slice(4));
  expect(finals('R4')).toEqual([
    [1,2001,null,null,null,'Qualifier','Heat 1',1,2001,null],
    [2,2002,null,null,null,'Absent; Qualifier','Heat 1',2,2002,null],
    [3,2003,null,null,null,'Qualifier','Heat 1',3,2003,null],
    [4,2004,null,null,null,'Absent; Qualifier','Heat 1',4,2004,null],
    [5,2005,null,null,null,'Qualifier','Heat 1',5,2005,null],
    [6,2006,null,null,null,'Absent; Qualifier','Heat 1',6,2006,null],
    [2,2007,null,null,null,'Call-up','Heat 2',7,2007,'2002 (seed 2)'],
    [null,2050,null,null,null,'Added',null,null,null,null],
    [null,2051,null,null,null,'Added',null,null,null,'2006 (seed 6)'],
  ]);
  expect(finals('R22',['Team 2','Team 7','Team 8'])).toEqual([
    [1,2201,'Team 2',1,null,'Qualifier','Heat 1',1,2201,null],
    [1,2202,'Team 2',2,null,'Qualifier','Heat 1',1,2202,null],
    [1,2198,'Team 2',3,null,'Qualifier','Heat 1',1,2203,null],
    [1,2204,'Team 2',4,null,'Qualifier','Heat 1',1,2204,null],
    ...[1,2,3,4].map(leg=>[6,2700+leg,'Team 7',leg,null,'Absent; Qualifier','Heat 2',6,2700+leg,null]),
    ...[1,2,3,4].map(leg=>[null,2800+leg,'Team 8',leg,null,'Added',null,null,null,null]),
  ]);
  // All results: the Note of every row a change touches says who, what and why; the call-up has no reason.
  const note=(code:string,race:string,wristbands:number[])=>wristbands.map(wristband=>sheets[2].data.find(values=>values[0]===code&&values[3]===race&&values[4]===wristband)![12]).map(value=>value===null?null:String(value).replace(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z /gm,''));
  const heats='Aisha: Aisha marked Heats complete',calledUp='Sam: Sam called up 2007 (heat rank 7) for absent 2002',replaced='Priya: Priya replaced 2006 with 2051 (Final) - Hurt';
  expect(note('R4','Final 1',[2001,2007,2050,2051])).toEqual([null,calledUp,'Sam: Sam added 2050 to the Final - Not found',replaced]);
  expect(note('R4','Heat 2',[2007])).toEqual([`${heats}\n${calledUp}`]);
  expect(note('R4','Heat 1',[2006])).toEqual([`${heats}\n${replaced}`]);
  expect(note('R22','Final 1',[2801,2802,2803,2804])).toEqual(Array(4).fill('Sam: Sam added Team 8 to the Final - Not found'));
  expect(note('R22','Final 1',[2201,2202,2198,2204])).toEqual(Array(4).fill("Priya: Priya changed Team 2's 3rd leg from 2203 to 2198 (Final) - Did not want to run"));
  // Audit notes: one line each, with the reason as the Comment; the call-up's Comment is empty.
  expect(sheets[3].data.slice(1).map(values=>[values[0],values[2],values[3],values[4]])).toEqual([
    ['R4','Aisha','Aisha marked Heats complete',null],
    ['R22','Aisha','Aisha marked Heats complete',null],
    ['R4','Sam','Sam called up 2007 (heat rank 7) for absent 2002',null],
    ['R4','Sam','Sam added 2050 to the Final - Not found','Not found'],
    ['R4','Priya','Priya replaced 2006 with 2051 (Final) - Hurt','Hurt'],
    ['R22','Sam','Sam added Team 8 to the Final - Not found','Not found'],
    ['R22','Priya',"Priya changed Team 2's 3rd leg from 2203 to 2198 (Final) - Did not want to run",'Did not want to run'],
  ]);
});
