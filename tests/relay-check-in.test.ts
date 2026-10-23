import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RaceScreenRead } from '../src/shared/race-screen.js';
import type { TeamEntry } from '../src/shared/races.js';
import { filledLegs,legWarnings } from '../src/shared/teams.js';
import { signInOwner } from './support/sign-in.js';
import { relaySetup } from './support/relays.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'relay-owner',resetTestDay:true});
  const people=await signInOwner(app,'relay-owner','Aisha');
  await call(people.owner.token,'/api/day/confirm-events',{});
  const sam=await people.volunteer('Sam Patel'),priya=await people.volunteer('Priya Shah');
  return {owner:people.owner.token as string,sam:sam.token,priya:priya.token,relays:relaySetup(app)};
}

test('the first tick on the empty next heat creates the race, copying the team\'s four children into one race entry',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2134,null,1045]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  const before=await relays.screen(priya,'R22');
  expect(before.race).toMatchObject({id:null,kind:'heat',number:1});
  expect(before.teams!.map(team=>[team.number,team.races])).toEqual([[1,[]],[2,[]]]);
  const ticked=await relays.tick(priya,'R22',1);
  expect(ticked.revision).toBeGreaterThan(before.revision);
  expect(ticked.race).toMatchObject({id:expect.any(String),kind:'heat',number:1,state:'in progress'});
  expect(ticked.race.parts.runners.value).toEqual([{id:expect.any(String),team:{id:before.teams![0].id,number:1},legs:[
    {wristband:2101,here:false,warnings:[]},{wristband:2134,here:false,warnings:[]},{wristband:null,here:false,warnings:[]},
    {wristband:1045,here:false,warnings:[{kind:'wrong-section',message:'1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',kept:true}]}]}]);
  // The team list says which race holds each team.
  expect(ticked.teams!.map(team=>[team.number,team.races])).toEqual([[1,[{id:ticked.race.id,kind:'heat',number:1,state:'in progress'}]],[2,[]]]);
  // A second tick, from another phone, joins the same race: there is no cap and no hold.
  const both=await relays.tick(sam,'R22',2);
  expect(both.race.id).toBe(ticked.race.id);
  expect(both.race.parts.runners.value!.map(entry=>'team' in entry && entry.team.number)).toEqual([1,2]);
  expect(both.holds).toEqual({});
});
test('a here mark and Cancel: the last tap on a child wins, a repeated tap changes nothing, and a team with a child here can\'t be taken off',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R21',[3101,3102,3103,null]);
  const ticked=await relays.tick(sam,'R21',1),teamId=ticked.teams![0].id;
  const here=await relays.here(priya,'R21',1,2);
  expect(here.revision).toBeGreaterThan(ticked.revision);
  const marks=(read:RaceScreenRead)=>(read.race.parts.runners.value![0] as TeamEntry).legs.map(leg=>leg.here);
  expect(marks(here)).toEqual([false,false,true,false]);
  // The same tap again, and a tick of a team already in, change nothing: the day revision stays.
  expect((await relays.here(sam,'R21',1,2)).revision).toBe(here.revision);
  expect((await relays.tick(priya,'R21',1)).revision).toBe(here.revision);
  const refused=(what:string,body:object)=>call(sam,`/api/race-screen/R21/${what}`,{raceId:here.race.id,teamId,...body}).then(response=>response.json().message);
  expect(await refused('take-off',{})).toBe('Team 1 has children marked here - unmark them first');
  // Unmarked, it comes off and is still to run again; taking it off again changes nothing.
  expect(marks(await relays.here(sam,'R21',1,2,false))).toEqual([false,false,false,false]);
  const off=await relays.takeOff(priya,'R21',1);
  expect(off.race.parts.runners.value).toEqual([]);
  expect(off.teams![0].races).toEqual([]);
  expect((await relays.takeOff(sam,'R21',1)).revision).toBe(off.revision);
  // A here mark on a team someone has since taken off is refused.
  expect(await refused('here',{leg:0,here:true})).toBe('Team 1 is no longer in Heat 1');
  await relays.tick(sam,'R21',1);
  expect(await refused('here',{leg:3,here:true})).toBe('Choose a child in this team');
  expect(await refused('here',{leg:4,here:true})).toBe('Choose a child and whether they are here');
  expect(await refused('here',{leg:0})).toBe('Choose a child and whether they are here');
  expect(await refused('tick',{teamId:undefined})).toBe('Choose a team');
  expect(await refused('tick',{raceId:3})).toBe('Choose a race');
  expect(await refused('tick',{teamId:'nope'})).toBe('Team not found');
});
test('taps from two phones at once on different children of one race all land',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  await relays.tick(sam,'R22',1);
  await Promise.all([relays.tick(priya,'R22',2),relays.here(sam,'R22',1,0),relays.here(priya,'R22',1,1),relays.here(sam,'R22',1,3)]);
  await Promise.all([relays.here(sam,'R22',2,0),relays.here(priya,'R22',2,3)]);
  const entries=(await relays.screen(sam,'R22')).race.parts.runners.value as TeamEntry[];
  expect(entries.map(entry=>[entry.team.number,entry.legs.map(leg=>leg.here)])).toEqual([[1,[true,true,false,true]],[2,[true,false,false,true]]]);
});
test('check-in taps are refused in order: signed out, stage complete, race deleted, saved or submitted, then a team that has already run',async()=>{
  const {owner,sam,priya,relays}=await start();
  await relays.team(sam,'R20',[201,202,203,204]);
  await relays.team(sam,'R20',[301,302,303,304]);
  const heat1=await relays.tick(sam,'R20',1),[team1,team2]=heat1.teams!;
  const tap=(what:string,body:object)=>call(sam,`/api/race-screen/R20/${what}`,body).then(response=>response.json().message);
  // Priya does the order and Sam the times: Sam's press leaves heat 1 submitted, waiting on Priya.
  const order=(await relays.post<RaceScreenRead>(priya,'/api/race-screen/R20/take-over',{job:'order'})).race;
  await relays.post(priya,'/api/race-screen/R20/order',{raceId:order.id,version:order.parts.finish.version,order:[order.parts.runners.value![0].id],didNotFinish:[],didNotRun:[],added:[]});
  const times=(await relays.post<RaceScreenRead>(sam,'/api/race-screen/R20/take-over',{job:'times'})).race;
  await relays.post(sam,'/api/race-screen/R20/times',{raceId:times.id,version:times.parts.times.version,places:[1234],keptWrong:[]});
  expect((await relays.post<RaceScreenRead>(sam,'/api/race-screen/R20/submit',{raceId:heat1.race.id})).race.state).toBe('submitted');
  expect(await tap('here',{raceId:heat1.race.id,teamId:team1.id,leg:0,here:true})).toBe('Heat 1 is submitted - tap Not yet to change it');
  expect(await tap('tick',{raceId:heat1.race.id,teamId:team2.id})).toBe('Heat 1 is submitted - tap Not yet to change it');
  await relays.post(priya,'/api/race-screen/R20/submit',{raceId:heat1.race.id});
  expect(await tap('tick',{raceId:heat1.race.id,teamId:team2.id})).toBe('Heat 1 is saved - ask a lead to change it');
  // Team 1 ran in heat 1: it can't be ticked into heat 2.
  const next=await relays.screen(sam,'R20');
  expect(next.race).toMatchObject({id:null,number:2});
  expect(next.teams!.map(team=>team.races.map(race=>race.state))).toEqual([['saved'],[]]);
  expect(await tap('tick',{raceId:null,teamId:team1.id})).toBe('Team 1 has already run');
  // A lead deleted the race the phone saw; its team is still to run again.
  const heat2=await relays.tick(priya,'R20',2);
  expect((await call(owner,`/api/lead/races/${heat2.race.id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect(await tap('take-off',{raceId:heat2.race.id,teamId:team2.id})).toBe('A lead deleted Heat 2');
  expect((await relays.screen(sam,'R20')).teams![1].races).toEqual([]);
  // Stage complete comes before the race's own refusals; signed out before everything.
  expect((await call(owner,'/api/lead/events/R20/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect(await tap('take-off',{raceId:heat2.race.id,teamId:team2.id})).toBe('Stage complete - ask a lead');
  expect((await call(sam,'/api/sign-out',{})).statusCode).toBe(200);
  expect(await tap('take-off',{raceId:heat2.race.id,teamId:team2.id})).toBe('You are signed out. Sign in again');
});
test('a relay never gets a check-in hold, and only a relay takes team taps',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R19',[101,102,103,104]);
  await relays.tick(sam,'R19',1);
  for(const what of ['hold','take-over']) expect((await call(sam,`/api/race-screen/R19/${what}`,{job:'check-in'})).json()).toEqual({message:'Anyone can check a relay in: tick its teams'});
  expect((await call(sam,'/api/race-screen/R19/check-in',{raceId:null,version:0,runners:[{wristband:105}]})).json()).toEqual({message:'Anyone can check a relay in: tick its teams'});
  expect((await relays.screen(sam,'R19')).holds).toEqual({});
  expect((await call(sam,'/api/race-screen/R4/tick',{raceId:null,teamId:'x'})).json()).toEqual({message:'Only a relay has teams'});
});
test('a team being changed can\'t be ticked until its change is done',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const teamId=(await relays.screen(sam,'R22')).teams![0].id;
  await relays.post(sam,'/api/teams/R22/open',{teamId});
  const seen=await relays.screen(priya,'R22');
  expect(seen.teams![0].changing).toMatchObject({name:'Sam Patel'});
  expect((await call(priya,'/api/race-screen/R22/tick',{raceId:null,teamId})).json()).toEqual({message:'Sam Patel is changing Team 1'});
  await relays.post(sam,'/api/teams/R22/cancel',{teamId});
  expect((await relays.tick(priya,'R22',1)).race.parts.runners.value).toHaveLength(1);
});
test('Remove team is refused for a team in a race, run or not, and allowed again once its race is deleted',async()=>{
  const {owner,sam,priya,relays}=await start();
  for(const wristband of [2101,2201,2301,2401]) await relays.team(sam,'R22',[wristband,null,null,null]);
  const remove=async(number:number)=>{
    const team=(await relays.screen(sam,'R22')).teams!.find(item=>item.number===number)!;
    if(!team.races.some(race=>race.state!=='saved')) await relays.post(sam,'/api/teams/R22/open',{teamId:team.id});
    return call(sam,'/api/teams/R22/remove',{teamId:team.id,version:team.version}).then(response=>response.json());
  };
  // Team 4 in the unsaved heat is changed at check-in, never removed; Team 1 ran in a saved one.
  await relays.tick(priya,'R22',1);
  await relays.save(priya,'R22',[1],[1500]);
  const heat2=await relays.tick(priya,'R22',4);
  expect(await remove(4)).toEqual({message:'Team 4 is in Heat 2 - change it at check-in'});
  expect(await remove(1)).toEqual({message:'Team 1 has been in a race - it can\'t be removed'});
  // A deleted race holds nobody: Team 4 is still to run again, so it can go.
  expect((await call(owner,`/api/lead/races/${heat2.race.id}/delete`,{permanent:false})).statusCode).toBe(200);
  expect((await remove(4)).events.find((event:{code:string})=>event.code==='R22').teams.map((team:{number:number})=>team.number)).toEqual([1,2,3]);
});
test('Done on a check-in Edit changes the race entry and the team list together, and a swapped child starts unmarked',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  const ticked=await relays.tick(priya,'R22',1),team=ticked.teams![0],entryId=ticked.race.parts.runners.value![0].id;
  await relays.here(priya,'R22',1,0);
  await relays.here(priya,'R22',1,1);
  // Opening the team at check-in marks it as Sam's on every phone, with no hold.
  await relays.post(sam,'/api/race-screen/R22/edit-open',{raceId:ticked.race.id,teamId:team.id});
  expect((await relays.screen(priya,'R22')).teams![0].changing).toMatchObject({name:'Sam Patel'});
  // Sam swaps the 1st and 2nd legs, and swaps the 3rd child for a Beaver number he keeps.
  const done=await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/edit-done',{raceId:ticked.race.id,teamId:team.id,version:team.version,legs:[2102,2101,1045,2104],keptWarnings:[1045]});
  const kept=[{kind:'wrong-section',message:'1045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',kept:true}];
  expect(done.race.parts.runners.value).toEqual([{id:entryId,team:{id:team.id,number:1},legs:[
    {wristband:2102,here:true,warnings:[]},{wristband:2101,here:true,warnings:[]},{wristband:1045,here:false,warnings:kept},{wristband:2104,here:false,warnings:[]}]}]);
  expect(done.teams![0]).toMatchObject({id:team.id,version:team.version+1,changing:null,
    legs:[{wristband:2102,warnings:[]},{wristband:2101,warnings:[]},{wristband:1045,warnings:kept},{wristband:2104,warnings:[]}]});
  expect(done.holds).toEqual({});
});
test('a relay\'s race screen carries the day\'s relays and their teams, so an Edit at check-in warns of a child in another relay as it is typed',async()=>{
  const {sam,relays}=await start();
  await relays.team(sam,'R21',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  const seen=await relays.screen(sam,'R22');
  expect([...seen.relays!].sort((a,b)=>a.code.localeCompare(b.code)).map(relay=>[relay.code,relay.name,relay.section,relay.teams.map(team=>team.number)])).toEqual([
    ['R19','4x50m Relay','Boy Beavers',[]],['R20','4x50m Relay','Girl Beavers',[]],['R21','4x50m Relay','Boy Cubs',[1]],['R22','4x50m Relay','Girl Cubs',[1]],['R27','4x100m Relay','Boy Scouts',[]],['R28','4x100m Relay','Girl Scouts',[]]]);
  expect(legWarnings(2101,seen.event,seen.relays!).map(warning=>warning.kind)).toContain('other-relay');
});
test('a check-in Edit is refused in order: race deleted, submitted or saved, a team not in the race, the mark, the version, then a wristband already in the relay',async()=>{
  const {owner,sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  await relays.team(sam,'R22',[2301,2302,2303,2304]);
  const heat1=await relays.tick(priya,'R22',1),[team1,team2,team3]=heat1.teams!;
  const edit=(token:string,what:string,body:object)=>call(token,`/api/race-screen/R22/edit-${what}`,{raceId:heat1.race.id,...body}).then(response=>response.json().message);
  const done=(token:string,team:{id:string;version:number},legs:Array<number|null>)=>edit(token,'done',{teamId:team.id,version:team.version,legs,keptWarnings:[]});
  // Only a team ticked into the race opens at check-in.
  expect(await edit(sam,'open',{teamId:team2.id})).toBe('Team 2 is no longer in Heat 1');
  expect(await done(sam,team2,[2201,2202,2203,2209])).toBe('Team 2 is no longer in Heat 1');
  // Done needs the mark: none, then Priya's.
  expect(await done(sam,team1,[2101,2102,2103,2109])).toBe('Open the team again');
  await relays.post(priya,'/api/race-screen/R22/edit-open',{raceId:heat1.race.id,teamId:team1.id});
  expect(await edit(sam,'open',{teamId:team1.id})).toBe('Priya Shah is changing this team');
  expect(await done(sam,team1,[2101,2102,2103,2109])).toBe('Priya Shah is changing this team');
  // Change anyway moves the mark to Sam; once his Done lands, Priya's late Done is refused.
  await relays.post(sam,'/api/race-screen/R22/edit-open',{raceId:heat1.race.id,teamId:team1.id,changeAnyway:true});
  expect(await done(priya,team1,[2101,2102,2103,2108])).toBe('Sam Patel is changing this team');
  await relays.post(sam,'/api/race-screen/R22/edit-done',{raceId:heat1.race.id,teamId:team1.id,version:team1.version,legs:[2101,2102,2103,2109],keptWarnings:[]});
  await relays.post(priya,'/api/race-screen/R22/edit-open',{raceId:heat1.race.id,teamId:team1.id});
  expect(await done(priya,team1,[2101,2102,2103,2108])).toBe('Sam Patel changed this team - check it and enter it again');
  // A wristband already in another team of the relay, even one not in the race; then a warning not kept.
  const changed={id:team1.id,version:team1.version+1};
  expect(await done(priya,changed,[2101,2102,2103,2301])).toBe('2301 is already in Team 3. Check the wristband.');
  expect(await done(priya,changed,[2101,2102,2103,1045])).toBe('1045 needs Fix number or Keep');
  // Cancel clears Priya's mark; a Cancel from a phone without it changes nothing.
  const cancelled=await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/edit-cancel',{teamId:team1.id});
  expect(cancelled.teams![0].changing).toBeNull();
  expect((await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/edit-cancel',{teamId:team1.id})).revision).toBe(cancelled.revision);
  // Submitted, then saved: today's race-screen wordings, before the mark.
  await relays.post(sam,'/api/race-screen/R22/edit-open',{raceId:heat1.race.id,teamId:team1.id});
  const order=(await relays.post<RaceScreenRead>(priya,'/api/race-screen/R22/take-over',{job:'order'})).race;
  await relays.post(priya,'/api/race-screen/R22/order',{raceId:order.id,version:order.parts.finish.version,order:[order.parts.runners.value![0].id],didNotFinish:[],didNotRun:[],added:[]});
  const times=(await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/take-over',{job:'times'})).race;
  await relays.post(sam,'/api/race-screen/R22/times',{raceId:times.id,version:times.parts.times.version,places:[1234],keptWrong:[]});
  await relays.post(sam,'/api/race-screen/R22/submit',{raceId:heat1.race.id});
  expect(await done(sam,changed,[2101,2102,2103,2107])).toBe('Heat 1 is submitted - tap Not yet to change it');
  expect(await edit(priya,'open',{teamId:team1.id})).toBe('Heat 1 is submitted - tap Not yet to change it');
  await relays.post(priya,'/api/race-screen/R22/submit',{raceId:heat1.race.id});
  expect(await done(sam,changed,[2101,2102,2103,2107])).toBe('Heat 1 is saved - ask a lead to change it');
  // A lead deleted the race; stage complete comes before that.
  const heat2=await relays.tick(priya,'R22',3);
  await relays.post(sam,'/api/race-screen/R22/edit-open',{raceId:heat2.race.id,teamId:team3.id});
  expect((await call(owner,`/api/lead/races/${heat2.race.id}/delete`,{permanent:false})).statusCode).toBe(200);
  const late=()=>call(sam,'/api/race-screen/R22/edit-done',{raceId:heat2.race.id,teamId:team3.id,version:team3.version,legs:[2301,2302,2303,2307],keptWarnings:[]}).then(response=>response.json().message);
  expect(await late()).toBe('A lead deleted Heat 2');
  expect((await call(owner,'/api/lead/events/R22/complete-stage',{stage:'heats'})).statusCode).toBe(200);
  expect(await late()).toBe('Stage complete - ask a lead');
  // Whatever became of the race, Cancel still clears the mark.
  expect((await relays.post<RaceScreenRead>(sam,'/api/race-screen/R22/edit-cancel',{teamId:team3.id})).teams![2].changing).toBeNull();
});
test('the Teams screen refuses to change a team in the unsaved heat: it is changed at check-in',async()=>{
  const {sam,priya,relays}=await start();
  await relays.team(sam,'R22',[2101,2102,2103,2104]);
  await relays.team(sam,'R22',[2201,2202,2203,2204]);
  await relays.team(sam,'R22',[2301,2302,2303,2304]);
  await relays.tick(priya,'R22',1);
  await relays.save(priya,'R22',[1],[1500]);
  const heat2=await relays.tick(priya,'R22',3),team3=heat2.teams![2];
  const teams=(what:string,body:object)=>call(sam,`/api/teams/R22/${what}`,{teamId:team3.id,...body}).then(response=>response.json().message);
  expect(await teams('open',{})).toBe('Team 3 is in Heat 2 - change it at check-in');
  // Opened at check-in, it is still refused on the Teams screen, before the mark.
  await relays.post(sam,'/api/race-screen/R22/edit-open',{raceId:heat2.race.id,teamId:team3.id});
  expect(await teams('done',{version:team3.version,legs:[2301,2302,2303,2309]})).toBe('Team 3 is in Heat 2 - change it at check-in');
  expect(await teams('remove',{version:team3.version})).toBe('Team 3 is in Heat 2 - change it at check-in');
  // A team that ran in a saved heat, and one still to run, change on the Teams screen as before.
  for(const team of heat2.teams!.slice(0,2)) {
    await relays.post(sam,'/api/teams/R22/open',{teamId:team.id});
    await relays.post(sam,'/api/teams/R22/done',{teamId:team.id,version:team.version,legs:[team.legs[0].wristband,null,null,null]});
  }
  expect((await relays.screen(sam,'R22')).teams!.map(filledLegs)).toEqual([1,1,4]);
});
