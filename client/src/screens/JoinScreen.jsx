import React, { useState } from 'react';
import { api } from '../api.js';

/**
 * Kahoot-style entry: a name and a button. No email, no password.
 * "Resume with code" is the discreet second path for someone returning on a
 * different browser or device.
 */
export default function JoinScreen({ settings, onJoined }) {
  const [mode, setMode] = useState('join');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const participant =
        mode === 'join' ? await api.join(name) : await api.resume(code);
      onJoined(participant, { isNew: mode === 'join' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <div className="card">
        <h1>{settings?.event_title ?? 'Strategy Voting'}</h1>

        {mode === 'join' ? (
          <form onSubmit={submit}>
            <p className="muted small">
              No account needed. Pick any name &mdash; it is just a label for the room.
            </p>
            {error && <div className="error">{error}</div>}
            <label htmlFor="display-name">Enter your name or moniker</label>
            <input
              id="display-name"
              type="text"
              value={name}
              autoFocus
              autoComplete="off"
              maxLength={40}
              placeholder="e.g. Quoc Duy"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="row" style={{ marginTop: 16 }}>
              <button type="submit" disabled={busy || name.trim() === ''}>
                {busy ? 'Joining…' : 'Join'}
              </button>
            </div>
            <div style={{ marginTop: 18 }} className="tiny muted">
              Already participated?{' '}
              <button type="button" className="link" onClick={() => { setMode('resume'); setError(''); }}>
                Resume with code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit}>
            <p className="muted small">
              Enter the 5-character code shown when you first joined.
            </p>
            {error && <div className="error">{error}</div>}
            <label htmlFor="recovery-code">Recovery code</label>
            <input
              id="recovery-code"
              type="text"
              className="code"
              value={code}
              autoFocus
              autoComplete="off"
              maxLength={7}
              placeholder="K7M4Q"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <div className="row" style={{ marginTop: 16 }}>
              <button type="submit" disabled={busy || code.trim().length < 5}>
                {busy ? 'Checking…' : 'Resume'}
              </button>
              <button type="button" className="secondary" onClick={() => { setMode('join'); setError(''); }}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
