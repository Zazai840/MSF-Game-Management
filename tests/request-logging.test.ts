import { afterEach, expect, test } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import type { FastifyInstance } from 'fastify';
let app: FastifyInstance;
afterEach(async () => { await app?.close(); });
test('logging on writes one JSON line per request without tokens, codes or the owner password', async () => {
  let output = '';
  const logTo = new Writable({write(chunk, _encoding, done) { output += chunk; done(); }});
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL!, ownerPassword: 'test-owner-fixture', resetTestDay: true, logTo});
  const {owner, day, pass, lead} = await signInOwner(app, 'test-owner-fixture');
  const volunteer = await lead('Ahmed');
  const lines = output.trim().split('\n').map(line => JSON.parse(line));
  expect(lines).toContainEqual(expect.objectContaining({req:expect.objectContaining({method:'GET', url:'/api/day', remoteAddress:'127.0.0.1'})}));
  expect(lines).toContainEqual(expect.objectContaining({res:{statusCode:200}, responseTime:expect.any(Number)}));
  for (const secret of [owner.token, volunteer.token, volunteer.profile.secret!, pass, day.olympicsPassword, day.leadCode, 'test-owner-fixture']) expect(output).not.toContain(secret);
});
