import { execFileSync } from 'node:child_process';
import pg from 'pg';
/**
 * Playwright stops the web server only after global teardown, so dropping its database first would cut its open
 * connections and log "Database connection lost". This run's server (named by its own build folder) is stopped first,
 * as SIGTERM stops it, and teardown waits until it no longer answers.
 */
async function stopWebServer() {
  try {execFileSync('pkill',['-TERM','-f',`${process.env.DIST_DIR}/server/server/main.js`]);} catch {return;}
  for(let tries=0;tries<50;tries++) {
    try {await fetch(`${process.env.E2E_BASE_URL}/api/health`);} catch {return;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
/** Drops the run's database when the config named it, as npm test does, so runs don't leave one behind each. */
export default async function teardown() {
  if (!process.env.E2E_DROP_DATABASE) return;
  await stopWebServer();
  const url = new URL(process.env.E2E_TEST_DATABASE_URL!);
  const database = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new pg.Client({connectionString:process.env.PG_ADMIN_URL || url.href});
  await admin.connect();
  // FORCE still, for any connection a worker left open.
  try { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); } finally { await admin.end(); }
}
