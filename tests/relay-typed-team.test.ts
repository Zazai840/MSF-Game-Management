import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
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
  await relays.save(sam,'R22',[1,2],[1400,1500]);
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
  await relays.save(sam,'R22',[1,2],[1400,1500]);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  const final=await ok(lead,'/api/races',{eventCode:'R22',kind:'final'});
  expect((await typed(sam,final,[2121,2122,2123,2124])).json()).toEqual({message:'A new team can\'t join the final'});
  expect((await relays.teams(sam,'R22')).map(team=>team.number)).toEqual([1,2]);
});
