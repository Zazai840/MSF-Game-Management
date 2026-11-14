import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import { createApp } from '../src/server/app.js';
import { isRunner } from '../src/shared/races.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
/** "+ Runner" at an individual final's start line (spec #364): a free place, any wristband, a reason, an audit note. */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function ok<T=RaceFlowRead>(response:Awaited<ReturnType<typeof call>>) {
  expect(response.statusCode,response.body).toBe(200);
  return response.json() as T;
}
async function final() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'add-owner',resetTestDay:true});
  const people=await signInOwner(app,'add-owner','Aisha'),owner=people.owner.token as string,sam=(await people.volunteer('Sam')).token as string,setup=raceSetup(app);
  for(const runners of [[2001,2002,2003,2004,2005,2006],[2007,2008]]) await setup.record(owner,'R4',runners,runners.map(wristband=>1000+wristband-2000));
  const id=(await setup.makeFinal(owner,'R4')).race.id;
  return {owner,sam,read:()=>call(sam,`/api/races/${id}`).then(response=>ok(response))};
}
const attend=(token:string,read:RaceFlowRead,here:number[],absent:number[]=[])=>{
  const ids=(marked:number[])=>read.race.final!.entries.filter(entry=>marked.includes(entry.wristband!)).map(entry=>entry.finalEntryId);
  return call(token,`/api/races/${read.race.id}/absent`,{raceId:read.race.id,version:read.race.parts.runners.version,here:ids(here),absent:ids(absent)});
};
const add=(token:string,read:RaceFlowRead,wristband:number,reason?:unknown,keptWarnings:number[]=[])=>
  call(token,`/api/races/${read.race.id}/add-runner`,{raceId:read.race.id,version:read.race.parts.runners.version,wristband,keptWarnings,...(reason===undefined?{}:{reason})});
const here=(read:RaceFlowRead)=>read.race.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband);
const notFound={reason:'Not found',text:null};

test('"+ Runner" adds any wristband to a final with a free place, Here and Added in the last row, with a reason kept as an audit note',async()=>{
  const {owner,sam,read}=await final();
  // No finalist is Absent: no place is free.
  expect((await add(sam,await read(),2050,notFound)).json().message).toBe('No place is free in the Final');
  let seen=await ok(await attend(sam,await read(),[2001,2003,2004,2005,2006],[2002]));
  // A reason is needed, one of the list, "Wrong number" is not one for an add, and Other needs text.
  expect((await add(sam,seen,2050)).json().message).toBe('Choose why the change');
  expect((await add(sam,seen,2050,{reason:'Wrong number',text:null})).json().message).toBe('Choose why the change');
  expect((await add(sam,seen,2050,{reason:'Other',text:''})).json().message).toBe('Write why for Other');
  // A number already in the final is refused.
  expect((await add(sam,seen,2003,notFound)).json().message).toBe('2003 is already in the Final');
  seen=await ok(await add(sam,seen,2050,notFound));
  expect(here(seen)).toEqual([2001,2003,2004,2005,2006,2050]);
  expect(seen.race.final!.entries.at(-1)).toMatchObject({wristband:2050,seed:null,calledUp:false,absent:false});
  // 6 are Here: no place is free.
  expect((await add(sam,seen,2051,notFound)).json().message).toBe('No place is free in the Final');
  const line='Sam added 2050 to the Final - Not found';
  expect((await ok<EventResultsRead>(await call(owner,'/api/lead/events/R4/results'))).auditNotes[0]).toMatchObject({message:line,comment:'Not found'});
  // A wrong add: the added runner marked Absent frees the place again, and the note stays.
  seen=await ok(await attend(sam,seen,[2001,2003,2004,2005,2006],[2002,2050]));
  expect(here(seen)).toEqual([2001,2003,2004,2005,2006]);
  seen=await ok(await add(sam,seen,2007,{reason:'Other',text:'Zone lead  sent them'}));
  expect(here(seen)).toEqual([2001,2003,2004,2005,2006,2007]);
  expect((await ok<EventResultsRead>(await call(owner,'/api/lead/events/R4/results'))).auditNotes.slice(0,2).map(note=>note.message)).toEqual(['Sam added 2007 to the Final - Other - Zone lead sent them',line]);
});

test('a place counts finalists not marked yet: one Absent and the rest unmarked frees one place, which one add fills',async()=>{
  const {sam,read}=await final();
  let seen=await ok(await attend(sam,await read(),[2001],[2002]));
  seen=await ok(await add(sam,seen,2050,notFound));
  expect((await add(sam,seen,2051,notFound)).json().message).toBe('No place is free in the Final');
});

test('"Call up next fastest" hides and is refused once no place is free: one Absent, one added, the rest not marked',async()=>{
  const {owner,sam,read}=await final();
  let seen=await ok(await attend(sam,await read(),[],[2002]));
  const callUp=seen.callUp!;
  expect(callUp).toMatchObject({who:'2007',position:7});
  seen=await ok(await add(sam,seen,2050,notFound));
  expect(seen.callUp).toBeUndefined();
  for(const token of [sam,owner]) expect((await call(token,'/api/lead/events/R4/call-up',{expectedHeatEntryId:callUp.entryId})).json().message).toBe('No place is free in the Final');
});

test('the added runner gets a full result with place and medal, and the note shows in their Notes and the Day export; once saved, no add',async()=>{
  const {owner,sam,read}=await final();
  let seen=await ok(await attend(sam,await read(),[2001,2003,2004,2005,2006],[2002]));
  // An unknown number kept at its warning.
  seen=await ok(await add(sam,seen,7050,{reason:'Hurt',text:null},[7050]));
  const ids=seen.race.parts.runners.value!.map(runner=>runner.id),added=ids.at(-1)!;
  seen=await ok(await call(sam,`/api/races/${seen.race.id}/steps/runners/done`,{}));
  seen=await ok(await call(sam,`/api/races/${seen.race.id}/order`,{raceId:seen.race.id,version:seen.race.parts.finish.version,order:[added,...ids.slice(0,-1)],didNotFinish:[],didNotRun:[],added:[]}));
  seen=await ok(await call(sam,`/api/races/${seen.race.id}/steps/positions/done`,{}));
  expect(seen.race.state).toBe('saved');
  const line='Sam added 7050 to the Final - Hurt';
  const row=(await ok<EventResultsRead>(await call(owner,'/api/lead/events/R4/results'))).results.finalResults!.leaderboard.find(item=>item.wristband===7050)!;
  expect(row).toMatchObject({position:1,medalPlace:1});
  expect(row.notes.map(note=>note.message)).toEqual([line]);
  expect((await add(sam,seen,2051,notFound)).json().message).toBe('Final is saved - ask a lead to change it');
  const sheets=await readExcelFile((await call(owner,'/api/day/export',{})).rawPayload);
  const finals=sheets.find(sheet=>sheet.sheet==='Finals')!.data;
  expect(finals.some(cells=>cells.includes(7050) && cells.includes('Added'))).toBe(true);
  const all=sheets.find(sheet=>sheet.sheet==='All results')!.data,[race,note]=['Race','Note'].map(name=>all[0].indexOf(name));
  expect(all.filter(cells=>cells[race]==='Final 1' && cells.includes(7050)).every(cells=>String(cells[note]).includes(line))).toBe(true);
  expect(sheets.find(sheet=>sheet.sheet==='Audit notes')!.data.flat().some(cell=>typeof cell==='string' && cell.includes(line))).toBe(true);
});

test('"+ Runner" is a final\'s only: a heat refuses it',async()=>{
  const {sam}=await final();
  const heat=await ok(await call(sam,'/api/races',{eventCode:'R2',kind:'heat',number:1}));
  expect((await add(sam,heat,2050,notFound)).statusCode).toBe(409);
});
