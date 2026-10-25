import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { EventResultsRead } from '../src/shared/lead-results.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-rulings-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-rulings-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,lead=(await people.lead('Jo Evans')).token;
  const relays=relaySetup(app);
  /** Types one Girl Cubs team per entry of `teams` on R22's team list: Team 1 is 2101-2104, Team 2 is 2201-2204, ... */
  async function teams(count:number) {for(let number=1;number<=count;number++) await relays.team(sam,'R22',[1,2,3,4].map(leg=>2000+number*100+leg));}
  /** Ticks the teams in with all four children marked here, then saves the heat with them placed in the order given and timed by place. */
  async function heat(placed:number[],times:number[]) {
    for(const number of placed) {await relays.tick(sam,'R22',number);for(const leg of [0,1,2,3]) await relays.here(sam,'R22',number,leg);}
    await relays.save(sam,'R22',placed,times);
  }
  const read=async()=>(await call(lead,'/api/lead/events/R22/results')).json() as EventResultsRead;
  /** Team `number`'s row on the leaderboard, which names its race and entry. */
  const row=async(number:number)=>(await read()).results.leaderboard.find(row=>row.team?.number===number)!;
  const leadRace=async(id:string)=>(await call(lead,`/api/lead/races/${id}`)).json().race;
  return {sam,lead,relays,teams,heat,read,row,leadRace};
}
const ranking=(results:EventResultsRead['results'])=>results.leaderboard.map(row=>[row.team?.number,row.position,row.status]);

test('a lead disqualifies a whole team and lifts it: the team leaves the ranking and comes back',async()=>{
  const {lead,teams,heat,row}=await start();
  await teams(3);
  await heat([1,2,3],[1400,1500,1600]);
  const team1=await row(1),path=`/api/lead/races/${team1.raceId}/runners/${team1.entryId}`;
  // A handover outside the zone goes under Other, with a comment.
  const disqualified=await call(lead,`${path}/disqualify`,{reason:'Other',comment:'Handover outside the zone'});
  expect(disqualified.statusCode).toBe(200);
  const read=disqualified.json() as EventResultsRead;
  expect(ranking(read.results)).toEqual([[2,1,'Finished'],[3,2,'Finished'],[1,null,'Disqualified']]);
  expect(read.auditNotes[0]).toMatchObject({action:'disqualify',message:'Jo Evans disqualified Team 1 (Heat 1): Other - Handover outside the zone',touches:[{raceId:team1.raceId,entryId:team1.entryId}]});
  const again=await call(lead,`${path}/disqualify`,{reason:'Baton'});
  expect([again.statusCode,again.json().message]).toEqual([409,'This team is already disqualified']);
  const lifted=await call(lead,`${path}/lift-disqualification`,{comment:'Judge saw the baton inside the zone'});
  expect(ranking((lifted.json() as EventResultsRead).results)).toEqual([[1,1,'Finished'],[2,2,'Finished'],[3,3,'Finished']]);
  expect((lifted.json() as EventResultsRead).auditNotes[0].message).toBe('Jo Evans lifted the disqualification of Team 1 (Heat 1): Judge saw the baton inside the zone');
  const liftAgain=await call(lead,`${path}/lift-disqualification`,{comment:'Again'});
  expect([liftAgain.statusCode,liftAgain.json().message]).toEqual([409,'This team is not disqualified']);
});

/** Eight teams over two heats: Team 4 and Team 7 share 6th place at 17.00, so one of them misses the final. */
async function tiedAtSixth() {
  const started=await start();
  await started.teams(8);
  await started.heat([1,2,3,4],[1400,1500,1600,1700]);
  await started.heat([5,6,7,8],[1450,1550,1700,1800]);
  return {...started,tie:(await started.read()).results.ties[0]};
}
const settle=(lead:string,body:object)=>call(lead,'/api/lead/events/R22/settle-tie',body);

test('an open tie between teams blocks Heats complete until the lead settles it: No run-off needed',async()=>{
  const {lead,tie,row}=await tiedAtSixth();
  const blocked=await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'});
  expect(blocked.statusCode).toBe(409);
  const settled=await settle(lead,{tieId:tie.id,outcome:'no-run-off',comment:''});
  expect(settled.statusCode).toBe(200);
  const read=settled.json() as EventResultsRead;
  expect(read.results.ties).toEqual([]);
  expect(read.auditNotes[0].message).toBe('Jo Evans settled the tie at 17.00 (Team 4, Team 7): No run-off needed');
  expect((await row(4)).flags.map(flag=>flag.kind)).toEqual(['tie-settled']);
  expect((await call(lead,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
});

test('a run-off or a decision puts the tied teams in the order the lead gives, and the first takes the last final place',async()=>{
  for(const [outcome,comment,message] of [['run-off','','Jo Evans recorded a run-off at 17.00: Team 7 then Team 4'],['decided','Judges agreed','Jo Evans decided the tie at 17.00 without a run-off: Team 7 then Team 4 - Judges agreed']]) {
    const {lead,tie,row}=await tiedAtSixth();
    const team4=await row(4),team7=await row(7);
    const settled=await settle(lead,{tieId:tie.id,outcome,comment,order:[team7,team4].map(({raceId,entryId})=>({raceId,entryId}))});
    expect(settled.statusCode).toBe(200);
    const read=settled.json() as EventResultsRead;
    expect(read.auditNotes[0].message).toBe(message);
    expect(read.results.qualifiers.map(row=>row.team?.number)).toEqual([1,5,2,6,3,7]);
    await app.close();
  }
});

test('Correct times on a relay heat retimes its teams by place, refusing more places than teams',async()=>{
  const {lead,teams,heat,read,row,leadRace}=await start();
  await teams(2);
  await heat([1,2],[1400,1500]);
  const race={id:(await row(1)).raceId},baseVersion=(await leadRace(race.id)).parts.times.version;
  const tooMany=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion,places:[1400,1500,1600]});
  expect([tooMany.statusCode,tooMany.json().message]).toEqual([409,'This race has 2 teams - enter no more places than that']);
  const corrected=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion,places:[1450,1550],comment:'Read again from the recording'});
  expect(corrected.statusCode).toBe(200);
  expect((await read()).results.leaderboard.map(row=>[row.team?.number,row.time])).toEqual([[1,1450],[2,1550]]);
  const stale=await call(lead,`/api/lead/races/${race.id}/times`,{baseVersion,places:[1400,1500]});
  expect([stale.statusCode,stale.json().message]).toEqual([409,'These times have changed - open the race again']);
});

test('Correct finishing order on a relay heat moves teams by number while times stay by place; Didn\'t run makes a team still to run again',async()=>{
  const {sam,lead,relays,teams,heat,read,row,leadRace}=await start();
  await teams(3);
  await heat([1,2,3],[1400,1500,1600]);
  const raceId=(await row(1)).raceId,versions=async()=>{const race=await leadRace(raceId);return {baseVersion:race.parts.finish.version,runnersVersion:race.parts.runners.version};};
  const moved=await call(lead,`/api/lead/races/${raceId}/finish-order`,{...await versions(),order:[2,1,3],didNotFinish:[],didNotRun:[],comment:'Photo checked'});
  expect(moved.statusCode).toBe(200);
  expect((await read()).results.leaderboard.map(row=>[row.team?.number,row.time])).toEqual([[2,1400],[1,1500],[3,1600]]);
  expect((await read()).auditNotes[0].message).toBe('Jo Evans corrected the finishing order for Heat 1: Team 2, Team 1, Team 3 - Photo checked');
  // A child's wristband is not a team in this race.
  expect((await call(lead,`/api/lead/races/${raceId}/finish-order`,{...await versions(),order:[2101,2201,2301],didNotFinish:[],didNotRun:[]})).statusCode).toBe(400);
  const stillToRun=async()=>(await relays.screen(sam,'R22')).teams!.filter(team=>!team.races.length).map(team=>team.number);
  expect(await stillToRun()).toEqual([]);
  const tookOff=await call(lead,`/api/lead/races/${raceId}/finish-order`,{...await versions(),order:[2],didNotFinish:[1],didNotRun:[3]});
  expect(tookOff.statusCode).toBe(200);
  expect((await read()).auditNotes[0].message).toBe('Jo Evans corrected the finishing order for Heat 1: Team 2; Did not finish Team 1; Didn\'t run Team 3');
  expect((await leadRace(raceId)).parts.runners.value.map((entry:any)=>entry.team.number)).toEqual([1,2]);
  expect(await stillToRun()).toEqual([3]);
});

test('a team\'s notes carry its children\'s warnings, a child also in another relay\'s team and running short, each checked by the lead with the note',async()=>{
  const {sam,lead,relays,row}=await start();
  await relays.team(sam,'R22',[1045,2102,2103,2134]);
  await relays.team(sam,'R28',[4101,2134,4103,4104]);
  await relays.tick(sam,'R22',1);for(const leg of [0,1,2]) await relays.here(sam,'R22',1,leg);
  await relays.save(sam,'R22',[1],[1400]);
  const team=await row(1);
  expect(team.flags.map(flag=>[flag.warningKind,flag.message,flag.checked])).toEqual([
    ['wrong-section','1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',false],
    ['other-relay','2134 is in Girl Cubs Team 1 and Girl Scouts Team 1.',false],
    ['ran-short','Team 1 ran with 3 of 4 children marked here.',false]
  ]);
  expect([team.notes,team.hasNote]).toEqual([[],false]);
  const checked=(await call(lead,`/api/lead/races/${team.raceId}/runners/${team.entryId}/mark-warning-checked`,{comment:'Leg 4 ran, judge saw'})).json() as EventResultsRead;
  const after=checked.results.leaderboard.find(row=>row.team?.number===1)!,by={name:'Jo Evans',at:checked.auditNotes[0].at,note:'Leg 4 ran, judge saw'};
  expect(after.flags.map(flag=>flag.checkedBy)).toEqual([by,by,by]);
  expect(after.notes.map(note=>[note.action,note.actor,note.comment])).toEqual([['mark-warning-checked','Jo Evans','Leg 4 ran, judge saw']]);
});
