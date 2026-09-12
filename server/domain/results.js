/**
 * Result aggregation. Pure functions over plain objects -- no SQL, no React.
 * Everything the charts draw is computed here, so the maths can be tested and
 * changed without touching any rendering code.
 */

export const SCALE = { min: 1, max: 10 };
export const MIDPOINT = (SCALE.min + SCALE.max) / 2; // 5.5

/**
 * Quadrant keys are positional (x/y high/low) rather than named after a
 * particular pair of axis labels, because the axis labels are configurable.
 * The nicknames are a convenience the UI may show alongside the real labels.
 */
export const QUADRANTS = {
  'high-high': { nickname: 'Do now', x: 'high', y: 'high' },
  'low-high': { nickname: 'Big bets', x: 'low', y: 'high' },
  'high-low': { nickname: 'Easy fills', x: 'high', y: 'low' },
  'low-low': { nickname: 'Deprioritise', x: 'low', y: 'low' },
};

export function quadrantKey(x, y) {
  return `${x >= MIDPOINT ? 'high' : 'low'}-${y >= MIDPOINT ? 'high' : 'low'}`;
}

export function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Votes land on integer coordinates, so many participants share a point.
 * Collapsing duplicates into one dot with a count is honest -- unlike jitter,
 * which invents positions nobody voted for.
 */
export function clusterPoints(votes) {
  const byCell = new Map();
  for (const v of votes) {
    const key = `${v.x}:${v.y}`;
    const hit = byCell.get(key);
    if (hit) hit.count += 1;
    else byCell.set(key, { x: v.x, y: v.y, count: 1 });
  }
  return [...byCell.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

/**
 * Mean distance of each vote from the group centroid: a plain-language
 * "how much did the room disagree" number on the same 1-10 scale as the axes.
 */
export function dispersion(votes, centre) {
  if (votes.length < 2) return 0;
  const total = votes.reduce(
    (sum, v) => sum + Math.hypot(v.x - centre.x, v.y - centre.y),
    0,
  );
  return total / votes.length;
}

/** Above this mean distance the room is meaningfully split on a strategy. */
export const CONTESTED_THRESHOLD = 2.5;

export function summariseStrategy(strategy, votes) {
  const xs = votes.map((v) => v.x);
  const ys = votes.map((v) => v.y);
  const centre = votes.length
    ? { x: mean(xs), y: mean(ys) }
    : { x: null, y: null };
  const spread = votes.length ? dispersion(votes, centre) : 0;

  return {
    id: strategy.id,
    title: strategy.title,
    description: strategy.description ?? '',
    voteCount: votes.length,
    mean: centre,
    median: { x: median(xs), y: median(ys) },
    dispersion: spread,
    contested: votes.length >= 3 && spread > CONTESTED_THRESHOLD,
    quadrant: votes.length ? quadrantKey(centre.x, centre.y) : null,
    // Anonymous by construction: no participant id ever reaches a point.
    points: clusterPoints(votes),
  };
}

/**
 * @param strategies [{id,title,description}]
 * @param votes      [{strategy_id, participant_id, x_score, y_score}]
 */
export function buildResults(strategies, votes) {
  const byStrategy = new Map(strategies.map((s) => [s.id, []]));
  for (const v of votes) {
    byStrategy.get(v.strategy_id)?.push({ x: v.x_score, y: v.y_score });
  }
  return strategies.map((s) => summariseStrategy(s, byStrategy.get(s.id) ?? []));
}

export function summariseParticipation(participants, votes, strategyCount) {
  const votesBy = new Map();
  for (const v of votes) {
    votesBy.set(v.participant_id, (votesBy.get(v.participant_id) ?? 0) + 1);
  }
  const responded = [...votesBy.values()].filter((n) => n > 0).length;
  const complete = strategyCount === 0
    ? 0
    : [...votesBy.values()].filter((n) => n >= strategyCount).length;

  return {
    participantCount: participants.length,
    respondedCount: responded,
    completedCount: complete,
    strategyCount,
    totalVotes: votes.length,
  };
}
