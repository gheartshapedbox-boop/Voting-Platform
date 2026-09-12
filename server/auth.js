import { timingSafeEqual } from 'node:crypto';
import { forbidden } from './errors.js';

export const DEFAULT_PASSCODE = 'let-me-in';

export function adminPasscode() {
  return process.env.ADMIN_PASSCODE || DEFAULT_PASSCODE;
}

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// Per-IP backoff on wrong passcodes. In-memory on purpose: a serverless cold
// start resets it, which is an acceptable trade for a workshop tool.
const attempts = new Map();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export function checkThrottle(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) return;
  if (entry.count >= MAX_ATTEMPTS) {
    throw forbidden('too_many_attempts', 'Too many attempts. Wait a minute and try again.');
  }
}

export function recordFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export function recordSuccess(ip) {
  attempts.delete(ip);
}

export function bearerToken(req) {
  const header = req.get?.('authorization') ?? req.headers?.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

export function verifyPasscode(candidate) {
  return constantTimeEquals(candidate ?? '', adminPasscode());
}

/**
 * The only thing standing between a caller and every admin route. It re-checks
 * a server-issued token against the database on every single request, so the
 * client hiding a button has no bearing on authorisation.
 */
export function requireAdmin(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'admin_required', message: 'Admin sign-in required.' });
  req.store
    .findAdminToken(token)
    .then((row) => {
      if (!row) return res.status(401).json({ error: 'admin_required', message: 'Session expired. Sign in again.' });
      req.adminToken = token;
      next();
    })
    .catch(next);
}
