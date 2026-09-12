import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshStore } from './helpers.js';
import * as service from '../server/service.js';
import { aggregate } from '../server/domain/results.js';

async function scenario() {
  const { db, store, sessionId } = await freshStore();
  const alice = await service.joinSession(store, sessionId, 'Alice');
  const strategy = await service.createStrategy(store, sessionId, { title: 'Open a second lounge' });
  const vote = (participantId, input, strategyId = strategy.id) =>
    service.submitResponse(store, { sessionId, participantId, strategyId, input });
  return { db, store, sessionId, alice, strategy, vote };
}

const statsFor = async (store, sessionId, strategyId) =>
  aggregate((await store.listResponses(sessionId)).filter((r) => r.strategy_id === strategyId));

// --- Requirement 1 ----------------------------------------------------------
test('a participant cannot hold two current responses for one strategy', async (t) => {
  const { db, store, sessionId, alice, strategy, vote } = await scenario();
  t.after(() => db.close());

  await vote(alice.id, { kind: 'RATED', benefit: 1, effort: 1 });
  await vote(alice.id, { kind: 'RATED', benefit: 5, effort: 5 });
  await vote(alice.id, { kind: 'NOT_SURE' });
  await vote(alice.id, { kind: 'RATED', benefit: 3, effort: 3 });

  const rows = await store.listResponses(sessionId);
  assert.equal(rows.length, 1, 'four votes must collapse into one row');
  assert.equal(rows[0].benefit, 3);

  // And the constraint itself refuses a second row, not just the upsert path.
  await assert.rejects(
    db.query(
      `INSERT INTO responses (id, session_id, participant_id, strategy_id, kind, benefit, effort)
       VALUES ('forced', $1, $2, $3, 'RATED', 2, 2)`,
      [sessionId, alice.id, strategy.id],
    ),
    /unique|duplicate/i,
    'the UNIQUE constraint must reject a direct second insert',
  );
});

// --- Requirement 2 ----------------------------------------------------------
test('RATED -> RATED updates the existing response instead of adding one', async (t) => {
  const { db, store, sessionId, alice, vote } = await scenario();
  t.after(() => db.close());

  const first = await vote(alice.id, { kind: 'RATED', benefit: 2, effort: 4 });
  const second = await vote(alice.id, { kind: 'RATED', benefit: 5, effort: 1 });

  const rows = await store.listResponses(sessionId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].benefit, 5);
  assert.equal(rows[0].effort, 1);
  assert.equal(first.strategyId, second.strategyId);
});

// --- Requirement 3 ----------------------------------------------------------
test('RATED -> NOT_SURE removes benefit and effort from the aggregates', async (t) => {
  const { db, store, sessionId, alice, strategy, vote } = await scenario();
  t.after(() => db.close());

  const bob = await service.joinSession(store, sessionId, 'Bob');
  await vote(alice.id, { kind: 'RATED', benefit: 5, effort: 5 });
  await vote(bob.id, { kind: 'RATED', benefit: 1, effort: 1 });
  assert.equal((await statsFor(store, sessionId, strategy.id)).avgBenefit, 3);

  await vote(alice.id, { kind: 'NOT_SURE' });

  const after = await statsFor(store, sessionId, strategy.id);
  assert.equal(after.responded, 2);
  assert.equal(after.rated, 1);
  assert.equal(after.notSure, 1);
  assert.equal(after.avgBenefit, 1, "Alice's old 5 must not linger in the average");
  assert.equal(after.effort, undefined);
  assert.equal(after.avgEffort, 1);

  // The stored row must not merely be ignored -- it must not hold the scores.
  const row = (await store.listResponses(sessionId)).find((r) => r.participant_id === alice.id);
  assert.equal(row.kind, 'NOT_SURE');
  assert.equal(row.benefit, null);
  assert.equal(row.effort, null);
});

test('the database refuses a NOT_SURE row that carries scores', async (t) => {
  const { db, store, sessionId, alice, strategy } = await scenario();
  t.after(() => db.close());
  await assert.rejects(
    db.query(
      `INSERT INTO responses (id, session_id, participant_id, strategy_id, kind, benefit, effort)
       VALUES ('bad', $1, $2, $3, 'NOT_SURE', 4, 4)`,
      [sessionId, alice.id, strategy.id],
    ),
    /responses_shape/,
  );
  await assert.rejects(
    db.query(
      `INSERT INTO responses (id, session_id, participant_id, strategy_id, kind, benefit, effort)
       VALUES ('bad2', $1, $2, $3, 'RATED', NULL, NULL)`,
      [sessionId, alice.id, strategy.id],
    ),
    /responses_shape/,
    'a RATED row with no scores must be impossible too',
  );
});

// --- Requirement 4 ----------------------------------------------------------
test('NOT_SURE -> RATED puts the rating back into the aggregates', async (t) => {
  const { db, store, sessionId, alice, strategy, vote } = await scenario();
  t.after(() => db.close());

  const bob = await service.joinSession(store, sessionId, 'Bob');
  await vote(alice.id, { kind: 'NOT_SURE' });
  await vote(bob.id, { kind: 'RATED', benefit: 2, effort: 2 });

  let stats = await statsFor(store, sessionId, strategy.id);
  assert.deepEqual([stats.responded, stats.rated, stats.notSure], [2, 1, 1]);
  assert.equal(stats.avgBenefit, 2);

  await vote(alice.id, { kind: 'RATED', benefit: 4, effort: 4 });

  stats = await statsFor(store, sessionId, strategy.id);
  assert.deepEqual([stats.responded, stats.rated, stats.notSure], [2, 2, 0]);
  assert.equal(stats.avgBenefit, 3);
  assert.equal(stats.avgEffort, 3);
  assert.equal((await store.listResponses(sessionId)).length, 2, 'still one row per participant');
});

// --- Requirement 7 at the data layer ---------------------------------------
test('the database refuses scores outside 1-5 even if the service is bypassed', async (t) => {
  const { db, store, sessionId, alice, strategy } = await scenario();
  t.after(() => db.close());
  for (const [benefit, effort] of [[0, 3], [6, 3], [3, 0], [3, 6], [-1, 1]]) {
    await assert.rejects(
      db.query(
        `INSERT INTO responses (id, session_id, participant_id, strategy_id, kind, benefit, effort)
         VALUES ($4, $1, $2, $3, 'RATED', $5, $6)`,
        [sessionId, alice.id, strategy.id, `x${benefit}_${effort}`, benefit, effort],
      ),
      /check constraint/i,
      `benefit=${benefit} effort=${effort} must be rejected by the database`,
    );
  }
});

// --- Requirement 8 ----------------------------------------------------------
test('LOCKED voting blocks writes at the data layer, not just in the UI', async (t) => {
  const { db, store, sessionId, alice, strategy, vote } = await scenario();
  t.after(() => db.close());

  await vote(alice.id, { kind: 'RATED', benefit: 3, effort: 3 });
  await service.setSessionStatus(store, sessionId, 'LOCKED');

  // Through the service...
  await assert.rejects(() => vote(alice.id, { kind: 'RATED', benefit: 5, effort: 5 }), /locked/i);
  await assert.rejects(() => vote(alice.id, { kind: 'NOT_SURE' }), /locked/i);

  // ...and through the raw store call the routes use, with no service in the way.
  const refused = await store.upsertResponse({
    sessionId, participantId: alice.id, strategyId: strategy.id, kind: 'RATED', benefit: 5, effort: 5,
  });
  assert.equal(refused, null, 'the guarded upsert itself must refuse while LOCKED');

  const rows = await store.listResponses(sessionId);
  assert.equal(rows[0].benefit, 3, 'the existing vote is untouched');

  // A new participant may still join, but cannot vote.
  const late = await service.joinSession(store, sessionId, 'Latecomer');
  await assert.rejects(() => vote(late.id, { kind: 'RATED', benefit: 1, effort: 1 }), /locked/i);
  assert.equal((await store.listResponses(sessionId)).length, 1);

  // Reopening restores voting.
  await service.setSessionStatus(store, sessionId, 'OPEN');
  await vote(alice.id, { kind: 'RATED', benefit: 5, effort: 5 });
  assert.equal((await store.listResponses(sessionId))[0].benefit, 5);
});

// --- Requirement 11 ---------------------------------------------------------
test('archiving a strategy keeps its historical responses', async (t) => {
  const { db, store, sessionId, alice, strategy, vote } = await scenario();
  t.after(() => db.close());

  const bob = await service.joinSession(store, sessionId, 'Bob');
  await vote(alice.id, { kind: 'RATED', benefit: 5, effort: 4 });
  await vote(bob.id, { kind: 'NOT_SURE' });

  await service.archiveStrategy(store, sessionId, strategy.id, true);

  const rows = await store.listResponses(sessionId);
  assert.equal(rows.length, 2, 'archiving must not delete responses');

  // Gone from the ballot and the dashboard...
  const ballot = await service.getBallot(store, sessionId, alice.id);
  assert.equal(ballot.strategies.length, 0);
  const results = await service.getResults(store, sessionId);
  assert.equal(results.plotted.length, 0);
  assert.equal(results.strategies.length, 0);

  // ...but still there when asked for, with its aggregate intact.
  const withArchived = await service.getResults(store, sessionId, { includeArchived: true });
  const archived = withArchived.strategies.find((s) => s.id === strategy.id);
  assert.equal(archived.archived, true);
  assert.equal(archived.responded, 2);
  assert.equal(archived.rated, 1);
  assert.equal(archived.avgBenefit, 5);

  // New votes on an archived strategy are refused.
  await assert.rejects(() => vote(alice.id, { kind: 'RATED', benefit: 1, effort: 1 }), /withdrawn/i);

  // Restoring brings the history back rather than starting from zero.
  await service.archiveStrategy(store, sessionId, strategy.id, false);
  const restored = (await service.getResults(store, sessionId)).strategies[0];
  assert.equal(restored.responded, 2);
  assert.equal(restored.avgBenefit, 5);
  assert.equal(restored.avgEffort, 4);
});

// --- identity ---------------------------------------------------------------
test('renaming keeps the same participant id and every vote', async (t) => {
  const { db, store, sessionId, alice, vote } = await scenario();
  t.after(() => db.close());

  await vote(alice.id, { kind: 'RATED', benefit: 4, effort: 2 });
  const renamed = await service.renameParticipant(store, alice.id, 'Quoc Duy');

  assert.equal(renamed.id, alice.id, 'a new name must not create a new identity');
  assert.equal(renamed.displayName, 'Quoc Duy');
  assert.equal(renamed.recoveryCode, alice.recoveryCode);
  assert.equal((await store.listResponses(sessionId)).length, 1);
  assert.equal((await store.listParticipants(sessionId)).length, 1);
});

test('two participants may share a display name and stay distinct', async (t) => {
  const { db, store, sessionId } = await scenario();
  t.after(() => db.close());

  const one = await service.joinSession(store, sessionId, 'Quoc Duy');
  const two = await service.joinSession(store, sessionId, 'Quoc Duy');
  assert.notEqual(one.id, two.id);
  assert.notEqual(one.recoveryCode, two.recoveryCode);
  assert.equal((await store.listParticipants(sessionId)).length, 3);
});

test('a recovery code restores the original identity and its votes', async (t) => {
  const { db, store, sessionId, alice, vote } = await scenario();
  t.after(() => db.close());

  await vote(alice.id, { kind: 'RATED', benefit: 5, effort: 2 });
  const resumed = await service.resumeWithCode(store, sessionId, alice.recoveryCode.toLowerCase());

  assert.equal(resumed.id, alice.id);
  const ballot = await service.getBallot(store, sessionId, resumed.id);
  assert.equal(ballot.responses[0].benefit, 5);
  await assert.rejects(() => service.resumeWithCode(store, sessionId, 'ZZZZZ'), /doesn't match/);
});
