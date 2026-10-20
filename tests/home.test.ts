import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
test('Home lists the switched-on events in programme order, each with its current race, and a lead\'s To check count',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'home-owner',resetTestDay:true});
  const people=await signInOwner(app,'home-owner'),owner=people.owner.token as string,setup=raceSetup(app);
  const volunteer=(await people.volunteer('Sam')).token,lead=(await people.lead('Alex')).token;
  await call(owner,'/api/day/events/R5/enabled',{enabled:false});
  await setup.record(volunteer,'R4',[2001],[1234]);
  await setup.checkIn(volunteer,'R7',[1001]);
  const home=(await call(volunteer,'/api/home')).json();
  expect(home).not.toHaveProperty('waiting');expect(home).not.toHaveProperty('needsYou');
  const events=home.events;
  expect(events.map((event:{code:string})=>event.code)).toEqual(['R1','R2','R3','R4','R6','R7','R8','R9','R10','R11','R12','R13','R14','R15','R16','R17','R18','R23','R24']);
  expect(events[0]).toEqual({code:'R1',name:'60m',section:'Boy Beavers',race:{kind:'heat',number:1}});
  // A saved heat moves the event on; a race in progress stays current.
  expect(events.find((event:{code:string})=>event.code==='R4')).toEqual({code:'R4',name:'60m',section:'Girl Cubs',race:{kind:'heat',number:2}});
  expect(events.find((event:{code:string})=>event.code==='R7')).toEqual({code:'R7',name:'60m Hurdles',section:'Boy Beavers',race:{kind:'race',number:1}});
  // A kept warning reaches the lead's To check count once its race is saved.
  await setup.checkIn(volunteer,'R16',[3045],[3045]);
  expect((await call(lead,'/api/home')).json().needsYou).toBe(0);
  await setup.order(volunteer,'R16',[3045]);await setup.times(volunteer,'R16',[1300]);await setup.submit(volunteer,'R16');
  expect((await call(lead,'/api/home')).json().needsYou).toBe(1);
});
