import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes } from './routes/public.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(here, '..', 'client', 'dist');

export function createApp(db) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/admin', adminRoutes(db));
  app.use('/api', publicRoutes(db));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // In production the built client is served from the same origin as the API.
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // Constraint violations mean a real invariant was hit -- report them as 409
  // rather than leaking a 500 and a stack trace.
  app.use((err, req, res, next) => {
    if (typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'That change conflicts with an existing record.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
