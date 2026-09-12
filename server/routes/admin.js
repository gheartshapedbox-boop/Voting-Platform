import { Router } from 'express';
import * as service from '../service.js';
import { checkThrottle, recordFailure, recordSuccess, requireAdmin, verifyPasscode } from '../auth.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function adminRoutes(sessionId) {
  const router = Router();

  router.post('/login', wrap(async (req, res) => {
    const ip = req.ip ?? 'unknown';
    checkThrottle(ip);
    if (!verifyPasscode(req.body?.passcode)) {
      recordFailure(ip);
      return res.status(401).json({ error: 'bad_passcode', message: 'That passcode is not right.' });
    }
    recordSuccess(ip);
    res.json({ token: await req.store.createAdminToken() });
  }));

  // Everything below this line is unreachable without a valid server-issued token.
  router.use(requireAdmin);

  router.post('/logout', wrap(async (req, res) => {
    await req.store.deleteAdminToken(req.adminToken);
    res.json({ ok: true });
  }));

  router.get('/overview', wrap(async (req, res) => {
    res.json(await service.getAdminOverview(req.store, sessionId));
  }));

  router.post('/strategies', wrap(async (req, res) => {
    res.status(201).json(await service.createStrategy(req.store, sessionId, req.body ?? {}));
  }));

  router.patch('/strategies/:id', wrap(async (req, res) => {
    res.json(await service.editStrategy(req.store, sessionId, req.params.id, req.body ?? {}));
  }));

  router.post('/strategies/:id/archive', wrap(async (req, res) => {
    res.json(await service.archiveStrategy(req.store, sessionId, req.params.id, true));
  }));

  router.post('/strategies/:id/restore', wrap(async (req, res) => {
    res.json(await service.archiveStrategy(req.store, sessionId, req.params.id, false));
  }));

  router.post('/session/status', wrap(async (req, res) => {
    res.json(await service.setSessionStatus(req.store, sessionId, req.body?.status));
  }));

  router.post('/clear-responses', wrap(async (req, res) => {
    await req.store.clearResponses(sessionId);
    res.json({ ok: true });
  }));

  return router;
}
