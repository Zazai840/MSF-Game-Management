import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceFlowRead,RacesRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
/**
 * A relay's teams sheet: the races list carries each relay's teams, and each team is typed and saved whole on its own
 * (POST /api/relays/:eventId/teams), checked against the version the phone last saw, with nothing to hold.
 */
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function ok<T=RacesRead>(token:string,url:string,body?:unknown) {
  const response=await call(token,url,body);
  if(response.statusCode!==200) throw new Error(`${url} answered ${response.statusCode}: ${response.body}`);
  return response.json() as T;
}
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'teams-sheet-owner',resetTestDay:true});
  const people=await signInOwner(app,'teams-sheet-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=(await people.volunteer('Sam Patel')).token,priya=(await people.volunteer('Priya Shah')).token;
  const groups=(await ok(sam,'/api/races')).groups,id=(code:string)=>groups.find(group=>group.event.code===code)!.event.id;
  return {owner:people.owner.token as string,sam,priya,id};
}
const group=(read:RacesRead,code:string)=>read.groups.find(item=>item.event.code===code)!;
const numbers=(read:RacesRead,code:string)=>group(read,code).teams!.map(team=>team.number);

test('the races list carries each relay\'s teams; a new team takes the next number, and a removed team\'s number is never used again',async()=>{
  const {sam,id}=await start();
  const empty=await ok(sam,'/api/races');
  expect(group(empty,'R22')).toMatchObject({teams:[],nextTeam:1});
  expect(group(empty,'R4').teams).toBeUndefined();
  const first=await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2101,2134,null,2150],keptWarnings:[]});
  expect(first.revision).toBeGreaterThan(empty.revision);
  expect(group(first,'R22')).toMatchObject({nextTeam:2,teams:[{number:1,version:1,changedBy:'Sam Patel',changing:null,races:[],
    legs:[{wristband:2101,warnings:[]},{wristband:2134,warnings:[]},{wristband:null,warnings:[]},{wristband:2150,warnings:[]}]}]});
  await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2201,null,null,null],keptWarnings:[]});
  const three=await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2301,null,null,null],keptWarnings:[]});
  const team3=group(three,'R22').teams![2];
  const removed=await ok(sam,`/api/relays/${id('R22')}/teams/${team3.id}/remove`,{version:team3.version});
  expect(numbers(removed,'R22')).toEqual([1,2]);
  expect(group(removed,'R22').nextTeam).toBe(4);
  // Its wristband is free again, and the next team takes the next unused number.
  expect(numbers(await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2301,null,null,null],keptWarnings:[]}),'R22')).toEqual([1,2,4]);
  // Other relays' lists are their own.
  expect(group(removed,'R21').teams).toEqual([]);
  for(const [url,body,message] of [
    [`/api/relays/${id('R22')}/teams`,{legs:[null,null,null,null]},'Enter at least one wristband number'],
    [`/api/relays/${id('R22')}/teams`,{legs:[2101,2102]},'Enter the four wristband boxes'],
    [`/api/relays/${id('R4')}/teams`,{legs:[1101,null,null,null]},'Only a relay has teams'],
    [`/api/relays/nope/teams`,{legs:[1101,null,null,null]},'Event not found'],
    [`/api/relays/${id('R22')}/teams/nope`,{version:1,legs:[2401,null,null,null]},'Team not found'],
    [`/api/relays/${id('R22')}/teams/${team3.id}`,{legs:[2401,null,null,null]},'Open the team again']
  ] as const) expect((await call(sam,url,body)).json(),url).toEqual({message});
});
test('a number already in the relay is refused; a wrong-Section, unknown or other-relay number needs Keep, and is stored kept',async()=>{
  const {sam,id}=await start();
  await ok(sam,`/api/relays/${id('R28')}/teams`,{legs:[4001,4002,4003,2134],keptWarnings:[2134]});
  await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2101,2102,null,null],keptWarnings:[]});
  const refused=async(body:object)=>(await call(sam,`/api/relays/${id('R22')}/teams`,body)).json();
  expect(await refused({legs:[2301,2102,null,null],keptWarnings:[]})).toEqual({message:'2102 is already in Team 1. Check the wristband.'});
  expect(await refused({legs:[2301,2301,null,null],keptWarnings:[]})).toEqual({message:'2301 is already in this team. Check the wristband.'});
  expect(await refused({legs:[6100,null,null,null],keptWarnings:[]})).toEqual({message:'6100 needs Fix number or Keep'});
  const kept=group(await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[6100,1045,2134,2150],keptWarnings:[6100,1045,2134]}),'R22').teams![1];
  expect(kept.legs).toEqual([
    {wristband:6100,warnings:[{kind:'unknown-number',message:'6100 is not a wristband number. Wristbands are 1 to 4999.',kept:true}]},
    {wristband:1045,warnings:[{kind:'wrong-section',message:'1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',kept:true}]},
    {wristband:2134,warnings:[{kind:'other-relay',message:'2134 is also in Team 1 of 4x100m Relay Girl Scouts.',kept:true}]},
    {wristband:2150,warnings:[]}
  ]);
});
test('two phones save different teams of one relay at once, neither locked out; a Save on an older version is refused as changed',async()=>{
  const {sam,priya,id}=await start();
  const url=`/api/relays/${id('R22')}/teams`;
  await ok(sam,url,{legs:[2101,null,null,null],keptWarnings:[]});
  const both=await ok(priya,url,{legs:[2201,null,null,null],keptWarnings:[]});
  const [team1,team2]=group(both,'R22').teams!;
  // Both edit at once, each their own team: both land.
  await Promise.all([ok(sam,`${url}/${team1.id}`,{version:1,legs:[2101,2102,null,null],keptWarnings:[]}),ok(priya,`${url}/${team2.id}`,{version:1,legs:[2201,2202,null,null],keptWarnings:[]})]);
  // Priya changes Team 1 (Change anyway is the phone's own confirm); Sam's Save on the version he saw is refused.
  const changed=await ok(priya,`${url}/${team1.id}`,{version:2,legs:[2101,2102,2103,null],keptWarnings:[]});
  expect(group(changed,'R22').teams![0]).toMatchObject({version:3,changedBy:'Priya Shah'});
  const late=await call(sam,`${url}/${team1.id}`,{version:2,legs:[2101,2109,null,null],keptWarnings:[]});
  expect(late.statusCode).toBe(409);
  expect(late.json()).toEqual({message:'Priya Shah changed this a moment ago',reason:'changed',by:'Priya Shah'});
  // A Remove on an older version is refused the same way.
  expect((await call(sam,`${url}/${team1.id}/remove`,{version:2})).json()).toMatchObject({reason:'changed',by:'Priya Shah'});
  // Her own late Save on her other screen asks to check and enter it again.
  expect((await call(priya,`${url}/${team1.id}`,{version:2,legs:[2101,null,null,null],keptWarnings:[]})).json()).toMatchObject({message:'Not saved - check your entries and enter it again',reason:'changed'});
});
test('a team in an unsaved race is changed only at check-in; a team ever in a race, a deleted one too, can\'t be removed; heats complete freezes the list',async()=>{
  const {owner,sam,id}=await start();
  const url=`/api/relays/${id('R22')}/teams`;
  await ok(sam,url,{legs:[2101,null,null,null],keptWarnings:[]});
  const listed=await ok(sam,url,{legs:[2201,null,null,null],keptWarnings:[]});
  const [team1,team2]=group(listed,'R22').teams!;
  const heat=await ok<RaceFlowRead>(sam,'/api/races',{eventCode:'R22',kind:'heat',number:1});
  await ok<RaceFlowRead>(sam,`/api/races/${heat.race.id}/teams/${team1.id}/tick`,{});
  expect((await call(sam,`${url}/${team1.id}`,{version:1,legs:[2101,2102,null,null],keptWarnings:[]})).json()).toEqual({message:'Team 1 is in Heat 1 - change it at check-in'});
  expect((await call(sam,`${url}/${team1.id}/remove`,{version:1})).json()).toEqual({message:'Team 1 is in Heat 1 - change it at check-in'});
  // A race moved to Deleted races still counts (a lead can restore it): the team stays on the list.
  expect((await call(owner,`/api/lead/races/${heat.race.id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await call(sam,`${url}/${team1.id}/remove`,{version:1})).json()).toEqual({message:'Team 1 has been in a race - it can\'t be removed'});
  expect((await ok(sam,`${url}/${team1.id}`,{version:1,legs:[2101,2102,null,null],keptWarnings:[]})).groups.find(item=>item.event.code==='R22')!.teams![0].version).toBe(2);
  expect((await call(owner,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  for(const [path,body] of [['',{legs:[2301,null,null,null],keptWarnings:[]}],[`/${team2.id}`,{version:1,legs:[2201,2202,null,null],keptWarnings:[]}],[`/${team2.id}/remove`,{version:1}]] as const)
    expect((await call(sam,`${url}${path}`,body)).json()).toEqual({message:'Girl Cubs heats are finished. Ask a lead to change the teams.'});
});
test('two new teams saved at the same moment both land, with different numbers',async()=>{
  const {sam,priya,id}=await start();
  await Promise.all([ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2201,null,null,null],keptWarnings:[]}),ok(priya,`/api/relays/${id('R22')}/teams`,{legs:[2301,null,null,null],keptWarnings:[]})]);
  const teams=group(await ok(sam,'/api/races'),'R22').teams!;
  expect(teams.map(team=>team.number)).toEqual([1,2]);
  expect(teams.map(team=>team.legs[0].wristband).sort()).toEqual([2201,2301]);
});
test('Start new day clears every team list and "is changing" mark with the day',async()=>{
  const {owner,sam,id}=await start();
  const team=group(await ok(sam,`/api/relays/${id('R22')}/teams`,{legs:[2101,null,null,null],keptWarnings:[]}),'R22').teams![0];
  await ok(sam,`/api/relays/${id('R22')}/teams/${team.id}/open`,{});
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  const fresh=await ok(owner,'/api/races');
  expect(group(fresh,'R22').teams).toEqual([]);
  expect(group(fresh,'R21').teams).toEqual([]);
});
