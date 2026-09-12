import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, asAdmin, asParticipant } from './helpers.js';

process.env.ADMIN_PASSCODE = 'test-passcode';

const ADMIN_ROUTES = [
  ['POST', '/api/admin/logout'],
  ['GET', '/api/admin/overview'],
  ['POST', '/api/admin/strategies'],
  ['PATCH', '/api/admin/strategies/anything'],
  ['POST', '/api/admin/strategies/anything/archive'],
  ['POST', '/api/admin/strategies/anything/restore'],
  ['POST', '/api/admin/session/status'],
  ['POST', '/api/admin/clear-responses'],
];

async function signedIn(api) {
  const res = await api.call('POST', '/api/admin/login', { body: { passcode: 'test-passcode' } });
  assert.equal(res.status, 200);
  return res.body.token;
}

// --- Requirement 9 ----------------------------------------------------------
test('participants cannot reach admin data or actions', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const join = await api.call('POST', '/api/join', { body: { displayName: 'Nosy' } });
  const participant = join.body;

  for (const [method, path] of ADMIN_ROUTES) {
    // No credentials at all.
    assert.equal((await api.call(method, path, { body: {} })).status, 401, `${method} ${path} unauthenticated`);

    // A valid participant id is not admin authority.
    const asPart = await api.call(method, path, { body: {}, headers: asParticipant(participant.id) });
    assert.equal(asPart.status, 401, `${method} ${path} with a participant id`);

    // A made-up bearer token.
    const forged = await api.call(method, path, { body: {}, headers: asAdmin('forged-token-value') });
    assert.equal(forged.status, 401, `${method} ${path} with a forged token`);
  }
});

test('a revoked admin token stops working immediately', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const token = await signedIn(api);
  assert.equal((await api.call('GET', '/api/admin/overview', { headers: asAdmin(token) })).status, 200);

  await api.call('POST', '/api/admin/logout', { headers: asAdmin(token) });

  for (const [method, path] of ADMIN_ROUTES) {
    const res = await api.call(method, path, { body: {}, headers: asAdmin(token) });
    assert.equal(res.status, 401, `${method} ${path} after logout`);
  }
});

test('the wrong passcode does not issue a token', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const bad = await api.call('POST', '/api/admin/login', { body: { passcode: 'guess' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.token, undefined);
});

// --- anonymity --------------------------------------------------------------
test('public results carry aggregates only, never participant identities', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const token = await signedIn(api);
  const strategy = (await api.call('POST', '/api/admin/strategies', {
    body: { title: 'Self-service kiosks' }, headers: asAdmin(token),
  })).body;

  const alice = (await api.call('POST', '/api/join', { body: { displayName: 'Alice' } })).body;
  await api.call('PUT', `/api/responses/${strategy.id}`, {
    body: { kind: 'RATED', benefit: 4, effort: 2 }, headers: asParticipant(alice.id),
  });

  const results = await api.call('GET', '/api/results');
  assert.equal(results.status, 200);

  const serialised = JSON.stringify(results.body);
  assert.ok(!serialised.includes(alice.id), 'no participant id in the results payload');
  assert.ok(!serialised.includes(alice.recoveryCode), 'no recovery code in the results payload');
  assert.ok(!serialised.includes('Alice'), 'no display name in the results payload');
  assert.equal(results.body.plotted[0].avgBenefit, 4);
  assert.equal(results.body.participantCount, 1);
});

test('the admin roster does show names, join time, progress and recovery codes', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const token = await signedIn(api);
  await api.call('POST', '/api/admin/strategies', { body: { title: 'A' }, headers: asAdmin(token) });
  await api.call('POST', '/api/admin/strategies', { body: { title: 'B' }, headers: asAdmin(token) });
  const alice = (await api.call('POST', '/api/join', { body: { displayName: 'Alice' } })).body;
  const strategies = (await api.call('GET', '/api/ballot', { headers: asParticipant(alice.id) })).body.strategies;
  await api.call('PUT', `/api/responses/${strategies[0].id}`, {
    body: { kind: 'NOT_SURE' }, headers: asParticipant(alice.id),
  });

  const overview = (await api.call('GET', '/api/admin/overview', { headers: asAdmin(token) })).body;
  const row = overview.participants[0];
  assert.equal(row.displayName, 'Alice');
  assert.equal(row.recoveryCode, alice.recoveryCode);
  assert.equal(row.responded, 1);
  assert.equal(row.total, 2);
  assert.ok(row.joinedAt, 'join time is shown');
});

// --- participant flow over HTTP --------------------------------------------
test('joining, voting and changing a vote over HTTP', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const token = await signedIn(api);
  const strategy = (await api.call('POST', '/api/admin/strategies', {
    body: { title: 'Extend opening hours' }, headers: asAdmin(token),
  })).body;

  const joined = await api.call('POST', '/api/join', { body: { displayName: '  Quoc  Duy ' } });
  assert.equal(joined.status, 201);
  assert.equal(joined.body.displayName, 'Quoc Duy');
  assert.match(joined.body.recoveryCode, /^[34679ACDEFGHJKMNPQRTUVWXY]{5}$/);
  const me = asParticipant(joined.body.id);

  assert.equal((await api.call('POST', '/api/join', { body: { displayName: '' } })).status, 400);

  const vote = (body) => api.call('PUT', `/api/responses/${strategy.id}`, { body, headers: me });

  assert.equal((await vote({ kind: 'RATED', benefit: 4, effort: 2 })).status, 200);
  assert.equal((await vote({ kind: 'RATED', benefit: 5, effort: 1 })).status, 200);
  assert.equal((await vote({ kind: 'NOT_SURE' })).status, 200);

  // Requirement 7 over the wire.
  for (const bad of [{ benefit: 0, effort: 3 }, { benefit: 6, effort: 3 }, { benefit: 2.5, effort: 3 },
                     { benefit: '4', effort: 3 }, { benefit: null, effort: 3 }]) {
    const res = await vote({ kind: 'RATED', ...bad });
    assert.equal(res.status, 400, `${JSON.stringify(bad)} must be rejected`);
  }

  const ballot = (await api.call('GET', '/api/ballot', { headers: me })).body;
  assert.equal(ballot.responses.length, 1);
  assert.equal(ballot.responses[0].kind, 'NOT_SURE');
});

test('an unknown participant id cannot vote or read a ballot', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const token = await signedIn(api);
  const strategy = (await api.call('POST', '/api/admin/strategies', {
    body: { title: 'X' }, headers: asAdmin(token),
  })).body;

  assert.equal((await api.call('GET', '/api/ballot')).status, 403);
  const ghost = asParticipant('11111111-2222-3333-4444-555555555555');
  assert.equal((await api.call('GET', '/api/ballot', { headers: ghost })).status, 403);
  assert.equal((await api.call('PUT', `/api/responses/${strategy.id}`, {
    body: { kind: 'RATED', benefit: 3, effort: 3 }, headers: ghost,
  })).status, 403);
});

// --- Requirement 8 over HTTP ------------------------------------------------
test('locking the session rejects participant writes over HTTP', async (t) => {
  const api = await startServer();
  t.after(() => api.close());

  const token = await signedIn(api);
  const strategy = (await api.call('POST', '/api/admin/strategies', {
    body: { title: 'Loyalty scheme' }, headers: asAdmin(token),
  })).body;
  const me = asParticipant((await api.call('POST', '/api/join', { body: { displayName: 'Voter' } })).body.id);
  await api.call('PUT', `/api/responses/${strategy.id}`, { body: { kind: 'RATED', benefit: 2, effort: 2 }, headers: me });

  await api.call('POST', '/api/admin/session/status', { body: { status: 'LOCKED' }, headers: asAdmin(token) });

  const blocked = await api.call('PUT', `/api/responses/${strategy.id}`, {
    body: { kind: 'RATED', benefit: 5, effort: 5 }, headers: me,
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'voting_locked');

  const ballot = (await api.call('GET', '/api/ballot', { headers: me })).body;
  assert.equal(ballot.session.status, 'LOCKED');
  assert.equal(ballot.responses[0].benefit, 2, 'the earlier vote is unchanged');
});
