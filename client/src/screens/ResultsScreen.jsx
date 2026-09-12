import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import QuadrantChart from '../components/QuadrantChart.jsx';

const QUADRANT_NAMES = {
  'high-high': 'DO NOW',
  'low-high': 'BIG BETS',
  'high-low': 'EASY FILLS',
  'low-low': 'DEPRIORITISE',
};

const fmt = (n) => (n == null ? '—' : n.toFixed(1));

export default function ResultsScreen({ pollMs = 5000 }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await api.results();
        if (!cancelled) { setData(next); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    load();
    const timer = setInterval(load, pollMs); // good enough for a workshop; no websockets needed
    return () => { cancelled = true; clearInterval(timer); };
  }, [pollMs]);

  const selected = useMemo(
    () => data?.strategies.find((s) => s.id === selectedId) ?? null,
    [data, selectedId],
  );

  if (error && !data) return <div className="page"><div className="error">{error}</div></div>;
  if (!data) return <div className="page"><p className="muted">Loading results…</p></div>;

  const { settings, scale, strategies, participation } = data;
  const scored = strategies.filter((s) => s.voteCount > 0);

  const means = scored.map((s) => ({
    id: s.id,
    label: s.title,
    x: s.mean.x,
    y: s.mean.y,
    voteCount: s.voteCount,
    contested: s.contested,
  }));

  return (
    <div className="page page--wide">
      <h1>{settings.event_title}</h1>
      <p className="muted small">
        Each dot is a strategy at the room&rsquo;s average score. Votes are anonymous.
      </p>

      <div className="tiles" style={{ margin: '18px 0' }}>
        <div className="tile">
          <div className="value">{participation.respondedCount}<span className="muted" style={{ fontSize: '1rem' }}> / {participation.participantCount}</span></div>
          <div className="label">Participants responded</div>
        </div>
        <div className="tile">
          <div className="value">{participation.completedCount}</div>
          <div className="label">Scored every strategy</div>
        </div>
        <div className="tile">
          <div className="value">{participation.totalVotes}</div>
          <div className="label">Votes cast</div>
        </div>
        <div className="tile">
          <div className="value">{scored.filter((s) => s.contested).length}</div>
          <div className="label">Strategies the room is split on</div>
        </div>
      </div>

      <div className="layout-split">
        <div className="card">
          <h2>{settings.y_label} vs {settings.x_label}</h2>
          {scored.length === 0 ? (
            <p className="muted">No votes yet. The chart fills in as people score.</p>
          ) : (
            <>
              <QuadrantChart
                means={means}
                votes={selected ? selected.points : []}
                xLabel={settings.x_label}
                yLabel={settings.y_label}
                scale={scale}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                quadrantNames={QUADRANT_NAMES}
              />
              <div className="legend">
                <span className="legend-item">
                  <svg width="16" height="16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
                  </svg>
                  Strategy average
                </span>
                {selected && (
                  <span className="legend-item">
                    <svg width="16" height="16" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" fill="var(--series-1)" fillOpacity="0.22"
                              stroke="var(--series-1)" strokeWidth="1.5" />
                    </svg>
                    Individual votes for {selected.title} (bigger dot = more votes on that spot)
                  </span>
                )}
                <span className="legend-item">
                  <svg width="16" height="16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="var(--series-2)"
                            strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                  Room is split
                </span>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Strategies</h2>
          <p className="tiny muted">Select one to see how individual votes were spread.</p>
          <ul className="strategy-list">
            {strategies.map((s) => (
              <li key={s.id}>
                <button
                  aria-pressed={s.id === selectedId}
                  disabled={s.voteCount === 0}
                  onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
                >
                  {s.title}
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {s.voteCount === 0 ? 'no votes yet' : `${s.voteCount} ${s.voteCount === 1 ? 'vote' : 'votes'}`}
                    {s.contested ? ' · split' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The table view: everything the chart shows, readable without colour. */}
      <div className="card">
        <h2>All results</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="num">Votes</th>
                <th className="num">Avg {settings.y_label}</th>
                <th className="num">Avg {settings.x_label}</th>
                <th className="num">Spread</th>
                <th>Quadrant</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={s.id} className={s.id === selectedId ? 'is-selected' : undefined}>
                  <td>
                    {s.title}{' '}
                    {s.contested && <span className="badge badge--split">split</span>}
                  </td>
                  <td className="num">{s.voteCount}</td>
                  <td className="num">{fmt(s.mean.y)}</td>
                  <td className="num">{fmt(s.mean.x)}</td>
                  <td className="num">{s.voteCount ? s.dispersion.toFixed(2) : '—'}</td>
                  <td>{s.quadrant ? QUADRANT_NAMES[s.quadrant] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
