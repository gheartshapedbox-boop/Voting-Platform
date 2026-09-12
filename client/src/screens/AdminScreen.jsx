import React, { useEffect, useState } from 'react';
import { api, setAdminToken, hasAdminToken } from '../api.js';
import ResultsPanel from '../components/ResultsPanel.jsx';

function LoginCard({ onSignedIn }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  return (
    <form className="card stack" style={{ maxWidth: 380, margin: '6vh auto 0' }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            try {
              const { token } = await api.adminLogin(passcode);
              setAdminToken(token);
              onSignedIn();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}>
      <h1>Facilitator</h1>
      <label className="field">
        Admin passcode
        <input type="password" value={passcode} autoFocus autoComplete="current-password"
               onChange={(e) => setPasscode(e.target.value)} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="primary xl" disabled={busy || !passcode}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      <p className="muted small">
        Every admin action is checked against this sign-in on the server, not in the browser.
      </p>
    </form>
  );
}

function StrategyRow({ strategy, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(strategy.title);
  const [description, setDescription] = useState(strategy.description ?? '');

  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <form className="stack-s" onSubmit={async (e) => {
            e.preventDefault();
            await api.editStrategy(strategy.id, { title, description });
            setEditing(false);
            onChanged();
          }}>
            <input type="text" value={title} maxLength={120} autoFocus
                   onChange={(e) => setTitle(e.target.value)} />
            <textarea value={description} placeholder="Optional description"
                      onChange={(e) => setDescription(e.target.value)} />
            <div className="row">
              <button type="submit" className="primary sm" disabled={!title.trim()}>Save</button>
              <button type="button" className="ghost sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr style={strategy.archived ? { opacity: 0.6 } : undefined}>
      <td>
        <div className="row">
          <span>{strategy.title}</span>
          {strategy.archived && <span className="badge archived">Archived</span>}
        </div>
        {strategy.description && <div className="muted small">{strategy.description}</div>}
      </td>
      <td className="num">{strategy.responded}</td>
      <td className="num">{strategy.rated}</td>
      <td className="num">{strategy.notSure}</td>
      <td>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost sm" onClick={() => setEditing(true)}>Edit</button>
          {strategy.archived ? (
            <button className="sm" onClick={async () => { await api.restoreStrategy(strategy.id); onChanged(); }}>
              Restore
            </button>
          ) : (
            <button className="sm danger" onClick={async () => { await api.archiveStrategy(strategy.id); onChanged(); }}>
              Archive
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminScreen() {
  const [signedIn, setSignedIn] = useState(hasAdminToken());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const refresh = async () => {
    try {
      setData(await api.overview());
      setError(null);
    } catch (err) {
      if (err.status === 401) { setAdminToken(null); setSignedIn(false); }
      else setError(err.message);
    }
  };

  useEffect(() => {
    if (!signedIn) return undefined;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [signedIn]);

  if (!signedIn) return <LoginCard onSignedIn={() => setSignedIn(true)} />;
  if (!data) return <div className="spinner">Loading…</div>;

  const locked = data.session.status === 'LOCKED';
  const visibleStrategies = data.strategies.filter((s) => showArchived || !s.archived);
  const archivedCount = data.strategies.filter((s) => s.archived).length;
  const joinUrl = `${location.origin}/`;

  return (
    <div className="stack">
      {error && <div className="notice error">{error}</div>}

      <div className="row-between">
        <h1>Facilitator</h1>
        <div className="row">
          <span className={`badge ${locked ? 'locked' : 'open'}`}>
            {locked ? 'Voting locked' : 'Voting open'}
          </span>
          <button className="ghost sm" onClick={async () => {
            try { await api.adminLogout(); } finally { setAdminToken(null); setSignedIn(false); }
          }}>Sign out</button>
        </div>
      </div>

      {/* ---- session control ---- */}
      <div className="card stack-s">
        <div className="row-between">
          <div>
            <h2>Session</h2>
            <p className="secondary small">
              {locked
                ? 'Participants can see their answers but cannot change them.'
                : 'Participants can add and change answers.'}
            </p>
          </div>
          <div className="row">
            <button className={locked ? 'primary' : ''}
                    onClick={async () => { await api.setStatus(locked ? 'OPEN' : 'LOCKED'); refresh(); }}>
              {locked ? 'Reopen voting' : 'Lock voting'}
            </button>
            <button className="danger sm" onClick={async () => {
              if (confirm('Delete every response in this session? This cannot be undone.')) {
                await api.clearResponses();
                refresh();
              }
            }}>Clear all responses</button>
          </div>
        </div>
        <div className="panel small secondary">
          Participants join at <strong>{joinUrl}</strong> — no account needed.
        </div>
      </div>

      {/* ---- strategies ---- */}
      <div className="card stack">
        <div className="row-between">
          <h2>Strategies</h2>
          {archivedCount > 0 && (
            <button className="ghost sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
            </button>
          )}
        </div>

        <form className="stack-s" onSubmit={async (e) => {
          e.preventDefault();
          await api.addStrategy(newTitle, newDescription);
          setNewTitle(''); setNewDescription('');
          refresh();
        }}>
          <div className="row">
            <input className="grow" type="text" value={newTitle} maxLength={120}
                   placeholder="Add a strategy…" onChange={(e) => setNewTitle(e.target.value)} />
            <button type="submit" className="primary" disabled={!newTitle.trim()}>Add</button>
          </div>
          {newTitle.trim() && (
            <textarea value={newDescription} placeholder="Optional description"
                      onChange={(e) => setNewDescription(e.target.value)} />
          )}
        </form>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="num">Responded</th>
                <th className="num">Rated</th>
                <th className="num">Not sure</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleStrategies.length === 0 && (
                <tr><td colSpan={5} className="center muted" style={{ padding: 24 }}>
                  Nothing yet — add the first strategy above.
                </td></tr>
              )}
              {visibleStrategies.map((s) => (
                <StrategyRow key={s.id} strategy={s} onChanged={refresh} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Archiving takes a strategy off the ballot and the dashboard. Its responses are kept,
          and restoring brings them back.
        </p>
      </div>

      {/* ---- participants ---- */}
      <div className="card stack">
        <div className="row-between">
          <h2>Participants</h2>
          <span className="badge">{data.participants.length} joined</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Joined</th>
                <th>Progress</th>
                <th>Resume code</th>
              </tr>
            </thead>
            <tbody>
              {data.participants.length === 0 && (
                <tr><td colSpan={4} className="center muted" style={{ padding: 24 }}>
                  No one has joined yet.
                </td></tr>
              )}
              {data.participants.map((p) => (
                <tr key={p.id}>
                  <td>{p.displayName}</td>
                  <td className="muted small">{new Date(p.joinedAt).toLocaleTimeString()}</td>
                  <td>
                    <div className="row">
                      <span className="small secondary" style={{ minWidth: 42 }}>
                        {p.responded}/{p.total}
                      </span>
                      <div className="progress-track" style={{ width: 90 }}>
                        <div className="progress-fill"
                             style={{ width: p.total ? `${(p.responded / p.total) * 100}%` : '0%' }} />
                      </div>
                    </div>
                  </td>
                  <td><span className="code-chip">{p.recoveryCode}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Names are labels, not identities — two people may share one. Responses on the dashboard
          are never attributed.
        </p>
      </div>

      <ResultsPanel plotted={data.plotted} unplotted={data.unplotted}
                    strategies={data.strategies} participantCount={data.participants.length} />
    </div>
  );
}
