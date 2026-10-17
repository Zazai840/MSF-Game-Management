import { afterEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import * as rulings from '../src/server/rulings/records.js';
let app: FastifyInstance;
const join = (code: string, name: string) => app.inject({method:'POST', url:'/api/join', payload:{code,name}});
const auth = (token: string) => ({authorization:`Bearer ${token}`});
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); });
async function start(trustedProxyHops?: number) {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/${process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test'}`, ownerPassword: 'test-owner-fixture', resetTestDay: true, trustedProxyHops});
}
test('wrong owner password is refused without starting an Olympics day', async () => {
  await start();
  const refused = await join('wrong-fixture', 'Ahmed');
  expect(refused.statusCode).toBe(403);
  expect(refused.json().message).toBe('Wrong owner password');
  expect((await join('test-owner-fixture', 'Ahmed')).statusCode).toBe(200);
});
test('day code joins a volunteer and wrong codes and used full names are refused plainly', async () => {
  await start();
  const owner = (await join('test-owner-fixture', 'Aisha')).json();
  const day = (await app.inject({url:'/api/day', headers:auth(owner.token)})).json();
  const wrong = await join('not-a-day-code', 'Ahmed');
  expect(wrong.statusCode).toBe(403);
  expect(wrong.json().message).toBe('Wrong day code - ask for the right one');
  const volunteer = (await join(day.dayCode, 'Ahmed')).json();
  expect(volunteer.phone).toMatchObject({name:'Ahmed', level:'Volunteer'});
  const duplicate = await join(day.dayCode, ' ahmed ');
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().message).toBe('Someone has joined as Ahmed - use your full name so the zone lead can tell you apart');
  const missing = await join(day.dayCode, '  ');
  expect(missing.statusCode).toBe(400);
  expect(missing.json().message).toBe('Enter your full name (up to 80 characters)');
});
test('permission ladder refuses volunteer lead reads and ordinary lead Day reads but shares jobs', async () => {
  await start();
  const owner = (await join('test-owner-fixture', 'Aisha')).json();
  const day = (await app.inject({url:'/api/day', headers:auth(owner.token)})).json();
  const volunteer = (await join(day.dayCode, 'Ahmed')).json();
  const lead = (await join(day.dayCode, 'Fatima')).json();
  expect((await app.inject({url:'/api/lead', headers:auth(volunteer.token)})).statusCode).toBe(403);
  expect((await app.inject({url:'/api/day', headers:auth(volunteer.token)})).statusCode).toBe(403);
  expect((await app.inject({method:'POST', url:'/api/become-lead', headers:auth(lead.token), payload:{code:day.leadCode}})).json()).toMatchObject({level:'Lead'});
  expect((await app.inject({url:'/api/day', headers:auth(lead.token)})).statusCode).toBe(403);
  expect((await app.inject({url:'/api/lead', headers:auth(lead.token)})).statusCode).toBe(200);
  for (const phone of [volunteer, lead, owner]) {
    const home = await app.inject({url:'/api/home', headers:auth(phone.token)});
    expect(home.statusCode).toBe(200);
    expect(home.json().waiting).toEqual({'Start line':0, 'Finish order':0, Times:0});
  }
  const home = (await app.inject({url:'/api/home', headers:auth(volunteer.token)})).json();
  expect(home).not.toHaveProperty('leadCode');
  expect(home).not.toHaveProperty('dayCode');
  expect(home).not.toHaveProperty('needsYou');
});
test('owner password starts the first Olympics day and the phone stays joined', async () => {
  await start();
  const joined = await join('test-owner-fixture', 'Aisha');
  expect(joined.statusCode).toBe(200);
  const {token, phone} = joined.json();
  expect(phone).toMatchObject({name:'Aisha', level:'Scoring team'});
  const headers = auth(token);
  expect((await app.inject({url:'/api/me', headers})).json()).toMatchObject({name:'Aisha', level:'Scoring team'});
  const day = (await app.inject({url:'/api/day', headers})).json();
  expect(day.dayCode).toMatch(/^\d{4}$/);
  expect(day.leadCode).toMatch(/^[A-Z0-9]{6}$/);
  await app.close();
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/${process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test'}`, ownerPassword:'test-owner-fixture'});
  expect((await app.inject({url:'/api/me', headers})).json()).toMatchObject({name:'Aisha', level:'Scoring team'});
});
test('malformed join requests are refused as a plain request error', async () => {
  await start();
  const response = await app.inject({method:'POST', url:'/api/join', headers:{'content-type':'application/json'}, payload:'{"code":'});
  expect(response.statusCode).toBe(400);
  expect(response.json().message).toBe('Check what you entered and try again');
});


test('failed owner and day codes block all joins from an IP without counting validation errors', async () => {
  await start();
  let now=Date.now();
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const remoteAddress='192.0.2.1';
  const attempt=(code:unknown,name:unknown='Ahmed',ip=remoteAddress)=>app.inject({method:'POST',url:'/api/join',remoteAddress:ip,payload:{code,name}});
  for(let i=0;i<8;i++) expect((await attempt(null)).statusCode).toBe(400);
  for(let i=0;i<5;i++) expect((await attempt('wrong')).statusCode).toBe(403);
  const refusal=await attempt('wrong');
  expect(refusal.statusCode).toBe(429);
  expect(refusal.headers['retry-after']).toBe('1');
  const codeChecks=vi.spyOn(pg.Pool.prototype,'connect');
  const blocked=await Promise.all([attempt('wrong'),attempt('wrong'),attempt('test-owner-fixture','Scoring')]);
  for(const response of blocked) {
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('1');
  }
  expect(codeChecks).not.toHaveBeenCalled();
  codeChecks.mockRestore();
  expect((await attempt('wrong','Ahmed','192.0.2.2')).statusCode).toBe(403);
  const owner=await attempt('test-owner-fixture','Scoring','192.0.2.2');
  expect(owner.statusCode).toBe(200);
  const day=(await app.inject({url:'/api/day',headers:auth(owner.json().token)})).json();
  expect((await attempt(day.dayCode)).statusCode).toBe(429);
  now+=1000;
  expect((await attempt(day.dayCode)).statusCode).toBe(200);
  expect((await attempt(day.dayCode)).statusCode).toBe(409);
  now+=15*60_000;
  const wrongDay=await attempt('wrong');
  expect(wrongDay.statusCode).toBe(403);
  expect(wrongDay.json().message).toBe('Wrong day code - ask for the right one');
});

test('failed lead codes aggregate across phones sharing an IP and across IPs used by one phone', async () => {
  await start();
  let now=Date.now();
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const owner=(await join('test-owner-fixture','Scoring')).json();
  const day=(await app.inject({url:'/api/day',headers:auth(owner.token)})).json();
  const first=(await join(day.dayCode,'Ahmed')).json(),second=(await join(day.dayCode,'Aisha')).json();
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
  expect((await attempt(second.token,'test-owner-fixture','192.0.2.1')).json()).toMatchObject({level:'Scoring team'});
});

// Behind one proxy every phone connects from the proxy's address; only the forwarded address tells them apart.
const proxy='10.0.0.1';
const viaProxy=(forwardedFor:string)=>({remoteAddress:proxy,headers:{'x-forwarded-for':forwardedFor}});
test('behind a trusted proxy hop wrong day codes slow only the phone that mistyped', async () => {
  await start(1);
  const attempt=(forwardedFor:string)=>app.inject({method:'POST',url:'/api/join',...viaProxy(forwardedFor),payload:{code:'wrong',name:'Ahmed'}});
  for(let i=0;i<5;i++) expect((await attempt('198.51.100.1')).statusCode).toBe(403);
  expect((await attempt('198.51.100.1')).statusCode).toBe(429);
  expect((await attempt('203.0.113.9, 198.51.100.1')).statusCode).toBe(429);
  expect((await attempt('198.51.100.2')).statusCode).toBe(403);
});
test('without proxy trust forwarded addresses are ignored and cannot dodge wrong day code backoff', async () => {
  await start();
  const attempt=(forwardedFor:string)=>app.inject({method:'POST',url:'/api/join',...viaProxy(forwardedFor),payload:{code:'wrong',name:'Ahmed'}});
  for(let i=0;i<5;i++) expect((await attempt('198.51.100.1')).statusCode).toBe(403);
  expect((await attempt('198.51.100.2')).statusCode).toBe(429);
});
async function twoPhonesBehindProxy() {
  const owner=(await join('test-owner-fixture','Scoring')).json();
  const day=(await app.inject({url:'/api/day',headers:auth(owner.token)})).json();
  const first=(await join(day.dayCode,'Ahmed')).json(),second=(await join(day.dayCode,'Aisha')).json();
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
