import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
afterEach(async()=>{await app?.close();});
const join=(body:object,ip='10.0.0.1')=>app.inject({method:'POST',url:'/api/join',payload:body,remoteAddress:ip});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'join-owner',resetTestDay:true});
  const people=await signInOwner(app,'join-owner');
  return {olympics:people.day.olympicsPassword as string,leadCode:people.day.leadCode as string};
}
test('the Olympics password makes a new name a volunteer profile, and the same phone joins again by its name',async()=>{
  const {olympics}=await start();
  const first=await join({code:olympics,name:'  Amina   Yusuf ',profiles:[]});
  expect(first.statusCode).toBe(200);
  const made=first.json();
  expect(made).toMatchObject({kind:'volunteer',profile:{name:'Amina Yusuf'},phone:{level:'Volunteer'}});
  expect(made.pass).toEqual(expect.any(String));expect(made.profile.secret).toEqual(expect.any(String));
  const again=(await join({code:olympics,name:'amina yusuf',profiles:[{id:made.profile.id,secret:made.profile.secret}]})).json();
  expect(again).toMatchObject({kind:'volunteer',profile:{id:made.profile.id}});
  expect(again.profile.secret).toBeUndefined();
});
test('a name held on another phone is refused as taken, with the pass for That\'s me',async()=>{
  const {olympics}=await start();
  await join({code:olympics,name:'Tom Barker',profiles:[]});
  const taken=await join({code:olympics,name:'tom barker',profiles:[]});
  expect(taken.statusCode).toBe(409);
  expect(taken.json()).toMatchObject({taken:true,pass:expect.any(String)});
  expect(taken.json().message).toMatch(/^Tom Barker already has a profile/);
  const waiting=await app.inject({method:'POST',url:'/api/thats-me',payload:{pass:taken.json().pass,name:'Tom Barker'}});
  expect(waiting.statusCode).toBe(200);
});
test('today\'s lead code alone signs in as a lead, numbering a name taken on another phone; the owner password signs in the owner',async()=>{
  const {olympics,leadCode}=await start();
  await join({code:olympics,name:'Sam Patel',profiles:[]});
  const lead=(await join({code:leadCode.toLowerCase(),name:'Sam Patel',profiles:[]})).json();
  expect(lead).toMatchObject({kind:'lead',profile:{name:'Sam Patel 2'},phone:{level:'Lead'},pass:expect.any(String)});
  const owner=(await join({code:'join-owner',name:'Aisha',profiles:[]})).json();
  expect(owner).toMatchObject({kind:'owner',phone:{level:'Lead'}});
});
test('a wrong code is refused plainly and backs off per address after five',async()=>{
  await start();
  for(let attempt=0;attempt<5;attempt++) {
    const wrong=await join({code:'NOPE',name:'Jo'},'10.0.0.9');
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().message).toBe("That is not the Olympics password or today's lead code. Check with a lead and try again.");
  }
  expect((await join({code:'NOPE',name:'Jo'},'10.0.0.9')).statusCode).toBe(429);
  expect((await join({code:'NOPE',name:'Jo'},'10.0.0.10')).statusCode).toBe(403);
  expect((await join({code:'',name:'Jo'})).json().message).toBe('Type the day code');
});
