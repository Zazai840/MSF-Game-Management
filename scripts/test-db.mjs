import pg from 'pg';
const url = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : undefined;
const database = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test';
if (!/^msf_spec22_\d+_(test|e2e)$/.test(database)) throw new Error('Use a ticket-isolated test database name');
if (url) url.pathname = '/postgres';
const admin = new pg.Client({connectionString: process.env.PG_ADMIN_URL || url?.href || `postgresql://${process.env.USER}@localhost:5432/postgres`});
await admin.connect();
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`);
await admin.end();
