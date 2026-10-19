import pg from 'pg';
const url = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : undefined;
const database = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.TEST_DATABASE_NAME || 'msf_spec22_23_test';
if (!/^msf_spec22_\d+_(test|e2e)$/.test(database)) throw new Error('Use a ticket-isolated test database name');
if (url) url.pathname = '/postgres';
const admin = new pg.Client({connectionString: process.env.PG_ADMIN_URL || url?.href || `postgresql://${process.env.USER}@localhost:5432/postgres`});
await admin.connect();
// Names come from process ids, which get reused: a database an older branch left behind can carry columns this schema removed, so start fresh.
await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
await admin.query(`CREATE DATABASE "${database}"`);
await admin.end();
