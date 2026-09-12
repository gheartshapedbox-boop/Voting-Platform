import { createHash, timingSafeEqual } from 'node:crypto';
import { isValidAdminSession } from './store.js';

/**
 * Admin authorisation. Enforced here, on every /api/admin/* request -- the
 * client only ever hides buttons, which is decoration, not security.
 *
 * One shared passcode is exchanged for a server-stored bearer token. That is
 * the right weight for a workshop prototype: no user accounts to manage, but
 * the check still happens on the server and the token can be revoked.
 */

export const DEV_PASSCODE = 'let-me-in';

export function configuredPasscode() {
  return process.env.ADMIN_PASSCODE || DEV_PASSCODE;
}

export function passcodeMatches(supplied) {
  const a = createHash('sha256').update(String(supplied ?? '')).digest();
  const b = createHash('sha256').update(configuredPasscode()).digest();
  return timingSafeEqual(a, b); // hashes are equal-length, so this is safe
}

/* A deliberately small brute-force guard: the passcode is short and shared. */
const ATTEMPT_WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

export function throttleState(key, now = Date.now()) {
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > ATTEMPT_WINDOW_MS) return { blocked: false, remaining: MAX_ATTEMPTS };
  return { blocked: rec.count >= MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - rec.count) };
}

export function recordFailure(key, now = Date.now()) {
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > ATTEMPT_WINDOW_MS) attempts.set(key, { count: 1, firstAt: now });
  else rec.count += 1;
}

export function clearFailures(key) {
  attempts.delete(key);
}

export function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Express middleware: 401s anything without a live admin session. */
export function requireAdmin(db) {
  return (req, res, next) => {
    const token = bearerToken(req);
    if (!isValidAdminSession(db, token)) {
      return res.status(401).json({ error: 'Admin authorisation required.' });
    }
    req.adminToken = token;
    next();
  };
}
