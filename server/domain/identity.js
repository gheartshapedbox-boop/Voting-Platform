import { randomUUID } from 'node:crypto';

/**
 * Participant identity rules. Pure functions -- no database access -- so the
 * rules can be tested and changed without touching transport or storage.
 */

// Deliberately excludes 0/O/1/I/L/5/S/2/Z -- the pairs people mis-read off a
// screen or mis-hear read aloud. 23^5 ~= 6.4M combinations, far more than a
// workshop needs, and collisions are retried on insert anyway.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY34679';
export const CODE_LENGTH = 5;

export const MAX_NAME_LENGTH = 40;

export function newParticipantId() {
  return randomUUID();
}

/**
 * Collapses whitespace and trims. The display name is a label, not an identity,
 * so we normalise for presentation only -- we never dedupe on it.
 */
export function normaliseDisplayName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

export function validateDisplayName(raw) {
  const name = normaliseDisplayName(raw);
  if (name.length === 0) return { ok: false, error: 'Please enter a name or moniker.' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Keep it to ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: name };
}

export function generateRecoveryCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** People type codes in lower case and pad them with spaces or dashes. */
export function normaliseRecoveryCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export function isPlausibleRecoveryCode(code) {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}
