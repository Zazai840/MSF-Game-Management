import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import { toCheckWording } from '../src/shared/to-check.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import { isTeamEntry,type TeamEntry } from '../src/shared/races.js';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
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

test('a team added at the finish is a To check item cleared by Mark addition checked, and its children\'s wristband warnings show like any team\'s',async()=>{
  const {sam,lead,relays,toCheck}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[1045,2202,2203,2204]);
  await relays.tick(sam,'R22',1);
  for(const leg of [0,1,2,3]) await relays.here(sam,'R22',1,leg);
  // Team 2 was never checked in: the order adds it with "+ Team not on the list".
  const race=(await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/take-over',{job:'order'})).race,teams=(await relays.screen(sam,'R22')).teams!;
  const team1=race.parts.runners.value!.find(entry=>isTeamEntry(entry) && entry.team.number===1)!.id;
  const ordered=await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/order',{raceId:race.id,version:race.parts.finish.version,order:[team1],didNotFinish:[],didNotRun:[],added:[],addedTeams:[teams.find(team=>team.number===2)!.id]});
  const timed=(await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/take-over',{job:'times'})).race;
  await relays.post(sam,'/api/race-screen/R22/times',{raceId:timed.id,version:timed.parts.times.version,places:[1400,1500],keptWrong:[]});
  await relays.post(sam,'/api/race-screen/R22/submit',{raceId:race.id});
  const items=await toCheck();
  expect(items.map(({kind,title,explanation})=>({kind,title,explanation})).sort((a,b)=>a.kind.localeCompare(b.kind))).toEqual([
    {kind:'added-at-finish',title:'A team was added at the finish',explanation:'Team 2 crossed the line but was not checked in at the start. Check it ran in this race.'},
    {kind:'warning',title:'A wristband number needs checking',explanation:'In Team 2: 1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. Correct it or mark it checked.'}
  ]);
  const added=items.find(item=>item.kind==='added-at-finish')!;
  expect(added.entryId).toBe(ordered.race.parts.runners.value!.find(entry=>isTeamEntry(entry) && entry.team.number===2)!.id);
  expect((await call(lead,`/api/lead/races/${added.raceId}/runners/${added.entryId}/mark-added-checked`,{})).statusCode).toBe(200);
  expect((await toCheck()).map(item=>item.kind)).toEqual(['warning']);
  expect((await call(lead,`/api/lead/races/${added.raceId}/runners/${added.entryId}/mark-warning-checked`,{})).statusCode).toBe(200);
  expect(await toCheck()).toEqual([]);
});

test('a time out of order, teams tied on time and a team ran twice are today\'s items worded with "team", and "already ran" never applies to a relay',()=>{
  const at='2026-10-23T10:00:00Z',event={id:'r22',code:'R22',name:'4x50m Relay',section:'Girl Cubs' as const,format:'heats' as const,enabled:true,relay:true};
  const team=(id:string,number:number):TeamEntry=>({id,team:{id:`team-${number}`,number},legs:[1,2,3,4].map(leg=>({wristband:2000+number*100+leg,warnings:[],here:true}))});
  const heat=(id:string,number:number,entries:TeamEntry[],places:number[]):ResultsRace=>({id,kind:'heat',number,checkedInAt:at,deleted:false,saved:true,runners:entries,finish:{order:entries.map(entry=>entry.id),didNotFinish:[]},times:{places,outOfOrder:places.some((time,index)=>index>0 && time<places[index-1])}});
  // Team 1 ran in both heats (a restored heat); Team 2 and Team 3 tie on 15.00; Heat 3's times are out of order.
  const races=[heat('h1',1,[team('a',1),team('b',2)],[1400,1500]),heat('h2',2,[team('c',1),team('d',3)],[1450,1500]),heat('h3',3,[team('e',4),team('f',5)],[1700,1600])];
  const items=eventResults({event,races}).needsYou.map(item=>({kind:item.kind,...toCheckWording({...item,event})}));
  expect(items.map(item=>item.kind).sort()).toEqual(['ran-twice','ran-twice','tie','times-out-of-order']);
  expect(items.find(item=>item.kind==='ran-twice')).toMatchObject({title:'A team ran twice',explanation:'Team 1 has a result in more than one race of this event. Choose which result counts.'});
  expect(items.find(item=>item.kind==='tie')).toMatchObject({title:'Teams tied on time',explanation:'Team 2 and Team 3 both have 15.00. Decide whether a run-off is needed.'});
  expect(items.find(item=>item.kind==='times-out-of-order')).toMatchObject({title:'A time looks wrong',explanation:'2nd place (16.00) is faster than 1st (17.00). The timer kept it as typed.'});
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
