import { randomUUID } from 'node:crypto';
import { badRequest } from '../errors.js';

export const MAX_NAME_LENGTH = 40;

// No 0/O, 1/I/L, 2/Z, 5/S, 8/B -- codes get read aloud and typed from memory.
const CODE_ALPHABET = '34679ACDEFGHJKMNPQRTUVWXY';
export const RECOVERY_CODE_LENGTH = 5;

export function newParticipantId() {
  return randomUUID();
}

export function newRecoveryCode() {
  let out = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeRecoveryCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * A display name is a label, not an identity: it is trimmed and length-checked,
 * never deduplicated. Two participants may share a name and stay distinct.
 */
export function normalizeDisplayName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length === 0) throw badRequest('name_required', 'Enter a name or moniker.');
  if (name.length > MAX_NAME_LENGTH) {
    throw badRequest('name_too_long', `Keep it under ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}
