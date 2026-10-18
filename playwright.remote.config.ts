import { defineConfig } from '@playwright/test';
// The remote smoke check against a deployed test build: no local server, no global setup, no test database.
export default defineConfig({
  testDir:'e2e/remote', workers:1, retries:0,
  use:{baseURL:process.env.REMOTE_BASE_URL, trace:'retain-on-failure'},
  projects:[{name:'iPhone',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]
});
