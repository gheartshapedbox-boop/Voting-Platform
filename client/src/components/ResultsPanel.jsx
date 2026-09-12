import React from 'react';
import QuadrantChart from './QuadrantChart.jsx';

const QUADRANT_LABELS = {
  QUICK_WIN: 'Quick win',
  BIG_BET: 'Big bet',
  FILL_IN: 'Fill-in',
  AVOID: 'Thankless',
};

const fmt = (n) => (n == null ? '—' : n.toFixed(1));

export default function ResultsPanel({ plotted, unplotted, strategies, participantCount }) {
  const ranked = [...strategies].sort((a, b) => {
    if (a.rated === 0 && b.rated !== 0) return 1;
    if (b.rated === 0 && a.rated !== 0) return -1;
    // Best first: most benefit for least effort.
    return (b.avgBenefit - b.avgEffort) - (a.avgBenefit - a.avgEffort);
  });

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row-between">
          <div>
            <h2>Final dashboard</h2>
            <p className="secondary small">
              Average benefit against average effort, using rated responses only.
            </p>
          </div>
          {participantCount != null && (
            <span className="badge">{participantCount} participant{participantCount === 1 ? '' : 's'}</span>
          )}
        </div>

        {plotted.length === 0 ? (
          <div className="panel center secondary" style={{ padding: 48 }}>
            Nothing to plot yet. A strategy appears here once at least one person rates it.
          </div>
        ) : (
          <>
            <QuadrantChart points={plotted} />
            <div className="legend">
              <span><span className="legend-swatch" />Strategy (hover for counts)</span>
              <span className="muted">Dashed lines split the scale at 3.</span>
            </div>
          </>
        )}
      </div>

      {unplotted.length > 0 && (
        <div className="notice warn">
          <strong>Not on the chart ({unplotted.length}):</strong>{' '}
          {unplotted.map((s) => s.title).join(', ')}.{' '}
          <span className="secondary">No one has rated these, so they have no position.</span>
        </div>
      )}

      <div className="card card-flush">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="num">Responded</th>
                <th className="num">Rated</th>
                <th className="num">Not sure</th>
                <th className="num">Avg benefit</th>
                <th className="num">Avg effort</th>
                <th>Quadrant</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length === 0 && (
                <tr><td colSpan={7} className="center muted" style={{ padding: 28 }}>No strategies yet.</td></tr>
              )}
              {ranked.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.title}{' '}
                    {s.archived && <span className="badge archived">Archived</span>}
                  </td>
                  <td className="num">{s.responded}</td>
                  <td className="num">{s.rated}</td>
                  <td className="num">{s.notSure}</td>
                  <td className="num">{fmt(s.avgBenefit)}</td>
                  <td className="num">{fmt(s.avgEffort)}</td>
                  <td className="muted small">{s.quadrant ? QUADRANT_LABELS[s.quadrant] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
