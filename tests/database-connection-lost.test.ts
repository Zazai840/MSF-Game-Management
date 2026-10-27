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
  let onError!:()=>void;
  let timeout!:ReturnType<typeof setTimeout>;
  const connectionLost=new Promise<void>((resolve,reject)=>{
    onError=()=>resolve();
    pool.on('error',onError);
    timeout=setTimeout(()=>reject(new Error('Timed out waiting for the pool error event')),2000);
  });
  try {
    await Promise.all([admin.query('SELECT pg_terminate_backend($1)',[pid]),connectionLost]);
  } finally {
    clearTimeout(timeout);
    pool.off('error',onError);
    await admin.end();
  }
  expect((await pool.query('SELECT 1 AS answer')).rows).toEqual([{answer:1}]);
});
