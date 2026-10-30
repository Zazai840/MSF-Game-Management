import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead,ResultsRead } from '../src/shared/lead-results.js';
import { leadLine,type RaceFlowRead,type RacesRead } from '../src/shared/race-flow.js';
import { isTeamEntry,type RaceRead } from '../src/shared/races.js';
import { signInOwner } from './support/sign-in.js';
import { relayFlowSetup } from './support/relays.js';
/**
 * A relay final in the race flow: a lead makes it from "+ Final", seeding the fastest 6 teams. Its Start line marks
 * each seeded team Here or Absent with one tap from anyone (ADR 0002), neither at first, and it saves itself once
 * Runners and Finishing order are done: a final has no Times.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function ok<T=RaceFlowRead>(token:string,url:string,body?:unknown) {
  const response=await call(token,url,body);
  if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
  return response.json() as T;
}
const teamsOf=(race:Pick<RaceRead,'parts'>)=>(race.parts.runners.value||[]).filter(isTeamEntry);
/** Team N of R22 (Girl Cubs) is 2N01-2N04. */
const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);
/** Runs a relay heat to saved in the race flow: the teams ticked in, every child here, placed in the order given and timed. */
async function runHeat(token:string,number:number,placed:number[],times:number[]) {
  let read=await ok(token,'/api/races',{eventCode:'R22',kind:'heat',number});
  const id=read.race.id,teamId=(team:number)=>read.teams!.find(item=>item.number===team)!.id;
  for(const team of placed) {
    read=await ok(token,`/api/races/${id}/teams/${teamId(team)}/tick`,{});
    for(const leg of [0,1,2,3]) read=await ok(token,`/api/races/${id}/teams/${teamId(team)}/here`,{leg,here:true});
  }
  read=await ok(token,`/api/races/${id}/steps/runners/done`,{});
  const entryOf=(team:number)=>teamsOf(read.race).find(entry=>entry.team.number===team)!.id;
  read=await ok(token,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:placed.map(entryOf),didNotFinish:[],didNotRun:[],added:[]});
  read=await ok(token,`/api/races/${id}/steps/positions/done`,{});
  read=await ok(token,`/api/races/${id}/times`,{raceId:id,version:read.race.parts.times.version,places:times,keptWrong:[]});
  read=await ok(token,`/api/races/${id}/steps/times/done`,{});
  expect(read.race.state).toBe('saved');
}
/** Seven Girl Cubs teams run two heats of R22: Teams 2, 5, 1, 6, 3 and 7 are the six fastest, Team 4 is 7th; Team 8 never runs. */
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-flow-final-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-flow-final-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Shah')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relayFlowSetup(app);
  for(let number=1;number<=8;number++) await relays.team(sam,'R22',legs(number));
  await runHeat(sam,1,[2,1,3,4],[1400,1500,1700,1900]);
  await runHeat(sam,2,[5,6,7],[1450,1600,1800]);
  return {sam,priya,lead};
}
const makeFinal=(token:string)=>call(token,'/api/races',{eventCode:'R22',kind:'final'});
/** The final's seeded line-up as numbers, and each team's mark: Here (every child here), Absent, or not marked. */
function marks(read:RaceFlowRead) {
  const entries=teamsOf(read.race);
  return read.race.final!.entries.map(item=>{
    const entry=entries.find(other=>other.id===item.finalEntryId);
    return [item.team!.number,entry?entry.legs.every(leg=>leg.here || leg.wristband===null)?'here':'some':item.absent?'absent':'unmarked'];
  });
}
const mark=(token:string,read:RaceFlowRead,number:number,value:'here'|'absent'|null)=>
  call(token,`/api/races/${read.race.id}/teams/${read.race.final!.entries.find(item=>item.team?.number===number)!.team!.id}/absent`,{mark:value});

test('only a lead makes a relay final: it seeds the fastest 6 teams, fastest first, none marked',async()=>{
  const {sam,lead}=await start();
  const refused=await makeFinal(sam);
  expect(refused.statusCode).toBe(403);
  expect(refused.json().message).toBe('Ask a lead to make the final');
  const made=await makeFinal(lead);
  expect(made.statusCode).toBe(200);
  const final=made.json() as RaceFlowRead;
  expect(final.race.kind).toBe('final');
  expect(final.race.final!.entries.map(item=>[item.seed,item.team!.number])).toEqual([[1,2],[2,5],[3,1],[4,6],[5,3],[6,7]]);
  expect(marks(final).map(([,state])=>state)).toEqual(Array(6).fill('unmarked'));
  // As on a children's final, nobody runs it until marked Here: the finish line has no team to place yet.
  expect(teamsOf(final.race)).toEqual([]);
  // Each seeded team's card shows its four children, even once Absent takes it out of the race.
  expect(final.race.final!.entries[0].legs!.map(leg=>leg.wristband)).toEqual(legs(2));
  expect(final.steps.times).toBeUndefined();
});

test('Here / Absent per seeded team lands from two phones at once with no version check; a lit mark tapped again unmarks it; no per-child Here',async()=>{
  const {sam,priya,lead}=await start();
  const final=(await makeFinal(lead)).json() as RaceFlowRead;
  // Both phones tap on the final as they first saw it.
  const answers=await Promise.all([mark(sam,final,2,'here'),mark(priya,final,5,'absent'),mark(priya,final,1,'here')]);
  expect(answers.map(answer=>answer.statusCode)).toEqual([200,200,200]);
  let read=await ok(sam,`/api/races/${final.race.id}`);
  expect(marks(read)).toEqual([[2,'here'],[5,'absent'],[1,'here'],[6,'unmarked'],[3,'unmarked'],[7,'unmarked']]);
  // Tapped again: Absent unmarked brings the team back with its children as they were; Here unmarked clears every child.
  expect((await mark(sam,read,5,null)).statusCode).toBe(200);
  expect((await mark(sam,read,2,null)).statusCode).toBe(200);
  read=await ok(sam,`/api/races/${final.race.id}`);
  expect(marks(read).slice(0,2)).toEqual([[2,'unmarked'],[5,'unmarked']]);
  expect(read.race.final!.entries.find(item=>item.team?.number===5)!.legs!.map(leg=>leg.wristband)).toEqual(legs(5));
  // Absent straight from Here.
  await mark(sam,read,1,'absent');
  expect(marks(await ok(sam,`/api/races/${final.race.id}`))[2]).toEqual([1,'absent']);
  const child=await call(sam,`/api/races/${final.race.id}/teams/${read.race.final!.entries[0].team!.id}/here`,{leg:0,here:true});
  expect(child.statusCode).toBe(409);
  expect(child.json().message).toBe("Mark the final's teams Here or Absent");
  const bad=await call(sam,`/api/races/${final.race.id}/teams/${read.race.final!.entries[0].team!.id}/absent`,{mark:'maybe'});
  expect(bad.statusCode).toBe(400);
});

test('Here / Absent is only for a final\'s seeded teams, call-ups and a lead\'s additions',async()=>{
  const {sam,lead}=await start();
  const final=(await makeFinal(lead)).json() as RaceFlowRead,team4=final.teams!.find(team=>team.number===4)!;
  const outside=await call(sam,`/api/races/${final.race.id}/teams/${team4.id}/absent`,{mark:'here'});
  expect(outside.statusCode).toBe(409);
  expect(outside.json().message).toBe('Team 4 is not in the final');
  const heat=(await ok<RacesRead>(sam,'/api/races')).groups.find(group=>group.event.code==='R22')!.races.find(race=>race.kind==='heat')!;
  const onHeat=await call(sam,`/api/races/${heat.id}/teams/${team4.id}/absent`,{mark:'here'});
  expect(onHeat.statusCode).toBe(409);
});

test('a lead\'s call-up for an absent team and a lead\'s added team join the final not marked, and take Here / Absent like any finalist',async()=>{
  const {sam,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  await mark(sam,read,7,'absent');
  const {finalResults}=(await ok<EventResultsRead>(lead,'/api/lead/events/R22/results')).results;
  expect((await call(lead,'/api/lead/events/R22/call-up',{expectedHeatEntryId:finalResults!.nextCallUp!.entryId})).statusCode).toBe(200);
  read=await ok(sam,`/api/races/${read.race.id}`);
  const called=read.race.final!.entries.find(item=>item.calledUp)!;
  expect(called).toMatchObject({team:{number:4},seed:6,absent:false});
  expect(marks(read).at(-1)).toEqual([4,'unmarked']);
  await mark(sam,read,4,'here');
  expect(marks(await ok(sam,`/api/races/${read.race.id}`)).at(-1)).toEqual([4,'here']);
  // A lead adds Team 8, which ran in no heat.
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:read.teams!.find(team=>team.number===8)!.id})).statusCode).toBe(200);
  read=await ok(sam,`/api/races/${read.race.id}`);
  expect(read.race.final!.entries.at(-1)).toMatchObject({team:{number:8},seed:null,calledUp:false});
  expect(marks(read).at(-1)).toEqual([8,'unmarked']);
  await mark(sam,read,8,'absent');
  expect(marks(await ok(sam,`/api/races/${read.race.id}`)).at(-1)).toEqual([8,'absent']);
});

test('the finish line places only teams marked Here: an unmarked or Absent team is not in the race, so an order naming one keeps only those Here',async()=>{
  const {sam,priya,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  await mark(sam,read,2,'here');await mark(sam,read,5,'absent');
  read=await ok(priya,`/api/races/${read.race.id}`);
  expect(teamsOf(read.race).map(entry=>entry.team.number)).toEqual([2]);
  const id=read.race.id,unmarked=read.race.final!.entries.find(item=>item.team?.number===1)!.finalEntryId,absent=read.race.final!.entries.find(item=>item.team?.number===5)!.finalEntryId;
  // As on a children's final, an order naming a team not Here keeps only those in the race.
  const placed=await ok(priya,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:[teamsOf(read.race)[0].id,unmarked,absent],didNotFinish:[],didNotRun:[],added:[]});
  expect(placed.race.parts.finish.value!.order).toEqual([teamsOf(read.race)[0].id]);
});

test('the final saves itself once Runners and Finishing order are done, with no Times, and a lead\'s card reads Final saved · confirm the medals',async()=>{
  const {sam,priya,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  for(const number of [2,5,1,6,3]) await mark(sam,read,number,'here');
  await mark(sam,read,7,'absent');
  read=await ok(sam,`/api/races/${read.race.id}/steps/runners/done`,{});
  const id=read.race.id,entries=teamsOf(read.race);
  expect(entries.map(entry=>entry.team.number)).toEqual([2,5,1,6,3]);
  // A final's teams are its seeds, call-ups and a lead's additions: no team is added at the finish.
  const added=await call(priya,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[],addedTeams:[read.teams!.find(team=>team.number===4)!.id]});
  expect(added.statusCode).toBe(409);
  read=await ok(priya,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order:entries.map(entry=>entry.id).reverse(),didNotFinish:[],didNotRun:[],added:[]});
  expect(read.race.state).toBe('in progress');
  read=await ok(priya,`/api/races/${id}/steps/positions/done`,{});
  expect(read.race.state).toBe('saved');
  const group=(await ok<RacesRead>(lead,'/api/races')).groups.find(item=>item.event.code==='R22')!;
  const issues=(await ok<ResultsRead>(lead,'/api/lead/results')).needsYou;
  expect(issues.filter(item=>item.event.code==='R22')).toEqual([]);
  expect(leadLine(group,issues)).toBe('Final saved · confirm the medals');
});
