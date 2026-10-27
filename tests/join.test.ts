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
test('a name held on another phone joins as the next free number, and the first phone keeps its own',async()=>{
  const {olympics}=await start();
  const first=(await join({code:olympics,name:'Tom Barker',profiles:[]})).json();
  const second=await join({code:olympics,name:'tom barker',profiles:[]});
  expect(second.statusCode).toBe(200);
  expect(second.json()).toMatchObject({kind:'volunteer',profile:{name:'Tom Barker 2'},phone:{level:'Volunteer'}});
  expect(second.json().profile.id).not.toBe(first.profile.id);
  expect((await join({code:olympics,name:'Tom Barker',profiles:[]})).json().profile.name).toBe('Tom Barker 3');
  // The first phone still joins as itself.
  expect((await join({code:olympics,name:'Tom Barker',profiles:[{id:first.profile.id,secret:first.profile.secret}]})).json().profile.id).toBe(first.profile.id);
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
