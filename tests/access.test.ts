import { afterEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';
let app: FastifyInstance;
const join = (code: string, name: string) => app.inject({method:'POST', url:'/api/join', payload:{code,name}});
const auth = (token: string) => ({authorization:`Bearer ${token}`});
afterEach(async () => { await app?.close(); });
async function start() {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/${process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test'}`, ownerPassword: 'test-owner-fixture', resetTestDay: true});
}
test('wrong owner password is refused without starting an Olympics day', async () => {
  await start();
  const refused = await join('wrong-fixture', 'Ahmed');
  expect(refused.statusCode).toBe(403);
  expect(refused.json().message).toBe('Wrong owner password');
  expect((await join('test-owner-fixture', 'Ahmed')).statusCode).toBe(200);
});
test('day code joins a volunteer and wrong codes and used first names are refused plainly', async () => {
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
  expect(duplicate.json().message).toBe('Someone has joined as Ahmed - add your surname initial');
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
