import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import { toCheckWording } from '../src/shared/to-check.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-to-check-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-to-check-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relaySetup(app);
  /** Ticks the relay's teams in, marks the children here (all four unless `here` says how many of a team's), then saves the heat in that order. */
  async function heat(code:string,placed:number[],here:Record<number,number>={}) {
    for(const number of placed) {
      await relays.tick(sam,code,number);
      for(let leg=0;leg<(here[number]??4);leg++) await relays.here(sam,code,number,leg);
    }
    await relays.save(sam,code,placed,placed.map((_,index)=>1400+index*100));
  }
  /** To check as the lead reads it: each item of the relay's event in To check's words, newest first. */
  async function toCheck(code='R22') {
    const read=(await call(lead,'/api/lead/results')).json() as ResultsRead;
    return read.needsYou.filter(item=>item.event.code===code).map(item=>({kind:item.kind,entryId:item.entryId,raceId:item.raceId,...toCheckWording(item)}));
  }
  return {sam,lead,relays,heat,toCheck};
}

test('a kept wrong-Section number in a team that ran is a To check item naming the team, cleared by Mark checked',async()=>{
  const {sam,lead,relays,heat,toCheck}=await start();
  await relays.team(sam,'R22',[2101,1045,2103,2104]);
  await heat('R22',[1]);
  const items=await toCheck();
  expect(items.map(({kind,title,explanation})=>({kind,title,explanation}))).toEqual([{kind:'warning',title:'A wristband number needs checking',explanation:'In Team 1: 1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. Correct it or mark it checked.'}]);
  const checked=await call(lead,`/api/lead/races/${items[0].raceId}/runners/${items[0].entryId}/mark-warning-checked`,{});
  expect(checked.statusCode).toBe(200);
  expect(await toCheck()).toEqual([]);
});

test('a team that ran with fewer than four children marked here is a To check item, cleared by Mark checked or by Disqualify',async()=>{
  const {sam,lead,relays,heat,toCheck}=await start();
  for(const number of [1,2,3]) await relays.team(sam,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));
  await heat('R22',[1,2,3],{2:3,3:0});
  const items=await toCheck();
  expect(items.map(({kind,title,explanation})=>({kind,title,explanation})).sort((a,b)=>a.explanation.localeCompare(b.explanation))).toEqual([
    {kind:'ran-short',title:'A team ran short',explanation:'Team 2 ran with 3 of 4 children marked here.'},
    {kind:'ran-short',title:'A team ran short',explanation:'Team 3 ran with 0 of 4 children marked here.'}
  ]);
  const [team2,team3]=['Team 2','Team 3'].map(name=>items.find(item=>item.explanation.startsWith(name))!);
  expect((await call(lead,`/api/lead/races/${team2.raceId}/runners/${team2.entryId}/mark-warning-checked`,{})).statusCode).toBe(200);
  expect((await call(lead,`/api/lead/races/${team3.raceId}/runners/${team3.entryId}/disqualify`,{reason:'Baton'})).statusCode).toBe(200);
  expect(await toCheck()).toEqual([]);
});

test('a child in two relays\' teams is a To check item on the team that ran, kept or not, cleared by fixing the team list or Mark checked',async()=>{
  const {sam,lead,relays,heat,toCheck}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2134]);
  await relays.team(sam,'R28',[4101,4102,4103,4104]);
  // Typed into a Girl Scouts team as well, the Girl Cub's "also in Team 2 of 4x50m Relay Girl Cubs" warning is kept.
  const snapshot=await relays.team(sam,'R28',[4201,2134,4203,4204]);
  await heat('R22',[1,2]);
  const twoRelays={kind:'two-relays',title:'A child is in two relays',explanation:'2134 is in Girl Cubs Team 2 and Girl Scouts Team 2.'};
  expect((await toCheck()).map(({kind,title,explanation})=>({kind,title,explanation}))).toEqual([twoRelays]);
  // The Girl Scouts team has not run, so its relay has nothing to check yet.
  expect(await toCheck('R28')).toEqual([]);
  // Fixing the Girl Scouts team list clears it; typing the child back brings it back.
  const team=snapshot.events.find(event=>event.code==='R28')!.teams!.find(team=>team.number===2)!;
  async function change(legs:number[]) {
    const opened=await relays.post<typeof snapshot>(sam,'/api/teams/R28/open',{teamId:team.id});
    const version=opened.events.find(event=>event.code==='R28')!.teams!.find(other=>other.id===team.id)!.version;
    await relays.post(sam,'/api/teams/R28/done',{teamId:team.id,version,legs,keptWarnings:legs});
  }
  await change([4201,4202,4203,4204]);
  expect(await toCheck()).toEqual([]);
  await change([4201,2134,4203,4204]);
  const [item]=await toCheck();
  expect(item).toMatchObject(twoRelays);
  expect((await call(lead,`/api/lead/races/${item.raceId}/runners/${item.entryId}/mark-warning-checked`,{})).statusCode).toBe(200);
  expect(await toCheck()).toEqual([]);
});
