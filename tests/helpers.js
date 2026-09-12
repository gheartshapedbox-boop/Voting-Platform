import { openDb, DEFAULT_SESSION_ID } from '../server/db/index.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

/** A fresh in-memory Postgres per test: no fixtures to reset, no shared state. */
export async function freshStore() {
  const db = await openDb();
  return { db, store: createStore(db), sessionId: DEFAULT_SESSION_ID };
}

export async function startServer() {
  const { db, store, sessionId } = await freshStore();
  const app = createApp({ store, sessionId, serveClient: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { body, headers = {} } = {}) => {
    const sendsBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: sendsBody ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  return {
    store,
    sessionId,
    call,
    async close() {
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}

export const asParticipant = (id) => ({ 'x-participant-id': id });
export const asAdmin = (token) => ({ authorization: `Bearer ${token}` });
