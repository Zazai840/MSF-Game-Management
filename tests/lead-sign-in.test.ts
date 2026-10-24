import { afterEach, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app: FastifyInstance;
const post = (url: string, payload: object, remoteAddress?: string, headers?: object) => app.inject({method:'POST', url, payload, remoteAddress, headers:headers as never});
const auth = (token: string) => ({authorization:`Bearer ${token}`});
const me = async (token: string) => (await app.inject({url:'/api/me', headers:auth(token)})).json();
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); });
/** A running day with the owner signed in as scoring team, and the Olympics password pass and lead code a phone would have. */
async function start() {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL!, ownerPassword: 'lead-sign-in-owner', resetTestDay: true});
  const {owner, pass, day} = await signInOwner(app, 'lead-sign-in-owner', 'Aisha Khan');
  return {scoring:owner, pass, leadCode: day.leadCode as string};
}
const held = (...profiles: {id:string; secret?:string}[]) => profiles.map(({id, secret}) => ({id, secret}));

test('Lead sign-in signs in this phone\'s profile, creates an unused name, and numbers a name taken on another phone', async () => {
  const {pass, leadCode} = await start();
  const mine = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  const own = await post('/api/lead-sign-in', {pass, name:'  sam   PATEL ', code:leadCode, profiles:held(mine.profile)});
  expect(own.statusCode).toBe(200);
  expect(own.json().profile).toEqual({id:mine.profile.id, name:'Sam Patel'});
  expect(await me(own.json().token)).toMatchObject({name:'Sam Patel', level:'Lead', profileId:mine.profile.id});

  const fresh = (await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:[]})).json();
  expect(fresh.profile).toMatchObject({name:'Yusuf Ali', secret:expect.any(String)});
  expect(await me(fresh.token)).toMatchObject({name:'Yusuf Ali', level:'Lead'});

  const second = (await post('/api/lead-sign-in', {pass, name:'Sam Patel', code:leadCode, profiles:held(fresh.profile)})).json();
  expect(second.profile).toMatchObject({name:'Sam Patel 2', secret:expect.any(String)});
  expect(await me(second.token)).toMatchObject({name:'Sam Patel 2', level:'Lead'});
  expect((await post('/api/lead-sign-in', {pass, name:'sam patel', code:leadCode, profiles:[]})).json().profile.name).toBe('Sam Patel 3');
  // The old profile is untouched: its own phone still signs it in, and the lowest free number is reused.
  expect((await post('/api/sign-in', {pass, profileId:mine.profile.id, secret:mine.profile.secret})).json().phone).toMatchObject({name:'Sam Patel', level:'Lead'});
  expect((await post('/api/lead-sign-in', {pass, name:'Sam Patel 2', code:leadCode, profiles:held(second.profile)})).json().profile).toEqual({id:second.profile.id, name:'Sam Patel 2'});
});

test('Lead sign-in never lowers the scoring team and needs the password pass and a full name', async () => {
  const {scoring, pass, leadCode} = await start();
  const signedIn = (await post('/api/lead-sign-in', {pass, name:'Aisha Khan', code:leadCode, profiles:held(scoring.profile)})).json();
  expect(await me(signedIn.token)).toMatchObject({name:'Aisha Khan', level:'Scoring team'});
  const noPass = await post('/api/lead-sign-in', {pass:'made-up', name:'Yusuf Ali', code:leadCode, profiles:[]});
  expect(noPass.statusCode).toBe(401);
  expect(noPass.json().reason).toBe('password-changed');
  expect((await post('/api/lead-sign-in', {pass, name:'   ', code:leadCode, profiles:[]})).statusCode).toBe(400);
});

test('a wrong lead code is refused plainly and repeated tries are slowed down per phone and per IP', async () => {
  const {pass, leadCode} = await start();
  const mine = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  const wrong = await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:'WRONG1', profiles:[]});
  expect(wrong.statusCode).toBe(403);
  expect(wrong.json().message).toBe("That is not today's lead code. Ask a lead for it.");
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  for (let i = 0; i < 5; i++) expect((await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:'WRONG1', profiles:held(mine.profile)}, '192.0.2.1')).statusCode).toBe(403);
  expect((await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:'WRONG1', profiles:held(mine.profile)}, '192.0.2.1')).statusCode).toBe(429);
  expect((await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:[]}, '192.0.2.1')).statusCode).toBe(429);
  // The same phone from another IP is still slowed down; another phone from another IP is not.
  expect((await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:held(mine.profile)}, '192.0.2.2')).statusCode).toBe(429);
  expect((await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:[]}, '192.0.2.2')).statusCode).toBe(200);
  now += 1000;
  expect((await post('/api/lead-sign-in', {pass, name:'Sam Patel', code:leadCode, profiles:held(mine.profile)}, '192.0.2.1')).statusCode).toBe(200);
});

test('a new lead code turns Lead sign-in leads back into volunteers, except whoever made it', async () => {
  const {scoring, pass, leadCode} = await start();
  const lead = (await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:[]})).json();
  await post('/api/day/lead-code', {}, undefined, auth(scoring.token));
  expect(await me(lead.token)).toMatchObject({level:'Volunteer'});
  expect(await me(scoring.token)).toMatchObject({level:'Scoring team'});
  expect((await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:held(lead.profile)})).statusCode).toBe(403);
});

test('profiles on this phone show today\'s role, none on a new day, and which were moved away', async () => {
  const {scoring, pass, leadCode} = await start();
  const volunteer = (await post('/api/profiles', {pass, name:'Sam Patel'})).json();
  const lead = (await post('/api/lead-sign-in', {pass, name:'Yusuf Ali', code:leadCode, profiles:[]})).json();
  const unused = {id:'00000000-0000-4000-8000-000000000000', secret:'guess'};
  const read = await post('/api/phone-profiles', {pass, profiles:held(volunteer.profile, lead.profile, scoring.profile, unused)});
  expect(read.statusCode).toBe(200);
  expect(read.json()).toEqual({profiles:[
    {id:volunteer.profile.id, level:'Volunteer'}, {id:lead.profile.id, level:'Lead'}, {id:scoring.profile.id, level:'Scoring team'}, {id:unused.id, moved:true}
  ]});
  expect((await post('/api/phone-profiles', {pass:'made-up', profiles:[]})).json().reason).toBe('password-changed');
  await app.inject({method:'POST', url:'/api/day/export', headers:auth(scoring.token), payload:{}});
  const reset = await post('/api/day/start-new', {confirmation:'NEW DAY'}, undefined, auth(scoring.token));
  expect(reset.statusCode, reset.body).toBe(200);
  expect((await post('/api/phone-profiles', {pass, profiles:held(volunteer.profile, lead.profile)})).json()).toEqual({profiles:[
    {id:volunteer.profile.id, level:null}, {id:lead.profile.id, level:null}
  ]});
});
