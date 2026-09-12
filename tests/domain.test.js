import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODE_LENGTH,
  generateRecoveryCode,
  isPlausibleRecoveryCode,
  normaliseDisplayName,
  normaliseRecoveryCode,
  validateDisplayName,
} from '../server/domain/identity.js';
import {
  buildResults,
  clusterPoints,
  dispersion,
  median,
  quadrantKey,
  summariseParticipation,
} from '../server/domain/results.js';

describe('display names', () => {
  it('collapses whitespace but keeps the name as typed otherwise', () => {
    assert.equal(normaliseDisplayName('  Quoc   Duy '), 'Quoc Duy');
  });

  it('rejects empty names', () => {
    assert.equal(validateDisplayName('   ').ok, false);
  });

  it('rejects names past the length limit', () => {
    assert.equal(validateDisplayName('x'.repeat(41)).ok, false);
    assert.equal(validateDisplayName('x'.repeat(40)).ok, true);
  });
});

describe('recovery codes', () => {
  it('generates codes of the fixed length from the safe alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRecoveryCode();
      assert.equal(code.length, CODE_LENGTH);
      assert.ok(isPlausibleRecoveryCode(code), `${code} used an unsafe character`);
    }
  });

  it('never emits the characters people mis-read', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) for (const c of generateRecoveryCode()) seen.add(c);
    for (const bad of ['0', 'O', '1', 'I', 'L', '5', 'S', '2', 'Z', '8', 'B']) {
      // B is allowed; the rest are not. Guard only the excluded set.
      if (bad === 'B') continue;
      assert.ok(!seen.has(bad), `alphabet leaked ${bad}`);
    }
  });

  it('forgives lower case and punctuation when resuming', () => {
    assert.equal(normaliseRecoveryCode(' k7m4q '), 'K7M4Q');
    assert.equal(normaliseRecoveryCode('k7-m4q'), 'K7M4Q');
  });

  it('rejects codes of the wrong shape', () => {
    assert.equal(isPlausibleRecoveryCode('K7M4'), false);
    assert.equal(isPlausibleRecoveryCode('K7M40'), false); // 0 is not in the alphabet
  });
});

describe('result maths', () => {
  it('places points in the right quadrant around the 5.5 midpoint', () => {
    assert.equal(quadrantKey(9, 9), 'high-high');
    assert.equal(quadrantKey(2, 9), 'low-high');
    assert.equal(quadrantKey(9, 2), 'high-low');
    assert.equal(quadrantKey(5, 5), 'low-low');
    assert.equal(quadrantKey(5.5, 5.5), 'high-high');
  });

  it('takes the median of an even-length series', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([]), null);
  });

  it('collapses duplicate coordinates into counted dots rather than jittering', () => {
    const points = clusterPoints([
      { x: 3, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 4 }, { x: 8, y: 2 },
    ]);
    assert.deepEqual(points, [
      { x: 3, y: 4, count: 3 },
      { x: 8, y: 2, count: 1 },
    ]);
  });

  it('reports zero dispersion when the room agrees exactly', () => {
    assert.equal(dispersion([{ x: 5, y: 5 }, { x: 5, y: 5 }], { x: 5, y: 5 }), 0);
  });

  it('flags a strategy as contested only when opinion is genuinely split', () => {
    const strategies = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
    const votes = [
      // A: everyone agrees
      { strategy_id: 'a', participant_id: 'p1', x_score: 8, y_score: 8 },
      { strategy_id: 'a', participant_id: 'p2', x_score: 8, y_score: 9 },
      { strategy_id: 'a', participant_id: 'p3', x_score: 7, y_score: 8 },
      // B: two camps
      { strategy_id: 'b', participant_id: 'p1', x_score: 1, y_score: 1 },
      { strategy_id: 'b', participant_id: 'p2', x_score: 10, y_score: 10 },
      { strategy_id: 'b', participant_id: 'p3', x_score: 1, y_score: 10 },
    ];
    const [a, b] = buildResults(strategies, votes);
    assert.equal(a.contested, false);
    assert.equal(b.contested, true);
    assert.equal(a.voteCount, 3);
  });

  it('never attaches a participant id to a plotted point', () => {
    const [only] = buildResults(
      [{ id: 'a', title: 'A' }],
      [{ strategy_id: 'a', participant_id: 'secret-person', x_score: 5, y_score: 5 }],
    );
    assert.deepEqual(Object.keys(only.points[0]).sort(), ['count', 'x', 'y']);
    assert.ok(!JSON.stringify(only).includes('secret-person'));
  });

  it('handles a strategy with no votes without dividing by zero', () => {
    const [only] = buildResults([{ id: 'a', title: 'A' }], []);
    assert.equal(only.voteCount, 0);
    assert.equal(only.mean.x, null);
    assert.equal(only.quadrant, null);
    assert.deepEqual(only.points, []);
  });

  it('counts responded and completed participants separately', () => {
    const stats = summariseParticipation(
      [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      [
        { participant_id: 'p1', strategy_id: 'a' },
        { participant_id: 'p1', strategy_id: 'b' },
        { participant_id: 'p2', strategy_id: 'a' },
      ],
      2,
    );
    assert.deepEqual(stats, {
      participantCount: 3,
      respondedCount: 2, // p3 never voted
      completedCount: 1, // only p1 scored both
      strategyCount: 2,
      totalVotes: 3,
    });
  });
});
