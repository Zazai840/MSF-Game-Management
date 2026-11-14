import { afterEach,expect,test } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import type { RaceFlowRead,RacesRead } from '../src/shared/race-flow.js';
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
  expect(one.nextTeam).toBe(1);
  let read=(await typed(sam,one,[2101,2102,2103,2104])).json() as RaceFlowRead;
  read=(await typed(sam,one,[2111,2112,2113,null])).json() as RaceFlowRead;
  expect(teamsIn(read.race)).toEqual([[1,[[2101,true],[2102,true],[2103,true],[2104,true]]],[2,[[2111,true],[2112,true],[2113,true],[null,false]]]]);
  expect(read.nextTeam).toBe(3);
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

test('a new team typed at a final ("+ Team" with a number in no team) joins Here as Added with a reason while a place is free, kept as an audit note; refused otherwise, writing nothing',async()=>{
  const {sam,lead,relays}=await start();
  const heat=await relays.worked(sam,'R22');
  for(const legs of [[2101,2102,2103,2104],[2111,2112,2113,2114]]) expect((await typed(sam,heat,legs)).statusCode).toBe(200);
  await relays.save(sam,'R22',[1,2],[3400,3500]);
  let final=await ok(lead,'/api/races',{eventCode:'R22',kind:'final'});
  const notFound={reason:'Not found',text:null},newTeam=[2121,2122,2123,2124];
  const atFinal=(reason?:unknown,legs:Array<number|null>=newTeam,kept:number[]=[])=>call(sam,`/api/relays/${final.group.event.id}/teams`,{legs,keptWarnings:kept,joinRaceId:final.race.id,...(reason===undefined?{}:{reason})});
  // No finalist Absent: no place is free.
  expect((await atFinal(notFound)).json()).toEqual({message:'No place is free in the Final'});
  await call(sam,`/api/races/${final.race.id}/teams/${final.race.final!.entries[1].team!.id}/absent`,{mark:'absent'});
  // A place is free: refused without a reason, with Wrong number (a replace's reason), or with Other and no text.
  expect((await atFinal()).json()).toEqual({message:'Choose why the change'});
  for(const reason of [{reason:'Wrong number',text:null},{reason:'Other',text:''}]) expect((await atFinal(reason)).statusCode).toBe(400);
  // The usual leg checks: an unknown number needs Keep.
  expect((await atFinal(notFound,[2121,6100,null,null])).json()).toEqual({message:'6100 needs Fix number or Keep'});
  expect((await relays.teams(sam,'R22')).map(team=>team.number)).toEqual([1,2]);
  // With a reason the new team takes the relay's next number and joins Here at once, as Added.
  final=await ok(sam,`/api/relays/${final.group.event.id}/teams`,{legs:newTeam,keptWarnings:[],joinRaceId:final.race.id,reason:notFound});
  expect(final.race.final!.entries.at(-1)).toMatchObject({team:{number:3},seed:null,calledUp:false,absent:false});
  expect(teamsIn(final.race).at(-1)).toEqual([3,newTeam.map(wristband=>[wristband,true])]);
  expect((await app.inject({url:'/api/lead/events/R22/results',headers:{authorization:`Bearer ${lead}`}})).json().auditNotes[0].message).toBe('Sam Patel added Team 3 to the Final - Not found');
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

test('the races read carries no relay team list, and the writes for a team without a race, the open / close marks and Remove are gone',async()=>{
  const {sam,relays}=await start();
  const home=(await app.inject({url:'/api/races',headers:{authorization:`Bearer ${sam}`}})).json() as RacesRead,relay=home.groups.find(group=>group.event.code==='R22')!;
  expect(relay).not.toHaveProperty('teams');
  expect(relay).not.toHaveProperty('nextTeam');
  const heat=await relays.worked(sam,'R22');
  const read=await ok(sam,`/api/relays/${heat.group.event.id}/teams`,{legs:[2101,2102,2103,2104],keptWarnings:[],joinRaceId:heat.race.id});
  const team=read.teams![0],url=`/api/relays/${heat.group.event.id}/teams`;
  expect((await call(sam,url,{legs:[2111,null,null,null],keptWarnings:[]})).json()).toEqual({message:'Choose this race'});
  expect((await call(sam,`${url}/${team.id}`,{version:team.version,legs:[2101,2102,2103,2105],keptWarnings:[]})).json()).toEqual({message:'Choose this race'});
  for(const gone of ['open','close','remove']) expect((await call(sam,`${url}/${team.id}/${gone}`,{version:team.version})).statusCode).toBe(404);
  const races=(await app.inject({url:'/api/races',headers:{authorization:`Bearer ${sam}`}})).json() as RacesRead,id=(code:string)=>races.groups.find(group=>group.event.code===code)!.event.id;
  for(const [path,body,message] of [
    [url,{legs:[null,null,null,null],joinRaceId:heat.race.id},'Enter at least one wristband number'],
    [url,{legs:[2111,2112],joinRaceId:heat.race.id},'Enter the four wristband boxes'],
    [`/api/relays/${id('R4')}/teams`,{legs:[1101,null,null,null],joinRaceId:heat.race.id},'Only a relay has teams'],
    ['/api/relays/nope/teams',{legs:[1101,null,null,null],joinRaceId:heat.race.id},'Event not found'],
    [`${url}/nope`,{version:1,legs:[2111,null,null,null],raceId:heat.race.id},'Team not found'],
    [`${url}/${team.id}`,{legs:[2111,null,null,null],raceId:heat.race.id},'Open the team again']
  ] as const) expect((await call(sam,path,body)).json(),path).toEqual({message});
  expect((await relays.teams(sam,'R22')).map(item=>[item.number,item.legs.map(leg=>leg.wristband)])).toEqual([[1,[2101,2102,2103,2104]]]);
});

test('teams typed ahead on a day saved before the build are Still to run at every heat of their relay, with their numbers, and Add checks each in',async()=>{
  const {sam,relays}=await start();
  // The old build's New team: rows of the relay in no race, numbered in the order saved; Team 2 has three children.
  const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  try {
    await db.query(`INSERT INTO relay_teams(id,event_id,number,legs,changed_by) SELECT gen_random_uuid(),e.id,t.n,t.legs::jsonb,'Sam Patel'
      FROM events e JOIN olympics_days d ON d.id=e.day_id AND d.active,
      (VALUES (1,'[{"wristband":2101,"warnings":[]},{"wristband":2102,"warnings":[]},{"wristband":2103,"warnings":[]},{"wristband":2104,"warnings":[]}]'),
        (2,'[{"wristband":2201,"warnings":[]},{"wristband":2202,"warnings":[]},{"wristband":null,"warnings":[]},{"wristband":2204,"warnings":[]}]')) AS t(n,legs)
      WHERE e.code='R22'`);
  } finally {await db.end();}
  const stillToRun=(read:RaceFlowRead)=>read.teams!.filter(team=>!team.races.length).map(team=>[team.number,team.legs.map(leg=>leg.wristband)]);
  const one=await relays.worked(sam,'R22');
  expect(stillToRun(one)).toEqual([[1,[2101,2102,2103,2104]],[2,[2201,2202,null,2204]]]);
  // A team typed into the heat takes the next number.
  expect(one.nextTeam).toBe(3);
  const added=await relays.tick(sam,'R22',2);
  expect(teamsIn(added.race)).toEqual([[2,[[2201,true],[2202,true],[null,false],[2204,true]]]]);
  await relays.save(sam,'R22',[2],[3400]);
  const two=await relays.worked(sam,'R22');
  expect(two.race.number).toBe(2);
  expect(stillToRun(two)).toEqual([[1,[2101,2102,2103,2104]]]);
});
