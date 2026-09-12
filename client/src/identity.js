/**
 * The browser remembers only the participant UUID. The display name and every
 * vote live on the server, so returning to this browser restores the same
 * participant -- and renaming never creates a second one.
 */
const KEY = 'strategy-voting:participant-id';

export function getParticipantId() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // private mode, embedded webview
  }
}

export function rememberParticipantId(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch { /* the session still works, it just will not survive a reload */ }
}

export function forgetParticipantId() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to do */ }
}
