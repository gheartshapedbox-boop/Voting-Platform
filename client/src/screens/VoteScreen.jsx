import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import ScoreScale from '../components/ScoreScale.jsx';

/**
 * One card per strategy. A vote saves as soon as both axes have a value, so
 * nobody loses input by closing the tab. Re-scoring updates the same row
 * server-side -- the (participant, strategy) uniqueness is a DB constraint.
 */
export default function VoteScreen({ participant, settings, scale, onRename }) {
  const [strategies, setStrategies] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState({});
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(participant.displayName);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, mine] = await Promise.all([
          api.strategies(),
          api.myVotes(participant.id),
        ]);
        if (cancelled) return;
        setStrategies(list);
        setDrafts(
          Object.fromEntries(
            mine.map((v) => [v.strategyId, { x: v.x, y: v.y, comment: v.comment ?? '' }]),
          ),
        );
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [participant.id]);

  const save = async (strategyId, draft) => {
    if (draft.x == null || draft.y == null) return;
    setStatus((s) => ({ ...s, [strategyId]: 'saving' }));
    try {
      await api.castVote(participant.id, strategyId, {
        x: draft.x, y: draft.y, comment: draft.comment ?? '',
      });
      setStatus((s) => ({ ...s, [strategyId]: 'saved' }));
    } catch (err) {
      setStatus((s) => ({ ...s, [strategyId]: 'error' }));
      setError(err.message);
    }
  };

  const update = (strategyId, patch) => {
    const next = { ...(drafts[strategyId] ?? {}), ...patch };
    setDrafts((d) => ({ ...d, [strategyId]: next }));
    return next;
  };

  const completed = useMemo(
    () => Object.values(drafts).filter((d) => d.x != null && d.y != null).length,
    [drafts],
  );

  const submitRename = async (event) => {
    event.preventDefault();
    try {
      await onRename(nameDraft);
      setRenaming(false);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !strategies) return <div className="page"><div className="error">{error}</div></div>;
  if (!strategies) return <div className="page"><p className="muted">Loading…</p></div>;

  const total = strategies.length;

  return (
    <div className="page">
      <div className="card">
        <div className="row row--between">
          <div>
            <h1>{settings?.event_title}</h1>
            {renaming ? (
              <form className="row" onSubmit={submitRename} style={{ marginTop: 8 }}>
                <input
                  type="text" value={nameDraft} maxLength={40} autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  style={{ width: 200 }}
                />
                <button type="submit" className="small">Save</button>
                <button type="button" className="secondary small" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Voting as <strong>{participant.displayName}</strong>{' '}
                <button className="link" onClick={() => { setNameDraft(participant.displayName); setRenaming(true); }}>
                  change name
                </button>
              </p>
            )}
          </div>
          <div className="chip" title="Use this code to resume on another device">
            Resume code <span className="code">{participant.recoveryCode}</span>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="row row--between tiny muted" style={{ marginBottom: 6 }}>
            <span>Your progress</span>
            <span>{completed} of {total} scored</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: total ? `${(completed / total) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>

      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}

      {total === 0 && (
        <div className="card">
          <h2>Nothing to vote on yet</h2>
          <p className="muted">
            The facilitator has not added any strategies. This page will show them once they do.
          </p>
        </div>
      )}

      {strategies.map((strategy) => {
        const draft = drafts[strategy.id] ?? {};
        const state = status[strategy.id];
        return (
          <div className="card vote-card" key={strategy.id}>
            <div className="row row--between">
              <h2 style={{ marginBottom: 4 }}>{strategy.title}</h2>
              {state === 'saved' && <span className="badge badge--good">✓ Saved</span>}
              {state === 'saving' && <span className="badge">Saving…</span>}
              {draft.x != null && draft.y != null && !state && <span className="badge">Recorded earlier</span>}
            </div>
            {strategy.description && <p className="muted small">{strategy.description}</p>}

            <div className="stack" style={{ marginTop: 14 }}>
              <div>
                <label>{settings?.y_label}</label>
                {settings?.y_hint && <p className="tiny muted" style={{ marginTop: -4 }}>{settings.y_hint}</p>}
                <ScoreScale
                  name={settings?.y_label} value={draft.y ?? null}
                  min={scale.min} max={scale.max}
                  lowLabel={`1 · low`} highLabel={`${scale.max} · high`}
                  onChange={(y) => save(strategy.id, update(strategy.id, { y }))}
                />
              </div>
              <div>
                <label>{settings?.x_label}</label>
                {settings?.x_hint && <p className="tiny muted" style={{ marginTop: -4 }}>{settings.x_hint}</p>}
                <ScoreScale
                  name={settings?.x_label} value={draft.x ?? null}
                  min={scale.min} max={scale.max}
                  lowLabel={`1 · low`} highLabel={`${scale.max} · high`}
                  onChange={(x) => save(strategy.id, update(strategy.id, { x }))}
                />
              </div>
              <div>
                <label htmlFor={`c-${strategy.id}`}>Why? (optional)</label>
                <textarea
                  id={`c-${strategy.id}`}
                  maxLength={500}
                  value={draft.comment ?? ''}
                  placeholder="One line on your reasoning"
                  onChange={(e) => update(strategy.id, { comment: e.target.value })}
                  onBlur={() => save(strategy.id, drafts[strategy.id] ?? {})}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
