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
  /** Ticks the teams in, then saves the heat with them placed in the order given and timed by place. */
  async function heat(placed:number[],times:number[]) {for(const number of placed) await relays.tick(sam,'R22',number);return (await relays.save(sam,'R22',placed,times)).race;}
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
