import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import type { HomeSnapshot,RaceScreenRead } from '../src/shared/race-screen.js';
import { isTeamEntry } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
/** Team N of R22 (Girl Cubs) is 2N01-2N04. */
const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);
/** Seven Girl Cubs teams run two heats of R22: Teams 2, 5, 1, 6, 3 and 7 are the six fastest, Team 4 is 7th. */
async function start({complete=true}={}) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-final-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-final-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Shah')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relaySetup(app);
  for(let number=1;number<=7;number++) await relays.team(sam,'R22',legs(number));
  for(const [placed,times] of [[[2,1,3,4],[1400,1500,1700,1900]],[[5,6,7],[1450,1600,1800]]]) {
    for(const number of placed) await relays.tick(sam,'R22',number);
    await relays.save(sam,'R22',placed,times);
  }
  const results=async()=>((await call(lead,'/api/lead/events/R22/results')).json() as EventResultsRead).results;
  const completeHeats=async()=>expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  if(complete) await completeHeats();
  return {sam,priya,lead,relays,results,completeHeats};
}
/** The Final's teams by number, each with its four children and whether each is here. */
const finalTeams=(read:RaceScreenRead)=>(read.race.parts.runners.value||[]).filter(isTeamEntry).map(entry=>entry.team.number);

test.each(['Heats complete','Call up'])('%s refuses a team missing from the team list without changing the final',async(action)=>{
  const {sam,lead,relays,results}=await start({complete:action==='Call up'});
  const seen=await relays.screen(sam,'R22');
  if(action==='Call up') await relays.post(sam,'/api/race-screen/R22/absent-team',{raceId:seen.race.id,teamId:seen.teams!.find(team=>team.number===5)!.id,absent:true});
  const number=action==='Call up'?4:2,team=seen.teams!.find(team=>team.number===number)!;
  // Simulate an inconsistent team list: public writes never remove a team that has run.
  const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
  await db.connect();
  try {await db.query('UPDATE relay_teams SET removed=true WHERE id=$1',[team.id]);}
  finally {await db.end();}
  const before=await results(),screenBefore=await relays.screen(sam,'R22');
  const response=action==='Call up'
    ?await call(lead,'/api/lead/events/R22/call-up',{expectedHeatEntryId:before.finalResults!.nextCallUp!.entryId})
    :await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'});
  expect(response.statusCode,response.body).toBe(409);
  expect(response.json()).toEqual({message:`Team ${number} is missing from the team list - ask a lead to check it`});
  expect(await results()).toEqual(before);
  expect(await relays.screen(sam,'R22')).toEqual(screenBefore);
});

test('storing the Final copies each seeded team\'s four children from its team list as it stands then',async()=>{
  const {sam,relays,completeHeats}=await start({complete:false});
  // Team 2 swaps its 3rd leg on the Teams screen after its heat: the Final takes the team list, not the heat's copy.
  const home=await relays.post<HomeSnapshot>(sam,'/api/teams/R22/take-over',{});
  const team=home.events.find(event=>event.code==='R22')!.teams!.find(item=>item.number===2)!;
  await relays.post(sam,'/api/teams/R22/open',{teamId:team.id});
  await relays.post(sam,'/api/teams/R22/done',{teamId:team.id,version:team.version,legs:[2201,2202,2299,2204],keptWarnings:[]});
  await completeHeats();
  const final=await relays.screen(sam,'R22');
  expect(final.race.kind).toBe('final');
  expect(finalTeams(final)).toEqual([2,5,1,6,3,7]);
  expect((final.race.parts.runners.value||[]).filter(isTeamEntry).find(entry=>entry.team.number===2)!.legs.map(leg=>[leg.wristband,leg.here])).toEqual([[2201,false],[2202,false],[2299,false],[2204,false]]);
});

test('anyone marks a Final team Absent with one tap, freeing its seed, and tapping again brings it back with its children as they were',async()=>{
  const {sam,priya,relays}=await start();
  const seen=await relays.screen(sam,'R22'),teamId=(number:number)=>seen.teams!.find(team=>team.number===number)!.id;
  const absent=(token:string,number:number,isAbsent:boolean,raceId=seen.race.id)=>call(token,'/api/race-screen/R22/absent-team',{raceId,teamId:teamId(number),absent:isAbsent});
  await relays.here(priya,'R22',5,0);
  // The order holder has placed Team 5 already: marked Absent, it leaves the order and later places move up.
  const order=(await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/take-over',{job:'order'})).race,entry=(number:number)=>order.parts.runners.value!.filter(isTeamEntry).find(item=>item.team.number===number)!.id;
  await relays.post(priya,'/api/race-screen/R22/order',{raceId:order.id,version:order.parts.finish.version,order:[entry(5),entry(2)],didNotFinish:[],didNotRun:[],added:[]});
  const marked=await absent(sam,5,true);
  expect(marked.statusCode,marked.body).toBe(200);
  const away=marked.json() as RaceScreenRead;
  expect(finalTeams(away)).toEqual([2,1,6,3,7]);
  expect(away.race.parts.finish.value!.order).toEqual([entry(2)]);
  expect(away.race.final!.entries.map(item=>[item.team?.number,item.seed,item.absent])).toEqual([[2,1,false],[5,2,true],[1,3,false],[6,4,false],[3,5,false],[7,6,false]]);
  // A repeated tap changes nothing.
  expect(((await absent(priya,5,true)).json() as RaceScreenRead).revision).toBe(away.revision);
  const back=(await absent(priya,5,false)).json() as RaceScreenRead;
  expect(finalTeams(back)).toEqual([2,1,6,3,7,5]);
  expect(back.race.parts.runners.value!.filter(isTeamEntry).find(item=>item.team.number===5)!.legs.map(leg=>leg.here)).toEqual([true,false,false,false]);
  expect(back.race.final!.entries.every(item=>!item.absent)).toBe(true);
  // Take off is for a heat's teams; Absent is for a Final's.
  expect((await call(sam,'/api/race-screen/R22/take-off',{raceId:seen.race.id,teamId:teamId(7)})).json()).toEqual({message:'Mark the final\'s teams Here or Absent'});
  expect((await absent(sam,4,true)).json()).toEqual({message:'Team 4 is not in the Final'});
});

test('a lead\'s call-up for an absent team names the next-ranked team, which appears ticked on the race screen',async()=>{
  const {sam,lead,relays,results}=await start();
  const seen=await relays.screen(sam,'R22');
  const marked=await call(sam,'/api/race-screen/R22/absent-team',{raceId:seen.race.id,teamId:seen.teams!.find(team=>team.number===5)!.id,absent:true});
  expect(marked.statusCode,marked.body).toBe(200);
  const next=(await results()).finalResults!.nextCallUp!;

  expect([next.team?.number,next.position]).toEqual([4,7]);
  const calledUp=await call(lead,'/api/lead/events/R22/call-up',{expectedHeatEntryId:next.entryId});
  expect(calledUp.statusCode,calledUp.body).toBe(200);
  expect((calledUp.json() as EventResultsRead).auditNotes.find(note=>note.action==='call-up')!.message).toBe('Jo Evans called up Team 4 (heat rank 7) for absent Team 5');
  const read=await relays.screen(sam,'R22');
  expect(read.revision).toBeGreaterThan(seen.revision);
  expect(finalTeams(read)).toEqual([2,1,6,3,7,4]);
  expect(read.race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===4)!.legs.map(leg=>[leg.wristband,leg.here])).toEqual(legs(4).map(wristband=>[wristband,false]));
  expect(read.race.final!.entries.map(item=>[item.team?.number,item.seed,item.absent,item.calledUp])).toEqual([[2,1,false,false],[5,2,true,false],[1,3,false,false],[6,4,false,false],[3,5,false,false],[7,6,false,false],[4,2,false,true]]);
});

test('a lead adds a team to the Final by picking it from the relay\'s teams: it shows as Added, ticked on the race screen',async()=>{
  const {sam,lead,relays}=await start();
  const detail=(await call(lead,'/api/lead/events/R22/results')).json() as EventResultsRead;
  // The lead's pick list is the relay's team list.
  expect(detail.teams!.map(team=>[team.number,team.legs.map(leg=>leg.wristband)])).toEqual([1,2,3,4,5,6,7].map(number=>[number,legs(number)]));
  const teamId=(number:number)=>detail.teams!.find(team=>team.number===number)!.id;
  const added=await call(lead,'/api/lead/events/R22/add-team',{teamId:teamId(4)});
  expect(added.statusCode,added.body).toBe(200);
  expect((added.json() as EventResultsRead).auditNotes.find(note=>note.action==='add-team')!.message).toBe('Jo Evans added Team 4 to the Final');
  const read=await relays.screen(sam,'R22');
  expect(finalTeams(read)).toEqual([2,5,1,6,3,7,4]);
  expect(read.race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===4)!.legs.map(leg=>[leg.wristband,leg.here])).toEqual(legs(4).map(wristband=>[wristband,false]));
  expect(read.race.final!.entries.at(-1)).toMatchObject({team:{number:4},seed:null,absent:false,calledUp:false});
  // A team already in the Final, Absent or not, is not added twice.
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:teamId(4)})).json()).toEqual({message:'Team 4 is already in the Final'});
  await call(sam,'/api/race-screen/R22/absent-team',{raceId:read.race.id,teamId:teamId(2),absent:true});
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:teamId(2)})).json()).toEqual({message:'Team 2 is already in the Final'});
  expect((await call(lead,'/api/lead/events/R4/add-team',{teamId:teamId(2)})).json()).toEqual({message:'Only a relay has teams'});
});

test('a relay Final takes the finishing order only: Submit Race asks only the order holder, an Edit\'s swapped child runs it, and Absent teams leave it when saved',async()=>{
  const {sam,priya,relays,results}=await start();
  const seen=await relays.screen(sam,'R22'),team=(number:number)=>seen.teams!.find(item=>item.number===number)!;
  await relays.post(sam,'/api/race-screen/R22/absent-team',{raceId:seen.race.id,teamId:team(7).id,absent:true});
  // Team 2's 3rd leg is swapped at check-in: the child who runs the Final gets the medal, with no flag.
  await relays.post(sam,'/api/race-screen/R22/edit-open',{raceId:seen.race.id,teamId:team(2).id});
  await relays.post(sam,'/api/race-screen/R22/edit-done',{raceId:seen.race.id,teamId:team(2).id,version:team(2).version,legs:[2201,2202,2299,2204],keptWarnings:[]});
  for(const number of [2,5,1,6,3]) for(const leg of [0,1,2,3]) await relays.here(sam,'R22',number,leg);
  const race=(await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/take-over',{job:'order'})).race,id=(number:number)=>race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===number)!.id;
  expect(finalTeams({race} as RaceScreenRead)).toEqual([2,5,1,6,3]);
  const ordered=await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/order',{raceId:race.id,version:race.parts.finish.version,order:[3,2,5,1,6].map(id),didNotFinish:[],didNotRun:[],added:[]});
  // Sam ticked and edited teams but holds no job, so only Priya is asked.
  expect(ordered.asked.map(holder=>holder.name)).toEqual(['Priya Shah']);
  const saved=await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/submit',{raceId:race.id});
  expect(saved.race.state).toBe('saved');
  const final=(await results()).finalResults!;
  expect(final.leaderboard.map(row=>[row.position,row.medalPlace,row.team?.number,row.team?.wristbands,row.flags])).toEqual([
    [1,1,3,legs(3),[]],[2,2,2,[2201,2202,2299,2204],[]],[3,3,5,legs(5),[]],[4,null,1,legs(1),[]],[5,null,6,legs(6),[]]
  ]);
});

test('Submit Race on a relay Final is blocked while every team is Absent',async()=>{
  const {sam,relays}=await start();
  const seen=await relays.screen(sam,'R22');
  for(const team of seen.teams!.filter(item=>[2,5,1,6,3,7].includes(item.number))) await relays.post(sam,'/api/race-screen/R22/absent-team',{raceId:seen.race.id,teamId:team.id,absent:true});
  expect((await call(sam,'/api/race-screen/R22/submit',{raceId:seen.race.id})).json()).toEqual({message:'Every team is marked Absent'});
});

test('Absent is only for a Final\'s teams',async()=>{
  const {sam,relays}=await start({complete:false});
  await relays.team(sam,'R22',legs(8));
  const ticked=await relays.tick(sam,'R22',8);
  expect((await call(sam,'/api/race-screen/R22/absent-team',{raceId:ticked.race.id,teamId:ticked.teams!.find(team=>team.number===8)!.id,absent:true})).json()).toEqual({message:'Only a final has Here / Absent'});
});

test('"+ Team not on the list" is refused on a relay Final: its teams are its seeds, call-ups and a lead\'s additions',async()=>{
  const {sam,priya,relays,completeHeats}=await start({complete:false});
  // Team 8 never ran a heat, so it is still to run once the Final is stored.
  await relays.team(sam,'R22',legs(8));
  await completeHeats();
  const final=(await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/take-over',{job:'order'})).race;
  const team8=(await relays.screen(priya,'R22')).teams!.find(team=>team.number===8)!;
  const added=await call(priya,'/api/race-screen/R22/order',{raceId:final.id,version:final.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[],addedTeams:[team8.id]});
  expect(added.json()).toEqual({message:'Ask a lead to add a team to the Final'});
  expect(finalTeams(await relays.screen(priya,'R22'))).toEqual([2,5,1,6,3,7]);
});
