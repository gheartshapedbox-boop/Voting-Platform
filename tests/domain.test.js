import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate,
  buildStrategyResults,
  dashboardPoints,
  isValidScore,
  normalizeResponseInput,
  participantProgress,
  quadrantOf,
  unplottedStrategies,
} from '../server/domain/results.js';
import { normalizeDisplayName, newRecoveryCode, RECOVERY_CODE_LENGTH } from '../server/domain/identity.js';

const rated = (benefit, effort) => ({ kind: 'RATED', benefit, effort });
const notSure = () => ({ kind: 'NOT_SURE', benefit: null, effort: null });

// --- Requirement 6: the worked example from the brief -----------------------
test('the brief\'s worked example: B5/E4, B3/E2, NOT_SURE', () => {
  const stats = aggregate([rated(5, 4), rated(3, 2), notSure()]);
  assert.equal(stats.responded, 3);
  assert.equal(stats.rated, 2);
  assert.equal(stats.notSure, 1);
  assert.equal(stats.avgBenefit, 4.0);
  assert.equal(stats.avgEffort, 3.0);
});

// --- Requirement 5 ----------------------------------------------------------
test('NOT_SURE counts toward Responded but not Rated', () => {
  const stats = aggregate([notSure(), notSure()]);
  assert.equal(stats.responded, 2);
  assert.equal(stats.rated, 0);
  assert.equal(stats.notSure, 2);
});

// --- Requirement 6 ----------------------------------------------------------
test('averages ignore NOT_SURE entirely', () => {
  const withoutAbstainers = aggregate([rated(4, 2), rated(2, 4)]);
  const withAbstainers = aggregate([rated(4, 2), rated(2, 4), notSure(), notSure(), notSure()]);
  assert.equal(withAbstainers.avgBenefit, withoutAbstainers.avgBenefit);
  assert.equal(withAbstainers.avgEffort, withoutAbstainers.avgEffort);
  assert.equal(withAbstainers.responded, 5);
  assert.equal(withAbstainers.rated, 2);
});

// --- Requirement 10 ---------------------------------------------------------
test('zero RATED responses gives null averages and no dot on the dashboard', () => {
  const strategies = [
    { id: 'a', title: 'Scored', description: '', archived_at: null },
    { id: 'b', title: 'Nobody rated', description: '', archived_at: null },
    { id: 'c', title: 'Only unsure', description: '', archived_at: null },
  ];
  const responses = [
    { strategy_id: 'a', participant_id: 'p1', kind: 'RATED', benefit: 4, effort: 2 },
    { strategy_id: 'c', participant_id: 'p1', kind: 'NOT_SURE', benefit: null, effort: null },
  ];
  const results = buildStrategyResults(strategies, responses);
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  assert.equal(byId.b.avgBenefit, null);
  assert.equal(byId.b.avgEffort, null);
  assert.equal(byId.c.avgBenefit, null, 'NOT_SURE alone must not produce an average');
  assert.equal(byId.c.responded, 1);
  assert.equal(byId.c.rated, 0);

  assert.deepEqual(dashboardPoints(results).map((s) => s.id), ['a']);
  assert.deepEqual(unplottedStrategies(results).map((s) => s.id).sort(), ['b', 'c']);
});

test('archived strategies are kept out of the dashboard but can be asked for', () => {
  const strategies = [
    { id: 'a', title: 'Live', description: '', archived_at: null },
    { id: 'z', title: 'Archived', description: '', archived_at: new Date().toISOString() },
  ];
  const responses = [
    { strategy_id: 'a', participant_id: 'p1', kind: 'RATED', benefit: 4, effort: 2 },
    { strategy_id: 'z', participant_id: 'p1', kind: 'RATED', benefit: 5, effort: 5 },
  ];
  const results = buildStrategyResults(strategies, responses);
  assert.deepEqual(dashboardPoints(results).map((s) => s.id), ['a']);
  assert.deepEqual(dashboardPoints(results, { includeArchived: true }).map((s) => s.id), ['a', 'z']);
  // The archived strategy's aggregate survives, it is just not plotted.
  assert.equal(results.find((s) => s.id === 'z').avgBenefit, 5);
});

// --- Requirement 7 ----------------------------------------------------------
test('ratings accept only whole numbers 1-5', () => {
  for (const good of [1, 2, 3, 4, 5]) assert.equal(isValidScore(good), true, `${good} should be valid`);
  for (const bad of [0, 6, -1, 2.5, NaN, Infinity, '3', null, undefined, true]) {
    assert.equal(isValidScore(bad), false, `${String(bad)} should be rejected`);
  }
});

test('normalizeResponseInput rejects out-of-range and non-integer scores', () => {
  assert.deepEqual(normalizeResponseInput({ kind: 'RATED', benefit: 3, effort: 5 }),
    { kind: 'RATED', benefit: 3, effort: 5 });

  for (const bad of [{ benefit: 0, effort: 3 }, { benefit: 6, effort: 3 }, { benefit: 3, effort: 0 },
                     { benefit: 3, effort: 6 }, { benefit: 2.5, effort: 3 }, { benefit: '4', effort: 3 }]) {
    assert.throws(() => normalizeResponseInput({ kind: 'RATED', ...bad }), /Benefit|Effort/);
  }
  assert.throws(() => normalizeResponseInput({ kind: 'MAYBE' }), /kind must be/);
});

test('NOT_SURE drops any scores sent alongside it', () => {
  assert.deepEqual(normalizeResponseInput({ kind: 'NOT_SURE', benefit: 5, effort: 5 }),
    { kind: 'NOT_SURE', benefit: null, effort: null });
});

// --- quadrants --------------------------------------------------------------
test('quadrants split at the midpoint, and are null without an average', () => {
  assert.equal(quadrantOf(5, 1), 'QUICK_WIN');
  assert.equal(quadrantOf(5, 5), 'BIG_BET');
  assert.equal(quadrantOf(1, 1), 'FILL_IN');
  assert.equal(quadrantOf(1, 5), 'AVOID');
  assert.equal(quadrantOf(3, 3), 'BIG_BET', 'a tie at the midpoint counts as high on both axes');
  assert.equal(quadrantOf(null, null), null);
});

// --- participant progress ---------------------------------------------------
test('progress counts responses against live strategies only', () => {
  const participants = [
    { id: 'p1', display_name: 'Quoc Duy', recovery_code: 'K7M4Q', joined_at: '2026-01-01' },
    { id: 'p2', display_name: 'Quoc Duy', recovery_code: 'R3TDF', joined_at: '2026-01-02' },
  ];
  const responses = [
    { participant_id: 'p1', strategy_id: 'a', kind: 'RATED', benefit: 3, effort: 3 },
    { participant_id: 'p1', strategy_id: 'b', kind: 'NOT_SURE', benefit: null, effort: null },
    { participant_id: 'p1', strategy_id: 'gone', kind: 'RATED', benefit: 3, effort: 3 },
  ];
  const progress = participantProgress(participants, responses, ['a', 'b']);
  assert.deepEqual(progress.map((p) => [p.id, p.responded, p.total]), [['p1', 2, 2], ['p2', 0, 2]]);
  // Two people called "Quoc Duy" stay two rows.
  assert.equal(new Set(progress.map((p) => p.id)).size, 2);
});

// --- identity ---------------------------------------------------------------
test('display names are trimmed and bounded, never deduplicated', () => {
  assert.equal(normalizeDisplayName('  Quoc   Duy '), 'Quoc Duy');
  assert.throws(() => normalizeDisplayName('   '), /Enter a name/);
  assert.throws(() => normalizeDisplayName('x'.repeat(41)), /under 40/);
});

test('recovery codes avoid characters people misread', () => {
  for (let i = 0; i < 200; i++) {
    const code = newRecoveryCode();
    assert.equal(code.length, RECOVERY_CODE_LENGTH);
    assert.match(code, /^[34679ACDEFGHJKMNPQRTUVWXY]+$/);
  }
});
