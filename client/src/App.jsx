import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.js';
import { getParticipantId, rememberParticipantId, forgetParticipantId } from './identity.js';
import JoinScreen from './screens/JoinScreen.jsx';
import VoteScreen from './screens/VoteScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';

const routeFromHash = () => {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash === 'admin' || hash === 'dashboard' ? hash : 'vote';
};

function ParticipantFlow() {
  const [ballot, setBallot] = useState(null);
  const [ready, setReady] = useState(false);

  // On load, ask the server whether the id in this browser is still real. A
  // stale id (cleared database, different deployment) drops cleanly to Join
  // instead of leaving the page wedged.
  const load = useCallback(async () => {
    if (!getParticipantId()) { setBallot(null); setReady(true); return; }
    try {
      setBallot(await api.ballot());
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) forgetParticipantId();
      setBallot(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the ballot fresh so strategies the facilitator adds, and a lock,
  // show up without anyone reloading.
  useEffect(() => {
    if (!ballot) return undefined;
    const timer = setInterval(async () => {
      try { setBallot(await api.ballot()); } catch { /* transient; the next tick retries */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [Boolean(ballot)]);

  if (!ready) return <div className="spinner">Loading…</div>;

  if (!ballot) {
    const enter = async (participant) => {
      rememberParticipantId(participant.id);
      setBallot(await api.ballot());
    };
    return (
      <JoinScreen
        onJoin={async (name) => enter(await api.join(name))}
        onResume={async (code) => enter(await api.resume(code))}
      />
    );
  }

  return (
    <VoteScreen
      ballot={ballot}
      onResponse={(saved) => setBallot((current) => ({
        ...current,
        responses: [...current.responses.filter((r) => r.strategyId !== saved.strategyId), saved],
      }))}
      onRename={async (name) => {
        const participant = await api.rename(name);
        setBallot((current) => ({ ...current, participant }));
      }}
      onLeave={() => { forgetParticipantId(); setBallot(null); }}
    />
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  const link = (key, label) => (
    <a className="navlink" href={`#/${key === 'vote' ? '' : key}`}
       aria-current={route === key ? 'page' : undefined}>
      {label}
    </a>
  );

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand"><span className="brand-dot" />Strategy voting</span>
        <nav className="navlinks">
          {link('vote', 'Vote')}
          {link('dashboard', 'Dashboard')}
          {link('admin', 'Facilitator')}
        </nav>
      </header>

      {route === 'admin' && <AdminScreen />}
      {route === 'dashboard' && <DashboardScreen />}
      {route === 'vote' && <ParticipantFlow />}
    </div>
  );
}
