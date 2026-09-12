import { randomUUID } from 'node:crypto';
import { newParticipantId, newRecoveryCode } from './domain/identity.js';

/**
 * Every SQL statement in the app lives here, one function per operation.
 * Business rules live in domain/ and service.js; this file only reads and writes.
 */
export function createStore(db) {
  const one = async (text, params) => (await db.query(text, params)).rows[0] ?? null;
  const all = async (text, params) => (await db.query(text, params)).rows;

  return {
    // ---- session -------------------------------------------------------
    getSession: (id) => one(`SELECT * FROM voting_sessions WHERE id = $1`, [id]),

    setSessionStatus: (id, status) =>
      one(`UPDATE voting_sessions SET status = $2 WHERE id = $1 RETURNING *`, [id, status]),

    // ---- participants --------------------------------------------------
    /** Retries on the (very unlikely) recovery-code collision the UNIQUE index catches. */
    async createParticipant(sessionId, displayName) {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          return await one(
            `INSERT INTO participants (id, session_id, display_name, recovery_code)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [newParticipantId(), sessionId, displayName, newRecoveryCode()],
          );
        } catch (err) {
          if (!/unique|duplicate/i.test(String(err?.message))) throw err;
        }
      }
      throw new Error('Could not allocate a unique recovery code.');
    },

    getParticipant: (id) => one(`SELECT * FROM participants WHERE id = $1`, [id]),

    getParticipantByRecoveryCode: (sessionId, code) =>
      one(`SELECT * FROM participants WHERE session_id = $1 AND recovery_code = $2`, [sessionId, code]),

    /** Renaming keeps the same row: the UUID, and therefore every vote, survives. */
    renameParticipant: (id, displayName) =>
      one(`UPDATE participants SET display_name = $2 WHERE id = $1 RETURNING *`, [id, displayName]),

    listParticipants: (sessionId) =>
      all(`SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at ASC`, [sessionId]),

    // ---- strategies ----------------------------------------------------
    async createStrategy(sessionId, { title, description = '' }) {
      const { rows } = await db.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM strategies WHERE session_id = $1`,
        [sessionId],
      );
      return one(
        `INSERT INTO strategies (id, session_id, title, description, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [randomUUID(), sessionId, title, description, rows[0].next],
      );
    },

    updateStrategy: (id, { title, description }) =>
      one(
        `UPDATE strategies SET title = COALESCE($2, title), description = COALESCE($3, description)
         WHERE id = $1 RETURNING *`,
        [id, title ?? null, description ?? null],
      ),

    /** Soft delete only. Responses are deliberately left untouched. */
    setStrategyArchived: (id, archived) =>
      one(
        `UPDATE strategies SET archived_at = ${archived ? 'now()' : 'NULL'} WHERE id = $1 RETURNING *`,
        [id],
      ),

    getStrategy: (id) => one(`SELECT * FROM strategies WHERE id = $1`, [id]),

    listStrategies: (sessionId, { includeArchived = false } = {}) =>
      all(
        `SELECT * FROM strategies WHERE session_id = $1
           ${includeArchived ? '' : 'AND archived_at IS NULL'}
         ORDER BY sort_order ASC, created_at ASC`,
        [sessionId],
      ),

    // ---- responses -----------------------------------------------------
    /**
     * The only write path for a vote, and the place voting rules are enforced.
     *
     * A single statement does all of it: the WHERE EXISTS refuses the write
     * unless the session is OPEN and the strategy is live, and the ON CONFLICT
     * turns a re-vote into an UPDATE of the existing row. Because the guard and
     * the write are one statement there is no window in which a session can be
     * locked between the check and the insert, and no path that produces a
     * second current response for the same (participant, strategy).
     *
     * Returns null when the guard refused -- the caller decides what to say.
     */
    upsertResponse({ sessionId, participantId, strategyId, kind, benefit, effort }) {
      return one(
        `INSERT INTO responses (id, session_id, participant_id, strategy_id, kind, benefit, effort)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE EXISTS (
           SELECT 1
             FROM voting_sessions v
             JOIN strategies s ON s.session_id = v.id
            WHERE v.id = $2 AND v.status = 'OPEN'
              AND s.id = $4 AND s.archived_at IS NULL
         )
         ON CONFLICT ON CONSTRAINT responses_one_per_participant_per_strategy
         DO UPDATE SET kind    = EXCLUDED.kind,
                       benefit = EXCLUDED.benefit,
                       effort  = EXCLUDED.effort,
                       updated_at = now()
         RETURNING *`,
        [randomUUID(), sessionId, participantId, strategyId, kind, benefit, effort],
      );
    },

    listResponses: (sessionId) =>
      all(`SELECT * FROM responses WHERE session_id = $1`, [sessionId]),

    listResponsesForParticipant: (participantId) =>
      all(`SELECT * FROM responses WHERE participant_id = $1`, [participantId]),

    clearResponses: (sessionId) =>
      db.query(`DELETE FROM responses WHERE session_id = $1`, [sessionId]),

    // ---- admin tokens --------------------------------------------------
    createAdminToken: async () => {
      const token = randomUUID() + randomUUID().replaceAll('-', '');
      await db.query(`INSERT INTO admin_sessions (token) VALUES ($1)`, [token]);
      return token;
    },
    findAdminToken: (token) => one(`SELECT * FROM admin_sessions WHERE token = $1`, [token]),
    deleteAdminToken: (token) => db.query(`DELETE FROM admin_sessions WHERE token = $1`, [token]),
  };
}
