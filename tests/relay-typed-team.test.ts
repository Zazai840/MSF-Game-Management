import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { toCheckWording } from '../src/shared/to-check.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * A relay team typed into a heat at its start line, leg by leg: the one write that makes a team (`joinRaceId`) numbers
 * it at save under the day lock and puts it in the heat with every typed child checked in.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body:unknown)=>app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},payload:JSON.stringify(body)});
afterEach(async()=>{await app?.close();});
async function ok(token:string,url:string,body:unknown) {
  const response=await call(token,url,body);
  if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
  return response.json() as RaceFlowRead;
}
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'typed-team-owner',resetTestDay:true});
  const people=await signInOwner(app,'typed-team-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Noor')).token,lead=(await people.lead('Jo Evans')).token;
  return {sam,priya,lead,relays:relayFlowSetup(app)};
}
const teamsIn=(race:Pick<RaceRead,'parts'>)=>(race.parts.runners.value||[]).filter(isTeamEntry).map(entry=>[entry.team.number,entry.legs.map(leg=>[leg.wristband,leg.here])]);
/** Types a team into the heat as the start line's 4th-leg Next (or Save Team N with K) does. */
const typed=(token:string,heat:RaceFlowRead,legs:Array<number|null>,keptWarnings:number[]=[])=>
  call(token,`/api/relays/${heat.group.event.id}/teams`,{legs,keptWarnings,joinRaceId:heat.race.id});

test('a typed team joins the heat in one write, every typed child checked in, numbered within the relay in the order saved, across heats',async()=>{
  const {sam,relays}=await start();
  const one=await relays.worked(sam,'R22');
  expect(one.group.nextTeam).toBe(1);
  let read=(await typed(sam,one,[2101,2102,2103,2104])).json() as RaceFlowRead;
  read=(await typed(sam,one,[2111,2112,2113,null])).json() as RaceFlowRead;
  expect(teamsIn(read.race)).toEqual([[1,[[2101,true],[2102,true],[2103,true],[2104,true]]],[2,[[2111,true],[2112,true],[2113,true],[null,false]]]]);
  expect(read.group.nextTeam).toBe(3);
  await relays.save(sam,'R22',[1,2],[3400,3500]);
  // Heat 2's first typed team takes the relay's next number.
  const two=await relays.worked(sam,'R22');
  expect(two.race.number).toBe(2);
  const joined=await ok(sam,`/api/relays/${two.group.event.id}/teams`,{legs:[2121,2122,2123,2124],keptWarnings:[],joinRaceId:two.race.id});
  expect(teamsIn(joined.race)).toEqual([[3,[[2121,true],[2122,true],[2123,true],[2124,true]]]]);
  // A team typed into a heat taken off goes back to Still to run with its number.
  const off=await relays.takeOff(sam,'R22',3);
  expect(teamsIn(off.race)).toEqual([]);
  expect(off.teams!.find(team=>team.number===3)!.races).toEqual([]);
});

test('two phones typing teams into one heat at once both land, each with its own number',async()=>{
  const {sam,priya,relays}=await start();
  const heat=await relays.worked(sam,'R22');
  // Both phones saw "Team 1" as they typed; whichever saves second gets the next number, with no refusal.
  const answers=await Promise.all([typed(sam,heat,[2101,2102,2103,2104]),typed(priya,heat,[2111,2112,2113,2114])]);
  expect(answers.map(answer=>answer.statusCode)).toEqual([200,200]);
  const latest=await relays.worked(sam,'R22');
  const numbers=(first:number)=>(latest.race.parts.runners.value||[]).filter(isTeamEntry).find(entry=>entry.legs[0].wristband===first)!.team.number;
  expect([numbers(2101),numbers(2111)].sort()).toEqual([1,2]);
  expect(latest.teams!.map(team=>team.number)).toEqual([1,2]);
});

test('a final refuses a new team, and writes nothing',async()=>{
  const {sam,lead,relays}=await start();
  const heat=await relays.worked(sam,'R22');
  for(const legs of [[2101,2102,2103,2104],[2111,2112,2113,2114]]) expect((await typed(sam,heat,legs)).statusCode).toBe(200);
  await relays.save(sam,'R22',[1,2],[3400,3500]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await ok(lead,'/api/races',{eventCode:'R22',kind:'final'});
  expect((await typed(sam,final,[2121,2122,2123,2124])).json()).toEqual({message:'A new team can\'t join the final'});
  expect((await relays.teams(sam,'R22')).map(team=>team.number)).toEqual([1,2]);
});

test('a typed leg already in this team or in another team of this heat is refused, on the typed-team save and on a leg change',async()=>{
  const {sam,relays}=await start();
  const heat=await relays.worked(sam,'R22');
  await ok(sam,`/api/relays/${heat.group.event.id}/teams`,{legs:[2101,2102,2103,2104],keptWarnings:[],joinRaceId:heat.race.id});
  const two=await ok(sam,`/api/relays/${heat.group.event.id}/teams`,{legs:[2111,2112,null,null],keptWarnings:[],joinRaceId:heat.race.id});
  expect((await typed(sam,heat,[2121,2121,null,null])).json()).toEqual({message:'2121 is already in this team.'});
  expect((await typed(sam,heat,[2121,2102,null,null])).json()).toEqual({message:'2102 is already in Team 1 in this heat. Each child runs for one team.'});
  const team2=two.teams!.find(team=>team.number===2)!;
  const change=(legs:Array<number|null>)=>call(sam,`/api/relays/${heat.group.event.id}/teams/${team2.id}`,{version:team2.version,legs,keptWarnings:[2111],raceId:heat.race.id});
  expect((await change([2111,2111,null,null])).json()).toEqual({message:'2111 is already in this team.'});
  expect((await change([2111,2103,null,null])).json()).toEqual({message:'2103 is already in Team 1 in this heat. Each child runs for one team.'});
  expect((await relays.teams(sam,'R22')).map(team=>team.legs.map(leg=>leg.wristband))).toEqual([[2101,2102,2103,2104],[2111,2112,null,null]]);
});

test('a typed leg that is unknown, another Section\'s, ran in another heat of this relay or is in a team of another relay needs Fix number or Keep; kept, it is saved with the leg and shows in To check',async()=>{
  const {sam,lead,relays}=await start();
  const scouts=await relays.worked(sam,'R28');
  await ok(sam,`/api/relays/${scouts.group.event.id}/teams`,{legs:[4001,2150,null,null],keptWarnings:[2150],joinRaceId:scouts.race.id});
  const one=await relays.worked(sam,'R22');
  await ok(sam,`/api/relays/${one.group.event.id}/teams`,{legs:[2101,2102,2103,2104],keptWarnings:[],joinRaceId:one.race.id});
  await relays.save(sam,'R22',[1],[3400]);
  const heat=await relays.worked(sam,'R22');
  expect(heat.race.number).toBe(2);
  for(const wristband of [6100,1045,2101,2150]) expect((await typed(sam,heat,[2111,wristband,null,null])).json()).toEqual({message:`${wristband} needs Fix number or Keep`});
  const saved=await ok(sam,`/api/relays/${heat.group.event.id}/teams`,{legs:[6100,1045,2101,2150],keptWarnings:[6100,1045,2101,2150],joinRaceId:heat.race.id});
  expect((saved.race.parts.runners.value||[]).filter(isTeamEntry)[0].legs.map(({wristband,warnings})=>({wristband,warnings}))).toEqual([
    {wristband:6100,warnings:[{kind:'unknown-number',message:'6100 is not a wristband number. Wristbands are 1 to 4999.',kept:true}]},
    {wristband:1045,warnings:[{kind:'wrong-section',message:'1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',kept:true}]},
    {wristband:2101,warnings:[{kind:'other-heat',message:'2101 already ran in Heat 1, in Team 1.',kept:true}]},
    {wristband:2150,warnings:[{kind:'other-relay',message:'2150 is also in Team 1 of 4x100m Relay Girl Scouts.',kept:true}]}
  ]);
  // A leg change is checked the same way: a child from Heat 1 needs Keep, and is kept with the leg.
  const team2=saved.teams!.find(team=>team.number===2)!,url=`/api/relays/${heat.group.event.id}/teams/${team2.id}`,others=[6100,1045,2101];
  expect((await call(sam,url,{version:team2.version,legs:[6100,1045,2101,2102],keptWarnings:others,raceId:heat.race.id})).json()).toEqual({message:'2102 needs Fix number or Keep'});
  const changed=await ok(sam,url,{version:team2.version,legs:[6100,1045,2101,2102],keptWarnings:[...others,2102],raceId:heat.race.id});
  expect(changed.teams!.find(team=>team.number===2)!.legs[3].warnings).toEqual([{kind:'other-heat',message:'2102 already ran in Heat 1, in Team 1.',kept:true}]);
  await relays.save(sam,'R22',[2],[3500]);
  const results=(await app.inject({url:'/api/lead/results',headers:{authorization:`Bearer ${lead}`}})).json() as ResultsRead;
  expect(results.needsYou.filter(item=>item.event.code==='R22').map(item=>toCheckWording(item).explanation)).toContain(
    'In Team 2: 6100 is not a wristband number. Wristbands are 1 to 4999. 1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. 2101 already ran in Heat 1, in Team 1. 2102 already ran in Heat 1, in Team 1. Correct it or mark it checked.');
});
