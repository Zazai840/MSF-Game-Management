import { afterEach, expect, test } from 'vitest';
import { createApp, type AppSettings } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';
let app: FastifyInstance;
afterEach(async () => { await app?.close(); });
async function health(extra: Partial<AppSettings>) {
  app = await createApp({databaseUrl: process.env.TEST_DATABASE_URL!, ownerPassword: 'test-owner-fixture', ...extra});
  const response = await app.inject({url:'/api/health'});
  expect(response.statusCode).toBe(200);
  return response.json();
}
const reportUrl = 'https://github.com/Zazai840/MSF-Game-Management/issues/new?template=tester-bug.yml';
test('a test build tells the client its commit and where to report a bug', async () => {
  expect(await health({testBuild:{commit:'0123456789abcdef0123456789abcdef01234567'}})).toEqual({ok:true, testBuild:{commit:'0123456789abcdef0123456789abcdef01234567', reportUrl}});
});
test('a test build without a known commit says so readably', async () => {
  expect(await health({testBuild:{}})).toEqual({ok:true, testBuild:{commit:'unknown', reportUrl}});
});
test('without the test build setting the client gets neither the commit nor the bug-report address', async () => {
  expect(await health({})).toEqual({ok:true});
});
