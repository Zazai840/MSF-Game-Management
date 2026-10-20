import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** Sam checks in, Priya does the order and Jo the times on R4 (a heats event); Ali watches. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'submit-owner',resetTestDay:true});
  const people=await signInOwner(app,'submit-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const [sam,priya,jo,ali]=await Promise.all(['Sam','Priya','Jo','Ali'].map(name=>people.volunteer(name)));
  return {owner:people.owner.token as string,sam:sam.token,priya:priya.token,jo:jo.token,ali:ali.token,ids:{sam:sam.phone.id,priya:priya.phone.id,jo:jo.phone.id,ali:ali.phone.id},lead:people.lead,setup:raceSetup(app)};
}
const submit=(token:string,raceId:string|null,code='R4')=>call(token,`/api/race-screen/${code}/submit`,{raceId});
const notYet=(token:string,raceId:string|null,code='R4')=>call(token,`/api/race-screen/${code}/not-yet`,{raceId});
const names=(holders:Array<{name:string}>)=>holders.map(holder=>holder.name).sort();
/** Heat 1 of R4 worked by three phones: 2001 1st in 12.95, 2002 2nd in 13.12. */
async function worked({sam,priya,jo,setup}:Awaited<ReturnType<typeof start>>) {
  await setup.checkIn(sam,'R4',[2001,2002]);
  await setup.order(priya,'R4',[2001,2002]);
  return setup.times(jo,'R4',[1295,1312]);
}

test('Submit Race is blocked while nobody is checked in, a runner has no place, a placed wristband has no time, or a wrong time is not kept',async()=>{
  const context=await start(),{sam,priya,jo,setup}=context;
  expect((await submit(sam,null)).json()).toEqual({message:'Nobody is checked in yet'});
  const checked=await setup.checkIn(sam,'R4',[2001,2002,2003]);
  expect((await submit(sam,checked.id)).json()).toEqual({message:'3 runners have no place yet'});
  await setup.order(priya,'R4',[2001,2002]);
  expect((await submit(sam,checked.id)).json()).toEqual({message:'2003 has no place yet'});
  await setup.order(priya,'R4',[2001,2002],{didNotFinish:[2003]});
  expect((await submit(sam,checked.id)).json()).toEqual({message:'Place 1 has no time'});
  await setup.times(jo,'R4',[1295]);
  expect((await submit(sam,checked.id)).json()).toEqual({message:'Place 2 has no time'});
  await setup.times(jo,'R4',[1295,1240]);
  expect((await submit(sam,checked.id)).json()).toEqual({message:"2nd place's time needs Fix time or Keep"});
  // A kept wrong time, like a kept wristband warning, does not block it.
  await setup.times(jo,'R4',[1295,1240],[1]);
  expect((await submit(sam,checked.id)).statusCode).toBe(200);
});

test('the first press moves the race to submitted and asks every holder with entries; the last press saves it, and the next heat keeps the holds',async()=>{
  const context=await start(),{sam,priya,jo,ali,ids,setup}=context;
  const race=await worked(context);
  const before=await setup.screen(ali,'R4');
  expect(before.race.state).toBe('in progress');
  expect(names(before.asked)).toEqual(['Jo','Priya','Sam']);
  const first=(await submit(priya,race.id)).json() as RaceScreenRead;
  expect(first).toMatchObject({race:{id:race.id,state:'submitted'},pressed:[{id:ids.priya,name:'Priya'}]});
  expect(first.revision).toBeGreaterThan(before.revision);
  // A watcher holds nothing on this race, so is never asked.
  expect(names(first.asked)).toEqual(['Jo','Priya','Sam']);
  // Pressing again changes nothing.
  expect((await submit(priya,race.id)).json().revision).toBe(first.revision);
  await submit(sam,race.id);
  const saved=(await submit(jo,race.id)).json() as RaceScreenRead;
  expect(saved.race).toMatchObject({id:null,kind:'heat',number:2,state:'in progress',parts:{runners:{value:null},finish:{value:null},times:{value:null}}});
  expect(saved.lastSaved).toMatchObject({kind:'heat',number:1,by:'Jo',at:expect.any(String)});
  expect(saved).toMatchObject({asked:[],pressed:[]});
  expect(saved.holds).toEqual({'check-in':{id:ids.sam,name:'Sam'},order:{id:ids.priya,name:'Priya'},times:{id:ids.jo,name:'Jo'}});
  // The saved heat records who held each job, one history row per part.
  const lead=(await context.lead('Alex')).token;
  const read=(await call(lead,`/api/lead/races/${race.id}`)).json();
  expect(read.race).toMatchObject({state:'saved',parts:{runners:{version:1},finish:{version:1},times:{version:1}}});
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const history=(await pool.query('SELECT part,held_by FROM race_part_history WHERE race_id=$1 AND held_by IS NOT NULL ORDER BY part',[race.id])).rows;
  await pool.end();
  expect(history).toEqual([{part:'finish',held_by:'Priya'},{part:'runners',held_by:'Sam'},{part:'times',held_by:'Jo'}]);
});

test('Not yet sends a submitted race back to in progress, clears every press and leaves an audit note; entries are refused while submitted',async()=>{
  const context=await start(),{sam,priya,jo,ali,setup,lead}=context;
  const race=await worked(context);
  await submit(sam,race.id);await submit(priya,race.id);
  // While submitted, entries are refused before the holder and version checks; Take over still works.
  const runners=(await setup.screen(sam,'R4')).race.parts.runners;
  expect((await call(sam,'/api/race-screen/R4/check-in',{raceId:race.id,version:runners.version,runners:[{wristband:2001}]})).json()).toEqual({message:'Heat 1 is submitted - tap Not yet to change it'});
  expect((await call(ali,'/api/race-screen/R4/times',{raceId:race.id,version:0,places:[1],keptWrong:[]})).json()).toEqual({message:'Heat 1 is submitted - tap Not yet to change it'});
  // Anyone may tap Not yet, a watcher too.
  const back=await notYet(ali,race.id);
  expect(back.statusCode,back.body).toBe(200);
  expect(back.json()).toMatchObject({race:{id:race.id,state:'in progress'},pressed:[]});
  expect((await notYet(ali,race.id)).json().revision).toBe(back.json().revision);
  // Only a column's holder changes it again.
  expect((await call(ali,'/api/race-screen/R4/times',{raceId:race.id,version:1,places:[1290,1312],keptWrong:[]})).json()).toEqual({message:'Jo took over the times'});
  expect((await call(jo,'/api/race-screen/R4/times',{raceId:race.id,version:1,places:[1290,1312],keptWrong:[]})).statusCode).toBe(200);
  const notes=(await call((await lead('Alex')).token,'/api/lead/events/R4/results')).json().auditNotes;
  expect(notes[0]).toMatchObject({action:'not-yet',actor:'Ali',message:'Ali tapped Not yet on 60m Girl Cubs Heat 1',touches:[{raceId:race.id}]});
  // Not yet on a race that is not submitted changes nothing.
  expect((await notYet(ali,null)).json().race).toMatchObject({id:race.id,state:'in progress'});
});

test('Take over while submitted removes the old holder\'s press, so the new holder must press; everyone else\'s presses stand',async()=>{
  const context=await start(),{sam,priya,jo,ali,ids}=context;
  const race=await worked(context);
  await submit(sam,race.id);await submit(jo,race.id);
  const taken=(await call(ali,'/api/race-screen/R4/take-over',{job:'times'})).json() as RaceScreenRead;
  expect(taken.race.state).toBe('submitted');
  expect(names(taken.asked)).toEqual(['Ali','Priya','Sam']);
  expect(taken.pressed).toEqual([{id:ids.sam,name:'Sam'}]);
  await submit(priya,race.id);
  expect((await call(ali,'/api/race-screen/R4')).json().race.state).toBe('submitted');
  expect((await submit(ali,race.id)).json().race).toMatchObject({id:null,number:2});
});

test('once saved, entries are refused as saved, and a race a lead deleted before it was saved says so',async()=>{
  const context=await start(),{owner,sam,priya,jo,setup}=context;
  const race=await worked(context);
  await setup.submit(sam,'R4');await setup.submit(priya,'R4');await setup.submit(jo,'R4');
  expect((await call(jo,'/api/race-screen/R4/times',{raceId:race.id,version:1,places:[1290,1312],keptWrong:[]})).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  expect((await submit(jo,race.id)).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  expect((await notYet(jo,race.id)).json()).toEqual({message:'Heat 1 is saved - ask a lead to change it'});
  const next=await setup.checkIn(sam,'R4',[2003]);
  expect(next.number).toBe(2);
  await call(owner,`/api/lead/races/${next.id}/delete`,{permanent:false});
  expect((await submit(sam,next.id)).json()).toEqual({message:'A lead deleted Heat 2'});
  expect((await call(sam,'/api/race-screen/R4/check-in',{raceId:next.id,version:1,runners:[{wristband:2004}]})).json()).toEqual({message:'A lead deleted Heat 2'});
});

test('only saved races count for results, ranking, To check and the export, and a final has run only once saved',async()=>{
  const context=await start(),{owner,sam,priya,jo,setup,lead}=context;
  const alex=(await lead('Alex')).token;
  // A kept warning on a race in progress is not a To check item yet, and the race is not ranked.
  await setup.checkIn(sam,'R4',[2001,3045],[3045]);
  await setup.order(priya,'R4',[2001,3045]);
  await setup.times(jo,'R4',[1295,1312]);
  let results=(await call(alex,'/api/lead/events/R4/results')).json().results;
  expect(results.leaderboard.filter((row:{position:number|null})=>row.position!==null)).toEqual([]);
  expect(results.notRankedYet.map((item:{reasons:string[]})=>item.reasons)).toEqual([['in progress']]);
  expect((await call(alex,'/api/lead')).json().needsYou).toEqual([]);
  await setup.submit(sam,'R4');await setup.submit(priya,'R4');await setup.submit(jo,'R4');
  results=(await call(alex,'/api/lead/events/R4/results')).json().results;
  expect(results.leaderboard.map((row:{wristband:number;position:number|null})=>[row.wristband,row.position])).toEqual([[2001,1],[3045,2]]);
  expect((await call(alex,'/api/lead')).json().needsYou.map((item:{kind:string})=>item.kind)).toEqual(['warning']);
  // The final: seeded once heats are complete, run only once its finishing order is saved.
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  await setup.order(priya,'R4',[2001,3045]);
  const unsaved=(await call(alex,'/api/lead/events/R4/results')).json().results.finalResults;
  expect(unsaved.hasRun).toBe(false);
  expect(unsaved.leaderboard.every((row:{position:number|null})=>row.position===null)).toBe(true);
  const saved=(await setup.submit(priya,'R4'));
  expect(saved.race).toMatchObject({kind:'final',state:'saved'});
  expect(saved.lastSaved).toMatchObject({kind:'final',by:'Priya'});
  const final=(await call(alex,'/api/lead/events/R4/results')).json().results.finalResults;
  expect(final.hasRun).toBe(true);
  expect(final.leaderboard.map((row:{wristband:number;position:number|null})=>[row.wristband,row.position])).toEqual([[2001,1],[3045,2]]);
  // The saved final takes no more entries.
  expect((await call(priya,'/api/race-screen/R4/order',{raceId:saved.race.id,version:saved.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[]})).json()).toEqual({message:'Final is saved - ask a lead to change it'});
});

test('a race with every runner Did not finish needs no times, and Absent runners stay off a saved final',async()=>{
  const context=await start(),{owner,sam,priya,setup,lead}=context;
  await setup.checkIn(sam,'R4',[2001,2002]);
  await setup.order(priya,'R4',[],{didNotFinish:[2001,2002]});
  expect((await setup.submit(priya,'R4')).race.state).toBe('submitted');
  expect((await setup.submit(sam,'R4')).lastSaved).toMatchObject({number:1});
  await setup.record(priya,'R4',[2003,2004],[1200,1300]);
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await setup.screen(sam,'R4');
  const absent=final.race.final!.entries.filter(entry=>entry.wristband===2004).map(entry=>entry.finalEntryId);
  expect((await call(sam,'/api/race-screen/R4/absent',{raceId:final.race.id,version:final.race.parts.runners.version,absent})).statusCode).toBe(200);
  await setup.order(priya,'R4',[2003]);
  await setup.submit(sam,'R4');await setup.submit(priya,'R4');
  const results=(await call((await lead('Alex')).token,'/api/lead/events/R4/results')).json().results.finalResults;
  expect(results.runners.map((runner:{wristband:number})=>runner.wristband)).toEqual([2003]);
  expect(results.leaderboard.map((row:{wristband:number})=>row.wristband)).toEqual([2003]);
});

test('on a final, everyone marked Absent blocks Submit Race',async()=>{
  const context=await start(),{owner,sam,setup}=context;
  await setup.record(sam,'R4',[2001],[1200]);
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await setup.screen(sam,'R4');
  const marked=(await call(sam,'/api/race-screen/R4/absent',{raceId:final.race.id,version:final.race.parts.runners.version,absent:final.race.final!.entries.map(entry=>entry.finalEntryId)})).json() as RaceScreenRead;
  expect((await submit(sam,marked.race.id)).json()).toEqual({message:'Everyone is marked Absent'});
});
