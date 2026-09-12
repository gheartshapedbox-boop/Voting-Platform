/** Thin fetch wrapper. Throws Error(message) using the server's message. */
async function request(url, { method = 'GET', body, participantId, adminToken } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (participantId) headers['x-participant-id'] = participantId;
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(payload?.error ?? `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

export const api = {
  session: () => request('/api/session'),

  // Identity
  join: (displayName) => request('/api/participants', { method: 'POST', body: { displayName } }),
  restore: (id) => request(`/api/participants/${id}`),
  resume: (recoveryCode) =>
    request('/api/participants/resume', { method: 'POST', body: { recoveryCode } }),
  rename: (id, displayName) =>
    request(`/api/participants/${id}`, { method: 'PATCH', body: { displayName } }),

  // Voting
  strategies: () => request('/api/strategies'),
  myVotes: (participantId) => request('/api/votes/mine', { participantId }),
  castVote: (participantId, strategyId, vote) =>
    request(`/api/votes/${strategyId}`, { method: 'PUT', participantId, body: vote }),

  results: () => request('/api/results'),

  // Admin -- every one of these is rejected server-side without a valid token.
  admin: {
    login: (passcode) => request('/api/admin/login', { method: 'POST', body: { passcode } }),
    check: (adminToken) => request('/api/admin/session', { adminToken }),
    logout: (adminToken) => request('/api/admin/logout', { method: 'POST', adminToken }),
    participants: (adminToken) => request('/api/admin/participants', { adminToken }),
    removeParticipant: (adminToken, id) =>
      request(`/api/admin/participants/${id}`, { method: 'DELETE', adminToken }),
    strategies: (adminToken) => request('/api/admin/strategies', { adminToken }),
    createStrategy: (adminToken, body) =>
      request('/api/admin/strategies', { method: 'POST', adminToken, body }),
    updateStrategy: (adminToken, id, body) =>
      request(`/api/admin/strategies/${id}`, { method: 'PATCH', adminToken, body }),
    deleteStrategy: (adminToken, id) =>
      request(`/api/admin/strategies/${id}`, { method: 'DELETE', adminToken }),
    updateSettings: (adminToken, body) =>
      request('/api/admin/settings', { method: 'PATCH', adminToken, body }),
    resetVotes: (adminToken) =>
      request('/api/admin/votes/reset', { method: 'POST', adminToken }),
  },
};
