import React, { useState } from 'react';

/**
 * Pixels only. Every number this component draws -- averages, counts, quadrant --
 * was computed on the server by domain/results.js. Changing what a quadrant means
 * is an edit there, and this file picks it up without knowing.
 */

const W = 760;
const H = 540;
const M = { top: 28, right: 28, bottom: 56, left: 66 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const CORNERS = [
  { key: 'QUICK_WIN', label: 'Quick wins',  x: 'left',  y: 'top' },
  { key: 'BIG_BET',   label: 'Big bets',    x: 'right', y: 'top' },
  { key: 'FILL_IN',   label: 'Fill-ins',    x: 'left',  y: 'bottom' },
  { key: 'AVOID',     label: 'Thankless',   x: 'right', y: 'bottom' },
];

export default function QuadrantChart({ points, min = 1, max = 5, midpoint = 3 }) {
  const [hovered, setHovered] = useState(null);

  const pad = 0.4;
  const lo = min - pad;
  const hi = max + pad;
  const sx = (v) => M.left + ((v - lo) / (hi - lo)) * PLOT_W;
  const sy = (v) => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

  const ticks = [];
  for (let v = min; v <= max; v++) ticks.push(v);

  // Place each label beside its dot, nudging apart the ones that would collide.
  const placed = [];
  const laidOut = [...points]
    .sort((a, b) => sy(a.avgBenefit) - sy(b.avgBenefit))
    .map((p) => {
      const cx = sx(p.avgEffort);
      const cy = sy(p.avgBenefit);
      const text = p.title.length > 26 ? `${p.title.slice(0, 25)}\u2026` : p.title;
      // Flip the label to the left when drawing it on the right would run past
      // the plot frame. ~6.4px per character at 12.5px is close enough to place it.
      const flip = cx + 16 + text.length * 6.4 > M.left + PLOT_W;
      let ly = cy + 4;
      while (placed.some((q) => Math.abs(q.ly - ly) < 13 && Math.abs(q.cx - cx) < 150)) ly += 13;
      const item = { ...p, cx, cy, ly, flip, text };
      placed.push(item);
      return item;
    });

  const midX = sx(midpoint);
  const midY = sy(midpoint);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
           aria-label={`Benefit against effort for ${points.length} strategies`}
           style={{ display: 'block', maxWidth: '100%' }}>
        {/* quadrant tints: the two good corners lifted very slightly */}
        <rect x={M.left} y={M.top} width={midX - M.left} height={midY - M.top}
              fill="var(--accent)" opacity="0.05" />
        <rect x={midX} y={midY} width={M.left + PLOT_W - midX} height={M.top + PLOT_H - midY}
              fill="var(--text-muted)" opacity="0.05" />

        {ticks.map((v) => (
          <g key={`g${v}`}>
            <line x1={sx(v)} y1={M.top} x2={sx(v)} y2={M.top + PLOT_H}
                  stroke="var(--border)" strokeWidth="1" />
            <line x1={M.left} y1={sy(v)} x2={M.left + PLOT_W} y2={sy(v)}
                  stroke="var(--border)" strokeWidth="1" />
            <text x={sx(v)} y={M.top + PLOT_H + 20} textAnchor="middle"
                  fontSize="12" fill="var(--text-muted)">{v}</text>
            <text x={M.left - 12} y={sy(v) + 4} textAnchor="end"
                  fontSize="12" fill="var(--text-muted)">{v}</text>
          </g>
        ))}

        {/* the split that defines the quadrants */}
        <line x1={midX} y1={M.top} x2={midX} y2={M.top + PLOT_H}
              stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5 4" />
        <line x1={M.left} y1={midY} x2={M.left + PLOT_W} y2={midY}
              stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5 4" />

        <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H}
              fill="none" stroke="var(--border-strong)" strokeWidth="1" />

        {CORNERS.map((c) => (
          <text key={c.key}
                x={c.x === 'left' ? M.left + 12 : M.left + PLOT_W - 12}
                y={c.y === 'top' ? M.top + 20 : M.top + PLOT_H - 10}
                textAnchor={c.x === 'left' ? 'start' : 'end'}
                fontSize="12" fontWeight="600" fill="var(--text-muted)"
                letterSpacing="0.04em" style={{ textTransform: 'uppercase' }}>
            {c.label}
          </text>
        ))}

        <text x={M.left + PLOT_W / 2} y={H - 12} textAnchor="middle"
              fontSize="13" fontWeight="600" fill="var(--text-secondary)">
          Average effort &rarr;
        </text>
        <text x={16} y={M.top + PLOT_H / 2} textAnchor="middle" fontSize="13" fontWeight="600"
              fill="var(--text-secondary)" transform={`rotate(-90 16 ${M.top + PLOT_H / 2})`}>
          Average benefit &rarr;
        </text>

        {laidOut.map((p) => (
          <g key={p.id}
             onMouseEnter={() => setHovered(p)}
             onMouseLeave={() => setHovered(null)}
             style={{ cursor: 'default' }}>
            {/* a generous invisible hit target around a deliberately small mark */}
            <circle cx={p.cx} cy={p.cy} r="20" fill="transparent" />
            <line x1={p.cx} y1={p.cy} x2={p.flip ? p.cx - 13 : p.cx + 13} y2={p.ly - 4}
                  stroke="var(--border-strong)" strokeWidth="1" />
            <circle cx={p.cx} cy={p.cy} r="9"
                    fill="var(--accent)" stroke="var(--surface-1)" strokeWidth="2"
                    opacity={hovered && hovered.id !== p.id ? 0.45 : 1} />
            <text x={p.flip ? p.cx - 16 : p.cx + 16} y={p.ly}
                  textAnchor={p.flip ? 'end' : 'start'}
                  fontSize="12.5" fill="var(--text-primary)"
                  opacity={hovered && hovered.id !== p.id ? 0.45 : 1}>
              {p.text}
            </text>
          </g>
        ))}
      </svg>

      {hovered && (
        <div className="chart-tooltip"
             style={{
               left: `${((hovered.cx + (hovered.flip ? -24 : 24)) / W) * 100}%`,
               top: `${(hovered.cy / H) * 100}%`,
               transform: hovered.flip ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
             }}>
          <strong>{hovered.title}</strong>
          <div className="secondary small">
            Benefit {hovered.avgBenefit.toFixed(1)} &middot; Effort {hovered.avgEffort.toFixed(1)}
          </div>
          <div className="muted small">
            {hovered.rated} rated
            {hovered.notSure > 0 ? `, ${hovered.notSure} not sure` : ''}
            {' '}({hovered.responded} responded)
          </div>
        </div>
      )}
    </div>
  );
}
