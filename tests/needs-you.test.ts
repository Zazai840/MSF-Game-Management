import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
import { toCheckWording } from '../src/shared/to-check.js';
import type { DayLeadItem } from '../src/shared/lead-results.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'needs-owner',resetTestDay:true});
  const people=await signInOwner(app,'needs-owner','Scoring'),owner=people.owner.token,day=people.day;await call(owner,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  // Only saved races reach To check, so each race is saved before the event's next one: every warning kept.
  const setup=raceSetup(app);
  const saved=(numbers:number[],places:number[],keptWrong:number[]=[])=>setup.record(volunteer,'R4',numbers,places,{keptWarnings:numbers,keptWrong});
  async function withAdded(numbers:number[],added:number[],places:number[]) {
    await setup.checkIn(volunteer,'R4',numbers,numbers);await setup.order(volunteer,'R4',[...numbers,...added],{added});
    const race=await setup.times(volunteer,'R4',places);await setup.submit(volunteer,'R4');return race;
  }
  const queue=async()=>(await call(lead,'/api/lead')).json();
  const path=(race:any,index=0)=>`/api/lead/races/${race.id}/runners/${race.parts.runners.value[index].id}`;
  async function count(expected:number) {
    expect((await queue()).needsYou).toHaveLength(expected);expect((await call(lead,'/api/home')).json().needsYou).toBe(expected);
    const list=(await call(lead,'/api/lead/results')).json();expect(list.groups.flatMap((group:any)=>group.events).find((item:any)=>item.event.code==='R4').needsYou).toBe(expected);
  }
  return {owner,lead,volunteer,setup,saved,withAdded,queue,path,count};
}
test('lead queue, home and event counts include saved warnings and settle consistently by disqualification and lifting the disqualification, correction and mark checked',async()=>{
  const {lead,volunteer,saved,queue,path,count}=await start();
  const race=await saved([3045],[1300]);await count(1);
  expect((await queue()).needsYou[0]).toMatchObject({kind:'warning',event:{code:'R4'},raceId:race.id,entryId:race.parts.runners.value![0].id});
  expect((await call(volunteer,'/api/lead')).statusCode).toBe(403);expect((await call(volunteer,'/api/home')).json()).not.toHaveProperty('needsYou');
  const target=path(race);
  await call(lead,target+'/disqualify',{reason:'Wrong section or age'});await count(0);
  expect((await call(lead,target+'/mark-warning-checked',{})).statusCode).toBe(409);
  await call(lead,target+'/lift-disqualification',{comment:'Recheck wristband'});await count(1);
  await call(lead,target+'/correct-number',{expectedWristband:3045,wristband:2001});await count(0);
  await call(lead,target+'/correct-number',{expectedWristband:2001,wristband:4045,keepWarnings:true});await count(1);
  await call(lead,target+'/mark-warning-checked',{});await count(0);
  const result=(await call(lead,'/api/lead/events/R4/results')).json();expect(result.results.actionableRunners[0]).toMatchObject({status:'Finished',wristband:4045});
});
test('added-at-finish acknowledgment is narrow, audited, revisioned and Lead-only without changing part versions',async()=>{
  const {owner,lead,volunteer,withAdded,path,count}=await start();const race=await withAdded([2001],[2002],[1300,1400]);
  const read=async()=>(await call(lead,`/api/lead/races/${race.id}`)).json().race,finished=await read();
  await count(1);const target=path(finished,1),command=target+'/mark-added-checked';
  const revision=(await call(owner,'/api/day')).json().revision;
  expect((await call(volunteer,command,{})).statusCode).toBe(403);
  expect((await call(lead,path(finished,0)+'/mark-added-checked',{})).statusCode).toBe(409);
  const saved=await call(lead,command,{});expect(saved.statusCode).toBe(200);await count(0);
  expect(saved.json().auditNotes[0]).toMatchObject({action:'mark-added-checked',actor:'Aisha',touches:[{raceId:race.id,entryId:finished.parts.runners.value[1].id}]});
  expect(saved.json().results.actionableRunners[1].flags).toContainEqual({kind:'added-at-finish',message:'Added at the finish',checked:true});
  expect((await read()).parts).toEqual(finished.parts);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
  expect((await call(lead,command,{})).statusCode).toBe(409);
});
test('all five item kinds are persisted newest first and each existing settlement path clears its live item',async()=>{
  const {lead,saved,withAdded,queue,path}=await start();
  const warning=await saved([3045],[1300]);
  await withAdded([2001],[2002],[1400,1450]);
  const duplicate=await saved([2003],[1500]),duplicate2=await saved([2003],[1550]);
  const times=await saved([2004,2005],[1700,1600],[1]);
  for(const number of [2010,2011]) await saved([number],[2000]);
  const items=(await queue()).needsYou;expect(items.map((item:any)=>item.kind)).toEqual(['tie','times-out-of-order','ran-twice','ran-twice','added-at-finish','warning']);
  expect((await queue()).needsYou.map((item:any)=>[item.id,item.at])).toEqual(items.map((item:any)=>[item.id,item.at]));
  expect(new Date(items[1].at).valueOf()).toBeGreaterThan(new Date(items[5].at).valueOf());
  await call(lead,`/api/lead/events/R4/settle-tie`,{tieId:items[0].tieId,outcome:'no-run-off'});
  await call(lead,`/api/lead/races/${times.id}/times`,{baseVersion:1,places:[1700,1600],acceptOutOfOrder:true});
  await call(lead,path(duplicate2)+'/count-result',{});
  const after=(await queue()).needsYou;expect(after.map((item:any)=>item.kind).sort()).toEqual(['added-at-finish','warning']);
  await call(lead,`/api/lead/races/${warning.id}/delete`,{permanent:false});expect((await queue()).needsYou.map((item:any)=>item.kind)).toEqual(['added-at-finish']);
  await call(lead,`/api/lead/races/${warning.id}/restore`,{});expect((await queue()).needsYou[0]).toMatchObject({kind:'warning',raceId:warning.id});
  await call(lead,path(duplicate)+'/correct-number',{expectedWristband:2003,wristband:2007});
  await call(lead,path(duplicate2)+'/correct-number',{expectedWristband:2003,wristband:2007});expect((await queue()).needsYou.filter((item:any)=>item.kind==='ran-twice')).toHaveLength(2);
  await call(lead,path(duplicate2)+'/disqualify',{reason:'Obstruction'});expect((await queue()).needsYou.filter((item:any)=>item.kind==='ran-twice')).toEqual([]);
  await call(lead,`/api/lead/races/${times.id}/times`,{baseVersion:2,places:[1800,1600]});expect((await queue()).needsYou.some((item:any)=>item.kind==='times-out-of-order')).toBe(true);
  await call(lead,`/api/lead/races/${times.id}/times`,{baseVersion:3,places:[1600,1800]});expect((await queue()).needsYou.some((item:any)=>item.kind==='times-out-of-order')).toBe(false);
});
test('an unrelated runner addition does not make an older eligibility warning newer than a later warning',async()=>{
  const {volunteer,setup,queue}=await start();
  // The older warning is checked in on R4; the newer is saved on R16 (also Girl Cubs) before R4's order adds a runner at the finish.
  const older=await setup.checkIn(volunteer,'R4',[3045],[3045]);
  const newer=await setup.record(volunteer,'R16',[4045],[1400],{keptWarnings:[4045]});
  await setup.order(volunteer,'R4',[3045,2001],{added:[2001]});await setup.times(volunteer,'R4',[1300,1350]);await setup.submit(volunteer,'R4');
  const items=(await queue()).needsYou;
  expect(items.map((item:any)=>[item.kind,item.raceId])).toEqual([['added-at-finish',older.id],['warning',newer.id],['warning',older.id]]);
  const repeated=(await queue()).needsYou;expect(repeated.map((item:any)=>item.at)).toEqual(items.map((item:any)=>item.at));
});
test('the lead queue carries the facts To check needs to explain each item in plain English',async()=>{
  const {saved,withAdded,queue}=await start();
  await saved([3045],[1300]);
  await withAdded([2001],[2002],[1400,1450]);
  await saved([2001],[1500]);
  await saved([2004,2005,2007],[1600,1305,1290],[1,2]);
  for(const number of [2010,2011]) await saved([number],[2000]);
  const items=(await queue()).needsYou as DayLeadItem[];
  const explained=(kind:DayLeadItem['kind'])=>items.filter(item=>item.kind===kind).map(item=>toCheckWording(item).explanation);
  expect(explained('times-out-of-order')).toEqual(['2nd place (13.05) is faster than 1st (16.00). The timer kept it as typed.']);
  expect(explained('warning')).toEqual(['3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. Correct it or mark it checked.']);
  expect(explained('added-at-finish')).toEqual(['2002 crossed the line but was not checked in at the start. Check they ran in this race.']);
  expect(explained('ran-twice')).toEqual(Array(2).fill('2001 has a result in more than one race of this event. Choose which result counts.'));
  expect(explained('tie')).toEqual(['2010 and 2011 both have 20.00. Decide whether a run-off is needed.']);
});
