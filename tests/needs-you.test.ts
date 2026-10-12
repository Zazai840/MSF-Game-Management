import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'needs-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/join',payload:{code:'needs-owner',name:'Scoring'}})).json().token as string;
  const day=(await call(owner,'/api/day')).json();await call(owner,'/api/day/confirm-events',{});
  const join=async(name:string)=>(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name}})).json().token as string;
  const volunteer=await join('Ahmed'),lead=await join('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  const checkIn=async(numbers:number[])=>(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:numbers,keptWarnings:numbers})).json().race;
  const queue=async()=>(await call(lead,'/api/lead')).json();
  const path=(race:any,index=0)=>`/api/lead/races/${race.id}/runners/${race.parts.runners.value[index].id}`;
  async function count(expected:number) {
    expect((await queue()).needsYou).toHaveLength(expected);expect((await call(lead,'/api/home')).json().needsYou).toBe(expected);
    const list=(await call(lead,'/api/lead/results')).json();expect(list.groups.flatMap((group:any)=>group.events).find((item:any)=>item.event.code==='R4').needsYou).toBe(expected);
  }
  return {owner,lead,volunteer,checkIn,queue,path,count};
}
test('lead queue, home and event counts include pending warnings and settle consistently by DQ/lift, correction and mark checked',async()=>{
  const {lead,volunteer,checkIn,queue,path,count}=await start();
  const race=await checkIn([3045]);await count(1);
  expect((await queue()).needsYou[0]).toMatchObject({kind:'warning',event:{code:'R4'},raceId:race.id,entryId:race.parts.runners.value[0].id});
  expect((await call(volunteer,'/api/lead')).statusCode).toBe(403);expect((await call(volunteer,'/api/home')).json()).not.toHaveProperty('needsYou');
  const target=path(race);
  await call(lead,target+'/disqualify',{reason:'Wrong section or age'});await count(0);
  expect((await call(lead,target+'/mark-warning-checked',{})).statusCode).toBe(409);
  await call(lead,target+'/lift-disqualification',{comment:'Recheck wristband'});await count(1);
  await call(lead,target+'/correct-number',{expectedWristband:3045,wristband:2001});await count(0);
  await call(lead,target+'/correct-number',{expectedWristband:2001,wristband:4045,keepWarnings:true});await count(1);
  await call(lead,target+'/mark-warning-checked',{});await count(0);
  const result=(await call(lead,'/api/lead/events/R4/results')).json();expect(result.results.actionableRunners[0]).toMatchObject({status:'Pending',wristband:4045});
  expect(result.results.leaderboard).toEqual([]);
});
test('added-at-finish acknowledgment is narrow, audited, revisioned and Lead-only without changing part versions',async()=>{
  const {owner,lead,volunteer,checkIn,path,count}=await start();const race=await checkIn([2001]);
  const finished=(await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[2002]})).json().race;
  await count(1);const target=path(finished,1),command=target+'/mark-added-checked';
  const revision=(await call(owner,'/api/day')).json().revision;
  expect((await call(volunteer,command,{})).statusCode).toBe(403);
  expect((await call(lead,path(finished,0)+'/mark-added-checked',{})).statusCode).toBe(409);
  const saved=await call(lead,command,{});expect(saved.statusCode).toBe(200);await count(0);
  expect(saved.json().auditNotes[0]).toMatchObject({action:'mark-added-checked',actor:'Aisha',touches:[{raceId:race.id,entryId:finished.parts.runners.value[1].id}]});
  expect(saved.json().results.actionableRunners[1].flags).toContainEqual({kind:'added-at-finish',message:'Added at the finish',checked:true});
  expect((await call(volunteer,`/api/races/${race.id}`)).json().parts).toEqual(finished.parts);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
  expect((await call(lead,command,{})).statusCode).toBe(409);
});
test('all six item kinds are persisted newest first and each existing settlement path clears its live item',async()=>{
  const {lead,volunteer,checkIn,queue,path}=await start();
  const warning=await checkIn([3045]);
  const added=await checkIn([2001]);await call(volunteer,`/api/races/${added.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2001,2002],didNotFinish:[],didNotRun:[],added:[2002]});
  const duplicate=await checkIn([2003]),duplicate2=await checkIn([2003]);
  const times=await checkIn([2004,2005]);await call(volunteer,`/api/races/${times.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2004,2005],didNotFinish:[],didNotRun:[],added:[]});await call(volunteer,`/api/races/${times.id}/times`,{baseVersion:0,places:[1700,1600]});
  const clash=await checkIn([2006]);await call(volunteer,`/api/races/${clash.id}/finish`,{baseVersion:0,runnersVersion:1,order:[2006],didNotFinish:[],didNotRun:[],added:[]});await call(volunteer,`/api/races/${clash.id}/times`,{baseVersion:0,places:[1400]});await call(volunteer,`/api/races/${clash.id}/times`,{baseVersion:0,places:[1500]});
  for(const number of [2010,2011]) {const race=await checkIn([number]);await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:[number],didNotFinish:[],didNotRun:[],added:[]});await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places:[2000]});}
  const items=(await queue()).needsYou;expect(items.map((item:any)=>item.kind)).toEqual(['tie','clash','times-out-of-order','ran-twice','ran-twice','added-at-finish','warning']);
  expect((await queue()).needsYou.map((item:any)=>[item.id,item.at])).toEqual(items.map((item:any)=>[item.id,item.at]));
  expect(new Date(items[1].at).valueOf()).toBeGreaterThan(new Date(items[6].at).valueOf());
  await call(lead,`/api/lead/events/R4/settle-tie`,{tieId:items[0].tieId,outcome:'no-run-off'});
  const candidates=(await call(lead,`/api/lead/races/${clash.id}`)).json().clashes[0].candidates;await call(lead,`/api/lead/races/${clash.id}/clashes/times`,{candidateId:candidates[1].id});
  await call(lead,`/api/lead/races/${times.id}/times`,{baseVersion:1,places:[1700,1600],acceptOutOfOrder:true});
  await call(lead,path(duplicate2)+'/count-result',{});
  const after=(await queue()).needsYou;expect(after.map((item:any)=>item.kind).sort()).toEqual(['added-at-finish','warning']);
  await call(lead,`/api/lead/races/${warning.id}/delete`,{permanent:false});expect((await queue()).needsYou.map((item:any)=>item.kind)).toEqual(['added-at-finish']);
  await call(lead,`/api/lead/races/${warning.id}/restore`,{});expect((await queue()).needsYou[0]).toMatchObject({kind:'warning',raceId:warning.id});
  await call(lead,path(duplicate)+'/correct-number',{expectedWristband:2003,wristband:2007});
  await call(lead,path(duplicate2)+'/correct-number',{expectedWristband:2003,wristband:2007});expect((await queue()).needsYou.filter((item:any)=>item.kind==='ran-twice')).toHaveLength(2);
  await call(lead,path(duplicate2)+'/disqualify',{reason:'Obstruction'});expect((await queue()).needsYou.filter((item:any)=>item.kind==='ran-twice')).toEqual([]);
  await call(volunteer,`/api/races/${times.id}/times`,{baseVersion:2,places:[1800,1600]});expect((await queue()).needsYou.some((item:any)=>item.kind==='times-out-of-order')).toBe(true);
  await call(lead,`/api/lead/races/${times.id}/times`,{baseVersion:3,places:[1600,1800]});expect((await queue()).needsYou.some((item:any)=>item.kind==='times-out-of-order')).toBe(false);
});
test('an unrelated runner addition does not make an older eligibility warning newer than a later warning',async()=>{
  const {lead,volunteer,checkIn,queue}=await start();
  const older=await checkIn([3045]),newer=await checkIn([4045]);
  await call(volunteer,`/api/races/${older.id}/finish`,{baseVersion:0,runnersVersion:1,order:[3045,2001],didNotFinish:[],didNotRun:[],added:[2001]});
  const items=(await queue()).needsYou;
  expect(items.map((item:any)=>[item.kind,item.raceId])).toEqual([['added-at-finish',older.id],['warning',newer.id],['warning',older.id]]);
  const repeated=(await queue()).needsYou;expect(repeated.map((item:any)=>item.at)).toEqual(items.map((item:any)=>item.at));
  const result=(await call(lead,'/api/lead/events/R4/results')).json();expect(result.results.needsYou.filter((item:any)=>item.kind==='warning').map((item:any)=>item.raceId)).toEqual([newer.id,older.id]);
});
