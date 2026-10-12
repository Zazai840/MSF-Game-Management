import pg from 'pg';
export async function openDatabase(databaseUrl: string, resetTestDay = false) {
  const pool = new pg.Pool({connectionString: databaseUrl});
  if (resetTestDay && !/^msf_spec22_\d+_(test|e2e)$/.test(new URL(databaseUrl).pathname.slice(1))) {
    await pool.end();
    throw new Error('Refusing to reset a non-test database');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS olympics_days (
      id uuid PRIMARY KEY, day_code text NOT NULL, lead_code text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_day ON olympics_days(active) WHERE active;
    CREATE TABLE IF NOT EXISTS phones (
      id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES olympics_days(id),
      name text NOT NULL, level text NOT NULL CHECK (level IN ('Volunteer','Lead','Scoring team')),
      token_hash text NOT NULL UNIQUE, removed boolean NOT NULL DEFAULT false,
      joined_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS joined_name ON phones(day_id, lower(name)) WHERE NOT removed;
    ALTER TABLE olympics_days ADD COLUMN IF NOT EXISTS events_confirmed boolean NOT NULL DEFAULT false;
    ALTER TABLE olympics_days ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS events (
      id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES olympics_days(id),
      code text NOT NULL, name text NOT NULL,
      section text NOT NULL CHECK (section IN ('Boy Beavers','Girl Beavers','Boy Cubs','Girl Cubs','Boy Scouts','Girl Scouts')),
      format text NOT NULL CHECK (format IN ('heats','timed')),
      enabled boolean NOT NULL DEFAULT true, programme_order integer NOT NULL,
      UNIQUE(day_id,code)
    );
  `);
  if (resetTestDay) await pool.query('TRUNCATE phones, olympics_days CASCADE');
  return pool;
}
