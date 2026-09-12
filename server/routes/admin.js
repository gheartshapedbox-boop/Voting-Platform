import express from 'express';
import {
  bearerToken,
  clearFailures,
  passcodeMatches,
  recordFailure,
  requireAdmin,
  throttleState,
} from '../auth.js';
import { buildResults, summariseParticipation } from '../domain/results.js';
import * as store from '../store.js';

export function adminRoutes(db) {
  const router = express.Router();

  /* Login is the only unauthenticated route in this file. */
  router.post('/login', (req, res) => {
    const key = req.ip ?? 'unknown';
    if (throttleState(key).blocked) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    if (!passcodeMatches(req.body?.passcode)) {
      recordFailure(key);
      return res.status(401).json({ error: 'Incorrect passcode.' });
    }
    clearFailures(key);
    res.json(store.createAdminSession(db));
  });

  // Everything below this line requires a valid server-side session.
  router.use(requireAdmin(db));

  router.get('/session', (req, res) => res.json({ ok: true }));

  router.post('/logout', (req, res) => {
    store.destroyAdminSession(db, bearerToken(req));
    res.json({ ok: true });
  });

  /* ----------------------------- participants ---------------------------- */

  router.get('/participants', (req, res) => {
    const strategyCount = store.listStrategies(db).length;
    const participants = store.listParticipantsWithProgress(db).map((p) => ({
      ...p,
      strategyCount,
      complete: strategyCount > 0 && p.votesCast >= strategyCount,
    }));
    res.json({
      participants,
      participation: summariseParticipation(participants, store.listVotes(db), strategyCount),
    });
  });

  router.delete('/participants/:id', (req, res) => {
    if (!store.deleteParticipant(db, req.params.id)) {
      return res.status(404).json({ error: 'Participant not found.' });
    }
    res.json({ ok: true });
  });

  /* ------------------------------ strategies ----------------------------- */

  router.get('/strategies', (req, res) => {
    res.json(store.listStrategies(db, { includeArchived: true }));
  });

  router.post('/strategies', (req, res) => {
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'A title is required.' });
    if (title.length > 120) return res.status(400).json({ error: 'Title is too long (120 max).' });
    res.status(201).json(
      store.createStrategy(db, {
        title,
        description: String(req.body?.description ?? '').trim(),
      }),
    );
  });

  router.patch('/strategies/:id', (req, res) => {
    const patch = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'A title is required.' });
      patch.title = title;
    }
    if (req.body?.description !== undefined) patch.description = String(req.body.description).trim();
    if (req.body?.archived !== undefined) patch.archived = !!req.body.archived;
    if (req.body?.position !== undefined) patch.position = Number(req.body.position);

    const updated = store.updateStrategy(db, req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'Strategy not found.' });
    res.json(updated);
  });

  router.delete('/strategies/:id', (req, res) => {
    if (!store.deleteStrategy(db, req.params.id)) {
      return res.status(404).json({ error: 'Strategy not found.' });
    }
    res.json({ ok: true });
  });

  /* ------------------------------- settings ------------------------------ */

  router.patch('/settings', (req, res) => {
    const allowed = ['event_title', 'x_label', 'y_label', 'x_hint', 'y_hint'];
    const patch = Object.fromEntries(
      Object.entries(req.body ?? {})
        .filter(([k, v]) => allowed.includes(k) && String(v).trim() !== '')
        .map(([k, v]) => [k, String(v).trim().slice(0, 120)]),
    );
    res.json(store.updateSettings(db, patch));
  });

  /* -------------------------------- results ------------------------------ */

  router.get('/results', (req, res) => {
    const strategies = store.listStrategies(db, { includeArchived: true });
    const votes = store.listVotes(db);
    res.json({
      settings: store.getSettings(db),
      strategies: buildResults(strategies, votes),
    });
  });

  router.post('/votes/reset', (req, res) => {
    res.json({ deleted: store.clearAllVotes(db) });
  });

  return router;
}
