import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start(mixed=false) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'ties-owner',resetTestDay:true});
  const people=await signInOwner(app,'ties-owner','Scoring'),owner=people.owner,day=people.day;
  await call(owner.token,'/api/day/confirm-events',{});
  const signInAs=async(name:string)=>(await people.volunteer(name)).token;
  const volunteer=await signInAs('Ahmed'),lead=await signInAs('Aisha');
  await call(lead,'/api/become-lead',{code:day.leadCode});
  async function race(number:number|number[],time:number) {
    const runners=Array.isArray(number)?number:[number];
    const checked=(await call(volunteer,'/api/races/check-in',{eventCode:'R4',runners})).json().race;
    await call(volunteer,`/api/races/${checked.id}/finish`,{baseVersion:0,runnersVersion:1,order:runners,didNotFinish:[],didNotRun:[],added:[]});
    await call(volunteer,`/api/races/${checked.id}/times`,{baseVersion:0,places:runners.map(()=>time)});
    return checked;
  }
  await race(mixed?[2001,2003]:2001,1000);await race(2002,1000);
  const results=(await call(lead,'/api/lead/events/R4/results')).json();
  return {owner:owner.token as string,lead,volunteer,race,tie:results.results.ties[0]};
}
test('a lead settles No run-off needed, with a durable audit note and an atomic day revision',async()=>{
  const {owner,lead,tie}=await start();
  const revision=(await call(owner,'/api/day')).json().revision;
  const response=await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,outcome:'no-run-off',comment:'Both runners qualify'});
  expect(response.statusCode).toBe(200);
  const result=response.json();
  expect(result.results.ties).toEqual([]);
  expect(result.results.leaderboard.map((row:any)=>[row.wristband,row.time,row.position])).toEqual([[2001,1000,1],[2002,1000,2]]);
  expect(result.auditNotes).toMatchObject([{actor:'Aisha',action:'settle-tie',comment:'Both runners qualify',touches:tie.entries.map(({raceId,entryId}:any)=>({raceId,entryId}))}]);
  expect(result.auditNotes[0].message).toBe('Aisha settled the tie at 10.00 (2001, 2002): No run-off needed - Both runners qualify');
  expect((await call(owner,'/api/day')).json().revision).toBe(revision+1);
  await app.close();app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'ties-owner'});
  const reopened=(await call(lead,'/api/lead/events/R4/results')).json();
  expect(reopened.results.ties).toEqual([]);expect(reopened.auditNotes).toEqual(result.auditNotes);
});
test('volunteers, missing comments, incomplete orders and stale ties are refused without audit notes',async()=>{
  const {owner,lead,volunteer,tie}=await start();
  const path='/api/lead/events/R4/settle-tie';
  const revision=(await call(owner,'/api/day')).json().revision;
  expect((await call(volunteer,path,{tieId:tie.id,outcome:'no-run-off'})).statusCode).toBe(403);
  for(const body of [null,[],{}, {tieId:tie.id,outcome:'unknown'}, {tieId:tie.id,outcome:'decided',order:tie.entries},
    {tieId:tie.id,outcome:'decided',order:tie.entries,comment:' '}, {tieId:tie.id,outcome:'no-run-off',comment:123},
    {tieId:tie.id,outcome:'no-run-off',comment:'x'.repeat(1001)}, {tieId:tie.id,outcome:'run-off'},
    {tieId:tie.id,outcome:'run-off',order:[tie.entries[0]]}, {tieId:tie.id,outcome:'run-off',order:[tie.entries[0],tie.entries[0]]},
    {tieId:tie.id,outcome:'run-off',order:[tie.entries[0],{raceId:'missing',entryId:'missing'}]}
  ]) {
    const refused=await call(lead,path,body);
    expect(refused.statusCode).toBe(400);expect(typeof refused.json().message).toBe('string');
  }
  expect((await call(lead,path,{tieId:'missing',outcome:'no-run-off'})).statusCode).toBe(409);
  expect((await call(owner,'/api/day')).json().revision).toBe(revision);
  expect((await call(lead,'/api/lead/events/R4/results')).json().auditNotes).toEqual([]);
  const saved=await call(lead,path,{tieId:tie.id,outcome:'no-run-off'});
  expect(saved.statusCode).toBe(200);
  expect((await call(lead,path,{tieId:tie.id,outcome:'run-off',order:tie.entries})).statusCode).toBe(409);
  expect((await call(lead,'/api/lead/events/R4/results')).json().auditNotes).toHaveLength(1);
  for(const job of ['start-line','finish-order','times']) expect((await call(lead,`/api/jobs/${job}`)).statusCode).toBe(200);
});
test.each(['run-off','decided'] as const)('%s orders the tied runners without changing times or creating a race',async outcome=>{
  const {lead,tie}=await start();
  const order=[...tie.entries].reverse();
  const response=await call(lead,'/api/lead/events/R4/settle-tie',{tieId:tie.id,outcome,order,comment:outcome==='decided'?'One runner had left':undefined});
  expect(response.statusCode).toBe(200);
  const result=response.json();
  expect(result.results.ties).toEqual([]);
  expect(result.results.raceCount).toBe(2);
  expect(result.results.leaderboard.map((row:any)=>[row.wristband,row.position,row.time,row.hasNote])).toEqual([[2002,1,1000,true],[2001,2,1000,true]]);
  expect(result.auditNotes).toHaveLength(1);
  expect(result.auditNotes[0]).toMatchObject({action:'settle-tie',actor:'Aisha',comment:outcome==='decided'?'One runner had left':null});
  expect(result.auditNotes[0].message).toContain(outcome==='run-off'?'recorded a run-off':'without a run-off');
});

test('a mixed tie refuses an order reversing same-race finishers and accepts cross-race ordering',async()=>{
  const {lead,tie}=await start(true);
  const path='/api/lead/events/R4/settle-tie';
  const refused=await call(lead,path,{tieId:tie.id,outcome:'run-off',order:[...tie.entries].reverse()});
  expect(refused.statusCode).toBe(400);
  expect(refused.json().message).toBe('Keep runners from the same race in their finishing order');
  const saved=await call(lead,path,{tieId:tie.id,outcome:'run-off',order:[tie.entries[2],tie.entries[0],tie.entries[1]]});
  expect(saved.statusCode).toBe(200);
  expect(saved.json().results.leaderboard.map((row:any)=>row.wristband)).toEqual([2002,2001,2003]);
  expect(saved.json().auditNotes).toHaveLength(1);
});
