import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app: FastifyInstance;
const call = (token: string, url: string, payload?: unknown) => app.inject({method:payload === undefined ? 'GET' : 'POST', url, headers:{authorization:`Bearer ${token}`}, ...(payload === undefined ? {} : {payload: payload as object})});
afterEach(async () => { await app?.close(); });
async function start() {
  app = await createApp({databaseUrl:process.env.TEST_DATABASE_URL!, ownerPassword:'password-owner-fixture', resetTestDay:true});
  return signInOwner(app, 'password-owner-fixture');
}

test('a new Olympics password under 6 characters or unchanged is refused plainly', async () => {
  const {owner, day} = await start();
  const short = await call(owner.token, '/api/day/olympics-password', {password:'abcde'});
  expect(short.statusCode).toBe(400);
  expect(short.json().message).toBe('Use at least 6 characters for the Olympics password');
  const same = await call(owner.token, '/api/day/olympics-password', {password:day.olympicsPassword});
  expect(same.statusCode).toBe(409);
  expect(same.json().message).toBe('That is already the Olympics password. Type a new one.');
  expect((await call(owner.token, '/api/day')).json().olympicsPassword).toBe(day.olympicsPassword);
});

test('a lead who is not the owner changes the Olympics password and a volunteer is refused', async () => {
  const {lead, volunteer} = await start();
  const ahmed = await volunteer('Ahmed'), maryam = await lead('Maryam');
  const refused = await call(ahmed.token, '/api/day/olympics-password', {password:'sunny-days'});
  expect(refused.statusCode).toBe(403);
  expect(refused.json().message).toBe('Lead access needed');
  expect((await call(maryam.token, '/api/day/olympics-password', {password:'sunny-days'})).statusCode).toBe(200);
});

test('passwords with surrounding whitespace are refused without changing the password or day', async () => {
  const {owner, day} = await start();
  for (const password of [' sunny-days', 'sunny-days ', '      ', '\tsunny-days', 'sunny-days\n']) {
    const refused = await call(owner.token, '/api/day/olympics-password', {password});
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toBe('Do not put spaces at the start or end of the Olympics password');
    expect((await call(owner.token, '/api/day')).json()).toEqual(day);
  }
  expect((await call(owner.token, '/api/day/phones')).json().auditNotes).toEqual([]);
});

test.each(['abcdef', 'sun ny'])('a six-character password %j is stored exactly', async password => {
  const {owner} = await start();
  expect((await call(owner.token, '/api/day/olympics-password', {password})).statusCode).toBe(200);
  const again = (await app.inject({method:'POST', url:'/api/owner-sign-in', payload:{password:'password-owner-fixture', name:'Aisha', profiles:[owner.profile]}})).json();
  expect((await call(again.token, '/api/day')).json().olympicsPassword).toBe(password);
});

test('changing the password ends every session with password-changed, refuses old passes, and roles come back with the new password', async () => {
  const {owner, day, pass, volunteer, lead} = await start();
  const ahmed = await volunteer('Ahmed'), maryam = await lead('Maryam');
  expect((await call(owner.token, '/api/day/olympics-password', {password:'sunny-days'})).statusCode).toBe(200);
  for (const signedIn of [owner, ahmed, maryam]) {
    const refused = await call(signedIn.token, '/api/me');
    expect(refused.statusCode).toBe(401);
    expect(refused.json().reason).toBe('password-changed');
  }
  const old = await app.inject({method:'POST', url:'/api/sign-in', payload:{pass, profileId:maryam.profile.id, secret:maryam.profile.secret}});
  expect(old.statusCode).toBe(401);
  expect(old.json().reason).toBe('password-changed');
  expect((await app.inject({method:'POST', url:'/api/password', payload:{password:day.olympicsPassword}})).statusCode).toBe(403);
  const {pass:newPass} = (await app.inject({method:'POST', url:'/api/password', payload:{password:'sunny-days'}})).json();
  const back = (await app.inject({method:'POST', url:'/api/sign-in', payload:{pass:newPass, profileId:maryam.profile.id, secret:maryam.profile.secret}})).json();
  expect((await call(back.token, '/api/me')).json()).toMatchObject({name:'Maryam', level:'Lead'});
  // The owner gets back in with the owner password and reads the new password off the Day tab.
  const again = (await app.inject({method:'POST', url:'/api/owner-sign-in', payload:{password:'password-owner-fixture', name:'Aisha', profiles:[{id:owner.profile.id, secret:owner.profile.secret}]}})).json();
  expect(again.pass).toBe(newPass);
  expect((await call(again.token, '/api/day')).json().olympicsPassword).toBe('sunny-days');
  const notes = (await call(again.token, '/api/day/phones')).json().auditNotes;
  expect(notes[0]).toMatchObject({eventId:null, actor:'Aisha', action:'Changed Olympics password', message:'Changed the Olympics password; every phone types the new one'});
});

test('the changed password survives Start new day', async () => {
  const {owner} = await start();
  await call(owner.token, '/api/day/olympics-password', {password:'sunny-days'});
  const again = (await app.inject({method:'POST', url:'/api/owner-sign-in', payload:{password:'password-owner-fixture', name:'Aisha', profiles:[{id:owner.profile.id, secret:owner.profile.secret}]}})).json();
  await call(again.token, '/api/day/export', {});
  expect((await call(again.token, '/api/day/start-new', {confirmation:'NEW DAY'})).statusCode).toBe(200);
  expect((await call(again.token, '/api/day')).json().olympicsPassword).toBe('sunny-days');
});
