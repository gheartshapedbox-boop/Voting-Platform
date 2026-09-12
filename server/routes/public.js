import { Router } from 'express';
import * as service from '../service.js';
import { getResults } from '../service.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function publicRoutes(sessionId) {
  const router = Router();

  const participantId = (req) => req.get('x-participant-id') || null;

  router.post('/join', wrap(async (req, res) => {
    res.status(201).json(await service.joinSession(req.store, sessionId, req.body?.displayName));
  }));

  router.post('/resume', wrap(async (req, res) => {
    res.json(await service.resumeWithCode(req.store, sessionId, req.body?.recoveryCode));
  }));

  router.get('/ballot', wrap(async (req, res) => {
    res.json(await service.getBallot(req.store, sessionId, participantId(req)));
  }));

  router.patch('/me', wrap(async (req, res) => {
    res.json(await service.renameParticipant(req.store, participantId(req), req.body?.displayName));
  }));

  router.put('/responses/:strategyId', wrap(async (req, res) => {
    res.json(await service.submitResponse(req.store, {
      sessionId,
      participantId: participantId(req),
      strategyId: req.params.strategyId,
      input: req.body,
    }));
  }));

  // Public on purpose: results go on the shared screen. Aggregates only.
  router.get('/results', wrap(async (req, res) => {
    res.json(await getResults(req.store, sessionId));
  }));

  return router;
}
