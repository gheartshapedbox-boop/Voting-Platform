import { badRequest } from '../errors.js';

// The rating scale. Change these three numbers and the whole app -- validation,
// aggregates, quadrant split, and the chart axes -- follows.
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
export const MIDPOINT = 3;

export const RATED = 'RATED';
export const NOT_SURE = 'NOT_SURE';

export const QUADRANTS = {
  QUICK_WIN: { key: 'QUICK_WIN', label: 'Quick wins',   hint: 'High benefit, low effort' },
  BIG_BET:   { key: 'BIG_BET',   label: 'Big bets',     hint: 'High benefit, high effort' },
  FILL_IN:   { key: 'FILL_IN',   label: 'Fill-ins',     hint: 'Low benefit, low effort' },
  AVOID:     { key: 'AVOID',     label: 'Thankless',    hint: 'Low benefit, high effort' },
};

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function isValidScore(value) {
  return Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX;
}

/**
 * Turns whatever the client sent into a response row, or throws.
 * NOT_SURE always clears benefit/effort -- the same rule the DB CHECK enforces.
 */
export function normalizeResponseInput(input) {
  const kind = input?.kind;

  if (kind === NOT_SURE) {
    return { kind: NOT_SURE, benefit: null, effort: null };
  }
  if (kind !== RATED) {
    throw badRequest('bad_kind', `kind must be "${RATED}" or "${NOT_SURE}".`);
  }
  const benefit = input.benefit;
  const effort = input.effort;
  if (!isValidScore(benefit)) {
    throw badRequest('bad_benefit', `Benefit must be a whole number ${SCALE_MIN}-${SCALE_MAX}.`);
  }
  if (!isValidScore(effort)) {
    throw badRequest('bad_effort', `Effort must be a whole number ${SCALE_MIN}-${SCALE_MAX}.`);
  }
  return { kind: RATED, benefit, effort };
}

/**
 * The core aggregate rule.
 *
 *   responded = everyone who answered at all (RATED + NOT_SURE)
 *   rated     = only those who gave scores
 *   averages  = computed from RATED responses ONLY, null when there are none
 */
export function aggregate(responses) {
  const rated = responses.filter((r) => r.kind === RATED);
  const notSure = responses.filter((r) => r.kind === NOT_SURE);

  return {
    responded: responses.length,
    rated: rated.length,
    notSure: notSure.length,
    avgBenefit: rated.length ? round1(mean(rated.map((r) => r.benefit))) : null,
    avgEffort: rated.length ? round1(mean(rated.map((r) => r.effort))) : null,
  };
}

/**
 * Ties go to the optimistic side: exactly MIDPOINT counts as high benefit and
 * as high effort. Move the comparison here if management disagrees.
 */
export function quadrantOf(avgBenefit, avgEffort) {
  if (avgBenefit == null || avgEffort == null) return null;
  const highBenefit = avgBenefit >= MIDPOINT;
  const highEffort = avgEffort >= MIDPOINT;
  if (highBenefit) return highEffort ? QUADRANTS.BIG_BET.key : QUADRANTS.QUICK_WIN.key;
  return highEffort ? QUADRANTS.AVOID.key : QUADRANTS.FILL_IN.key;
}

/** One row per strategy: its counts, its averages, its quadrant. */
export function buildStrategyResults(strategies, responses) {
  const byStrategy = new Map(strategies.map((s) => [s.id, []]));
  for (const r of responses) {
    if (byStrategy.has(r.strategy_id)) byStrategy.get(r.strategy_id).push(r);
  }
  return strategies.map((s) => {
    const stats = aggregate(byStrategy.get(s.id));
    return {
      id: s.id,
      title: s.title,
      description: s.description,
      archived: s.archived_at != null,
      ...stats,
      quadrant: quadrantOf(stats.avgBenefit, stats.avgEffort),
    };
  });
}

/**
 * What the Final Dashboard plots. A strategy with zero RATED responses has null
 * averages and therefore no position -- it is listed separately, never guessed
 * onto the chart at some default coordinate.
 */
export function dashboardPoints(strategyResults, { includeArchived = false } = {}) {
  return strategyResults.filter(
    (s) => (includeArchived || !s.archived) && s.rated > 0 && s.avgBenefit != null && s.avgEffort != null,
  );
}

export function unplottedStrategies(strategyResults, { includeArchived = false } = {}) {
  return strategyResults.filter((s) => (includeArchived || !s.archived) && s.rated === 0);
}

/** Admin participant list: how far through the active strategies each one is. */
export function participantProgress(participants, responses, activeStrategyIds) {
  const active = new Set(activeStrategyIds);
  const counts = new Map();
  for (const r of responses) {
    if (!active.has(r.strategy_id)) continue;
    counts.set(r.participant_id, (counts.get(r.participant_id) ?? 0) + 1);
  }
  return participants.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    recoveryCode: p.recovery_code,
    joinedAt: p.joined_at,
    responded: counts.get(p.id) ?? 0,
    total: active.size,
  }));
}
