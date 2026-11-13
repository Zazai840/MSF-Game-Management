import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
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
/** Runs a relay heat to saved in the race flow: the teams added in, every child checked in, placed in the order given and timed. */
async function runHeat(token:string,number:number,placed:number[],times:number[]) {
  let read=await ok(token,'/api/races',{eventCode:'R22',kind:'heat',number});
  const id=read.race.id,teamId=(team:number)=>read.teams!.find(item=>item.number===team)!.id;
  for(const team of placed) read=await ok(token,`/api/races/${id}/teams/${teamId(team)}/tick`,{});
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
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Shah')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relayFlowSetup(app);
  for(let number=1;number<=8;number++) await relays.team(sam,'R22',legs(number));
  await runHeat(sam,1,[2,1,3,4],[3400,3500,3700,3900]);
  await runHeat(sam,2,[5,6,7],[3450,3600,3800]);
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
  // Each seeded team is in the final all the same; Team 4 is not.
  const inFinal=(read:RaceFlowRead)=>read.teams!.filter(team=>team.races.some(race=>race.kind==='final')).map(team=>team.number).sort();
  expect(inFinal(final)).toEqual([1,2,3,5,6,7]);
  expect(final.teams!.find(team=>team.number===2)!.races.map(race=>race.kind)).toEqual(['heat','final']);
  // Marked Here it is listed once; marked Absent it is out of the final.
  await mark(sam,final,2,'here');
  expect((await ok(sam,`/api/races/${final.race.id}`)).teams!.find(team=>team.number===2)!.races.map(race=>race.kind)).toEqual(['heat','final']);
  await mark(sam,final,5,'absent');
  expect(inFinal(await ok(sam,`/api/races/${final.race.id}`))).toEqual([1,2,3,6,7]);
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
  // There is no per-child Here, at a final or a heat.
  expect(child.statusCode).toBe(404);
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

test('a call-up for an absent team joins the final Here at once, from anyone; a lead\'s added team joins not marked and takes Here / Absent like any finalist',async()=>{
  const {sam,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  expect(read.callUp).toBeUndefined();
  await mark(sam,read,7,'absent');
  const {finalResults}=(await ok<EventResultsRead>(lead,'/api/lead/events/R22/results')).results;
  read=await ok(sam,`/api/races/${read.race.id}`);
  // The race read offers the next-ranked team to every phone.
  expect(read.callUp).toEqual({entryId:finalResults!.nextCallUp!.entryId,who:'Team 4',position:7});
  expect((await call(sam,'/api/lead/events/R22/call-up',{expectedHeatEntryId:read.callUp!.entryId})).statusCode).toBe(200);
  read=await ok(sam,`/api/races/${read.race.id}`);
  expect(read.callUp).toBeUndefined();
  const called=read.race.final!.entries.find(item=>item.calledUp)!;
  expect(called).toMatchObject({team:{number:4},seed:6,absent:false});
  expect(marks(read).at(-1)).toEqual([4,'here']);
  expect(teamsOf(read.race).at(-1)!.legs.every(leg=>leg.here)).toBe(true);
  // A lead adds Team 8, which ran in no heat.
  expect((await call(lead,'/api/lead/events/R22/add-team',{teamId:read.teams!.find(team=>team.number===8)!.id})).statusCode).toBe(200);
  read=await ok(sam,`/api/races/${read.race.id}`);
  expect(read.race.final!.entries.at(-1)).toMatchObject({team:{number:8},seed:null,calledUp:false});
  expect(marks(read).at(-1)).toEqual([8,'unmarked']);
  await mark(sam,read,8,'absent');
  expect(marks(await ok(sam,`/api/races/${read.race.id}`)).at(-1)).toEqual([8,'absent']);
});

test('a finalist\'s child changed by its leg chip: one leg, against the team\'s version, its kept copy changed whether Here or not, the marks unchanged',async()=>{
  const {sam,priya,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  const raceId=read.race.id,team=(number:number)=>read.teams!.find(item=>item.number===number)!;
  const url=(number:number)=>`/api/relays/${read.group.event.id}/teams/${team(number).id}`;
  const inRace=(number:number)=>teamsOf(read.race).find(entry=>entry.team.number===number)?.legs.map(leg=>[leg.wristband,leg.here]);
  // Team 2 marked Here: a chip Save sends its legs with the 2nd changed, the others kept as they are; every child is still here.
  await mark(sam,read,2,'here');
  const two=team(2);
  read=await ok(priya,url(2),{version:two.version,legs:[2201,2199,2203,2204],keptWarnings:[2201,2203,2204],raceId,reason:{reason:'Hurt',text:null}});
  expect(inRace(2)).toEqual([[2201,true],[2199,true],[2203,true],[2204,true]]);
  // A chip tapped before Priya's Save is refused as changed.
  expect((await call(sam,url(2),{version:two.version,legs:[2201,2202,2203,2198],keptWarnings:[2201,2202,2203],raceId})).json()).toMatchObject({reason:'changed',by:'Priya Shah'});
  // Team 5 not marked: its kept copy takes the change, and keeps it once marked Here.
  read=await ok(sam,url(5),{version:team(5).version,legs:[2501,2502,2503,2198],keptWarnings:[2501,2502,2503],raceId,reason:{reason:'Hurt',text:null}});
  expect(read.race.final!.entries.find(item=>item.team?.number===5)!.legs!.map(leg=>leg.wristband)).toEqual([2501,2502,2503,2198]);
  expect(inRace(5)).toBeUndefined();
  await mark(sam,read,5,'here');
  read=await ok(sam,`/api/races/${raceId}`);
  expect(inRace(5)).toEqual([[2501,true],[2502,true],[2503,true],[2198,true]]);
  expect(marks(read)).toEqual([[2,'here'],[5,'here'],[1,'unmarked'],[6,'unmarked'],[3,'unmarked'],[7,'unmarked']]);
});

test('a leg replaced at a relay final needs a reason, Other with text, and is kept as an audit note on the team; a reorder needs none; refused once the final is saved',async()=>{
  const {sam,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  const raceId=read.race.id,team=(number:number)=>read.teams!.find(item=>item.number===number)!;
  const url=(number:number)=>`/api/relays/${read.group.event.id}/teams/${team(number).id}`;
  const change=(token:string,number:number,wristbands:number[],reason?:unknown)=>call(token,url(number),{version:team(number).version,legs:wristbands,keptWarnings:wristbands,raceId,...(reason===undefined?{}:{reason})});
  await mark(sam,read,2,'here');
  // Team 2's 3rd leg, 2203, is replaced by 2198: refused with no reason, a reason not in the list, or Other with no text.
  for(const reason of [undefined,{reason:'Tired',text:null},{reason:'Other',text:'  '}]) expect((await change(sam,2,[2201,2202,2198,2204],reason)).statusCode).toBe(400);
  expect((await change(sam,2,[2201,2202,2198,2204])).json().message).toBe('Choose why the change');
  expect((await change(sam,2,[2201,2202,2198,2204],{reason:'Other',text:''})).json().message).toBe('Write why for Other');
  read=await ok(sam,`/api/races/${raceId}`);
  expect(team(2).legs.map(leg=>leg.wristband)).toEqual(legs(2));
  // With a reason it saves, the team still Here, and the note says who, what and why.
  read=await ok(sam,url(2),{version:team(2).version,legs:[2201,2202,2198,2204],keptWarnings:[2201,2202,2198,2204],raceId,reason:{reason:'Did not want to run',text:null}});
  expect(teamsOf(read.race).find(entry=>entry.team.number===2)!.legs.map(leg=>[leg.wristband,leg.here])).toEqual([[2201,true],[2202,true],[2198,true],[2204,true]]);
  // Other with text, on a team not marked yet.
  read=await ok(sam,url(5),{version:team(5).version,legs:[2501,2502,2503,2197],keptWarnings:[2501,2502,2503,2197],raceId,reason:{reason:'Other',text:'Went home  early'}});
  // A reorder of the same children is no replace: no reason.
  read=await ok(sam,url(2),{version:team(2).version,legs:[2202,2201,2198,2204],keptWarnings:[2202,2201,2198,2204],raceId});
  const lines=['Sam Patel changed Team 2\'s 3rd leg from 2203 to 2198 (Final) - Did not want to run','Sam Patel changed Team 5\'s 4th leg from 2504 to 2197 (Final) - Other - Went home early'];
  // The event's Notes tab.
  expect((await ok<EventResultsRead>(lead,'/api/lead/events/R22/results')).auditNotes.map(note=>note.message).slice(0,2).reverse()).toEqual(lines);
  // The final run and saved: each team's Notes in the Final.
  for(const number of [5,1,6,3,7]) await mark(sam,read,number,'here');
  read=await ok(sam,`/api/races/${raceId}/steps/runners/done`,{});
  read=await ok(sam,`/api/races/${raceId}/order`,{raceId,version:read.race.parts.finish.version,order:teamsOf(read.race).map(entry=>entry.id),didNotFinish:[],didNotRun:[],added:[]});
  read=await ok(sam,`/api/races/${raceId}/steps/positions/done`,{});
  expect(read.race.state).toBe('saved');
  const leaderboard=(await ok<EventResultsRead>(lead,'/api/lead/events/R22/results')).results.finalResults!.leaderboard;
  for(const [number,line] of [[2,lines[0]],[5,lines[1]]] as const) expect(leaderboard.find(item=>item.team?.number===number)!.notes.map(note=>note.message)).toEqual([line]);
  // The Day export: the Note column on the team's rows in the Final, and the Audit notes sheet.
  const sheets=await readExcelFile((await call(lead,'/api/day/export',{})).rawPayload);
  const all=sheets.find(sheet=>sheet.sheet==='All results')!.data,[raceColumn,teamColumn,note]=['Race','Team','Note'].map(name=>all[0].indexOf(name));
  const finalRows=(number:number)=>all.filter(row=>row[raceColumn]==='Final 1' &&row[teamColumn]===`Team ${number}`);
  expect(finalRows(2).length).toBeGreaterThan(0);
  expect(finalRows(2).every(row=>String(row[note]).includes(lines[0]))).toBe(true);
  expect(sheets.find(sheet=>sheet.sheet==='Audit notes')!.data.flat().filter(cell=>typeof cell==='string' && lines.some(line=>cell.includes(line)))).toHaveLength(2);
  // Once the final is saved, no leg changes.
  expect((await change(sam,1,[2101,2102,2103,2195],{reason:'Hurt',text:null})).json().message).toBe('Final is saved - ask a lead to change it');
});

test('"+ Team" at a relay final: a team of the relay joins Here with a reason while a place is free, kept as an audit note; refused without a reason, for a team already in, with no place free, or once the final is saved',async()=>{
  const {sam,lead}=await start();
  let read=(await makeFinal(lead)).json() as RaceFlowRead;
  const raceId=read.race.id,team=(number:number)=>read.teams!.find(item=>item.number===number)!;
  const add=(number:number,reason?:unknown)=>call(sam,`/api/races/${raceId}/teams/${team(number).id}/add`,reason===undefined?{}:{reason});
  const notFound={reason:'Not found',text:null};
  // No finalist Absent: no place is free.
  const refused=async(response:ReturnType<typeof add>)=>[(await response).statusCode,(await response).json().message];
  expect(await refused(add(8,notFound))).toEqual([409,'There is no free place in the Final']);
  await mark(sam,read,7,'absent');
  for(const number of [2,5,1,6,3]) await mark(sam,read,number,'here');
  // A place is free: still refused without a reason, with Wrong number (a replace's reason), or for a team already in, Absent or not.
  for(const reason of [undefined,{reason:'Wrong number',text:null},{reason:'Other',text:''}]) expect((await add(8,reason)).statusCode).toBe(400);
  expect((await add(8)).json().message).toBe('Choose why the change');
  expect(await refused(add(2,notFound))).toEqual([409,'Team 2 is already in the Final']);
  expect((await add(7,notFound)).json().message).toBe('Team 7 is already in the Final');
  // Team 8, which ran in no heat, joins Here at once with its four children, as Added.
  read=await ok(sam,`/api/races/${raceId}/teams/${team(8).id}/add`,{reason:notFound});
  expect(read.race.final!.entries.at(-1)).toMatchObject({team:{number:8},seed:null,calledUp:false,absent:false});
  expect(marks(read).at(-1)).toEqual([8,'here']);
  expect(teamsOf(read.race).at(-1)!.legs.map(leg=>[leg.wristband,leg.here])).toEqual(legs(8).map(wristband=>[wristband,true]));
  // Six Here: no place is free. Team 8 marked Absent frees it again.
  expect((await add(4,notFound)).json().message).toBe('There is no free place in the Final');
  await mark(sam,read,8,'absent');
  read=await ok(sam,`/api/races/${raceId}/teams/${team(4).id}/add`,{reason:{reason:'Other',text:'Zone lead  sent them'}});
  expect(marks(read).slice(-2)).toEqual([[8,'absent'],[4,'here']]);
  const lines=['Sam Patel added Team 8 to the Final - Not found','Sam Patel added Team 4 to the Final - Other - Zone lead sent them'];
  expect((await ok<EventResultsRead>(lead,'/api/lead/events/R22/results')).auditNotes.map(note=>note.message).slice(0,2).reverse()).toEqual(lines);
  // The final run and saved: Team 4's Notes, the export's Note column and its Audit notes sheet.
  read=await ok(sam,`/api/races/${raceId}/steps/runners/done`,{});
  read=await ok(sam,`/api/races/${raceId}/order`,{raceId,version:read.race.parts.finish.version,order:teamsOf(read.race).map(entry=>entry.id),didNotFinish:[],didNotRun:[],added:[]});
  read=await ok(sam,`/api/races/${raceId}/steps/positions/done`,{});
  expect(read.race.state).toBe('saved');
  const leaderboard=(await ok<EventResultsRead>(lead,'/api/lead/events/R22/results')).results.finalResults!.leaderboard;
  expect(leaderboard.find(item=>item.team?.number===4)!.notes.map(note=>note.message)).toEqual([lines[1]]);
  const sheets=await readExcelFile((await call(lead,'/api/day/export',{})).rawPayload);
  const all=sheets.find(sheet=>sheet.sheet==='All results')!.data,[raceColumn,teamColumn,note]=['Race','Team','Note'].map(name=>all[0].indexOf(name));
  const rows=all.filter(row=>row[raceColumn]==='Final 1' && row[teamColumn]==='Team 4');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row=>String(row[note]).includes(lines[1]))).toBe(true);
  expect(sheets.find(sheet=>sheet.sheet==='Audit notes')!.data.flat().filter(cell=>typeof cell==='string' && lines.some(line=>cell.includes(line)))).toHaveLength(2);
  // Once the final is saved, no team is added; nor on a heat.
  expect((await add(8,notFound)).json().message).toBe('Final is saved - ask a lead to change it');
  const heat=read.group.races.find(race=>race.kind==='heat')!;
  expect((await call(sam,`/api/races/${heat.id}/teams/${team(8).id}/add`,{reason:notFound})).statusCode).toBe(409);
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
