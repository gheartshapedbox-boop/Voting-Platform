import express from 'express';
import {
  isPlausibleRecoveryCode,
  normaliseRecoveryCode,
  validateDisplayName,
} from '../domain/identity.js';
import { SCALE } from '../domain/results.js';
import { buildResults, summariseParticipation } from '../domain/results.js';
import * as store from '../store.js';

/**
 * Participant-facing API. Identity is asserted with the X-Participant-Id
 * header, which holds the internal UUID the browser stored at join time.
 */
export function publicRoutes(db) {
  const router = express.Router();

  /** Resolves and validates the caller's participant identity. */
  const requireParticipant = (req, res, next) => {
    const id = req.get('x-participant-id') ?? req.body?.participantId;
    const participant = id ? store.getParticipant(db, id) : null;
    if (!participant) {
      return res.status(401).json({ error: 'Unknown participant. Please join again.' });
    }
    req.participant = participant;
    store.touchParticipant(db, participant.id);
    next();
  };

  router.get('/session', (req, res) => {
    res.json({ settings: store.getSettings(db), scale: SCALE });
  });

  /* ------------------------------ identity ------------------------------- */

  // Join: always mints a NEW identity. Two people may share a display name;
  // the UUID keeps them apart.
  router.post('/participants', (req, res) => {
    const check = validateDisplayName(req.body?.displayName);
    if (!check.ok) return res.status(400).json({ error: check.error });
    res.status(201).json(store.createParticipant(db, check.value));
  });

  // Restore from the browser-stored UUID.
  router.get('/participants/:id', (req, res) => {
    const participant = store.getParticipant(db, req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });
    store.touchParticipant(db, participant.id);
    res.json(participant);
  });

  // Resume on another browser/device with the short code.
  router.post('/participants/resume', (req, res) => {
    const code = normaliseRecoveryCode(req.body?.recoveryCode);
    if (!isPlausibleRecoveryCode(code)) {
      return res.status(400).json({ error: 'That code does not look right. Codes are 5 characters.' });
    }
    const participant = store.getParticipantByCode(db, code);
    if (!participant) return res.status(404).json({ error: 'No participant found with that code.' });
    store.touchParticipant(db, participant.id);
    res.json(participant);
  });

  // Renaming changes the label only: same UUID, same votes.
  router.patch('/participants/:id', (req, res) => {
    const participant = store.getParticipant(db, req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });
    const check = validateDisplayName(req.body?.displayName);
    if (!check.ok) return res.status(400).json({ error: check.error });
    res.json(store.renameParticipant(db, participant.id, check.value));
  });

  /* ------------------------------ voting --------------------------------- */

  router.get('/strategies', (req, res) => {
    res.json(store.listStrategies(db));
  });

  router.get('/votes/mine', requireParticipant, (req, res) => {
    res.json(store.listVotesForParticipant(db, req.participant.id));
  });

  router.put('/votes/:strategyId', requireParticipant, (req, res) => {
    const strategy = store.getStrategy(db, req.params.strategyId);
    if (!strategy || strategy.archived) {
      return res.status(404).json({ error: 'Strategy not found.' });
    }

    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    const inScale = (n) => Number.isInteger(n) && n >= SCALE.min && n <= SCALE.max;
    if (!inScale(x) || !inScale(y)) {
      return res
        .status(400)
        .json({ error: `Scores must be whole numbers between ${SCALE.min} and ${SCALE.max}.` });
    }
    const comment = String(req.body?.comment ?? '').slice(0, 500);

    res.json(
      store.upsertVote(db, {
        participantId: req.participant.id,
        strategyId: strategy.id,
        x,
        y,
        comment,
      }),
    );
  });

  /* ------------------------------ results -------------------------------- */

  // Aggregate only. No participant identity is attached to any point.
  router.get('/results', (req, res) => {
    const strategies = store.listStrategies(db);
    const votes = store.listVotes(db);
    res.json({
      settings: store.getSettings(db),
      scale: SCALE,
      strategies: buildResults(strategies, votes),
      participation: summariseParticipation(
        store.listParticipantsWithProgress(db),
        votes,
        strategies.length,
      ),
    });
  });

  return router;
}
