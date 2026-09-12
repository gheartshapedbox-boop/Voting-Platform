-- One dialect (PostgreSQL) for every environment: PGlite locally and in tests,
-- a real Postgres on Vercel. Every invariant that matters is a constraint here,
-- so a bug in a route or the client cannot corrupt the data.

CREATE TABLE IF NOT EXISTS voting_sessions (
  id          text PRIMARY KEY,
  name        text        NOT NULL,
  -- OPEN: participants may create and change responses. LOCKED: they may not.
  status      text        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id            text PRIMARY KEY,                  -- immutable internal identity (UUID)
  session_id    text        NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  display_name  text        NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 40),
  recovery_code text        NOT NULL UNIQUE,       -- short human-readable resume code
  joined_at     timestamptz NOT NULL DEFAULT now()
);
-- Deliberately NOT unique on display_name: two people may both be "Alex" and
-- stay distinct participants. The UUID is the identity, the name is a label.

CREATE TABLE IF NOT EXISTS strategies (
  id          text PRIMARY KEY,
  session_id  text        NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  description text        NOT NULL DEFAULT '',
  sort_order  integer     NOT NULL DEFAULT 0,
  -- Archiving is a soft delete. Responses are never destroyed with the strategy.
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS responses (
  id             text PRIMARY KEY,
  session_id     text        NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  participant_id text        NOT NULL REFERENCES participants(id)    ON DELETE CASCADE,
  strategy_id    text        NOT NULL REFERENCES strategies(id)      ON DELETE CASCADE,
  kind           text        NOT NULL CHECK (kind IN ('RATED', 'NOT_SURE')),
  benefit        integer     CHECK (benefit BETWEEN 1 AND 5),
  effort         integer     CHECK (effort  BETWEEN 1 AND 5),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- A participant has at most ONE current response per strategy per session.
  -- Re-voting is an upsert onto this key, so a double submit cannot fan out.
  CONSTRAINT responses_one_per_participant_per_strategy
    UNIQUE (session_id, participant_id, strategy_id),

  -- A NOT_SURE row can never carry a leftover score, and a RATED row can never
  -- be missing one. This is what makes RATED -> NOT_SURE correct at the data
  -- layer instead of depending on aggregate code remembering to skip it.
  CONSTRAINT responses_shape CHECK (
       (kind = 'RATED'    AND benefit IS NOT NULL AND effort IS NOT NULL)
    OR (kind = 'NOT_SURE' AND benefit IS NULL     AND effort IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS responses_strategy_idx    ON responses (strategy_id);
CREATE INDEX IF NOT EXISTS responses_participant_idx ON responses (participant_id);
CREATE INDEX IF NOT EXISTS strategies_session_idx    ON strategies (session_id);
