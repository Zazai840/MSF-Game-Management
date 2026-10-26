import { afterEach,expect,test } from 'vitest';
import type pg from 'pg';
import { openDatabase } from '../src/server/storage.js';
let pool:pg.Pool;
afterEach(async()=>{await pool?.end();});

test('the server keeps answering when Postgres drops an idle connection (a restart or maintenance), instead of crashing',async()=>{
  pool=await openDatabase(process.env.TEST_DATABASE_URL!);
  const {rows:[{pid}]}=await pool.query('SELECT pg_backend_pid() AS pid');
  // A second pool, since the first can't end its own idle connection.
  const admin=await openDatabase(process.env.TEST_DATABASE_URL!);
  await admin.query('SELECT pg_terminate_backend($1)',[pid]);
  await admin.end();
  await new Promise(resolve=>setTimeout(resolve,200));
  expect((await pool.query('SELECT 1 AS answer')).rows).toEqual([{answer:1}]);
});
