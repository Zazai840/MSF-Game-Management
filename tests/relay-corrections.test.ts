import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead,LeadRaceRead } from '../src/shared/lead-results.js';
import { isTeamEntry,type TeamEntry } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
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
  const relays=relaySetup(app);
  async function teams(count:number) {for(let number=1;number<=count;number++) await relays.team(sam,'R22',legs(number));}
  /** Ticks the teams in and saves the heat with them placed in the order given; answers the saved heat's id. */
  async function heat(placed:number[]) {
    for(const number of placed) await relays.tick(sam,'R22',number);
    const before=await relays.screen(sam,'R22');
    await relays.save(sam,'R22',placed,placed.map((_,index)=>1400+index*100));
    return before.race.id!;
  }
  const race=async(id:string)=>((await call(lead,`/api/lead/races/${id}`)).json() as LeadRaceRead).race;
  const teamEntries=async(id:string)=>((await race(id)).parts.runners.value||[]).filter(isTeamEntry);
  /** R22's team list as the race screen carries it: each team's four wristbands and the heats holding it. */
  const teamList=async()=>(await relays.screen(sam,'R22')).teams!.map(team=>({number:team.number,wristbands:team.legs.map(leg=>leg.wristband),heats:team.races.map(item=>item.number)}));
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
  // Each team is held by the new heat only: Heat 1 is in Deleted races.
  expect((await teamList()).map(team=>team.heats)).toEqual([[2],[2],[2]]);
});

test('Delete race makes its teams still to run, Restore counts them as run again, and a team in two heats ran twice until a lead chooses which result counts',async()=>{
  const {sam,lead,relays,teams,heat,teamList}=await start();
  await teams(3);
  const first=await heat([1,2]);
  // An unsaved heat deleted: its team is still to run again.
  await relays.tick(sam,'R22',3);
  const unsaved=(await relays.screen(sam,'R22')).race.id!;
  expect((await call(lead,`/api/lead/races/${unsaved}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await teamList()).map(team=>team.heats)).toEqual([[1],[1],[]]);
  // A saved heat deleted: both its teams are still to run, and Team 1 runs again in the next heat.
  expect((await call(lead,`/api/lead/races/${first}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await teamList()).map(team=>team.heats)).toEqual([[],[],[]]);
  const third=await heat([1,3]);
  expect((await teamList()).map(team=>team.heats)).toEqual([[3],[],[3]]);
  // Heat 1 restored: Team 2 has run again, and Team 1 is in two heats.
  const restored=await call(lead,`/api/lead/races/${first}/restore`,{});
  expect(restored.statusCode).toBe(200);
  expect((await teamList()).map(team=>team.heats)).toEqual([[1,3],[1],[3]]);
  const twice=(restored.json() as EventResultsRead).results.leaderboard.filter(row=>row.flags.some(flag=>flag.kind==='ran-twice'));
  expect(twice.map(row=>[row.team?.number,row.race.number])).toEqual([[1,1],[1,3]]);
  // Choose which result counts: Team 1's Heat 3 result counts, its Heat 1 result stays visible as not counted.
  const counted=twice.find(row=>row.race.number===3)!;
  const response=await call(lead,`/api/lead/races/${third}/runners/${counted.entryId}/count-result`,{});
  expect(response.statusCode).toBe(200);
  const rows=(response.json() as EventResultsRead).results.leaderboard.filter(row=>row.team?.number===1);
  expect(rows.map(row=>[row.race.number,row.notCounted,row.flags.map(flag=>flag.kind)])).toEqual([[3,false,[]],[1,true,[]]]);
  expect((response.json() as EventResultsRead).auditNotes[0].message).toBe('Jo Evans counted Team 1 from Heat 3; Heat 1 not counted');
});
