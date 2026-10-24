import { afterEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import * as rulings from '../src/server/rulings/records.js';
let app: FastifyInstance;
const checkPassword = (password: unknown, remoteAddress?: string) => app.inject({method:'POST', url:'/api/password', remoteAddress, payload:{password}});
const auth = (token: string) => ({authorization:`Bearer ${token}`});
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); });
async function start(trustedProxyHops?: number) {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/${process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test'}`, ownerPassword: 'test-owner-fixture', resetTestDay: true, trustedProxyHops});
}
test('wrong owner password is refused without starting an Olympics day', async () => {
  await start();
  const refused = await app.inject({method:'POST', url:'/api/owner-sign-in', payload:{password:'wrong-fixture', name:'Ahmed', profiles:[]}});
  expect(refused.statusCode).toBe(403);
  expect(refused.json().message).toBe('That is not the Olympics password. Check with a lead and try again.');
  expect((await checkPassword('test-owner-fixture')).json()).toEqual({kind:'owner', dayRunning:false});
});
test('permission ladder refuses volunteer lead and Day reads, lets every lead read the Day, and shares Home', async () => {
  await start();
  const people = await signInOwner(app, 'test-owner-fixture'), {owner, day} = people;
  const volunteer = await people.volunteer('Ahmed');
  const lead = await people.volunteer('Fatima');
  expect((await app.inject({url:'/api/lead', headers:auth(volunteer.token)})).statusCode).toBe(403);
  expect((await app.inject({url:'/api/day', headers:auth(volunteer.token)})).statusCode).toBe(403);
  expect((await app.inject({method:'POST', url:'/api/become-lead', headers:auth(lead.token), payload:{code:day.leadCode}})).json()).toMatchObject({level:'Lead'});
  expect((await app.inject({url:'/api/day', headers:auth(lead.token)})).statusCode).toBe(200);
  expect((await app.inject({url:'/api/lead', headers:auth(lead.token)})).statusCode).toBe(200);
  for (const phone of [volunteer, lead, owner]) {
    const home = await app.inject({url:'/api/home', headers:auth(phone.token)});
    expect(home.statusCode).toBe(200);
    expect(home.json().phone.id).toBe(phone.phone.id);
  }
  const home = (await app.inject({url:'/api/home', headers:auth(volunteer.token)})).json();
  expect(home).not.toHaveProperty('leadCode');
  expect(home).not.toHaveProperty('olympicsPassword');
  expect(home).not.toHaveProperty('needsYou');
});
test('owner password starts the first Olympics day and the phone stays signed in', async () => {
  await start();
  const {token, phone} = (await signInOwner(app, 'test-owner-fixture')).owner;
  expect(phone).toMatchObject({name:'Aisha', level:'Lead'});
  const headers = auth(token);
  expect((await app.inject({url:'/api/me', headers})).json()).toMatchObject({name:'Aisha', level:'Lead'});
  const day = (await app.inject({url:'/api/day', headers})).json();
  expect(day.leadCode).toMatch(/^[A-Z0-9]{6}$/);
  await app.close();
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/${process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test'}`, ownerPassword:'test-owner-fixture'});
  expect((await app.inject({url:'/api/me', headers})).json()).toMatchObject({name:'Aisha', level:'Lead'});
});
test('malformed sign-in requests are refused as a plain request error', async () => {
  await start();
  const response = await app.inject({method:'POST', url:'/api/password', headers:{'content-type':'application/json'}, payload:'{"password":'});
  expect(response.statusCode).toBe(400);
  expect(response.json().message).toBe('Check what you entered and try again');
});


test('failed Olympics and owner passwords block all password checks from an IP without counting validation errors', async () => {
  await start();
  let now=Date.now();
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const remoteAddress='192.0.2.1';
  const attempt=(password:unknown,ip=remoteAddress)=>checkPassword(password,ip);
  for(let i=0;i<8;i++) expect((await attempt(null)).statusCode).toBe(400);
  for(let i=0;i<5;i++) expect((await attempt('wrong')).statusCode).toBe(403);
  const refusal=await attempt('wrong');
  expect(refusal.statusCode).toBe(429);
  expect(refusal.headers['retry-after']).toBe('1');
  const codeChecks=vi.spyOn(pg.Pool.prototype,'connect');
  const blocked=await Promise.all([attempt('wrong'),attempt('wrong'),attempt('test-owner-fixture')]);
  for(const response of blocked) {
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('1');
  }
  expect(codeChecks).not.toHaveBeenCalled();
  codeChecks.mockRestore();
  expect((await attempt('wrong','192.0.2.2')).statusCode).toBe(403);
  const {day}=await signInOwner(app,'test-owner-fixture','Owner');
  expect((await attempt(day.olympicsPassword)).statusCode).toBe(429);
  now+=1000;
  expect((await attempt(day.olympicsPassword)).json().kind).toBe('olympics');
  now+=15*60_000;
  const wrong=await attempt('wrong');
  expect(wrong.statusCode).toBe(403);
  expect(wrong.json().message).toBe('That is not the Olympics password. Check with a lead and try again.');
});

test('failed lead codes aggregate across phones sharing an IP and across IPs used by one phone', async () => {
  await start();
  let now=Date.now();
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const people=await signInOwner(app,'test-owner-fixture','Owner'),day=people.day;
  const first=await people.volunteer('Ahmed'),second=await people.volunteer('Aisha');
  const attempt=(token:string,code:unknown,remoteAddress:string)=>app.inject({method:'POST',url:'/api/become-lead',remoteAddress,headers:auth(token),payload:{code}});
  for(let i=0;i<8;i++) expect((await attempt(first.token,null,'192.0.2.1')).statusCode).toBe(400);
  for(let i=0;i<5;i++) expect((await attempt(first.token,'wrong','192.0.2.1')).statusCode).toBe(403);
  const sameIp=await attempt(second.token,'wrong','192.0.2.1');
  const samePhone=await attempt(first.token,'wrong','192.0.2.2');
  const codeChecks=vi.spyOn(rulings,'rulingChange');
  const blocked=await Promise.all([
    attempt(first.token,'wrong','192.0.2.3'),attempt(second.token,'wrong','192.0.2.1'),
    attempt(first.token,day.leadCode,'192.0.2.2'),attempt(second.token,'test-owner-fixture','192.0.2.1')
  ]);
  for(const response of [sameIp,samePhone,...blocked]) {
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('1');
  }
  expect(codeChecks).not.toHaveBeenCalled();
  codeChecks.mockRestore();
  expect((await attempt(second.token,'wrong','192.0.2.3')).statusCode).toBe(403);
  now+=1000;
  expect((await attempt(first.token,day.leadCode,'192.0.2.2')).json()).toMatchObject({level:'Lead'});
  expect((await attempt(second.token,'test-owner-fixture','192.0.2.1')).json()).toMatchObject({level:'Lead'});
});

// Behind one proxy every phone connects from the proxy's address; only the forwarded address tells them apart.
const proxy='10.0.0.1';
const viaProxy=(forwardedFor:string)=>({remoteAddress:proxy,headers:{'x-forwarded-for':forwardedFor}});
test('behind a trusted proxy hop wrong passwords slow only the phone that mistyped', async () => {
  await start(1);
  const attempt=(forwardedFor:string)=>app.inject({method:'POST',url:'/api/password',...viaProxy(forwardedFor),payload:{password:'wrong'}});
  for(let i=0;i<5;i++) expect((await attempt('198.51.100.1')).statusCode).toBe(403);
  expect((await attempt('198.51.100.1')).statusCode).toBe(429);
  expect((await attempt('203.0.113.9, 198.51.100.1')).statusCode).toBe(429);
  expect((await attempt('198.51.100.2')).statusCode).toBe(403);
});
test('without proxy trust forwarded addresses are ignored and cannot dodge wrong password backoff', async () => {
  await start();
  const attempt=(forwardedFor:string)=>app.inject({method:'POST',url:'/api/password',...viaProxy(forwardedFor),payload:{password:'wrong'}});
  for(let i=0;i<5;i++) expect((await attempt('198.51.100.1')).statusCode).toBe(403);
  expect((await attempt('198.51.100.2')).statusCode).toBe(429);
});
async function twoPhonesBehindProxy() {
  const people=await signInOwner(app,'test-owner-fixture','Owner');
  const first=await people.volunteer('Ahmed'),second=await people.volunteer('Aisha');
  const attempt=(token:string,forwardedFor:string)=>{
    const {remoteAddress,headers}=viaProxy(forwardedFor);
    return app.inject({method:'POST',url:'/api/become-lead',remoteAddress,headers:{...headers,...auth(token)},payload:{code:'wrong'}});
  };
  for(let i=0;i<5;i++) expect((await attempt(first.token,'198.51.100.1')).statusCode).toBe(403);
  return (forwardedFor:string)=>attempt(second.token,forwardedFor);
}
test('behind a trusted proxy hop wrong lead codes slow only the phone that mistyped', async () => {
  await start(1);
  const secondPhone=await twoPhonesBehindProxy();
  expect((await secondPhone('198.51.100.1')).statusCode).toBe(429);
  expect((await secondPhone('198.51.100.2')).statusCode).toBe(403);
});
test('without proxy trust forwarded addresses are ignored and cannot dodge wrong lead code backoff', async () => {
  await start();
  const secondPhone=await twoPhonesBehindProxy();
  expect((await secondPhone('198.51.100.2')).statusCode).toBe(429);
});
