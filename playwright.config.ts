import { defineConfig } from '@playwright/test';
import { createServer } from 'node:net';
// A free port the OS picks, so concurrent runs never collide. Workers inherit it through the environment.
const freePort = () => new Promise<string>(resolve => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    server.close(() => resolve(String(port)));
  });
});
const port = process.env.E2E_PORT ||= await freePort();
const baseURL = `http://127.0.0.1:${port}`;
const databaseName = process.env.E2E_DATABASE_NAME || `msf_spec22_${process.pid}_e2e`;
const databaseUrl = new URL(process.env.PG_ADMIN_URL || `postgresql://${process.env.USER}@localhost:5432/postgres`);
databaseUrl.pathname = `/${databaseName}`;
process.env.E2E_BASE_URL = baseURL;
// The web server's database, for test setup no API allows (ownRelay). Workers load this config again with their own
// process id, so they keep the first value.
const testDatabaseUrl = process.env.E2E_TEST_DATABASE_URL ||= process.env.E2E_DATABASE_URL || databaseUrl.href;
export default defineConfig({
  testDir:'e2e', testIgnore:['test-build/**','remote/**'], fullyParallel:false, workers:1,
  globalSetup:'./e2e/setup.ts',
  use:{baseURL, trace:'retain-on-failure'},
  projects:[
    {name:'iPhone',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
    {name:'Android',use:{browserName:'chromium',viewport:{width:360,height:800},isMobile:true,hasTouch:true}},
    {name:'desktop',use:{browserName:'chromium',viewport:{width:1280,height:800}}}
  ],
  webServer:{command:'node scripts/test-db.mjs && npm run build && npm start',url:`${baseURL}/api/health`,reuseExistingServer:false,timeout:120000,
    env:{NODE_ENV:'production',PORT:port,TEST_DATABASE_NAME:databaseName, TEST_DATABASE_URL:testDatabaseUrl, DATABASE_URL:testDatabaseUrl,OWNER_PASSWORD:'e2e-owner-fixture',RESET_TEST_DAY:'1'}}
});
