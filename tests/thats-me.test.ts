import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app: FastifyInstance;
const call = (url: string, body?: object, token?: string) => app.inject({method:body === undefined ? 'GET' : 'POST', url, headers:token ? {authorization:`Bearer ${token}`} : {}, ...(body === undefined ? {} : {payload:body})});
afterEach(async () => { await app?.close(); });
async function start() {
  app = await createApp({databaseUrl:process.env.TEST_DATABASE_URL!, ownerPassword:'thats-me-owner', resetTestDay:true});
  return signInOwner(app, 'thats-me-owner', 'Aisha');
}
async function request(pass: string, name: string) {
  const response = await call('/api/thats-me', {pass, name});
  expect(response.statusCode).toBe(200);
  return response.json() as {id: string; name: string; secret: string};
}

test('approving That\'s me moves the profile to the new phone and signs the old phone out with reason moved', async () => {
  const people = await start();
  const oldPhone = await people.lead('Sam Patel');
  const lead = await people.lead('Lena Lead');
  const waiting = await request(people.pass, '  sam   PATEL ');
  expect(waiting.name).toBe('Sam Patel');
  expect((await call('/api/thats-me/status', {secret:waiting.secret})).json()).toEqual({status:'waiting'});
  // The request counts in "N to check" and is listed on its own, opening no race.
  expect((await call('/api/home', undefined, lead.token)).json().needsYou).toBe(1);
  const read = (await call('/api/lead', undefined, lead.token)).json();
  expect(read.profileRequests).toEqual([{id:waiting.id, name:'Sam Patel', at:expect.any(String)}]);
  expect(read.needsYou).toEqual([]);
  // A volunteer cannot approve.
  const volunteer = await people.volunteer('Vic Volunteer');
  expect((await call(`/api/lead/thats-me/${waiting.id}/approve`, {}, volunteer.token)).statusCode).toBe(403);

  expect((await call(`/api/lead/thats-me/${waiting.id}/approve`, {}, lead.token)).statusCode).toBe(200);
  const old = await call('/api/home', undefined, oldPhone.token);
  expect(old.statusCode).toBe(401);
  expect(old.json().reason).toBe('moved');
  const oldTap = await call('/api/sign-in', {pass:people.pass, profileId:oldPhone.profile.id, secret:oldPhone.profile.secret});
  expect(oldTap.json().reason).toBe('moved');

  const approved = (await call('/api/thats-me/status', {secret:waiting.secret})).json();
  expect(approved).toMatchObject({status:'approved', profile:{id:oldPhone.profile.id, name:'Sam Patel', secret:waiting.secret}, token:expect.any(String)});
  const me = (await call('/api/me', undefined, approved.token)).json();
  expect(me).toMatchObject({id:oldPhone.phone.id, name:'Sam Patel', level:'Volunteer', profileId:oldPhone.profile.id});
  // The new phone holds the profile: tapping the name signs it in again.
  expect((await call('/api/sign-in', {pass:people.pass, profileId:oldPhone.profile.id, secret:waiting.secret})).statusCode).toBe(200);

  const phones = (await call('/api/day/phones', undefined, people.owner.token)).json();
  expect(phones.phones.filter((row: {name: string}) => row.name === 'Sam Patel')).toHaveLength(1);
  expect(phones.auditNotes[0]).toMatchObject({eventId:null, actor:'Lena Lead', action:'Approved That\'s me', message:'Moved Sam Patel\'s profile to a new phone'});
  expect((await call('/api/lead', undefined, lead.token)).json().profileRequests).toEqual([]);
  expect((await call(`/api/lead/thats-me/${waiting.id}/approve`, {}, lead.token)).statusCode).toBe(404);
});

test('a That\'s me request needs the Olympics password and a profile with that name', async () => {
  const people = await start();
  expect((await call('/api/thats-me', {pass:'wrong', name:'Aisha'})).json().reason).toBe('password-changed');
  const missing = await call('/api/thats-me', {pass:people.pass, name:'Nobody Here'});
  expect(missing.statusCode).toBe(404);
  expect((await call('/api/thats-me/status', {secret:'not-a-secret'})).statusCode).toBe(404);
});

test('declining tells the waiting phone and writes an audit note; cancelling takes the request out of To check', async () => {
  const people = await start();
  await people.volunteer('Sam Patel');
  const declined = await request(people.pass, 'Sam Patel');
  expect((await call(`/api/lead/thats-me/${declined.id}/decline`, {}, people.owner.token)).statusCode).toBe(200);
  expect((await call('/api/thats-me/status', {secret:declined.secret})).json()).toEqual({status:'declined'});
  const notes = (await call('/api/day/phones', undefined, people.owner.token)).json().auditNotes;
  expect(notes[0]).toMatchObject({actor:'Aisha', action:'Declined That\'s me', message:'Did not move Sam Patel\'s profile to a new phone'});

  const cancelled = await request(people.pass, 'Sam Patel');
  expect((await call('/api/lead', undefined, people.owner.token)).json().profileRequests).toHaveLength(1);
  expect((await call('/api/thats-me/cancel', {secret:cancelled.secret})).statusCode).toBe(200);
  expect((await call('/api/lead', undefined, people.owner.token)).json().profileRequests).toEqual([]);
  expect((await call('/api/thats-me/status', {secret:cancelled.secret})).json()).toEqual({status:'cancelled'});
  expect((await call(`/api/lead/thats-me/${cancelled.id}/approve`, {}, people.owner.token)).statusCode).toBe(404);
});

test('Start new day deletes unanswered That\'s me requests', async () => {
  const people = await start();
  await people.volunteer('Sam Patel');
  const waiting = await request(people.pass, 'Sam Patel');
  expect((await call('/api/day/export', {}, people.owner.token)).statusCode).toBe(200);
  expect((await call('/api/day/start-new', {confirmation:'NEW DAY'}, people.owner.token)).statusCode).toBe(200);
  expect((await call('/api/lead', undefined, people.owner.token)).json().profileRequests).toEqual([]);
  expect((await call('/api/thats-me/status', {secret:waiting.secret})).statusCode).toBe(404);
});
