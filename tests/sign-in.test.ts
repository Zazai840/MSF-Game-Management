import { afterEach, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { raceSetup } from './support/races.js';
import { createApp } from '../src/server/app.js';
let app: FastifyInstance;
const post = (url: string, payload: object, remoteAddress?: string) => app.inject({method:'POST', url, payload, remoteAddress});
const auth = (token: string) => ({authorization:`Bearer ${token}`});
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); });
async function start() {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL!, ownerPassword: 'sign-in-owner', resetTestDay: true});
}
async function owner(name = 'Aisha Khan', profiles: object[] = []) {
  const signedIn = await post('/api/owner-sign-in', {password:'sign-in-owner', name, profiles});
  expect(signedIn.statusCode).toBe(200);
  return signedIn.json();
}
async function olympicsPass(ownerToken: string) {
  const {olympicsPassword} = (await app.inject({url:'/api/day', headers:auth(ownerToken)})).json();
  return (await post('/api/password', {password:olympicsPassword})).json().pass as string;
}

test('with no day running only the owner password works, and owner sign-in starts the first day', async () => {
  await start();
  const wrong = await post('/api/password', {password:'not-it'});
  expect(wrong.statusCode).toBe(403);
  expect(wrong.json().message).toBe('That is not the Olympics password. Check with a lead and try again.');
  expect((await post('/api/password', {password:'sign-in-owner'})).json()).toEqual({kind:'owner', dayRunning:false});
  const signedIn = await owner('  Aisha   Khan ');
  expect(signedIn.profile).toMatchObject({name:'Aisha Khan'});
  expect(signedIn.profile.secret).toEqual(expect.any(String));
  expect(signedIn.pass).toEqual(expect.any(String));
  const me = (await app.inject({url:'/api/me', headers:auth(signedIn.token)})).json();
  expect(me).toEqual({id:expect.any(String), dayId:expect.any(String), name:'Aisha Khan', level:'Scoring team', profileId:signedIn.profile.id});
  const day = (await app.inject({url:'/api/day', headers:auth(signedIn.token)})).json();
  expect(day.leadCode).toMatch(/^[A-Z0-9]{6}$/);
  expect(day.olympicsPassword.length).toBeGreaterThanOrEqual(6);
  expect(day.events.length).toBeGreaterThan(0);
  expect((await post('/api/password', {password:'sign-in-owner'})).json()).toEqual({kind:'owner', dayRunning:true});
  expect((await post('/api/password', {password:day.olympicsPassword})).json()).toEqual({kind:'olympics', pass:signedIn.pass});
});

test('the owner password signs in as scoring team on a running day without touching it', async () => {
  await start();
  const first = await owner();
  const before = (await app.inject({url:'/api/day', headers:auth(first.token)})).json();
  await app.inject({method:'POST', url:'/api/day/events/R4/rename', headers:auth(first.token), payload:{name:'Kept sprint'}});
  const again = await owner('aisha khan', [{id:first.profile.id, secret:first.profile.secret}]);
  expect(again.profile).toEqual({id:first.profile.id, name:'Aisha Khan'});
  const second = await owner('Sam Patel');
  const third = await owner('sam patel');
  expect(third.profile.name).toBe('Sam Patel 2');
  expect((await owner('Sam Patel', [{id:third.profile.id, secret:third.profile.secret}])).profile).toEqual({id:third.profile.id, name:'Sam Patel 2'});
  expect((await owner('Sam Patel')).profile.name).toBe('Sam Patel 3');
  const after = (await app.inject({url:'/api/day', headers:auth(second.token)})).json();
  expect(after).toMatchObject({leadCode:before.leadCode, olympicsPassword:before.olympicsPassword});
  expect(after.events.find((event: {code:string}) => event.code === 'R4').name).toBe('Kept sprint');
  const me = (await app.inject({url:'/api/me', headers:auth(second.token)})).json();
  expect(me).toMatchObject({dayId:again.phone.dayId, level:'Scoring team'});
  expect((await post('/api/owner-sign-in', {password:'wrong', name:'Someone Else', profiles:[]})).statusCode).toBe(403);
});

test('Create profile tidies the name, refuses empty, long and taken names, and signs in as a volunteer', async () => {
  await start();
  const scoring = await owner();
  const pass = await olympicsPass(scoring.token);
  const created = await post('/api/profiles', {pass, name:'  Sam   Patel '});
  expect(created.statusCode).toBe(200);
  const {profile, token} = created.json();
  expect(profile).toMatchObject({id:expect.any(String), name:'Sam Patel', secret:expect.any(String)});
  expect((await app.inject({url:'/api/me', headers:auth(token)})).json()).toMatchObject({name:'Sam Patel', level:'Volunteer', profileId:profile.id});
  for (const name of ['   ', 'x'.repeat(81)]) {
    const refused = await post('/api/profiles', {pass, name});
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toBe('Enter your full name (up to 80 characters)');
  }
  const taken = await post('/api/profiles', {pass, name:'SAM  patel'});
  expect(taken.statusCode).toBe(409);
  expect(taken.json()).toEqual({taken:true, message:"Sam Patel already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial."});
  expect((await post('/api/profiles', {pass, name:'Aisha Khan'})).json().taken).toBe(true);
  const noPass = await post('/api/profiles', {pass:'made-up', name:'Yusuf Ali'});
  expect(noPass.statusCode).toBe(401);
  expect(noPass.json().reason).toBe('password-changed');
});

test('tapping a name proves the profile secret and the password pass and returns a session token', async () => {
  await start();
  const scoring = await owner();
  const pass = await olympicsPass(scoring.token);
  const {profile, token: first} = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  await app.inject({method:'POST', url:'/api/become-lead', headers:auth(first), payload:{code:(await app.inject({url:'/api/day', headers:auth(scoring.token)})).json().leadCode}});
  const signedIn = await post('/api/sign-in', {pass, profileId:profile.id, secret:profile.secret});
  expect(signedIn.statusCode).toBe(200);
  const {token, phone} = signedIn.json();
  expect(token).not.toBe(first);
  expect(phone).toMatchObject({name:'Sam Patel', level:'Lead', profileId:profile.id});
  expect((await app.inject({url:'/api/me', headers:auth(token)})).json()).toMatchObject({id:phone.id, level:'Lead'});
  const wrongSecret = await post('/api/sign-in', {pass, profileId:profile.id, secret:'guess'});
  expect(wrongSecret.statusCode).toBe(401);
  expect(wrongSecret.json().reason).toBe('moved');
  expect((await post('/api/sign-in', {pass:'made-up', profileId:profile.id, secret:profile.secret})).json().reason).toBe('password-changed');
});

test('repeated wrong Olympics or owner passwords from one IP are slowed down', async () => {
  await start();
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  for (let i = 0; i < 5; i++) expect((await post('/api/password', {password:'wrong'}, '192.0.2.1')).statusCode).toBe(403);
  expect((await post('/api/password', {password:'wrong'}, '192.0.2.1')).statusCode).toBe(429);
  expect((await post('/api/password', {password:'sign-in-owner'}, '192.0.2.1')).statusCode).toBe(429);
  expect((await post('/api/owner-sign-in', {password:'sign-in-owner', name:'Aisha Khan', profiles:[]}, '192.0.2.1')).statusCode).toBe(429);
  expect((await post('/api/password', {password:'sign-in-owner'}, '192.0.2.2')).statusCode).toBe(200);
  now += 1000;
  expect((await post('/api/password', {password:'sign-in-owner'}, '192.0.2.1')).statusCode).toBe(200);
});

test('race parts saved by a signed-in profile name its author, and tapping the name again keeps the same sign-in row', async () => {
  await start();
  const scoring = await owner();
  const pass = await olympicsPass(scoring.token);
  await app.inject({method:'POST', url:'/api/day/confirm-events', headers:auth(scoring.token), payload:{}});
  const {profile} = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  const {token, phone} = (await post('/api/sign-in', {pass, profileId:profile.id, secret:profile.secret})).json();
  const setup = raceSetup(app), race = await setup.checkIn(token, 'R4', [2001,2002]);
  await setup.order(token, 'R4', [2001,2002]);
  await setup.times(token, 'R4', [1200,1300]);
  const read = (await app.inject({url:`/api/lead/races/${race.id}`, headers:auth(scoring.token)})).json();
  expect(read.history.filter((save: {part:string}) => save.part === 'times').map((save: {author:string|null}) => save.author)).toEqual([null, 'Sam Patel']);
  expect((await post('/api/sign-in', {pass, profileId:profile.id, secret:profile.secret})).json().phone.id).toBe(phone.id);
});

test('Sign out ends the session, resets today\'s role to Volunteer and leaves Signed in today, with no audit note', async () => {
  await start();
  const scoring = await owner();
  const pass = await olympicsPass(scoring.token);
  const {leadCode} = (await app.inject({url:'/api/day', headers:auth(scoring.token)})).json();
  const {profile, token} = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  await app.inject({method:'POST', url:'/api/become-lead', headers:auth(token), payload:{code:leadCode}});
  const signedOut = await app.inject({method:'POST', url:'/api/sign-out', headers:auth(token), payload:{}});
  expect(signedOut.statusCode).toBe(200);
  const after = await app.inject({url:'/api/me', headers:auth(token)});
  expect(after.statusCode).toBe(401);
  expect(after.json().reason).toBe('signed-out');
  const phones = (await app.inject({url:'/api/day/phones', headers:auth(scoring.token)})).json();
  expect(phones.phones.map((phone: {name:string}) => phone.name)).toEqual(['Aisha Khan']);
  expect(phones.auditNotes.map((note: {action:string}) => note.action)).toEqual(['Became lead']);
  // Tapping the name again signs in as a volunteer: the lead code has to be typed again.
  expect((await post('/api/sign-in', {pass, profileId:profile.id, secret:profile.secret})).json().phone.level).toBe('Volunteer');
  // The scoring team gets back in with the owner password.
  expect((await app.inject({method:'POST', url:'/api/sign-out', headers:auth(scoring.token), payload:{}})).statusCode).toBe(200);
  expect((await app.inject({url:'/api/day', headers:auth(scoring.token)})).json().reason).toBe('signed-out');
  expect((await owner('Aisha Khan', [{id:scoring.profile.id, secret:scoring.profile.secret}])).phone).toMatchObject({level:'Scoring team', profileId:scoring.profile.id});
});

test('every 401 says why: signed-out after Remove or with no session, new-day once the day has changed', async () => {
  await start();
  const scoring = await owner();
  const pass = await olympicsPass(scoring.token);
  const removed = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  const stale = (await post('/api/profiles', {pass, name:'Yusuf Ali'})).json();
  await app.inject({method:'POST', url:`/api/day/phones/${removed.phone.id}/remove`, headers:auth(scoring.token), payload:{}});
  expect((await app.inject({url:'/api/home', headers:auth(removed.token)})).json().reason).toBe('signed-out');
  expect((await app.inject({url:'/api/home'})).json().reason).toBe('signed-out');
  await app.inject({method:'POST', url:'/api/day/export', headers:auth(scoring.token), payload:{}});
  expect((await app.inject({method:'POST', url:'/api/day/start-new', headers:auth(scoring.token), payload:{confirmation:'NEW DAY'}})).statusCode).toBe(200);
  const old = await app.inject({url:'/api/home', headers:auth(stale.token)});
  expect(old.statusCode).toBe(401);
  expect(old.json().reason).toBe('new-day');
});
