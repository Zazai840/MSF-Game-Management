import { spawn } from 'node:child_process';
import pg from 'pg';
const generated = !process.env.TEST_DATABASE_URL && !process.env.TEST_DATABASE_NAME;
const databaseName = process.env.TEST_DATABASE_NAME || `msf_spec22_${process.pid}_test`;
const adminUrl = new URL(process.env.PG_ADMIN_URL || `postgresql://${process.env.USER}@localhost:5432/postgres`);
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${databaseName}`;
const env = {...process.env, TEST_DATABASE_NAME:databaseName, TEST_DATABASE_URL:process.env.TEST_DATABASE_URL || testUrl.href};
async function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {env, stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',code => resolve(code ?? 1));
  });
}
let code = await run('scripts/test-db.mjs');
if (code === 0) code = await run('node_modules/vitest/vitest.mjs', ['run', ...process.argv.slice(2)]);
if (generated) {
  const admin = new pg.Client({connectionString:adminUrl.href});
  try {
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally { await admin.end(); }
}
process.exitCode = code;
