import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
// The same production server as the main suite, started as a test build (TEST_BUILD=1) with a known commit.
const webServer=base.webServer as Exclude<typeof base.webServer,unknown[]|undefined>;
export default defineConfig({
  ...base, testDir:'e2e/test-build', testIgnore:[],
  webServer:{...webServer, env:{...webServer.env, TEST_BUILD:'1', RAILWAY_GIT_COMMIT_SHA:'0123456789abcdef0123456789abcdef01234567'}}
});
