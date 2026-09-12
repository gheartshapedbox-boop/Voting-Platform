import React, { useState } from 'react';
import ScorePicker from '../components/ScorePicker.jsx';
import { api } from '../api.js';

function StrategyCard({ strategy, response, locked, onSaved }) {
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const kind = response?.kind ?? null;
  const benefit = response?.benefit ?? null;
  const effort = response?.effort ?? null;

  // A rating is only sent once both axes are set; until then it is a local draft.
  const [draft, setDraft] = useState({ benefit, effort });
  const shownBenefit = kind === 'RATED' ? benefit : draft.benefit;
  const shownEffort = kind === 'RATED' ? effort : draft.effort;

  const send = async (body) => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.vote(strategy.id, body));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pick = (axis, value) => {
    const next = { benefit: shownBenefit, effort: shownEffort, [axis]: value };
    setDraft(next);
    if (next.benefit != null && next.effort != null) {
      send({ kind: 'RATED', benefit: next.benefit, effort: next.effort });
    }
  };

  return (
    <div className={`vote-card stack ${kind ? 'answered' : ''}`}>
      <div className="row-between">
        <h3 className="grow">{strategy.title}</h3>
        {kind === 'RATED' && <span className="badge open">Rated</span>}
        {kind === 'NOT_SURE' && <span className="badge">Not sure</span>}
        {!kind && <span className="badge muted">No answer yet</span>}
      </div>
      {strategy.description && <p className="secondary small">{strategy.description}</p>}

      <div className="stack-s">
        <ScorePicker label="Benefit" hint="1 = low · 5 = high" disabled={locked || saving}
                     value={kind === 'NOT_SURE' ? null : shownBenefit}
                     onChange={(v) => pick('benefit', v)} />
        <ScorePicker label="Effort" hint="1 = easy · 5 = hard" disabled={locked || saving}
                     value={kind === 'NOT_SURE' ? null : shownEffort}
                     onChange={(v) => pick('effort', v)} />
      </div>

      <div className="row-between">
        <button type="button" className="sm" disabled={locked || saving}
                aria-pressed={kind === 'NOT_SURE'}
                onClick={() => send({ kind: 'NOT_SURE' })}>
          {kind === 'NOT_SURE' ? "✓ Marked not sure" : "I'm not sure"}
        </button>
        {kind !== 'RATED' && shownBenefit != null && shownEffort == null && (
          <span className="muted small">Pick an effort score to save</span>
        )}
        {kind !== 'RATED' && shownEffort != null && shownBenefit == null && (
          <span className="muted small">Pick a benefit score to save</span>
        )}
      </div>

      {error && <div className="notice error small">{error}</div>}
    </div>
  );
}

export default function VoteScreen({ ballot, onResponse, onRename, onLeave }) {
  const { session, participant, strategies, responses } = ballot;
  const locked = session.status === 'LOCKED';
  const byStrategy = new Map(responses.map((r) => [r.strategyId, r]));
  const answered = strategies.filter((s) => byStrategy.has(s.id)).length;

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(participant.displayName);
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="stack">
      <div className="card stack-s">
        <div className="row-between">
          <div className="grow">
            {renaming ? (
              <form className="row" onSubmit={async (e) => {
                e.preventDefault();
                await onRename(newName);
                setRenaming(false);
              }}>
                <input type="text" className="grow" value={newName} maxLength={40} autoFocus
                       onChange={(e) => setNewName(e.target.value)} />
                <button type="submit" className="primary sm">Save</button>
                <button type="button" className="ghost sm" onClick={() => setRenaming(false)}>Cancel</button>
              </form>
            ) : (
              <div className="row">
                <h2>{participant.displayName}</h2>
                <button className="ghost sm" onClick={() => { setNewName(participant.displayName); setRenaming(true); }}>
                  Rename
                </button>
              </div>
            )}
          </div>
          <span className={`badge ${locked ? 'locked' : 'open'}`}>
            {locked ? 'Voting locked' : 'Voting open'}
          </span>
        </div>

        <div className="row-between">
          <span className="secondary small">
            {answered} of {strategies.length} answered
          </span>
          <div className="progress-track grow" style={{ maxWidth: 260 }}>
            <div className="progress-fill"
                 style={{ width: strategies.length ? `${(answered / strategies.length) * 100}%` : '0%' }} />
          </div>
        </div>

        <div className="row small">
          <button className="ghost small" onClick={() => setShowCode((v) => !v)}>
            {showCode ? 'Hide' : 'Show'} my resume code
          </button>
          {showCode && <span className="code-chip">{participant.recoveryCode}</span>}
          {showCode && <span className="muted small">Use this to pick up where you left off on another device.</span>}
          <span className="grow" />
          <button className="ghost small" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {locked && (
        <div className="notice warn">
          Voting is locked. Your answers are saved — the facilitator has closed changes for now.
        </div>
      )}

      {strategies.length === 0 ? (
        <div className="card center secondary">
          No strategies have been added yet. Hold tight — this page updates when you refresh.
        </div>
      ) : (
        <div className="stack">
          {strategies.map((s) => (
            <StrategyCard key={s.id} strategy={s} locked={locked}
                          response={byStrategy.get(s.id)} onSaved={onResponse} />
          ))}
        </div>
      )}

      {strategies.length > 0 && answered === strategies.length && (
        <div className="notice">
          All done — thank you. You can change any answer while voting is open.
        </div>
      )}
    </div>
  );
}
