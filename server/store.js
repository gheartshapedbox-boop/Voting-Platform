import { randomUUID } from 'node:crypto';
import { generateRecoveryCode, newParticipantId } from './domain/identity.js';

/**
 * All SQL lives here. Every function takes the db handle first so routes and
 * tests can share one implementation against different databases.
 */

const isUniqueViolation = (err) =>
  typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');

/* ------------------------------- participants ---------------------------- */

const participantColumns = `
  id, display_name AS displayName, recovery_code AS recoveryCode,
  joined_at AS joinedAt, last_seen_at AS lastSeenAt`;

export function getParticipant(db, id) {
  return db.prepare(`SELECT ${participantColumns} FROM participants WHERE id = ?`).get(id);
}

export function getParticipantByCode(db, code) {
  return db
    .prepare(`SELECT ${participantColumns} FROM participants WHERE recovery_code = ?`)
    .get(code);
}

/**
 * Creates a brand-new identity. The UUID is the identity; the display name is
 * only a label, so we never look for an existing row by name.
 */
export function createParticipant(db, displayName) {
  const insert = db.prepare(
    'INSERT INTO participants (id, display_name, recovery_code) VALUES (?, ?, ?)',
  );
  // Recovery codes are short, so a collision is unlikely but not impossible.
  // The UNIQUE constraint is what actually guarantees uniqueness; we just retry.
  for (let attempt = 0; attempt < 12; attempt++) {
    const id = newParticipantId();
    const code = generateRecoveryCode();
    try {
      insert.run(id, displayName, code);
      return getParticipant(db, id);
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a unique recovery code');
}

/** Renaming changes the label only -- the identity (and therefore votes) stays. */
export function renameParticipant(db, id, displayName) {
  db.prepare('UPDATE participants SET display_name = ? WHERE id = ?').run(displayName, id);
  return getParticipant(db, id);
}

export function touchParticipant(db, id) {
  db.prepare(
    "UPDATE participants SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(id);
}

export function deleteParticipant(db, id) {
  return db.prepare('DELETE FROM participants WHERE id = ?').run(id).changes > 0;
}

/** Admin roster: identity, label, join time and progress in one query. */
export function listParticipantsWithProgress(db) {
  return db
    .prepare(
      `SELECT p.id,
              p.display_name  AS displayName,
              p.recovery_code AS recoveryCode,
              p.joined_at     AS joinedAt,
              p.last_seen_at  AS lastSeenAt,
              COUNT(v.id)     AS votesCast
         FROM participants p
         LEFT JOIN votes v ON v.participant_id = p.id
        GROUP BY p.id
        ORDER BY p.joined_at ASC`,
    )
    .all();
}

/* -------------------------------- strategies ----------------------------- */

const strategyColumns = 'id, title, description, position, archived, created_at AS createdAt';

export function listStrategies(db, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived = 0';
  return db
    .prepare(`SELECT ${strategyColumns} FROM strategies ${where} ORDER BY position ASC, created_at ASC`)
    .all();
}

export function getStrategy(db, id) {
  return db.prepare(`SELECT ${strategyColumns} FROM strategies WHERE id = ?`).get(id);
}

export function createStrategy(db, { title, description = '' }) {
  const id = randomUUID();
  const nextPosition =
    (db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM strategies').get().m ?? 0) + 1;
  db.prepare(
    'INSERT INTO strategies (id, title, description, position) VALUES (?, ?, ?, ?)',
  ).run(id, title, description, nextPosition);
  return getStrategy(db, id);
}

export function updateStrategy(db, id, patch) {
  const current = getStrategy(db, id);
  if (!current) return null;
  const next = {
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    position: patch.position ?? current.position,
    archived: patch.archived === undefined ? current.archived : patch.archived ? 1 : 0,
  };
  db.prepare(
    'UPDATE strategies SET title = ?, description = ?, position = ?, archived = ? WHERE id = ?',
  ).run(next.title, next.description, next.position, next.archived, id);
  return getStrategy(db, id);
}

/** Hard delete. Votes go with it via ON DELETE CASCADE. */
export function deleteStrategy(db, id) {
  return db.prepare('DELETE FROM strategies WHERE id = ?').run(id).changes > 0;
}

/* ----------------------------------- votes -------------------------------- */

export function listVotes(db) {
  return db
    .prepare('SELECT participant_id, strategy_id, x_score, y_score, comment FROM votes')
    .all();
}

export function listVotesForParticipant(db, participantId) {
  return db
    .prepare(
      `SELECT strategy_id AS strategyId, x_score AS x, y_score AS y, comment,
              updated_at AS updatedAt
         FROM votes WHERE participant_id = ?`,
    )
    .all(participantId);
}

/**
 * One row per (participant, strategy), enforced by the UNIQUE constraint.
 * Changing a vote updates that row -- it can never fan out into duplicates,
 * even if a flaky network makes the client send the same vote twice.
 */
export function upsertVote(db, { participantId, strategyId, x, y, comment = '' }) {
  db.prepare(
    `INSERT INTO votes (participant_id, strategy_id, x_score, y_score, comment)
          VALUES (@participantId, @strategyId, @x, @y, @comment)
     ON CONFLICT (participant_id, strategy_id)
     DO UPDATE SET x_score    = excluded.x_score,
                   y_score    = excluded.y_score,
                   comment    = excluded.comment,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run({ participantId, strategyId, x, y, comment });

  return db
    .prepare(
      `SELECT strategy_id AS strategyId, x_score AS x, y_score AS y, comment,
              updated_at AS updatedAt
         FROM votes WHERE participant_id = ? AND strategy_id = ?`,
    )
    .get(participantId, strategyId);
}

export function clearAllVotes(db) {
  return db.prepare('DELETE FROM votes').run().changes;
}

/* --------------------------------- settings ------------------------------- */

export function getSettings(db) {
  return Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]),
  );
}

export function updateSettings(db, patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  );
  const run = db.transaction((entries) => {
    for (const [key, value] of entries) stmt.run(key, String(value));
  });
  run(Object.entries(patch));
  return getSettings(db);
}

/* ----------------------------- admin sessions ----------------------------- */

export function createAdminSession(db, ttlHours = 12) {
  const token = randomUUID() + randomUUID().replaceAll('-', '');
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  db.prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
  return { token, expiresAt };
}

export function isValidAdminSession(db, token) {
  if (!token) return false;
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')").run();
  return !!db.prepare('SELECT token FROM admin_sessions WHERE token = ?').get(token);
}

export function destroyAdminSession(db, token) {
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}
