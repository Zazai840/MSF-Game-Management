import pg from 'pg';
export async function openDatabase(databaseUrl: string, resetTestDay = false) {
  const pool = new pg.Pool({connectionString: databaseUrl});
  if (resetTestDay && !/^msf_spec22_\d+_(test|e2e)$/.test(new URL(databaseUrl).pathname.slice(1))) {
    await pool.end();
    throw new Error('Refusing to reset a non-test database');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS olympics_days (
      id uuid PRIMARY KEY, lead_code text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_day ON olympics_days(active) WHERE active;
    -- Olympics settings: one row, made when the owner starts the first day and kept by Start new day.
    CREATE TABLE IF NOT EXISTS olympics_settings (
      id boolean PRIMARY KEY DEFAULT true CHECK (id), password text NOT NULL, password_version integer NOT NULL DEFAULT 1
    );
    -- Profiles last all of 2026: never renamed or deleted. The name is stored tidied, so lower(name) is its unique form.
    CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY, name text NOT NULL, secret_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS profile_name ON profiles(lower(name));
    -- One row per profile per Olympics day; the name is the profile's (profiles are never renamed).
    CREATE TABLE IF NOT EXISTS sign_ins (
      id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES olympics_days(id), profile_id uuid NOT NULL REFERENCES profiles(id),
      name text NOT NULL, level text NOT NULL CHECK (level IN ('Volunteer','Lead','Scoring team')),
      owner boolean NOT NULL DEFAULT false, token_hash text NOT NULL UNIQUE, signed_out boolean NOT NULL DEFAULT false,
      signed_in_at timestamptz NOT NULL DEFAULT now(), password_version integer NOT NULL DEFAULT 1, UNIQUE(day_id, profile_id)
    );
    -- That's me: a phone asks for a profile back. Approving gives the profile the waiting secret, so only that phone holds it;
    -- the old phone's session token is kept so its next request is told the profile moved.
    CREATE TABLE IF NOT EXISTS profile_requests (
      id uuid PRIMARY KEY, day_id uuid NOT NULL REFERENCES olympics_days(id), profile_id uuid NOT NULL REFERENCES profiles(id),
      secret_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','declined','cancelled')),
      moved_token_hash text, created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE olympics_days ADD COLUMN IF NOT EXISTS events_confirmed boolean NOT NULL DEFAULT false;
    ALTER TABLE olympics_days ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
    ALTER TABLE olympics_days ADD COLUMN IF NOT EXISTS exported_at timestamptz;
    ALTER TABLE olympics_days ADD COLUMN IF NOT EXISTS exported_revision bigint;
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
    CREATE TABLE IF NOT EXISTS race_finals (
      race_id uuid PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE, entries jsonb NOT NULL, presence_confirmed boolean NOT NULL DEFAULT false
    );
    ALTER TABLE race_finals ADD COLUMN IF NOT EXISTS generation text NOT NULL DEFAULT '';
    ALTER TABLE race_finals ADD COLUMN IF NOT EXISTS additional_entries jsonb NOT NULL DEFAULT '[]';
    CREATE TABLE IF NOT EXISTS race_counters (
      event_id uuid NOT NULL REFERENCES events(id), kind text NOT NULL, last_number integer NOT NULL,
      PRIMARY KEY(event_id,kind)
    );
    CREATE TABLE IF NOT EXISTS race_parts (
      race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      part text NOT NULL CHECK (part IN ('runners','finish','times')), version integer NOT NULL DEFAULT 0,
      value jsonb, saved_at timestamptz, saved_by uuid REFERENCES sign_ins(id),
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
      value jsonb, runners jsonb NOT NULL, before_runners jsonb NOT NULL, active boolean NOT NULL DEFAULT true
    );
    ALTER TABLE race_part_saves ADD COLUMN IF NOT EXISTS before_runners jsonb NOT NULL DEFAULT '[]';
    CREATE INDEX IF NOT EXISTS race_part_candidates ON race_part_saves(race_id,part) WHERE active;
    CREATE TABLE IF NOT EXISTS runner_rulings (
      race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      entry_id text NOT NULL, disqualification jsonb,
      PRIMARY KEY(race_id,entry_id)
    );
    ALTER TABLE runner_rulings ADD COLUMN IF NOT EXISTS warning_checks jsonb NOT NULL DEFAULT '[]';
    ALTER TABLE runner_rulings ADD COLUMN IF NOT EXISTS not_counted boolean NOT NULL DEFAULT false;
    ALTER TABLE runner_rulings ADD COLUMN IF NOT EXISTS added_at_finish_checked boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS audit_notes (
      id uuid PRIMARY KEY, sequence_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      day_id uuid NOT NULL REFERENCES olympics_days(id), event_id uuid REFERENCES events(id),
      action text NOT NULL, actor_name text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      message text NOT NULL, comment text, touches jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS event_audit_order ON audit_notes(event_id,sequence_number DESC);
    CREATE TABLE IF NOT EXISTS event_stages (
      event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, stage text NOT NULL,
      PRIMARY KEY(event_id,stage)
    );
    CREATE TABLE IF NOT EXISTS tie_settlements (
      event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      tie_id text NOT NULL, settlement jsonb NOT NULL,
      PRIMARY KEY(event_id,tie_id)
    );
  `);
  if (resetTestDay) await pool.query('TRUNCATE sign_ins, olympics_days, profiles, olympics_settings CASCADE');
  return pool;
}
