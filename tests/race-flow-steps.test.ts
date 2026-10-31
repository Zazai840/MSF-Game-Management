import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/storage.js';
import { isRunner } from '../src/shared/races.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
/**
 * Each step's writes in the race flow: the race screen's check-in, order, times and a final's Here / Absent, now
 * addressed by race with no hold (ADR 0003). Refusals keep the race screen's order and words.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start(confirmed=true) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'steps-owner',resetTestDay:true});
  const people=await signInOwner(app,'steps-owner','Aisha'),owner=people.owner.token as string;
  if(confirmed) await call(owner,'/api/day/confirm-events',{});
  return {owner,people,sam:(await people.volunteer('Sam')).token,priya:(await people.volunteer('Priya')).token,jo:(await people.volunteer('Jo')).token};
}
async function ok(response:Awaited<ReturnType<typeof call>>) {
  expect(response.statusCode,response.body).toBe(200);
  return response.json() as RaceFlowRead;
}
const heat=async(token:string,code='R4')=>ok(await call(token,'/api/races',{eventCode:code,kind:'heat',number:1}));
const checkIn=(token:string,read:RaceFlowRead,runners:Array<number|{id:string;wristband:number}>)=>call(token,`/api/races/${read.race.id}/check-in`,{raceId:read.race.id,version:read.race.parts.runners.version,runners:runners.map(runner=>typeof runner==='object'?runner:{wristband:runner})});
const order=(token:string,read:RaceFlowRead,body:object)=>call(token,`/api/races/${read.race.id}/order`,{raceId:read.race.id,version:read.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[],...body});
const times=(token:string,read:RaceFlowRead,body:object)=>call(token,`/api/races/${read.race.id}/times`,{raceId:read.race.id,version:read.race.parts.times.version,keptWrong:[],...body});
const idOf=(read:RaceFlowRead,wristband:number)=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
const placed=(read:RaceFlowRead)=>(read.race.parts.finish.value?.order||[]).map(id=>read.race.parts.runners.value!.filter(isRunner).find(runner=>runner.id===id)?.wristband??id);
const wristbands=(read:RaceFlowRead)=>read.race.parts.runners.value!.filter(isRunner).map(runner=>runner.wristband);

test.each([
  [[2001,2001],'2001 is already in this race'],
  [[-1],'Enter a whole wristband number'],
  [['2001'],'Enter a whole wristband number']
])('check-in refuses invalid runner lists plainly: %j',async(runners,message)=>{
  const {sam}=await start();
  const response=await checkIn(sam,await heat(sam),runners as number[]);
  expect(response.statusCode).toBe(400);expect(response.json().message).toBe(message);
});
test('check-in works on any switched-on event while programme confirmation remains a reminder; a switched-off event makes no new race',async()=>{
  const {owner,sam}=await start(false);
  expect((await ok(await checkIn(sam,await heat(sam),[2001]))).race.number).toBe(1);
  await call(owner,'/api/day/events/R16/rename',{name:'200m sprint'});
  expect((await heat(sam,'R16')).group.event.name).toBe('200m sprint');
  await call(owner,'/api/day/events/R5/enabled',{enabled:false});
  expect((await call(sam,'/api/races',{eventCode:'R5',kind:'heat',number:1})).json().message).toBe('This event is switched off');
});
test('number checks warn about another race in this event, but ignore this race, deleted races and other events',async()=>{
  const {owner,sam}=await start();
  const setup=raceSetup(app),first=await setup.record(sam,'R4',[2001],[1200]);
  const check=(body:object)=>call(sam,'/api/wristband-check',{eventCode:'R4',wristband:2001,...body});
  expect((await check({})).json().warnings).toEqual([{kind:'already-ran',message:'2001 already ran in this event'}]);
  expect((await check({raceId:first.id})).json().warnings).toEqual([]);
  expect((await check({eventCode:'R16'})).json().warnings).toEqual([]);
  expect((await check({eventCode:'R99'})).statusCode).toBe(404);
  await call(owner,`/api/lead/races/${first.id}/delete`,{permanent:false});
  expect((await check({})).json().warnings).toEqual([]);
  expect((await setup.checkIn(sam,'R4',[2001])).parts.runners.value!.filter(isRunner)[0].warnings).toEqual([]);
});
test('the order is by entry, and a runner check-in takes off drops out with later places moving up, even from an order sent before the removal',async()=>{
  const {sam,priya}=await start();
  const checked=await ok(await checkIn(sam,await heat(sam),[2001,2002,2003]));
  const ordered=await ok(await order(priya,checked,{order:[idOf(checked,2002),idOf(checked,2001)]}));
  expect(placed(ordered)).toEqual([2002,2001]);
  const removed=await ok(await checkIn(sam,ordered,[2001,2003]));
  expect(placed(removed)).toEqual([2001]);
  expect(removed.race.parts.finish.version).toBe(1);
  // Priya, not yet showing the removal, places 2003 third: saved without 2002, and later places move up.
  const stale=await ok(await order(priya,ordered,{order:[idOf(checked,2002),idOf(checked,2001),idOf(checked,2003)]}));
  expect(placed(stale)).toEqual([2001,2003]);
});
test('a fixed check-in number keeps its entry, so its place follows the fix, and the new number is checked again',async()=>{
  const {sam,priya}=await start();
  const checked=await ok(await checkIn(sam,await heat(sam),[2001,2002]));
  const ordered=await ok(await order(priya,checked,{order:[idOf(checked,2002),idOf(checked,2001)]}));
  const fixed=await ok(await checkIn(sam,ordered,[2001,{id:idOf(checked,2002),wristband:3045}]));
  expect(placed(fixed)).toEqual([3045,2001]);
  expect(fixed.race.parts.runners.value![1]).toMatchObject({id:idOf(checked,2002),wristband:3045,warnings:[{kind:'wrong-section',kept:false}]});
  expect((await checkIn(sam,fixed,[{id:'gone',wristband:2009}])).json().message).toBe('Choose a runner from this race');
});
test('Did not finish stays in the race, Didn\'t run takes the runner off, and a runner added at the finish joins it with warnings',async()=>{
  const {sam,priya}=await start();
  const checked=await ok(await checkIn(sam,await heat(sam),[2001,2002,2003]));
  const added=await ok(await order(priya,checked,{order:[idOf(checked,2001)],added:[3045],keptWarnings:[3045]}));
  expect(added.race.parts.runners.value!.at(-1)).toMatchObject({wristband:3045,addedAtFinish:true,warnings:[{kind:'wrong-section',kept:true}]});
  const settled=await ok(await order(priya,added,{order:[idOf(checked,2001),idOf(added,3045)],didNotFinish:[idOf(checked,2002)],didNotRun:[idOf(checked,2003)]}));
  expect(wristbands(settled)).toEqual([2001,2002,3045]);
  expect(placed(settled)).toEqual([2001,3045]);
  expect(settled.race.parts.finish.value!.didNotFinish).toEqual([idOf(checked,2002)]);
  expect((await order(priya,settled,{added:[2001]})).json().message).toBe('2001 is already in this race');
  expect((await checkIn(sam,settled,[2001,2002,3045,3045])).json().message).toBe('3045 is already in this race');
  expect((await ok(await order(priya,settled,{}))).race.parts.finish).toMatchObject({value:null});
});
test('a saved or deleted race and a complete stage refuse every step\'s writes',async()=>{
  const {owner,sam}=await start();
  const setup=raceSetup(app),saved=await setup.record(sam,'R16',[2001],[3200]),read=await ok(await call(sam,`/api/races/${saved.id}`));
  expect((await order(sam,read,{})).json().message).toBe('Heat 1 is saved - ask a lead to change it');
  const open=await ok(await checkIn(sam,await ok(await call(sam,'/api/races',{eventCode:'R16',kind:'heat',number:2})),[2002]));
  await call(owner,`/api/lead/races/${open.race.id}/delete`,{permanent:false});
  expect((await times(sam,open,{places:[]})).json().message).toBe('A lead deleted Heat 2');
  const third=await ok(await checkIn(sam,await ok(await call(sam,'/api/races',{eventCode:'R16',kind:'heat',number:3})),[2003]));
  await call(owner,`/api/lead/races/${third.race.id}/delete`,{permanent:true});
  expect((await call(owner,'/api/lead/events/R16/complete-stage',{stage:'event'})).statusCode).toBe(200);
  expect((await call(sam,'/api/races',{eventCode:'R16',kind:'heat',number:4})).json().message).toBe('Girl Cubs heats are finished. Ask a lead to add another heat.');
});
test('times are by place; a kept wrong time is stored for a lead, a retyped one is new, and times run no further than the runners',async()=>{
  const {owner,sam,priya,jo}=await start();
  const checked=await ok(await checkIn(sam,await heat(sam),[2001,2002,2003]));
  const ordered=await ok(await order(priya,checked,{order:[idOf(checked,2001),idOf(checked,2002)]}));
  const first=await ok(await times(jo,ordered,{places:[1295]}));
  expect(first.race.parts.times).toEqual({version:1,value:{places:[1295],outOfOrder:false,keptWrong:[]}});
  expect((await times(jo,first,{places:[1295,1312,1340,1400]})).json().message).toBe('This race has 3 runners - add the runner at the finish first');
  expect((await times(jo,first,{places:[1295,null]})).json().message).toBe('Enter whole hundredths for every place');
  expect((await times(jo,first,{places:[1295],keptWrong:'all'})).json().message).toBe('Choose the wrong times to keep');
  const kept=await ok(await times(jo,first,{places:[1295,1240],keptWrong:[1,0]}));
  expect(kept.race.parts.times.value).toEqual({places:[1295,1240],outOfOrder:true,keptWrong:[1]});
  const retyped=await ok(await times(jo,kept,{places:[1295,1312],keptWrong:[1]}));
  expect(retyped.race.parts.times.value).toEqual({places:[1295,1312],outOfOrder:false,keptWrong:[]});
  expect((await call(owner,`/api/lead/races/${checked.race.id}`)).json().race.parts.times.value).toEqual({places:[1295,1312],outOfOrder:false,keptWrong:[]});
  // Check-in takes 2003 off: a 3rd place time already typed stays while earlier places are retyped, but can't change.
  const third=await ok(await times(jo,retyped,{places:[1295,1312,1340]}));
  const removed=await ok(await checkIn(sam,third,[2001,2002]));
  expect((await ok(await times(jo,removed,{places:[1290,1312,1340]}))).race.parts.times.value!.places).toEqual([1290,1312,1340]);
  expect((await times(jo,await ok(await call(jo,`/api/races/${checked.race.id}`)),{places:[1290,1312,1345]})).json().message).toBe('This race has 2 runners - add the runner at the finish first');
});
test('times refuses a time no one can run, with the phone\'s words, but never checks a time saved before',async()=>{
  const {owner,sam,jo}=await start();
  const checked=await ok(await checkIn(sam,await heat(sam),[2001,2002,2003]));
  const refused=async(places:number[],message:string)=>{const response=await times(jo,checked,{places});expect(response.statusCode).toBe(400);expect(response.json().message).toBe(message);};
  await refused([0],'0.00 is not a time. Check the timer and type it again.');
  await refused([1295,21],'0.21 is too fast for 60m. No one runs 60m in under 6.00. For 21 seconds, type 2100.');
  await refused([124],'1.24 is too fast for 60m. No one runs 60m in under 6.00. Check the timer and type it again.');
  const fastest=await ok(await times(jo,checked,{places:[600]}));
  // An event with no known distance refuses only 0.00. A time saved then stays saved when the name gains a distance.
  await call(owner,'/api/day/events/R4/rename',{name:'Sack race'});
  const quick=await ok(await times(jo,fastest,{places:[21]}));
  await call(owner,'/api/day/events/R4/rename',{name:'60m'});
  expect((await ok(await times(jo,quick,{places:[21,1300]}))).race.parts.times.value!.places).toEqual([21,1300]);
});
/** Two heats of R4 (eight runners, 2001 fastest), then heats complete: the final seeds the six fastest. */
async function final() {
  const people=await start(),setup=raceSetup(app);
  for(const runners of [[2001,2002,2003,2004,2005,2006],[2007,2008]]) await setup.record(people.owner,'R4',runners,runners.map(wristband=>1000+wristband-2000));
  expect((await call(people.owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const groups=(await call(people.sam,'/api/races')).json().groups,id=groups.find((group:{event:{code:string}})=>group.event.code==='R4').races.find((race:{kind:string})=>race.kind==='final').id;
  return {...people,read:()=>call(people.sam,`/api/races/${id}`).then(ok)};
}
/** The final's whole check-in by wristband: those marked Here and those marked Absent; everyone else is unmarked. */
const attend=(token:string,read:RaceFlowRead,here:number[],absent:number[]=[])=>{
  const ids=(marked:number[])=>read.race.final!.entries.filter(entry=>marked.includes(entry.wristband!)).map(entry=>entry.finalEntryId);
  return call(token,`/api/races/${read.race.id}/absent`,{raceId:read.race.id,version:read.race.parts.runners.version,here:ids(here),absent:ids(absent)});
};
const marks=(read:RaceFlowRead)=>read.race.final!.entries.map(entry=>[entry.wristband,wristbands(read).includes(entry.wristband!)?'here':entry.absent?'absent':'unmarked']);
test('a new final has nobody Here or Absent; the marks round-trip to every phone, and only those Here are its runners',async()=>{
  const {sam,priya,read}=await final();
  const seeded=await read();
  expect(seeded.race.kind).toBe('final');
  expect(Object.keys(seeded.steps)).toEqual(['runners','positions']);
  expect(wristbands(seeded)).toEqual([]);
  expect(marks(seeded)).toEqual([2001,2002,2003,2004,2005,2006].map(wristband=>[wristband,'unmarked']));
  expect((await done(sam,seeded.race.id,'runners')).json().message).toBe('Nobody is marked Here yet');
  const marked=await ok(await attend(sam,seeded,[2001,2003,2004],[2002]));
  const seen=await ok(await call(priya,`/api/races/${seeded.race.id}`));
  expect(marks(seen)).toEqual([[2001,'here'],[2002,'absent'],[2003,'here'],[2004,'here'],[2005,'unmarked'],[2006,'unmarked']]);
  expect(wristbands(seen)).toEqual([2001,2003,2004]);
  // Tapping a lit mark again unmarks it.
  const unmarked=await ok(await attend(sam,marked,[2001,2004]));
  expect(marks(unmarked).filter(([,mark])=>mark!=='unmarked')).toEqual([[2001,'here'],[2004,'here']]);
  expect((await attend(sam,unmarked,[2001],[2001])).statusCode).toBe(400);
});
test('a final\'s order can start once someone is Here, and a runner marked Absent leaves the order until marked Here again',async()=>{
  const {sam,priya,read}=await final();
  const seeded=await ok(await attend(sam,await read(),[2001,2002,2003,2004,2005,2006]));
  expect(wristbands(seeded)).toEqual([2001,2002,2003,2004,2005,2006]);
  const ordered=await ok(await order(priya,seeded,{order:[idOf(seeded,2003),idOf(seeded,2001)]}));
  const away=await ok(await attend(sam,ordered,[2001,2002,2004,2005,2006],[2003]));
  expect(wristbands(away)).toEqual([2001,2002,2004,2005,2006]);
  expect(away.race.final!.entries.find(entry=>entry.wristband===2003)!.absent).toBe(true);
  expect(placed(away)).toEqual([2001]);
  const back=await ok(await attend(sam,away,[2001,2002,2003,2004,2005,2006]));
  expect(wristbands(back)).toEqual([2001,2002,2003,2004,2005,2006]);
  expect((await checkIn(sam,back,[2009])).json().message).toBe('Mark the final\'s runners Here or Absent');
  expect((await call(sam,`/api/races/${back.race.id}/absent`,{raceId:back.race.id,version:back.race.parts.runners.version,here:[],absent:['not-in-this-final']})).statusCode).toBe(400);
  expect((await call(sam,`/api/races/${back.race.id}/steps/times/done`,{})).json().message).toBe('A final has no times');
});
test('two finalists Here on one wristband number are refused in words a volunteer reads, with no "settle"',async()=>{
  const {sam,read}=await final(),seeded=await read();
  // No screen makes two finalists share a number today; the check-in still refuses it if one ever does.
  const pool=await openDatabase(process.env.TEST_DATABASE_URL!);
  try {await pool.query("UPDATE race_finals SET entries=jsonb_set(entries,'{1,runner,wristband}','2001') WHERE race_id=$1",[seeded.race.id]);}
  finally {await pool.end();}
  const refused=await attend(sam,seeded,[2001,2002]);
  expect(refused.statusCode).toBe(409);
  expect(refused.json().message).toBe('Two runners marked Here have the same wristband number. Ask a lead to check the final.');
});
test('a lead\'s call-up for an absent runner shows on the final, unmarked like every finalist',async()=>{
  const {people,sam,read}=await final();
  const away=await ok(await attend(sam,await read(),[2001,2003,2004,2005,2006],[2002]));
  const lead=(await people.lead('Lena')).token;
  const results=(await call(lead,'/api/lead/events/R4/results')).json();
  expect(results.results.finalResults.nextCallUp.wristband).toBe(2007);
  expect((await call(lead,'/api/lead/events/R4/call-up',{expectedHeatEntryId:results.results.finalResults.nextCallUp.entryId})).statusCode).toBe(200);
  const called=await read();
  expect(called.revision).toBeGreaterThan(away.revision);
  expect(marks(called).slice(-2)).toEqual([[2006,'here'],[2007,'unmarked']]);
  expect(wristbands(await ok(await attend(sam,called,[2001,2003,2004,2005,2006,2007],[2002])))).toEqual([2001,2003,2004,2005,2006,2007]);
});
test('a database an older build left, with its "Is everyone here?" confirm column, boots and still seeds the final',async()=>{
  const old=await openDatabase(process.env.TEST_DATABASE_URL!,true);
  // Made strict (no default) so a boot that keeps the column fails the final's insert, not just leaves clutter.
  await old.query('ALTER TABLE race_finals ADD COLUMN IF NOT EXISTS presence_confirmed boolean NOT NULL DEFAULT false');
  await old.query('ALTER TABLE race_finals ALTER COLUMN presence_confirmed DROP DEFAULT');
  await old.end();
  const {read}=await final();
  expect((await read()).race.kind).toBe('final');
});
const done=(token:string,raceId:string,step:string)=>call(token,`/api/races/${raceId}/steps/${step}/done`,{});
test('a race whose steps are all done but disagree waits, and saves itself once a step write makes them agree',async()=>{
  const {sam,priya,jo}=await start();
  const setup=raceSetup(app),checked=await setup.checkIn(sam,'R4',[2001,2002,2003]);
  await setup.order(priya,'R4',[2001,2002,2003]);await setup.times(jo,'R4',[1295,1312,1340]);
  // 2003 turns out not to have run: three times for two finishers.
  await setup.order(priya,'R4',[2001,2002],{didNotRun:[2003]});
  for(const step of ['runners','positions','times']) await done(sam,checked.id,step);
  expect((await ok(await call(sam,`/api/races/${checked.id}`))).race.state).toBe('in progress');
  expect((await setup.times(jo,'R4',[1295,1312])).state).toBe('saved');
});
test('only saved races count for results, ranking, To check and the export, and a final has run only once saved',async()=>{
  const {owner,people,sam,priya,jo}=await start();
  const setup=raceSetup(app),alex=(await people.lead('Alex')).token;
  // A kept warning on a race in progress is not a To check item yet, and the race is not ranked.
  await setup.checkIn(sam,'R4',[2001,3045],[3045]);await setup.order(priya,'R4',[2001,3045]);await setup.times(jo,'R4',[1295,1312]);
  let results=(await call(alex,'/api/lead/events/R4/results')).json().results;
  expect(results.leaderboard.filter((row:{position:number|null})=>row.position!==null)).toEqual([]);
  expect(results.notRankedYet.map((item:{reasons:string[]})=>item.reasons)).toEqual([['in progress']]);
  expect((await call(alex,'/api/lead')).json().needsYou).toEqual([]);
  await setup.submit(sam,'R4');
  results=(await call(alex,'/api/lead/events/R4/results')).json().results;
  expect(results.leaderboard.map((row:{wristband:number;position:number|null})=>[row.wristband,row.position])).toEqual([[2001,1],[3045,2]]);
  expect((await call(alex,'/api/lead')).json().needsYou.map((item:{kind:string})=>item.kind)).toEqual(['warning']);
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  await setup.attend(sam,'R4');await setup.order(priya,'R4',[2001,3045]);
  expect((await call(alex,'/api/lead/events/R4/results')).json().results.finalResults.hasRun).toBe(false);
  const saved=await setup.submit(priya,'R4');
  expect(saved.race).toMatchObject({kind:'final',state:'saved'});
  const final=(await call(alex,'/api/lead/events/R4/results')).json().results.finalResults;
  expect(final.hasRun).toBe(true);
  expect(final.leaderboard.map((row:{wristband:number;position:number|null})=>[row.wristband,row.position])).toEqual([[2001,1],[3045,2]]);
  expect((await order(priya,saved,{})).json().message).toBe('Final is saved - ask a lead to change it');
});
test('a race with every runner Did not finish needs no times, and Absent runners stay off a saved final; everyone Absent blocks it',async()=>{
  const {owner,people,sam,priya}=await start();
  const setup=raceSetup(app);
  await setup.checkIn(sam,'R4',[2001,2002]);
  await setup.order(priya,'R4',[],{didNotFinish:[2001,2002]});
  expect((await setup.submit(priya,'R4')).race.state).toBe('saved');
  await setup.record(priya,'R4',[2003,2004],[1200,1300]);
  expect((await call(owner,'/api/lead/events/R4/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await ok(await call(sam,`/api/races/${(await setup.screen(sam,'R4')).race.id}`));
  const everyone=await ok(await attend(sam,final,[],[2003,2004]));
  expect((await done(sam,final.race.id,'runners')).json().message).toBe('Nobody is marked Here yet');
  await ok(await attend(sam,everyone,[2003],[2004]));
  await setup.order(priya,'R4',[2003]);await setup.submit(sam,'R4');
  const results=(await call((await people.lead('Alex')).token,'/api/lead/events/R4/results')).json().results.finalResults;
  expect(results.runners.map((runner:{wristband:number})=>runner.wristband)).toEqual([2003]);
  expect(results.leaderboard.map((row:{wristband:number})=>row.wristband)).toEqual([2003]);
});
