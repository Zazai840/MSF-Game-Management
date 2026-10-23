import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
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
