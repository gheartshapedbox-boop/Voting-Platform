import React, { useState } from 'react';

export default function JoinScreen({ onJoin, onResume, sessionName }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showResume, setShowResume] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (showResume) await onResume(code);
      else await onJoin(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 420, margin: '6vh auto 0' }}>
      <div className="center stack-s">
        <h1>{sessionName ?? 'Strategy voting'}</h1>
        <p className="secondary">No sign-up. Pick a name and you are in.</p>
      </div>

      <form className="card stack" onSubmit={submit}>
        {showResume ? (
          <label className="field">
            Your resume code
            <input type="text" className="input-xl code-input" value={code} autoFocus
                   maxLength={5} placeholder="K7M4Q" autoComplete="off"
                   style={{ letterSpacing: '.2em', textTransform: 'uppercase' }}
                   onChange={(e) => setCode(e.target.value)} />
          </label>
        ) : (
          <label className="field">
            Enter your name or moniker
            <input type="text" className="input-xl" value={name} autoFocus
                   maxLength={40} placeholder="e.g. Quoc Duy" autoComplete="off"
                   onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        {error && <div className="notice error">{error}</div>}

        <button type="submit" className="primary xl"
                disabled={busy || (showResume ? !code.trim() : !name.trim())}>
          {busy ? 'One moment…' : showResume ? 'Resume' : 'Join'}
        </button>

        <div className="center small">
          {showResume ? (
            <button type="button" className="ghost small"
                    onClick={() => { setShowResume(false); setError(null); }}>
              ← Back to joining
            </button>
          ) : (
            <span className="muted">
              Already participated?{' '}
              <button type="button" className="ghost small"
                      onClick={() => { setShowResume(true); setError(null); }}>
                Resume with code
              </button>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
