import { afterEach, expect, test } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';
let app: FastifyInstance;
afterEach(async () => { await app?.close(); });
test('logging on writes one JSON line per request without tokens, codes or the owner password', async () => {
  let output = '';
  const logTo = new Writable({write(chunk, _encoding, done) { output += chunk; done(); }});
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/${process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test'}`, ownerPassword: 'test-owner-fixture', resetTestDay: true, logTo});
  const owner = (await app.inject({method:'POST', url:'/api/join', payload:{code:'test-owner-fixture', name:'Aisha'}})).json();
  const day = (await app.inject({url:'/api/day', headers:{authorization:`Bearer ${owner.token}`}})).json();
  const volunteer = (await app.inject({method:'POST', url:'/api/join', payload:{code:day.dayCode, name:'Ahmed'}})).json();
  await app.inject({method:'POST', url:'/api/become-lead', headers:{authorization:`Bearer ${volunteer.token}`}, payload:{code:day.leadCode}});
  const lines = output.trim().split('\n').map(line => JSON.parse(line));
  expect(lines).toContainEqual(expect.objectContaining({req:expect.objectContaining({method:'GET', url:'/api/day'})}));
  expect(lines).toContainEqual(expect.objectContaining({res:{statusCode:200}, responseTime:expect.any(Number)}));
  for (const secret of [owner.token, volunteer.token, day.dayCode, day.leadCode, 'test-owner-fixture']) expect(output).not.toContain(secret);
});
