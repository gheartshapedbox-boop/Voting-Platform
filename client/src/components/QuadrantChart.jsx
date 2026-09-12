import React, { useMemo, useState } from 'react';

/**
 * Renders a 2x2 quadrant scatter. This component does NO business maths: it is
 * handed points that already carry their coordinates and labels, and it turns
 * them into pixels. Aggregation lives in server/domain/results.js.
 */

const W = 660;
const H = 496;
// Generous top/bottom margins: the quadrant captions live OUTSIDE the plot
// frame, because votes at the extremes sit exactly where corner labels would.
const M = { top: 34, right: 26, bottom: 66, left: 56 };
const PLOT = { w: W - M.left - M.right, h: H - M.top - M.bottom };

// Pad the domain by half a step so votes at 1 and 10 are not clipped by the frame.
const PAD = 0.5;

// Placed above and below the frame, aligned to the half they describe.
const QUADRANT_CAPTIONS = [
  { key: 'low-high', xf: 0.25, edge: 'top' },
  { key: 'high-high', xf: 0.75, edge: 'top' },
  { key: 'low-low', xf: 0.25, edge: 'bottom' },
  { key: 'high-low', xf: 0.75, edge: 'bottom' },
];

/** Keeps direct labels from sitting on top of each other. */
function deconflict(labels, minGap = 13) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  return labels;
}

// Rough advance width for the 11px semibold label face. Good enough to decide
// which side of a dot the label belongs on.
const CHAR_W = 5.9;
const LABEL_GAP = 11;

/** Puts each label on whichever side of its dot keeps it inside the frame. */
function placeLabel(text, cx, plotLeft, plotRight) {
  const width = text.length * CHAR_W;
  if (cx + LABEL_GAP + width <= plotRight) {
    return { x: cx + LABEL_GAP, anchor: 'start' };
  }
  if (cx - LABEL_GAP - width >= plotLeft) {
    return { x: cx - LABEL_GAP, anchor: 'end' };
  }
  // Too wide for either side: pin it inside the nearer edge.
  return cx > (plotLeft + plotRight) / 2
    ? { x: plotRight, anchor: 'end' }
    : { x: plotLeft, anchor: 'start' };
}

export default function QuadrantChart({
  means = [],
  votes = [],
  xLabel = 'X',
  yLabel = 'Y',
  scale = { min: 1, max: 10 },
  midpoint = 5.5,
  selectedId = null,
  onSelect,
  quadrantNames = {},
}) {
  const [hover, setHover] = useState(null);

  const lo = scale.min - PAD;
  const hi = scale.max + PAD;
  const px = (v) => M.left + ((v - lo) / (hi - lo)) * PLOT.w;
  const py = (v) => M.top + PLOT.h - ((v - lo) / (hi - lo)) * PLOT.h;

  const ticks = useMemo(
    () => Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i),
    [scale.min, scale.max],
  );

  const meanLabels = useMemo(
    () =>
      deconflict(
        means
          .filter((m) => m.x != null && m.y != null)
          .map((m) => ({
            id: m.id,
            text: m.label,
            y: py(m.y) + 4,
            ...placeLabel(m.label, px(m.x), M.left, M.left + PLOT.w),
          })),
      ),
    [means, scale.min, scale.max],
  );

  const midX = px(midpoint);
  const midY = py(midpoint);

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Scatter of strategies by ${xLabel} (horizontal) and ${yLabel} (vertical)`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Quadrant tints: the faintest possible cue, never a data colour. */}
        <rect x={midX} y={M.top} width={M.left + PLOT.w - midX} height={midY - M.top}
              fill="var(--series-1-soft)" opacity="0.5" />

        {/* Recessive hairline grid */}
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line className="grid-line" x1={px(t)} y1={M.top} x2={px(t)} y2={M.top + PLOT.h} />
            <line className="grid-line" x1={M.left} y1={py(t)} x2={M.left + PLOT.w} y2={py(t)} />
          </g>
        ))}

        {/* Quadrant split */}
        <line className="mid-line" x1={midX} y1={M.top} x2={midX} y2={M.top + PLOT.h} />
        <line className="mid-line" x1={M.left} y1={midY} x2={M.left + PLOT.w} y2={midY} />

        {QUADRANT_CAPTIONS.map((c) => (
          <text
            key={c.key}
            className="quadrant-label"
            textAnchor="middle"
            x={M.left + PLOT.w * c.xf}
            y={c.edge === 'top' ? M.top - 13 : M.top + PLOT.h + 36}
          >
            {quadrantNames[c.key] ?? ''}
          </text>
        ))}

        {/* Frame + ticks */}
        <rect className="axis-line" x={M.left} y={M.top} width={PLOT.w} height={PLOT.h} fill="none" />
        {ticks.map((t) => (
          <g key={`t${t}`}>
            <text className="tick-label" x={px(t)} y={M.top + PLOT.h + 16} textAnchor="middle">{t}</text>
            <text className="tick-label" x={M.left - 9} y={py(t) + 3.5} textAnchor="end">{t}</text>
          </g>
        ))}
        <text className="axis-title" x={M.left + PLOT.w / 2} y={H - 10} textAnchor="middle">
          {xLabel} &rarr;
        </text>
        <text
          className="axis-title"
          transform={`translate(15 ${M.top + PLOT.h / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {yLabel} &rarr;
        </text>

        {/* Layer 1: individual votes for the selected strategy. Anonymous --
            a dot carries a count, never a name. */}
        {votes.map((v) => {
          const r = 5 + 2.4 * Math.sqrt(Math.max(0, v.count - 1));
          return (
            <g key={`v${v.x}-${v.y}`}>
              <circle
                cx={px(v.x)} cy={py(v.y)} r={r}
                fill="var(--series-1)" fillOpacity="0.22"
                stroke="var(--series-1)" strokeWidth="1.5"
              />
              <circle
                className="dot-hit" cx={px(v.x)} cy={py(v.y)} r={Math.max(r + 6, 12)}
                onMouseEnter={() =>
                  setHover({
                    x: px(v.x), y: py(v.y),
                    title: `${v.count} ${v.count === 1 ? 'vote' : 'votes'} here`,
                    lines: [`${xLabel}: ${v.x}`, `${yLabel}: ${v.y}`],
                  })
                }
              />
            </g>
          );
        })}

        {/* Layer 2: strategy averages */}
        {means
          .filter((m) => m.x != null && m.y != null)
          .map((m) => {
            const isSelected = m.id === selectedId;
            return (
              <g key={m.id}>
                {m.contested && (
                  <circle
                    cx={px(m.x)} cy={py(m.y)} r="13"
                    fill="none" stroke="var(--series-2)" strokeWidth="1.5" strokeDasharray="3 3"
                  />
                )}
                {/* 2px surface ring keeps overlapping dots legible */}
                <circle
                  cx={px(m.x)} cy={py(m.y)} r={isSelected ? 8.5 : 7}
                  fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2"
                />
                <circle
                  className="dot-hit" cx={px(m.x)} cy={py(m.y)} r="16"
                  onMouseEnter={() =>
                    setHover({
                      x: px(m.x), y: py(m.y),
                      title: m.label,
                      lines: [
                        `${xLabel}: ${m.x.toFixed(1)}`,
                        `${yLabel}: ${m.y.toFixed(1)}`,
                        `${m.voteCount} ${m.voteCount === 1 ? 'vote' : 'votes'}`,
                        ...(m.contested ? ['Room is split on this one'] : []),
                      ],
                    })
                  }
                  onClick={() => onSelect?.(m.id)}
                />
              </g>
            );
          })}

        {/* Direct labels -- sparing by design: one per strategy, no per-point values */}
        {meanLabels.map((l) => (
          <text
            key={l.id}
            className="point-label"
            x={l.x}
            y={l.y}
            textAnchor={l.anchor}
            opacity={selectedId && selectedId !== l.id ? 0.55 : 1}
          >
            {l.text}
          </text>
        ))}
      </svg>

      {hover && (
        <div
          className="tooltip"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: hover.x > W * 0.65 ? 'translate(-105%, -50%)' : 'translate(14px, -50%)',
          }}
        >
          <div className="t-title">{hover.title}</div>
          {hover.lines.map((line) => (
            <div key={line} className="muted">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
