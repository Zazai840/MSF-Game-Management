import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app: FastifyInstance;
const post = (url: string, payload: object, token?: string) => app.inject({method:'POST', url, payload, headers:token ? {authorization:`Bearer ${token}`} : {}});
const get = (url: string, token: string) => app.inject({url, headers:{authorization:`Bearer ${token}`}});
afterEach(async () => { await app?.close(); });

test('Start new day keeps the presser and profiles, sends other phones back with reason new-day and keeps the Olympics password', async () => {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL!, ownerPassword: 'new-day-owner', resetTestDay: true});
  const people = await signInOwner(app, 'new-day-owner', 'Aisha Khan');
  const {owner, day:before, pass} = people;
  const volunteer = await people.volunteer('Sam Patel'), lead = await people.lead('Yusuf Ali');
  await post('/api/day/export', {}, owner.token);
  expect((await post('/api/day/start-new', {confirmation:'NEW DAY'}, owner.token)).statusCode).toBe(200);

  for (const {token} of [volunteer, lead]) {
    const refused = await get('/api/home', token);
    expect(refused.statusCode).toBe(401);
    expect(refused.json().reason).toBe('new-day');
  }
  const unknown = await get('/api/home', 'made-up');
  expect(unknown.statusCode).toBe(401);
  expect(unknown.json().reason).toBeUndefined();
  const me = (await get('/api/me', owner.token)).json();
  expect(me).toMatchObject({id:owner.phone.id, level:'Lead', profileId:owner.profile.id});
  expect(me.dayId).not.toBe(owner.phone.dayId);
  const after = (await get('/api/day', owner.token)).json();
  expect(after.olympicsPassword).toBe(before.olympicsPassword);
  expect(after.leadCode).not.toBe(before.leadCode);
  expect((await post('/api/password', {password:before.olympicsPassword})).json().pass).toBe(pass);

  // The South lead's profile survives and signs in to the new day as a volunteer.
  const back = await post('/api/sign-in', {pass, profileId:lead.profile.id, secret:lead.profile.secret});
  expect(back.statusCode).toBe(200);
  expect(back.json().phone).toMatchObject({name:'Yusuf Ali', level:'Volunteer', dayId:me.dayId});
  expect((await get('/api/me', back.json().token)).json().level).toBe('Volunteer');
  expect((await post('/api/profiles', {pass, name:'sam patel'})).json().taken).toBe(true);
  expect((await get('/api/day/phones', owner.token)).json().phones.map((phone: {name:string}) => phone.name)).toEqual(['Aisha Khan', 'Yusuf Ali']);
  // The presser keeps the owner marker: the owner password finds the same row, still the owner lead.
  const ownerAgain = (await post('/api/owner-sign-in', {password:'new-day-owner', name:'Aisha Khan', profiles:[{id:owner.profile.id, secret:owner.profile.secret}]})).json();
  expect(ownerAgain.phone).toMatchObject({id:owner.phone.id, dayId:me.dayId, level:'Lead'});
});
