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
    CREATE TABLE IF NOT EXISTS races (
      id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES olympics_days(id), event_id uuid NOT NULL REFERENCES events(id),
      kind text NOT NULL CHECK (kind IN ('heat','final','race')), number integer NOT NULL,
      checked_in_at timestamptz NOT NULL DEFAULT now(), deleted boolean NOT NULL DEFAULT false,
      delete_reason text, request_id text, original_runners jsonb,
      UNIQUE(event_id,kind,number), UNIQUE(day_id,request_id)
    );
    CREATE TABLE IF NOT EXISTS race_counters (
      event_id uuid NOT NULL REFERENCES events(id), kind text NOT NULL, last_number integer NOT NULL,
      PRIMARY KEY(event_id,kind)
    );
    CREATE TABLE IF NOT EXISTS race_parts (
      race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      part text NOT NULL CHECK (part IN ('runners','finish','times')), version integer NOT NULL DEFAULT 0,
      value jsonb, saved_at timestamptz, saved_by uuid REFERENCES phones(id),
      PRIMARY KEY(race_id,part)
    );
    CREATE TABLE IF NOT EXISTS race_part_history (
      race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      part text NOT NULL CHECK (part IN ('runners','finish','times')), version integer NOT NULL,
      value jsonb, runners jsonb NOT NULL, PRIMARY KEY(race_id,part,version)
    );
    CREATE TABLE IF NOT EXISTS race_part_saves (
      id uuid PRIMARY KEY, sequence_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      part text NOT NULL CHECK (part IN ('runners','finish','times')),
      base_version integer NOT NULL, version integer NOT NULL,
      author_name text, saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      value jsonb, runners jsonb NOT NULL, active boolean NOT NULL DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS race_part_candidates ON race_part_saves(race_id,part) WHERE active;
    CREATE TABLE IF NOT EXISTS runner_rulings (
      race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      entry_id text NOT NULL, disqualification jsonb,
      PRIMARY KEY(race_id,entry_id)
    );
    ALTER TABLE runner_rulings ADD COLUMN IF NOT EXISTS warning_checks jsonb NOT NULL DEFAULT '[]';
    ALTER TABLE runner_rulings ADD COLUMN IF NOT EXISTS not_counted boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS audit_notes (
      id uuid PRIMARY KEY, sequence_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      day_id uuid NOT NULL REFERENCES olympics_days(id), event_id uuid REFERENCES events(id),
      action text NOT NULL, actor_name text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      message text NOT NULL, comment text, touches jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS event_audit_order ON audit_notes(event_id,sequence_number DESC);
    CREATE TABLE IF NOT EXISTS tie_settlements (
      event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      tie_id text NOT NULL, settlement jsonb NOT NULL,
      PRIMARY KEY(event_id,tie_id)
    );
  `);
  if (resetTestDay) await pool.query('TRUNCATE phones, olympics_days CASCADE');
  return pool;
}
