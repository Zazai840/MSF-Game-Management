import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
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

test('Absent is only for a Final\'s teams',async()=>{
  const {sam,relays}=await start({complete:false});
  await relays.team(sam,'R22',legs(8));
  const ticked=await relays.tick(sam,'R22',8);
  expect((await call(sam,'/api/race-screen/R22/absent-team',{raceId:ticked.race.id,teamId:ticked.teams!.find(team=>team.number===8)!.id,absent:true})).json()).toEqual({message:'Only a final has Here / Absent'});
});
