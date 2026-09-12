-- Voting Platform MVP schema (SQLite).
-- Invariants that matter are enforced HERE, not in the UI:
--   * a participant's identity is an immutable UUID; display_name is just a label
--   * one vote per (participant, strategy) -- re-voting is an UPDATE, never a new row
--   * scores are constrained to the 1..10 scale
--   * recovery codes are unique across participants

CREATE TABLE IF NOT EXISTS participants (
  -- Immutable internal identity. Never derived from the display name.
  id            TEXT PRIMARY KEY,
  -- Mutable, NOT unique: two people may both call themselves "Alex".
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 40),
  -- Short human-readable resume code. Unique so "resume with code" is unambiguous.
  recovery_code TEXT NOT NULL UNIQUE CHECK (length(recovery_code) = 5),
  joined_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS strategies (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  strategy_id    TEXT    NOT NULL REFERENCES strategies(id)   ON DELETE CASCADE,
  x_score        INTEGER NOT NULL CHECK (x_score BETWEEN 1 AND 10),
  y_score        INTEGER NOT NULL CHECK (y_score BETWEEN 1 AND 10),
  comment        TEXT    NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- The core data-integrity rule of the whole app.
  UNIQUE (participant_id, strategy_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_strategy ON votes (strategy_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Server-side admin sessions. Bearer tokens handed out after a passcode check.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
