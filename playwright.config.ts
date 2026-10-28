import { defineConfig } from '@playwright/test';
import { readdirSync,rmSync } from 'node:fs';
import { createServer } from 'node:net';
// A free port the OS picks, so concurrent runs never collide. Workers inherit it through the environment.
const freePort = () => new Promise<string>(resolve => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    server.close(() => resolve(String(port)));
  });
});
const port = process.env.E2E_PORT ||= await freePort();
// Each run builds the app and writes its results into folders of its own, so two runs at once never rebuild or clear
// under each other. Workers keep the first value. The main process clears the folders of runs that have ended.
const run = process.env.E2E_RUN ||= String(process.pid);
const dist = process.env.DIST_DIR ||= `dist-e2e/${run}`;
const running = (pid:number) => {try {process.kill(pid,0);return true;} catch {return false;}};
if (!process.env.TEST_WORKER_INDEX) for (const root of ['dist-e2e','test-results']) {
  for (const old of (()=>{try {return readdirSync(root);} catch {return [];}})()) if (/^\d+$/.test(old) && !running(Number(old))) rmSync(`${root}/${old}`,{recursive:true,force:true});
}
const baseURL = `http://127.0.0.1:${port}`;
const databaseName = process.env.E2E_DATABASE_NAME || `msf_spec22_${process.pid}_e2e`;
const databaseUrl = new URL(process.env.PG_ADMIN_URL || `postgresql://${process.env.USER}@localhost:5432/postgres`);
databaseUrl.pathname = `/${databaseName}`;
process.env.E2E_BASE_URL = baseURL;
// The web server's database, for test setup no API allows (ownRelay). Workers load this config again with their own
// process id, so they keep the first value.
const testDatabaseUrl = process.env.E2E_TEST_DATABASE_URL ||= process.env.E2E_DATABASE_URL || databaseUrl.href;
export default defineConfig({
  testDir:'e2e', testIgnore:['test-build/**','remote/**'], fullyParallel:false, workers:1, outputDir:`test-results/${run}`,
  globalSetup:'./e2e/setup.ts',
  use:{baseURL, trace:'retain-on-failure'},
  projects:[
    {name:'iPhone',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
    {name:'Android',use:{browserName:'chromium',viewport:{width:360,height:800},isMobile:true,hasTouch:true}},
    {name:'desktop',use:{browserName:'chromium',viewport:{width:1280,height:800}}}
  ],
  webServer:{command:`node scripts/test-db.mjs && npm run build && node ${dist}/server/server/main.js`,url:`${baseURL}/api/health`,reuseExistingServer:false,timeout:120000,
    env:{NODE_ENV:'production',PORT:port,DIST_DIR:dist,TEST_DATABASE_NAME:databaseName, TEST_DATABASE_URL:testDatabaseUrl, DATABASE_URL:testDatabaseUrl,OWNER_PASSWORD:'e2e-owner-fixture',RESET_TEST_DAY:'1'}}
});
