import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DEFAULT_SESSION_ID, getDb } from './db/index.js';
import { createStore } from './store.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { AppError } from './errors.js';
import { DEFAULT_PASSCODE, adminPasscode } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '../client/dist');

export function createApp({ store, sessionId = DEFAULT_SESSION_ID, serveClient = true } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  // One store instance per request, resolved lazily so a cold serverless
  // invocation opens the database once and warm ones reuse it.
  app.use(async (req, _res, next) => {
    try {
      req.store = store ?? createStore(await getDb());
      next();
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, usingDefaultPasscode: adminPasscode() === DEFAULT_PASSCODE });
  });

  app.use('/api', publicRoutes(sessionId));
  app.use('/api/admin', adminRoutes(sessionId));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  if (serveClient && fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars -- express needs the 4-arg shape
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong.' });
  });

  return app;
}
