import { afterEach,expect,test } from 'vitest';
import { isRunner } from '../src/shared/races.js';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/storage.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function screen(token:string):Promise<RaceScreenRead> {
  const response=await call(token,'/api/race-screen/R4');
  expect(response.statusCode,response.body).toBe(200);
  return response.json();
}
/** Two heats of R4 (eight runners, timed 2001 fastest), then heats complete: the final seeds the six fastest. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-owner',resetTestDay:true});
  const people=await signInOwner(app,'final-owner','Aisha');
  const owner=people.owner.token as string;
  await call(owner,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam')).token,priya=(await people.volunteer('Priya')).token;
  for(const runners of [[2001,2002,2003,2004,2005,2006],[2007,2008]]) await raceSetup(app).record(owner,'R4',runners,runners.map(wristband=>1000+wristband-2000));
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  return {owner,lead:people.lead,sam,priya};
}
const absent=(token:string,read:RaceScreenRead,wristbands:number[])=>call(token,'/api/race-screen/R4/absent',{raceId:read.race.id,version:read.race.parts.runners.version,absent:read.race.final!.entries.filter(entry=>wristbands.includes(entry.wristband)).map(entry=>entry.finalEntryId)});
const order=(token:string,read:RaceScreenRead,wristbands:number[])=>call(token,'/api/race-screen/R4/order',{raceId:read.race.id,version:read.race.parts.finish.version,order:wristbands.map(wristband=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id),didNotFinish:[],didNotRun:[],added:[]});
const wristbands=(read:RaceScreenRead)=>read.race.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband);
const placed=(read:RaceScreenRead)=>read.race.parts.finish.value!.order.map(id=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.id===id)!.wristband);

test('the final\'s order can start before anyone marks attendance, and a runner the check-in holder marks Absent leaves the order holder\'s list until marked Here again',async()=>{
  const {sam,priya}=await start();
  const seeded=await screen(priya);
  expect(seeded.race.kind).toBe('final');
  expect(wristbands(seeded)).toEqual([2001,2002,2003,2004,2005,2006]);
  // No gate on attendance: the order holder places runners at once.
  expect((await call(priya,'/api/race-screen/R4/hold',{job:'order'})).statusCode).toBe(200);
  const ordered=await order(priya,seeded,[2003,2001]);
  expect(ordered.statusCode,ordered.body).toBe(200);
  await call(sam,'/api/race-screen/R4/hold',{job:'check-in'});
  const marked=await absent(sam,ordered.json(),[2003]);
  expect(marked.statusCode,marked.body).toBe(200);
  const away=marked.json() as RaceScreenRead;
  expect(wristbands(away)).toEqual([2001,2002,2004,2005,2006]);
  expect(away.race.final!.entries.find(entry=>entry.wristband===2003)!.absent).toBe(true);
  expect(placed(away)).toEqual([2001]);
  // Only the check-in holder marks attendance.
  expect((await absent(priya,away,[])).json()).toEqual({message:'Sam took over check-in'});
  const back=(await absent(sam,away,[])).json() as RaceScreenRead;
  expect(wristbands(back)).toEqual([2001,2002,2003,2004,2005,2006]);
  expect(back.race.final!.entries.every(entry=>!entry.absent)).toBe(true);
  // Typing wristbands is for heats: the final's runners are its seeded qualifiers.
  expect((await call(sam,'/api/race-screen/R4/check-in',{raceId:back.race.id,version:back.race.parts.runners.version,runners:[{wristband:2009}]})).json()).toEqual({message:'Mark the final\'s runners Here or Absent'});
  expect((await call(sam,'/api/race-screen/R4/absent',{raceId:back.race.id,version:back.race.parts.runners.version,absent:['not-in-this-final']})).statusCode).toBe(400);
});
test('a lead\'s call-up for an absent runner shows on the race screen, and the old presence route is gone',async()=>{
  const {lead,sam}=await start();
  await call(sam,'/api/race-screen/R4/hold',{job:'check-in'});
  const away=(await absent(sam,await screen(sam),[2002])).json() as RaceScreenRead;
  const leadToken=(await lead('Lena')).token;
  const results=(await call(leadToken,'/api/lead/events/R4/results')).json();
  expect(results.results.finalResults.nextCallUp.wristband).toBe(2007);
  const calledUp=await call(leadToken,'/api/lead/events/R4/call-up',{expectedHeatEntryId:results.results.finalResults.nextCallUp.entryId});
  expect(calledUp.statusCode,calledUp.body).toBe(200);
  const read=await screen(sam);
  expect(read.revision).toBeGreaterThan(away.revision);
  expect(wristbands(read)).toEqual([2001,2003,2004,2005,2006,2007]);
  expect(read.race.final!.entries.map(entry=>entry.wristband)).toContain(2007);
  expect((await call(sam,`/api/races/${read.race.id}/presence`,{baseVersion:1,generation:'x',lineup:[],absent:[]})).statusCode).toBe(404);
});
test('a database an older build left, with its "Is everyone here?" confirm column, boots and still seeds the final',async()=>{
  const old=await openDatabase(process.env.TEST_DATABASE_URL!,true);
  // Made strict (no default) so a boot that keeps the column fails the final's insert, not just leaves clutter.
  await old.query('ALTER TABLE race_finals ADD COLUMN IF NOT EXISTS presence_confirmed boolean NOT NULL DEFAULT false');
  await old.query('ALTER TABLE race_finals ALTER COLUMN presence_confirmed DROP DEFAULT');
  await old.end();
  const {priya}=await start();
  expect((await screen(priya)).race.kind).toBe('final');
});
