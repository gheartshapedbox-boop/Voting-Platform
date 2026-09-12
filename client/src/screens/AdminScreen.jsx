import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { forgetAdminToken, rememberAdminToken, storedAdminToken } from '../identity.js';

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function AdminLogin({ onToken }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api.admin.login(passcode);
      rememberAdminToken(token);
      onToken(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <div className="card">
        <h1>Facilitator access</h1>
        <p className="muted small">
          The passcode is checked on the server. Every admin action is re-checked
          against the issued token, so there is nothing here a hidden button would unlock.
        </p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit}>
          <label htmlFor="passcode">Admin passcode</label>
          <input id="passcode" type="password" value={passcode} autoFocus
                 onChange={(e) => setPasscode(e.target.value)} />
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy || !passcode}>{busy ? 'Checking…' : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StrategyManager({ token, strategies, reload }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const guard = async (fn) => {
    try { await fn(); setError(''); await reload(); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <h2>Strategies</h2>
      {error && <div className="error">{error}</div>}

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          guard(async () => {
            await api.admin.createStrategy(token, { title, description });
            setTitle('');
            setDescription('');
          });
        }}
      >
        <div>
          <label htmlFor="s-title">New strategy</label>
          <input id="s-title" type="text" value={title} maxLength={120}
                 placeholder="e.g. Launch a self-serve tier"
                 onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="s-desc">Description (optional)</label>
          <textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div><button type="submit" disabled={!title.trim()}>Add strategy</button></div>
      </form>

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr><th>Title</th><th>Status</th><th style={{ width: 250 }}>Actions</th></tr>
          </thead>
          <tbody>
            {strategies.length === 0 && (
              <tr><td colSpan={3} className="muted">No strategies yet.</td></tr>
            )}
            {strategies.map((s) => (
              <tr key={s.id}>
                <td>
                  {editing?.id === s.id ? (
                    <form
                      className="stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        guard(async () => {
                          await api.admin.updateStrategy(token, s.id, {
                            title: editing.title, description: editing.description,
                          });
                          setEditing(null);
                        });
                      }}
                    >
                      <input type="text" value={editing.title}
                             onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                      <textarea value={editing.description}
                                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                      <div className="row">
                        <button type="submit" className="small">Save</button>
                        <button type="button" className="secondary small" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <strong>{s.title}</strong>
                      {s.description && <div className="tiny muted">{s.description}</div>}
                    </>
                  )}
                </td>
                <td>
                  <span className="badge">{s.archived ? 'Hidden' : 'Live'}</span>
                </td>
                <td>
                  {editing?.id !== s.id && (
                    <div className="row" style={{ gap: 6 }}>
                      <button className="secondary small"
                              onClick={() => setEditing({ id: s.id, title: s.title, description: s.description })}>
                        Edit
                      </button>
                      <button className="secondary small"
                              onClick={() => guard(() => api.admin.updateStrategy(token, s.id, { archived: !s.archived }))}>
                        {s.archived ? 'Show' : 'Hide'}
                      </button>
                      <button
                        className="danger small"
                        onClick={() => {
                          if (confirm(`Delete "${s.title}" and all votes on it?`)) {
                            guard(() => api.admin.deleteStrategy(token, s.id));
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsPanel({ token, settings, reload }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(settings), [settings]);

  const field = (key, label) => (
    <div key={key}>
      <label htmlFor={key}>{label}</label>
      <input id={key} type="text" value={draft[key] ?? ''}
             onChange={(e) => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }} />
    </div>
  );

  return (
    <div className="card">
      <h2>Wording</h2>
      <p className="tiny muted">Axis labels feed the voting screen and the chart.</p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.admin.updateSettings(token, draft);
          await reload();
          setSaved(true);
        }}
      >
        {field('event_title', 'Event title')}
        {field('y_label', 'Vertical axis label')}
        {field('y_hint', 'Vertical axis hint')}
        {field('x_label', 'Horizontal axis label')}
        {field('x_hint', 'Horizontal axis hint')}
        <div className="row">
          <button type="submit">Save wording</button>
          {saved && <span className="badge badge--good">✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}

export default function AdminScreen() {
  const [token, setToken] = useState(storedAdminToken());
  const [checked, setChecked] = useState(false);
  const [roster, setRoster] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');

  const signOut = useCallback(async () => {
    if (token) await api.admin.logout(token).catch(() => {});
    forgetAdminToken();
    setToken(null);
  }, [token]);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const [people, list, session] = await Promise.all([
        api.admin.participants(token),
        api.admin.strategies(token),
        api.session(),
      ]);
      setRoster(people);
      setStrategies(list);
      setSettings(session.settings);
      setError('');
    } catch (err) {
      if (err.status === 401) { forgetAdminToken(); setToken(null); }
      else setError(err.message);
    }
  }, [token]);

  // Verify the stored token with the server before trusting it.
  useEffect(() => {
    if (!token) { setChecked(true); return; }
    api.admin.check(token)
      .then(() => reload())
      .catch(() => { forgetAdminToken(); setToken(null); })
      .finally(() => setChecked(true));
  }, [token, reload]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = setInterval(reload, 6000);
    return () => clearInterval(timer);
  }, [token, reload]);

  if (!checked) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!token) return <AdminLogin onToken={setToken} />;

  const participation = roster?.participation;

  return (
    <div className="page page--wide">
      <div className="row row--between" style={{ marginBottom: 16 }}>
        <h1>Facilitator dashboard</h1>
        <button className="secondary small" onClick={signOut}>Sign out</button>
      </div>
      {error && <div className="error">{error}</div>}

      {participation && (
        <div className="tiles" style={{ marginBottom: 16 }}>
          <div className="tile">
            <div className="value">{participation.participantCount}</div>
            <div className="label">Joined</div>
          </div>
          <div className="tile">
            <div className="value">{participation.respondedCount}</div>
            <div className="label">Responded</div>
          </div>
          <div className="tile">
            <div className="value">{participation.completedCount}</div>
            <div className="label">Finished all {participation.strategyCount}</div>
          </div>
          <div className="tile">
            <div className="value">{participation.totalVotes}</div>
            <div className="label">Votes cast</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Participants</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Joined</th>
                <th className="num">Responded</th>
                <th>Resume code</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(roster?.participants ?? []).length === 0 && (
                <tr><td colSpan={5} className="muted">Nobody has joined yet.</td></tr>
              )}
              {(roster?.participants ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.displayName}
                    {/* Display names are not unique; the id is the identity. */}
                    <div className="tiny muted" title={p.id}>id {p.id.slice(0, 8)}…</div>
                  </td>
                  <td>{when(p.joinedAt)}</td>
                  <td className="num">
                    {p.votesCast} / {p.strategyCount}{' '}
                    {p.complete && p.strategyCount > 0 && <span className="badge badge--good">done</span>}
                  </td>
                  <td><span className="code">{p.recoveryCode}</span></td>
                  <td>
                    <button
                      className="danger small"
                      onClick={async () => {
                        if (confirm(`Remove ${p.displayName} and their votes?`)) {
                          await api.admin.removeParticipant(token, p.id);
                          reload();
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <StrategyManager token={token} strategies={strategies} reload={reload} />
      <SettingsPanel token={token} settings={settings} reload={reload} />

      <div className="card">
        <h2>Reset</h2>
        <p className="muted small">
          Clears every vote but keeps participants and strategies &mdash; handy between
          practice runs.
        </p>
        <button
          className="danger"
          onClick={async () => {
            if (confirm('Delete all votes? Participants and strategies are kept.')) {
              await api.admin.resetVotes(token);
              reload();
            }
          }}
        >
          Clear all votes
        </button>
      </div>
    </div>
  );
}
