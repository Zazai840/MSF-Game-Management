import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
afterEach(async()=>{await app?.close();});
test('Home\'s poll answers who the phone is and a lead\'s To check count; its events come from the Home stream',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'home-owner',resetTestDay:true});
  const people=await signInOwner(app,'home-owner'),setup=raceSetup(app);
  const volunteer=(await people.volunteer('Sam')).token,lead=(await people.lead('Alex')).token;
  const home=(await call(volunteer,'/api/home')).json();
  expect(home.phone).toMatchObject({name:'Sam',level:'Volunteer'});
  for(const gone of ['waiting','needsYou','events']) expect(home).not.toHaveProperty(gone);
  // A kept warning reaches the lead's To check count once its race is saved.
  await setup.checkIn(volunteer,'R16',[3045],[3045]);
  expect((await call(lead,'/api/home')).json().needsYou).toBe(0);
  await setup.order(volunteer,'R16',[3045]);await setup.times(volunteer,'R16',[1300]);await setup.submit(volunteer,'R16');
  expect((await call(lead,'/api/home')).json().needsYou).toBe(1);
});
