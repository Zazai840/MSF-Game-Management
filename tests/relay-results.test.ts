import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import { isTeamEntry,type TeamEntry } from '../src/shared/races.js';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-results-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-results-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relayFlowSetup(app);
  /** Types one Girl Cubs team per entry of `teams` on R22's team list: Team 1 is 2101-2104, Team 2 is 2201-2204, ... */
  async function teams(count:number) {for(let number=1;number<=count;number++) await relays.team(sam,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));}
  /** Adds the teams in, every child checked in, then saves the heat with them placed in the order given and timed by place. */
  async function heat(placed:number[],times:number[]) {
    for(const number of placed) await relays.tick(sam,'R22',number);
    await relays.save(sam,'R22',placed,times);
  }
  const results=async()=>((await call(lead,'/api/lead/events/R22/results')).json() as EventResultsRead).results;
  return {sam,lead,relays,teams,heat,results};
}
const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);

test('a relay\'s leaderboard has one row per team with its four children in leg order, ranked by time, six qualifying',async()=>{
  const {teams,heat,results}=await start();
  await teams(7);
  await heat([2,1,3,4],[3400,3500,3700,3900]);
  await heat([5,6,7],[3450,3600,3800]);
  const ranked=await results();
  expect(ranked.leaderboard.map(row=>[row.team?.number,row.team?.wristbands,row.time,row.race.number,row.place,row.position,row.qualification])).toEqual([
    [2,legs(2),3400,1,1,1,'Q'],[5,legs(5),3450,2,1,2,'Q'],[1,legs(1),3500,1,2,3,'Q'],[6,legs(6),3600,2,2,4,'Q'],
    [3,legs(3),3700,1,3,5,'Q'],[7,legs(7),3800,2,3,6,'Q'],[4,legs(4),3900,1,4,7,null]
  ]);
  // Teams are told apart by their team, not taken for one child who ran seven times.
  expect(ranked.leaderboard.flatMap(row=>row.flags)).toEqual([]);
  expect(ranked.qualifiers.map(row=>row.team?.number)).toEqual([2,5,1,6,3,7]);
  expect(ranked.band).toEqual({highlightCount:8,lineAfter:6,lineLabel:'Qualifying line'});
});

test('Heats complete on a relay seeds the six fastest teams into the final, each with its four children',async()=>{
  const {lead,teams,heat,results}=await start();
  await teams(7);
  await heat([2,1,3,4],[3400,3500,3700,3900]);
  await heat([5,6,7],[3450,3600,3800]);
  const sheet=(await results()).heatsCheckSheet!;
  expect(sheet.mustSettleFirst).toEqual([]);
  expect(sheet.creates.map(place=>[place.position,place.team?.number,place.team?.wristbands])).toEqual([[1,2,legs(2)],[2,5,legs(5)],[3,1,legs(1)],[4,6,legs(6)],[5,3,legs(3)],[6,7,legs(7)]]);
  const complete=await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'});
  expect(complete.statusCode).toBe(200);
  const final=(complete.json() as EventResultsRead).results.finalResults!;
  expect(final.entries.map(entry=>entry.seed)).toEqual([1,2,3,4,5,6]);
  expect(final.entries.map(entry=>entry.runner && isTeamEntry(entry.runner) && [entry.runner.team.number,entry.runner.legs.map(leg=>[leg.wristband,leg.here])])).toEqual([2,5,1,6,3,7].map(number=>[number,legs(number).map(wristband=>[wristband,false])]));
  // Nobody runs it until marked Here at the start line, as on a children's final.
  expect(final.runners).toEqual([]);
});

test('Reopen heats on a relay removes its unrun final with the line-up and opens the heats for changes; + Final makes "Final" again',async()=>{
  const {lead,teams,heat,results}=await start();
  await teams(7);
  await heat([2,1,3,4],[1400,1500,1700,1900]);
  await heat([5,6,7],[1450,1600,1800]);
  expect((await call(lead,'/api/races',{eventCode:'R22',kind:'final'})).statusCode).toBe(200);
  const reopened=await call(lead,'/api/lead/events/R22/reopen-stage',{stage:'heats',comment:'Team 4 was timed wrong'});
  expect(reopened.statusCode).toBe(200);
  expect((reopened.json() as EventResultsRead).results.finalResults).toBeNull();
  expect((await call(lead,'/api/lead/events/R22/deleted-races')).json()).toEqual([]);
  const group=(await call(lead,'/api/races')).json().groups.find((group:{event:{code:string}})=>group.event.code==='R22');
  expect(group).toMatchObject({heatsOpen:true,finalAvailable:true,nextHeat:3});
  expect(group.races.map((race:{kind:string})=>race.kind)).toEqual(['heat','heat']);
  // The heats take changes again: a third heat can be made.
  expect((await call(lead,'/api/races',{eventCode:'R22',kind:'heat',number:3})).statusCode).toBe(200);
  const remade=await call(lead,'/api/races',{eventCode:'R22',kind:'final'});
  expect(remade.statusCode).toBe(200);
  expect(remade.json().race).toMatchObject({kind:'final',number:1});
  expect((await results()).finalResults!.entries).toHaveLength(6);
});

test('equal team times in different heats are a tie that must be settled before Heats complete',async()=>{
  const {teams,heat,results}=await start();
  await teams(8);
  await heat([1,2,3,4],[3400,3500,3600,3700]);
  await heat([5,6,7,8],[3450,3550,3700,3800]);
  const ranked=await results();
  // Team 4 and Team 7 share 6th place: one of them misses the final.
  expect(ranked.ties.map(tie=>[tie.time,tie.impact,tie.entries.map(entry=>entry.team?.number)])).toEqual([[3700,'qualifiers:1',[4,7]]]);
  expect(ranked.leaderboard.filter(row=>row.flags.some(flag=>flag.kind==='tie')).map(row=>row.team?.number)).toEqual([4,7]);
  expect(ranked.heatsCheckSheet!.mustSettleFirst.map(item=>item.message)).toEqual(['Tie: Team 4, Team 7']);
});

test('Heats complete ignores a relay\'s empty current heat and waits on one with teams ticked',async()=>{
  const {sam,relays,teams,heat,results}=await start();
  await teams(3);
  await heat([1,2],[3400,3500]);
  // The next heat, created by a tick and emptied again, is just the empty current race.
  await relays.tick(sam,'R22',3);await relays.takeOff(sam,'R22',3);
  expect((await results()).heatsCheckSheet!.mustSettleFirst).toEqual([]);
  await relays.tick(sam,'R22',3);
  expect((await results()).heatsCheckSheet!.mustSettleFirst.map(item=>item.message)).toEqual(['Heat 2 is in progress (1 team checked in) - finish its steps or delete it']);
});

test('a relay final\'s leaderboard and Input - Running name every placed team with its four children',()=>{
  const team=(id:string,number:number,wristbands:Array<number|null>):TeamEntry=>({id,team:{id:`team-${number}`,number},legs:wristbands.map(wristband=>({wristband,warnings:[],here:true}))});
  const at='2026-10-23T10:00:00Z';
  const heat:ResultsRace={id:'heat',kind:'heat',number:1,checkedInAt:at,deleted:false,saved:true,runners:[team('h1',1,legs(1)),team('h2',2,legs(2)),team('h3',3,legs(3))],finish:{order:['h1','h2','h3'],didNotFinish:[]},times:{places:[3400,3500,3600],outOfOrder:false}};
  // Team 2 swapped its 3rd leg for the final: the final shows who ran it.
  const final:ResultsRace={id:'final',kind:'final',number:1,checkedInAt:at,deleted:false,saved:true,runners:[team('f1',1,legs(1)),team('f2',2,[2201,2202,2299,2204]),team('f3',3,[2301,2302,2303,null])],finish:{order:['f3','f1','f2'],didNotFinish:[]},times:null,
    final:{generation:'g',hasRun:true,heatsComplete:true,entries:['h1','h2','h3'].map((heatEntryId,index)=>({finalEntryId:`f${index+1}`,heatRaceId:'heat',heatEntryId,heatWristband:null,seed:index+1,heatRank:index+1,kind:'qualifier' as const,absent:false}))}};
  const results=eventResults({event:{code:'R22',name:'4x50m Relay',section:'Girl Cubs',format:'heats'},races:[heat,final],completedStages:['heats','final']});
  expect(results.finalResults!.leaderboard.map(row=>[row.position,row.medalPlace,row.team?.number,row.team?.wristbands])).toEqual([[1,1,3,[2301,2302,2303,null]],[2,2,1,legs(1)],[3,3,2,[2201,2202,2299,2204]]]);
  expect(results.inputRunning?.teams).toEqual([{id:'team-3',number:3,wristbands:[2301,2302,2303,null]},{id:'team-1',number:1,wristbands:legs(1)},{id:'team-2',number:2,wristbands:[2201,2202,2299,2204]}]);
});
