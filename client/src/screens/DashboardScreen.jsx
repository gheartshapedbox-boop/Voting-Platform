import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ResultsPanel from '../components/ResultsPanel.jsx';

export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await api.results();
        if (alive) { setData(next); setError(null); }
      } catch (err) {
        if (alive) setError(err.message);
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (!data) return <div className="spinner">Loading results…</div>;

  return (
    <div className="stack">
      <div className="row-between">
        <h1>{data.session.name}</h1>
        <span className={`badge ${data.session.status === 'LOCKED' ? 'locked' : 'open'}`}>
          {data.session.status === 'LOCKED' ? 'Voting locked' : 'Voting open'}
        </span>
      </div>
      <ResultsPanel {...data} />
      <p className="muted small center">Refreshes every 5 seconds. Individual votes are never shown.</p>
    </div>
  );
}
