import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import {
  forgetParticipant,
  rememberParticipant,
  storedParticipantId,
} from './identity.js';
import AdminScreen from './screens/AdminScreen.jsx';
import JoinScreen from './screens/JoinScreen.jsx';
import ResultsScreen from './screens/ResultsScreen.jsx';
import VoteScreen from './screens/VoteScreen.jsx';

/** Minimal history-based router -- three screens do not need a routing library. */
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next) => {
    window.history.pushState({}, '', next);
    setPath(next);
  }, []);
  return [path, go];
}

export default function App() {
  const [path, go] = useRoute();
  const [session, setSession] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [justJoined, setJustJoined] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setSession(await api.session());
      } catch {
        setSession({ settings: {}, scale: { min: 1, max: 10 } });
      }

      // Restore the identity this browser already holds. The UUID is the only
      // thing stored; the server decides whether it is still valid.
      const id = storedParticipantId();
      if (id) {
        try {
          setParticipant(await api.restore(id));
        } catch {
          forgetParticipant(); // deleted or from a reset database
        }
      }
      setReady(true);
    })();
  }, []);

  const handleJoined = (next, { isNew } = {}) => {
    rememberParticipant(next);
    setParticipant(next);
    setJustJoined(!!isNew);
  };

  const handleRename = async (displayName) => {
    // Same participant id, new label -- votes are untouched.
    const updated = await api.rename(participant.id, displayName);
    rememberParticipant(updated);
    setParticipant(updated);
  };

  const leave = () => {
    forgetParticipant();
    setParticipant(null);
    setJustJoined(false);
    go('/');
  };

  if (!ready) return <div className="page"><p className="muted">Loading…</p></div>;

  const isAdmin = path.startsWith('/admin');
  const isResults = path.startsWith('/results');

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <nav className="nav">
            <button onClick={() => go('/')} aria-current={!isAdmin && !isResults ? 'page' : undefined}>
              Vote
            </button>
            <button onClick={() => go('/results')} aria-current={isResults ? 'page' : undefined}>
              Results
            </button>
            <button onClick={() => go('/admin')} aria-current={isAdmin ? 'page' : undefined}>
              Facilitator
            </button>
          </nav>
          {participant && !isAdmin && (
            <div className="row" style={{ gap: 8 }}>
              <span className="chip">{participant.displayName}</span>
              <button className="link tiny" onClick={leave}>Not you?</button>
            </div>
          )}
        </div>
      </header>

      {isAdmin ? (
        <AdminScreen />
      ) : isResults ? (
        <ResultsScreen />
      ) : participant ? (
        <>
          {justJoined && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="notice">
                <strong>You&rsquo;re in, {participant.displayName}.</strong> This browser will
                remember you. To carry on from another device, use your resume code{' '}
                <span className="code">{participant.recoveryCode}</span>.{' '}
                <button className="link" onClick={() => setJustJoined(false)}>Got it</button>
              </div>
            </div>
          )}
          <VoteScreen
            participant={participant}
            settings={session.settings}
            scale={session.scale}
            onRename={handleRename}
          />
        </>
      ) : (
        <JoinScreen settings={session.settings} onJoined={handleJoined} />
      )}
    </>
  );
}
