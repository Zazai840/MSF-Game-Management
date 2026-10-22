import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
const run = promisify(execFile);
const adminUrl = process.env.PG_ADMIN_URL || `postgresql://${process.env.USER}@localhost:5432/postgres`;
const name = `msf_spec22_${Date.now()}_e2e`;
const databaseUrl = Object.assign(new URL(adminUrl), {pathname:`/${name}`}).href;
const admin = async (sql: string) => { const client = new pg.Client({connectionString:adminUrl}); await client.connect(); try { await client.query(sql); } finally { await client.end(); } };
afterEach(() => admin(`DROP DATABASE IF EXISTS "${name}"`));
test('a test database left by an older branch under a reused pid is made fresh, so the owner can sign in', async () => {
  await admin(`CREATE DATABASE "${name}"`);
  const stale = new pg.Client({connectionString:databaseUrl});
  await stale.connect();
  // The removed day code was a NOT NULL column; CREATE TABLE IF NOT EXISTS keeps it, so starting the first day failed with a 500.
  await stale.query('CREATE TABLE olympics_days (id uuid PRIMARY KEY, day_code text NOT NULL, lead_code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true)');
  await stale.end();
  const {TEST_DATABASE_URL: _, ...env} = process.env;
  await run(process.execPath, ['scripts/test-db.mjs'], {env:{...env, TEST_DATABASE_NAME:name}});
  const app = await createApp({databaseUrl, ownerPassword:'test-owner-fixture', resetTestDay:true});
  try {
    const signIn = await app.inject({method:'POST', url:'/api/owner-sign-in', payload:{password:'test-owner-fixture', name:'E2E Scoring', profiles:[]}});
    expect(signIn.statusCode).toBe(200);
  } finally { await app.close(); }
});
