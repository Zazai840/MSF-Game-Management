import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead,LeadRaceRead } from '../src/shared/lead-results.js';
import { isTeamEntry,type TeamEntry } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** Team N on R22 (Girl Cubs) is 2N01-2N04. */
const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-corrections-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-corrections-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relayFlowSetup(app);
  async function teams(count:number) {for(let number=1;number<=count;number++) await relays.team(sam,'R22',legs(number));}
  /** Ticks the teams in with all four children marked here and saves the heat with them placed in the order given; answers the saved heat's id. */
  async function heat(placed:number[]) {
    for(const number of placed) {await relays.tick(sam,'R22',number);for(const leg of [0,1,2,3]) await relays.here(sam,'R22',number,leg);}
    return (await relays.save(sam,'R22',placed,placed.map((_,index)=>1400+index*100))).race.id;
  }
  const race=async(id:string)=>((await call(lead,`/api/lead/races/${id}`)).json() as LeadRaceRead).race;
  const teamEntries=async(id:string)=>((await race(id)).parts.runners.value||[]).filter(isTeamEntry);
  /** R22's team list as the lead's Results carries it: each team's four wristbands and the heats holding it. */
  const teamList=async()=>((await call(lead,'/api/lead/events/R22/results')).json() as EventResultsRead).teams!.map(team=>({number:team.number,wristbands:team.legs.map(leg=>leg.wristband),heats:team.races.map(item=>item.number)}));
  return {sam,lead,relays,teams,heat,race,teamEntries,teamList};
}

test('Re-run on a relay heat opens a new heat with the same teams and children, and the old heat leaves the event',async()=>{
  const {lead,teams,heat,race,teamEntries,teamList}=await start();
  await teams(3);
  const first=await heat([2,1,3]);
  const before=await teamEntries(first);
  const response=await call(lead,`/api/lead/races/${first}/re-run`,{comment:'False start'});
  expect(response.statusCode).toBe(200);
  const rerun=(response.json() as {newRaceId:string}).newRaceId,again=await teamEntries(rerun);
  expect((await race(rerun)).state).toBe('in progress');
  expect(again.map(entry=>[entry.team.number,entry.legs.map(leg=>leg.wristband)])).toEqual(before.map(entry=>[entry.team.number,entry.legs.map(leg=>leg.wristband)]));
  expect(again.map(entry=>entry.id)).not.toContain(before[0].id);
  // Each team is held by the new heat only: the old Heat 1 is in Deleted races, and the re-run keeps its number.
  expect((await teamList()).map(team=>team.heats)).toEqual([[1],[1],[1]]);
});

test('Delete race makes its teams still to run, Restore counts them as run again, and a team in two heats ran twice until a lead chooses which result counts',async()=>{
  const {sam,lead,relays,teams,heat,teamList}=await start();
  await teams(3);
  const first=await heat([1,2]);
  // An unsaved heat deleted: its team is still to run again.
  await relays.tick(sam,'R22',3);
  const unsaved=(await relays.race(sam,'R22'))!.race.id;
  expect((await call(lead,`/api/lead/races/${unsaved}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await teamList()).map(team=>team.heats)).toEqual([[1],[1],[]]);
  // A saved heat deleted: both its teams are still to run, and Team 1 runs again in the next heat, which takes the freed number: Heat 1.
  expect((await call(lead,`/api/lead/races/${first}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await teamList()).map(team=>team.heats)).toEqual([[],[],[]]);
  const third=await heat([1,3]);
  expect((await teamList()).map(team=>team.heats)).toEqual([[1],[],[1]]);
  // The old Heat 1 restored, as Heat 2: Team 2 has run again, and Team 1 is in two heats.
  const restored=await call(lead,`/api/lead/races/${first}/restore`,{});
  expect(restored.statusCode).toBe(200);
  expect((await teamList()).map(team=>team.heats)).toEqual([[2,1],[2],[1]]);
  const twice=(restored.json() as EventResultsRead).results.leaderboard.filter(row=>row.flags.some(flag=>flag.kind==='ran-twice'));
  expect(twice.map(row=>[row.team?.number,row.race.number])).toEqual([[1,1],[1,2]]);
  // Choose which result counts: Team 1's new Heat 1 result counts, its Heat 2 result stays visible as not counted.
  const counted=twice.find(row=>row.race.number===1)!;
  const response=await call(lead,`/api/lead/races/${third}/runners/${counted.entryId}/count-result`,{});
  expect(response.statusCode).toBe(200);
  const rows=(response.json() as EventResultsRead).results.leaderboard.filter(row=>row.team?.number===1);
  expect(rows.map(row=>[row.race.number,row.notCounted,row.flags.map(flag=>flag.kind)])).toEqual([[1,false,[]],[2,true,[]]]);
  expect((response.json() as EventResultsRead).auditNotes[0].message).toBe('Jo Evans counted Team 1 from Heat 1; Heat 2 not counted');
});

/** Team 1 runs Heat 1, which is deleted, then the new Heat 1; the old one is restored as Heat 2, so the new Heat 1 is Team 1's latest race and Heat 2 an earlier one. */
async function twoRaces(setup:Awaited<ReturnType<typeof start>>) {
  const {lead,teams,heat}=setup;
  await teams(2);
  const earlier=await heat([1,2]);
  await call(lead,`/api/lead/races/${earlier}/delete`,{permanent:false});
  const latest=await heat([1]);
  await call(lead,`/api/lead/races/${earlier}/restore`,{});
  const entryOf=async(raceId:string)=>(await setup.teamEntries(raceId)).find(entry=>entry.team.number===1)!;
  return {earlier,latest,entryOf};
}
const wristbandsOf=(entry:TeamEntry)=>entry.legs.map(leg=>leg.wristband);

test('Correct number on a child of a team in its latest race changes the race and the team list in one write; on an earlier race only the race',async()=>{
  const setup=await start(),{lead,teamList}=setup,{earlier,latest,entryOf}=await twoRaces(setup);
  const correct=async(raceId:string,body:object)=>call(lead,`/api/lead/races/${raceId}/runners/${(await entryOf(raceId)).id}/correct-number`,body);
  const response=await correct(latest,{leg:1,expectedWristband:2102,wristband:2109});
  expect(response.statusCode).toBe(200);
  expect(wristbandsOf(await entryOf(latest))).toEqual([2101,2109,2103,2104]);
  expect((await teamList())[0].wristbands).toEqual([2101,2109,2103,2104]);
  expect((response.json() as EventResultsRead).auditNotes[0].message).toBe('Jo Evans corrected 2102 to 2109 in Team 1 (Heat 1)');
  // Heat 2 is earlier: the team list keeps 2103, so the typo fixed there doesn't change who runs next.
  expect((await correct(earlier,{leg:2,expectedWristband:2103,wristband:2199})).statusCode).toBe(200);
  expect(wristbandsOf(await entryOf(earlier))).toEqual([2101,2102,2199,2104]);
  expect((await teamList())[0].wristbands).toEqual([2101,2109,2103,2104]);
});

test('Correct number on a team refuses a wristband already in the relay and needs Fix number or Keep for a warning',async()=>{
  const setup=await start(),{lead,teamList}=setup,{latest,entryOf}=await twoRaces(setup);
  const correct=async(body:object)=>{const response=await call(lead,`/api/lead/races/${latest}/runners/${(await entryOf(latest)).id}/correct-number`,body);return [response.statusCode,response.json().message ?? null];};
  expect(await correct({leg:1,expectedWristband:2102,wristband:2201})).toEqual([409,'2201 is already in Team 2. Check the wristband.']);
  expect(await correct({leg:1,expectedWristband:2102,wristband:2101})).toEqual([409,'2101 is already in this team. Check the wristband.']);
  expect(await correct({leg:1,expectedWristband:2109,wristband:2105})).toEqual([409,'Runner number has changed - open actions again']);
  // 1060 is a Boy Cub's number: kept, it is stored with its warning on the race and the team list.
  expect(await correct({leg:1,expectedWristband:2102,wristband:1060})).toEqual([409,'1060 needs Fix number or Keep']);
  expect((await correct({leg:1,expectedWristband:2102,wristband:1060,keepWarnings:true}))[0]).toBe(200);
  const leg=(await entryOf(latest)).legs[1];
  expect([leg.wristband,leg.warnings.map(warning=>[warning.kind,warning.kept])]).toEqual([1060,[['wrong-section',true]]]);
  expect((await teamList())[0].wristbands).toEqual([2101,1060,2103,2104]);
});

test('Correct teams on a saved heat takes a team off (still to run again), adds a team still to run, and edits a team\'s four children through to the team list',async()=>{
  const {sam,lead,relays,teams,heat,race,teamEntries,teamList}=await start();
  await teams(4);
  const first=await heat([1,2,3]);
  const entries=await teamEntries(first),entryOf=(number:number)=>entries.find(entry=>entry.team.number===number)!;
  const teamId=async(number:number)=>(await relays.teams(sam,'R22')).find(team=>team.number===number)!.id;
  const saved=await race(first),versions={baseVersion:saved.parts.runners.version,finishVersion:saved.parts.finish.version};
  const correct=(body:object)=>call(lead,`/api/lead/races/${first}/teams`,{...versions,...body});
  const kept={entryId:entryOf(1).id},edited={entryId:entryOf(2).id,legs:[2201,2202,2299,2204]};
  // The team-entry refusals and warnings apply.
  const refused=async(body:object)=>{const response=await correct(body);return [response.statusCode,response.json().message];};
  expect(await refused({teams:[kept,{entryId:entryOf(2).id,legs:[2201,2202,2101,2204]}]})).toEqual([409,'2101 is already in Team 1. Check the wristband.']);
  expect(await refused({teams:[kept,{entryId:entryOf(2).id,legs:[2201,2202,1060,2204]}]})).toEqual([409,'1060 needs Fix number or Keep']);
  expect(await refused({teams:[kept,{teamId:await teamId(1)}]})).toEqual([400,'Choose each team once']);
  const response=await correct({teams:[kept,edited,{teamId:await teamId(4)}],comment:'Team 3 never ran'});
  expect(response.statusCode).toBe(200);
  const now=await race(first),after=await teamEntries(first);
  expect(after.map(entry=>[entry.team.number,wristbandsOf(entry)])).toEqual([[1,legs(1)],[2,[2201,2202,2299,2204]],[4,legs(4)]]);
  // Team 1 and Team 2 keep their places; Team 4 takes the next place, as a team added at the finish does.
  expect(now.parts.finish.value).toEqual({order:after.map(entry=>entry.id),didNotFinish:[]});
  expect(await teamList()).toEqual([
    {number:1,wristbands:legs(1),heats:[1]},{number:2,wristbands:[2201,2202,2299,2204],heats:[1]},{number:3,wristbands:legs(3),heats:[]},{number:4,wristbands:legs(4),heats:[1]}
  ]);
  expect((response.json() as EventResultsRead).auditNotes[0].message).toBe('Jo Evans corrected the teams for Heat 1: Team 1, Team 2, Team 4 - Team 3 never ran');
  // The race has changed since it was opened, and a team in another heat since can't be added: the refusal says which.
  expect(await refused({teams:[kept]})).toEqual([409,'This race has changed - open it again']);
  await relays.tick(sam,'R22',3);
  expect((await call(lead,`/api/lead/races/${first}/teams`,{baseVersion:now.parts.runners.version,finishVersion:now.parts.finish.version,teams:[...after.map(entry=>({entryId:entry.id})),{teamId:await teamId(3)}]})).json().message).toBe('Team 3 is already in Heat 2');
});

test('Re-run and Restore on a relay never wait on another heat in progress: the relay\'s heats run side by side',async()=>{
  const {sam,lead,relays,teams,heat,teamList}=await start();
  await teams(4);
  const first=await heat([1,2]);
  // Heat 2 has Team 3 checked in; deleted, then the new Heat 2 takes Team 4 in, and the old one comes back as Heat 3.
  await relays.tick(sam,'R22',3);
  const second=(await relays.race(sam,'R22'))!.race.id;
  expect((await call(lead,`/api/lead/races/${second}/delete`,{permanent:false})).statusCode).toBe(200);
  await relays.tick(sam,'R22',4);
  const restored=await call(lead,`/api/lead/races/${second}/restore`,{});
  expect([restored.statusCode,restored.json().message]).toEqual([200,undefined]);
  const rerun=await call(lead,`/api/lead/races/${first}/re-run`,{});
  expect([rerun.statusCode,rerun.json().message]).toEqual([200,undefined]);
  expect((await teamList()).map(team=>team.heats)).toEqual([[1],[1],[3],[2]]);
});
