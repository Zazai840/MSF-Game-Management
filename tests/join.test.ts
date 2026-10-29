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
  const first=await join({code:olympics,job:'start',name:'  Amina   Yusuf ',profiles:[]});
  expect(first.statusCode).toBe(200);
  const made=first.json();
  expect(made).toMatchObject({kind:'volunteer',profile:{name:'Amina Yusuf'},phone:{level:'Volunteer'}});
  expect(made.pass).toEqual(expect.any(String));expect(made.profile.secret).toEqual(expect.any(String));
  const again=(await join({code:olympics,job:'start',name:'amina yusuf',profiles:[{id:made.profile.id,secret:made.profile.secret}]})).json();
  expect(again).toMatchObject({kind:'volunteer',profile:{id:made.profile.id}});
  expect(again.profile.secret).toBeUndefined();
});
test('a name held on another phone is refused as taken; That\'s me moves it to this phone at once and the first phone is told it moved',async()=>{
  const {olympics}=await start();
  const first=(await join({code:olympics,job:'start',name:'Tom Barker',profiles:[]})).json();
  const taken=await join({code:olympics,job:'start',name:'tom barker',profiles:[]});
  expect(taken.statusCode).toBe(409);
  expect(taken.json()).toMatchObject({taken:true,message:'Is this you on a new phone?'});
  const moved=await join({code:olympics,job:'start',name:'tom barker',profiles:[],thatsMe:true});
  expect(moved.statusCode).toBe(200);
  const second=moved.json();
  expect(second).toMatchObject({kind:'volunteer',profile:{id:first.profile.id,name:'Tom Barker',secret:expect.any(String)},phone:{level:'Volunteer'}});
  expect(second.profile.secret).not.toBe(first.profile.secret);
  // The first phone's session and its held secret both answer moved, so it forgets the name.
  const old=await app.inject({method:'GET',url:'/api/home',headers:{authorization:`Bearer ${first.token}`}});
  expect(old.statusCode).toBe(401);expect(old.json().reason).toBe('moved');
  const oldTap=await app.inject({method:'POST',url:'/api/sign-in',payload:{pass:first.pass,profileId:first.profile.id,secret:first.profile.secret}});
  expect(oldTap.json().reason).toBe('moved');
  expect((await app.inject({method:'GET',url:'/api/home',headers:{authorization:`Bearer ${second.token}`}})).statusCode).toBe(200);
  // The new phone holds the name now: joining with it again signs in, with no question.
  expect((await join({code:olympics,job:'start',name:'Tom Barker',profiles:[{id:first.profile.id,secret:second.profile.secret}]})).json().profile.id).toBe(first.profile.id);
});
test('today\'s lead code alone signs in as a lead and asks the same question of a taken name; That\'s me moves it, and the lead role only with the lead code',async()=>{
  const {olympics,leadCode}=await start();
  const lead=(await join({code:leadCode,name:'Sam Patel',profiles:[]})).json();
  expect(lead).toMatchObject({kind:'lead',profile:{name:'Sam Patel'},phone:{level:'Lead'},pass:expect.any(String)});
  expect((await join({code:leadCode.toLowerCase(),name:'Sam Patel',profiles:[]})).json()).toMatchObject({taken:true});
  expect((await join({code:leadCode,name:'Sam Patel',profiles:[],thatsMe:true})).json()).toMatchObject({kind:'lead',profile:{id:lead.profile.id,name:'Sam Patel'},phone:{level:'Lead'}});
  // A third phone with only the Olympics password takes the name but not the lead role.
  expect((await join({code:olympics,job:'timer',name:'Sam Patel',profiles:[],thatsMe:true})).json()).toMatchObject({kind:'volunteer',profile:{id:lead.profile.id},phone:{level:'Volunteer'}});
  const owner=(await join({code:'join-owner',name:'Aisha',profiles:[]})).json();
  expect(owner).toMatchObject({kind:'owner',phone:{level:'Lead'}});
});
test('a wrong code is refused plainly and backs off per address after five',async()=>{
  await start();
  for(let attempt=0;attempt<5;attempt++) {
    const wrong=await join({code:'NOPE',name:'Jo'},'10.0.0.9');
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().message).toBe("That password isn't right. Check it with a lead and try again.");
  }
  expect((await join({code:'NOPE',name:'Jo'},'10.0.0.9')).statusCode).toBe(429);
  expect((await join({code:'NOPE',name:'Jo'},'10.0.0.10')).statusCode).toBe(403);
  expect((await join({code:'',name:'Jo'})).json().message).toBe('Type the password');
});
test('a phone whose password pass is out of date is told the password has changed',async()=>{
  const {olympics}=await start();
  const made=(await join({code:olympics,job:'start',name:'Lena Old',profiles:[]})).json();
  const stale=await app.inject({method:'POST',url:'/api/sign-in',payload:{pass:'old-pass',profileId:made.profile.id,secret:made.profile.secret}});
  expect(stale.statusCode).toBe(401);
  expect(stale.json()).toMatchObject({message:'The password has changed. Type the new one.',reason:'password-changed'});
});
test('the Olympics password without a job keeps the person on Join: nobody is signed in and the name stays free',async()=>{
  const {olympics}=await start();
  const refused=await join({code:olympics,name:'Rae Nojob',profiles:[]});
  expect(refused.statusCode).toBe(400);
  expect(refused.json()).toMatchObject({message:'Choose your job',reason:'choose-job'});
  expect((await join({code:olympics,name:'Rae Nojob',job:'timer',profiles:[]})).json().profile.name).toBe('Rae Nojob');
});
