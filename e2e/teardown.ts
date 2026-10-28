import pg from 'pg';
/** Drops the run's database when the config named it, as npm test does, so runs don't leave one behind each. */
export default async function teardown() {
  if (!process.env.E2E_DROP_DATABASE) return;
  const url = new URL(process.env.E2E_TEST_DATABASE_URL!);
  const database = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new pg.Client({connectionString:process.env.PG_ADMIN_URL || url.href});
  await admin.connect();
  // The web server stops after global teardown, so its connections are still open.
  try { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); } finally { await admin.end(); }
}
