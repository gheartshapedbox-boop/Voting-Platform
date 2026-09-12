/**
 * Browser-side persistence of the participant identity.
 *
 * Only the immutable UUID is authoritative here; the cached display name is a
 * convenience for first paint. On load the UUID is re-validated against the
 * server, so a stale or deleted identity falls back to the join screen.
 */
const KEY = 'voting-platform.participant-id';
const NAME_KEY = 'voting-platform.display-name';
const ADMIN_KEY = 'voting-platform.admin-token';

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback; // private mode / blocked storage
  }
};

export const storedParticipantId = () => safe(() => localStorage.getItem(KEY));
export const storedDisplayName = () => safe(() => localStorage.getItem(NAME_KEY));

export function rememberParticipant(participant) {
  safe(() => {
    localStorage.setItem(KEY, participant.id);
    localStorage.setItem(NAME_KEY, participant.displayName);
  });
}

export function forgetParticipant() {
  safe(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(NAME_KEY);
  });
}

export const storedAdminToken = () => safe(() => localStorage.getItem(ADMIN_KEY));
export const rememberAdminToken = (token) => safe(() => localStorage.setItem(ADMIN_KEY, token));
export const forgetAdminToken = () => safe(() => localStorage.removeItem(ADMIN_KEY));
