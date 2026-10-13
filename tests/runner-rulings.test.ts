import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'runner-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/join',payload:{code:'runner-owner',name:'Scoring'}})).json();
  const day=(await call(owner.token,'/api/day')).json();await call(owner.token,'/api/day/confirm-events',{});
  const join=async(name:string)=>(await app.inject({method:'POST',url:'/api/join',payload:{code:day.dayCode,name}})).json().token as string;
  const volunteer=await join('Ahmed'),lead=await join('Aisha');await call(lead,'/api/become-lead',{code:day.leadCode});
  async function race(numbers:number[],places:number[]) {
    const race=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners:numbers,keptWarnings:numbers})).json().race;
    await call(volunteer,`/api/races/${race.id}/finish`,{baseVersion:0,runnersVersion:1,order:numbers,didNotFinish:[],didNotRun:[],added:[]});
    await call(volunteer,`/api/races/${race.id}/times`,{baseVersion:0,places});return race;
  }
  const first=await race([2001,3045],[1100,1200]),second=await race([2001],[1300]);
  const path=(race:any,number:number)=>`/api/lead/races/${race.id}/runners/${race.parts.runners.value.find((runner:any)=>runner.wristband===number).id}`;
  return {owner:owner.token as string,lead,volunteer,first,second,path,read:async()=>(await call(lead,'/api/lead/events/R4/results')).json()};
}
test('a lead marks an eligibility warning checked without changing the ranking; ran-twice cannot be marked checked',async()=>{
  const {lead,first,second,path,read}=await start();
  const saved=await call(lead,path(first,3045)+'/mark-warning-checked',{});expect(saved.statusCode).toBe(200);
  const data=saved.json();expect(data.results.leaderboard[1]).toMatchObject({wristband:3045,position:2,flags:[{kind:'warning',checked:true,warningKind:'wrong-section'}],hasNote:true});
  expect(data.auditNotes[0]).toMatchObject({action:'mark-warning-checked',actor:'Aisha'});expect(data.auditNotes[0].message).toContain('3045');
  expect((await call(lead,path(second,2001)+'/mark-warning-checked',{})).statusCode).toBe(409);
  expect((await read()).auditNotes).toHaveLength(1);
});
test('correcting a number retains the stable entry, finishing place and time, reruns checks and reopens new warnings',async()=>{
  const {lead,volunteer,first,second,path,read}=await start();
  await call(lead,path(first,3045)+'/mark-warning-checked',{});
  const saved=await call(lead,path(first,3045)+'/correct-number',{expectedWristband:3045,wristband:2003});expect(saved.statusCode).toBe(200);
  const row=saved.json().results.leaderboard.find((row:any)=>row.wristband===2003);
  expect(row).toMatchObject({entryId:first.parts.runners.value[1].id,place:2,time:1200,flags:[],hasNote:true});
  const race=(await call(volunteer,`/api/races/${first.id}`)).json();
  expect(race.parts.runners.value[1]).toMatchObject({id:row.entryId,wristband:2003});expect(race.parts.runners.version).toBe(2);
  expect(race.parts.finish.value.order).toEqual(first.parts.runners.value.map((runner:any)=>runner.id));expect(race.parts.times.value.places).toEqual([1100,1200]);
  const duplicateFixed=await call(lead,path(second,2001)+'/correct-number',{expectedWristband:2001,wristband:2004});expect(duplicateFixed.statusCode).toBe(200);
  expect(duplicateFixed.json().results.leaderboard.flatMap((row:any)=>row.flags).some((flag:any)=>flag.kind==='ran-twice')).toBe(false);
  const wrongSection=await call(lead,path(first,3045)+'/correct-number',{expectedWristband:2003,wristband:4045,keepWarnings:true});expect(wrongSection.statusCode).toBe(200);
  expect(wrongSection.json().results.leaderboard.find((entry:any)=>entry.entryId===row.entryId)).toMatchObject({place:2,time:1200,flags:[{warningKind:'wrong-section',checked:false,message:'4045 belongs to Girl Scouts - this race is Girl Cubs'}]});
  const before=(await read()).auditNotes.length;
  expect((await call(lead,path(first,3045)+'/correct-number',{expectedWristband:2003,wristband:2005})).statusCode).toBe(409);
  expect((await call(lead,path(first,3045)+'/correct-number',{expectedWristband:4045,wristband:2001})).statusCode).toBe(400);
  expect((await read()).auditNotes).toHaveLength(before);
});
test('choosing a result counts that stable entry, excludes the other, clears duplicate flags and can be changed or corrected later',async()=>{
  const {lead,first,second,path,read}=await start();
  const saved=await call(lead,path(second,2001)+'/count-result',{});expect(saved.statusCode).toBe(200);
  const data=saved.json();
  expect(data.results.leaderboard.map((row:any)=>[row.wristband,row.status,row.position])).toEqual([[3045,'Finished',1],[2001,'Finished',2],[2001,'Not counted',null]]);
  expect(data.results.qualifiers.map((row:any)=>row.entryId)).toEqual([first.parts.runners.value[1].id,second.parts.runners.value[0].id]);
  expect(data.results.leaderboard.flatMap((row:any)=>row.flags).some((flag:any)=>flag.kind==='ran-twice')).toBe(false);
  expect(data.auditNotes[0]).toMatchObject({action:'count-result',actor:'Aisha',touches:[{raceId:first.id,entryId:first.parts.runners.value[0].id},{raceId:second.id,entryId:second.parts.runners.value[0].id}]});
  const changed=(await call(lead,path(first,2001)+'/count-result',{})).json();
  expect(changed.results.leaderboard[0]).toMatchObject({entryId:first.parts.runners.value[0].id,position:1});
  expect(changed.results.leaderboard[2]).toMatchObject({entryId:second.parts.runners.value[0].id,status:'Not counted'});
  const corrected=await call(lead,path(second,2001)+'/correct-number',{expectedWristband:2001,wristband:2004});expect(corrected.statusCode).toBe(200);
  expect(corrected.json().results.leaderboard[2]).toMatchObject({wristband:2004,status:'Finished',position:3,notCounted:false});
  expect((await call(lead,path(first,2001)+'/count-result',{})).statusCode).toBe(409);
  expect((await read()).auditNotes.map((note:any)=>note.action)).toEqual(['correct-number','count-result','count-result']);
});
test('runner rulings refuse volunteers and malformed corrections without audit changes; disqualification also settles duplicate flags',async()=>{
  const {owner,lead,volunteer,first,second,path,read}=await start();
  const target=path(first,3045);
  for(const command of ['mark-warning-checked','correct-number','count-result']) expect((await call(volunteer,`${target}/${command}`,{})).statusCode).toBe(403);
  const revision=(await call(owner,'/api/day')).json().revision;
  for(const body of [null,[],{}, {wristband:'2005',expectedWristband:3045},{wristband:2005},{wristband:-1,expectedWristband:3045},{wristband:2005,expectedWristband:3045,keepWarnings:'yes'}]) expect((await call(lead,target+'/correct-number',body)).statusCode).toBe(400);
  expect((await read()).auditNotes).toEqual([]);expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  const saved=await call(lead,path(second,2001)+'/disqualify',{reason:'Two false starts'});expect(saved.statusCode).toBe(200);
  expect(saved.json().results.leaderboard.flatMap((row:any)=>row.flags).some((flag:any)=>flag.kind==='ran-twice')).toBe(false);
  expect((await call(lead,path(second,2001)+'/count-result',{})).statusCode).toBe(409);
  expect((await call(lead,'/api/jobs/finish-order')).statusCode).toBe(200);expect((await call(lead,'/api/jobs/times')).statusCode).toBe(200);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
});
