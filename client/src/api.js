import { getParticipantId } from './identity.js';

let adminToken = sessionStorage.getItem('admin-token') || null;

export const hasAdminToken = () => Boolean(adminToken);

export function setAdminToken(token) {
  adminToken = token;
  if (token) sessionStorage.setItem('admin-token', token);
  else sessionStorage.removeItem('admin-token');
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  const participantId = getParticipantId();
  if (participantId) headers['x-participant-id'] = participantId;
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, payload?.error ?? 'error', payload?.message ?? 'Something went wrong.');
  }
  return payload;
}

export const api = {
  join: (displayName) => request('POST', '/api/join', { displayName }),
  resume: (recoveryCode) => request('POST', '/api/resume', { recoveryCode }),
  ballot: () => request('GET', '/api/ballot'),
  rename: (displayName) => request('PATCH', '/api/me', { displayName }),
  vote: (strategyId, body) => request('PUT', `/api/responses/${strategyId}`, body),
  results: () => request('GET', '/api/results'),

  adminLogin: (passcode) => request('POST', '/api/admin/login', { passcode }),
  adminLogout: () => request('POST', '/api/admin/logout'),
  overview: () => request('GET', '/api/admin/overview'),
  addStrategy: (title, description) => request('POST', '/api/admin/strategies', { title, description }),
  editStrategy: (id, patch) => request('PATCH', `/api/admin/strategies/${id}`, patch),
  archiveStrategy: (id) => request('POST', `/api/admin/strategies/${id}/archive`),
  restoreStrategy: (id) => request('POST', `/api/admin/strategies/${id}/restore`),
  setStatus: (status) => request('POST', '/api/admin/session/status', { status }),
  clearResponses: () => request('POST', '/api/admin/clear-responses'),
};
