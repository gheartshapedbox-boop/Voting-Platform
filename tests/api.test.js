import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

process.env.ADMIN_PASSCODE = 'test-passcode';

let server;
let base;
let db;

const call = async (path, { method = 'GET', body, participantId, adminToken } = {}) => {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (participantId) headers['x-participant-id'] = participantId;
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const adminLogin = async () => (await call('/api/admin/login', {
  method: 'POST', body: { passcode: 'test-passcode' },
})).body.token;

const addStrategy = async (token, title) =>
  (await call('/api/admin/strategies', { method: 'POST', adminToken: token, body: { title } })).body;

before(async () => {
  db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

describe('participant identity', () => {
  it('joins with nothing but a display name', async () => {
    const { status, body } = await call('/api/participants', {
      method: 'POST', body: { displayName: 'Quoc Duy' },
    });
    assert.equal(status, 201);
    assert.match(body.id, /^[0-9a-f-]{36}$/);
    assert.equal(body.displayName, 'Quoc Duy');
    assert.equal(body.recoveryCode.length, 5);
  });

  it('rejects an empty name', async () => {
    const { status } = await call('/api/participants', { method: 'POST', body: { displayName: '  ' } });
    assert.equal(status, 400);
  });

  it('gives two people with the SAME display name different identities', async () => {
    const a = (await call('/api/participants', { method: 'POST', body: { displayName: 'Alex' } })).body;
    const b = (await call('/api/participants', { method: 'POST', body: { displayName: 'Alex' } })).body;
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.recoveryCode, b.recoveryCode);
  });

  it('restores an identity from the stored uuid', async () => {
    const joined = (await call('/api/participants', { method: 'POST', body: { displayName: 'Returner' } })).body;
    const { status, body } = await call(`/api/participants/${joined.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, joined.id);
  });

  it('404s an unknown uuid so a stale browser falls back to the join screen', async () => {
    const { status } = await call('/api/participants/11111111-2222-3333-4444-555555555555');
    assert.equal(status, 404);
  });

  it('resumes from the recovery code, case-insensitively', async () => {
    const joined = (await call('/api/participants', { method: 'POST', body: { displayName: 'Roamer' } })).body;
    const { status, body } = await call('/api/participants/resume', {
      method: 'POST', body: { recoveryCode: joined.recoveryCode.toLowerCase() },
    });
    assert.equal(status, 200);
    assert.equal(body.id, joined.id);
  });

  it('rejects an unknown or malformed recovery code', async () => {
    assert.equal((await call('/api/participants/resume', { method: 'POST', body: { recoveryCode: 'nope' } })).status, 400);
    assert.equal((await call('/api/participants/resume', { method: 'POST', body: { recoveryCode: 'QQQQQ' } })).status, 404);
  });
});

describe('renaming keeps the identity', () => {
  it('changes the label without creating a second participant or losing votes', async () => {
    const token = await adminLogin();
    const strategy = await addStrategy(token, 'Rename test strategy');
    const person = (await call('/api/participants', { method: 'POST', body: { displayName: 'Before' } })).body;

    await call(`/api/votes/${strategy.id}`, { method: 'PUT', participantId: person.id, body: { x: 7, y: 8 } });

    const renamed = (await call(`/api/participants/${person.id}`, {
      method: 'PATCH', body: { displayName: 'After' },
    })).body;

    assert.equal(renamed.id, person.id, 'identity must survive a rename');
    assert.equal(renamed.displayName, 'After');
    assert.equal(renamed.recoveryCode, person.recoveryCode);

    const mine = (await call('/api/votes/mine', { participantId: person.id })).body;
    assert.equal(mine.length, 1);
    assert.deepEqual([mine[0].x, mine[0].y], [7, 8]);
  });
});

describe('voting', () => {
  it('refuses a vote from an unknown participant', async () => {
    const token = await adminLogin();
    const strategy = await addStrategy(token, 'Auth check');
    const { status } = await call(`/api/votes/${strategy.id}`, {
      method: 'PUT', participantId: 'not-a-real-id', body: { x: 1, y: 1 },
    });
    assert.equal(status, 401);
  });

  it('keeps exactly one row per participant per strategy when a vote changes', async () => {
    const token = await adminLogin();
    const strategy = await addStrategy(token, 'Upsert check');
    const person = (await call('/api/participants', { method: 'POST', body: { displayName: 'Voter' } })).body;

    for (const vote of [{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 9, y: 2 }]) {
      await call(`/api/votes/${strategy.id}`, { method: 'PUT', participantId: person.id, body: vote });
    }

    const rows = db
      .prepare('SELECT COUNT(*) AS n FROM votes WHERE participant_id = ? AND strategy_id = ?')
      .get(person.id, strategy.id);
    assert.equal(rows.n, 1, 'the UNIQUE constraint must collapse re-votes into one row');

    const mine = (await call('/api/votes/mine', { participantId: person.id })).body;
    const vote = mine.find((v) => v.strategyId === strategy.id);
    assert.deepEqual([vote.x, vote.y], [9, 2]);
  });

  it('rejects scores outside the scale and non-integers', async () => {
    const token = await adminLogin();
    const strategy = await addStrategy(token, 'Scale check');
    const person = (await call('/api/participants', { method: 'POST', body: { displayName: 'Cheater' } })).body;

    for (const bad of [{ x: 0, y: 5 }, { x: 11, y: 5 }, { x: 5, y: -3 }, { x: 5.5, y: 5 }, { x: 'abc', y: 5 }]) {
      const { status } = await call(`/api/votes/${strategy.id}`, {
        method: 'PUT', participantId: person.id, body: bad,
      });
      assert.equal(status, 400, `expected ${JSON.stringify(bad)} to be rejected`);
    }
  });

  it('404s a vote on a strategy that does not exist', async () => {
    const person = (await call('/api/participants', { method: 'POST', body: { displayName: 'Lost' } })).body;
    const { status } = await call('/api/votes/no-such-strategy', {
      method: 'PUT', participantId: person.id, body: { x: 5, y: 5 },
    });
    assert.equal(status, 404);
  });
});

describe('admin authorisation is server-side', () => {
  const adminPaths = [
    ['GET', '/api/admin/participants'],
    ['GET', '/api/admin/strategies'],
    ['POST', '/api/admin/strategies'],
    ['PATCH', '/api/admin/settings'],
    ['POST', '/api/admin/votes/reset'],
    ['GET', '/api/admin/results'],
  ];

  it('401s every admin route without a token', async () => {
    for (const [method, path] of adminPaths) {
      const { status } = await call(path, { method, body: method === 'GET' ? undefined : {} });
      assert.equal(status, 401, `${method} ${path} was not protected`);
    }
  });

  it('401s a forged token', async () => {
    const { status } = await call('/api/admin/participants', { adminToken: 'made-up-token' });
    assert.equal(status, 401);
  });

  it('rejects a wrong passcode', async () => {
    const { status } = await call('/api/admin/login', { method: 'POST', body: { passcode: 'wrong' } });
    assert.equal(status, 401);
  });

  it('stops honouring a token after logout', async () => {
    const token = await adminLogin();
    assert.equal((await call('/api/admin/participants', { adminToken: token })).status, 200);
    await call('/api/admin/logout', { method: 'POST', adminToken: token });
    assert.equal((await call('/api/admin/participants', { adminToken: token })).status, 401);
  });
});

describe('admin views', () => {
  it('lists participants with join time, progress and recovery code', async () => {
    const token = await adminLogin();
    const { body } = await call('/api/admin/participants', { adminToken: token });
    const sample = body.participants[0];
    assert.ok(sample.displayName);
    assert.ok(sample.joinedAt);
    assert.equal(typeof sample.votesCast, 'number');
    assert.equal(sample.recoveryCode.length, 5);
  });

  it('cascades votes away when a participant is removed', async () => {
    const token = await adminLogin();
    const strategy = await addStrategy(token, 'Cascade check');
    const person = (await call('/api/participants', { method: 'POST', body: { displayName: 'Temp' } })).body;
    await call(`/api/votes/${strategy.id}`, { method: 'PUT', participantId: person.id, body: { x: 4, y: 4 } });

    await call(`/api/admin/participants/${person.id}`, { method: 'DELETE', adminToken: token });

    const left = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE participant_id = ?').get(person.id);
    assert.equal(left.n, 0);
  });
});

describe('results', () => {
  it('aggregates votes without exposing who cast them', async () => {
    const token = await adminLogin();
    const strategy = await addStrategy(token, 'Anonymity check');
    const people = [];
    for (const name of ['P1', 'P2', 'P3']) {
      people.push((await call('/api/participants', { method: 'POST', body: { displayName: name } })).body);
    }
    for (const [i, person] of people.entries()) {
      await call(`/api/votes/${strategy.id}`, {
        method: 'PUT', participantId: person.id, body: { x: 8, y: 7 + (i % 2) },
      });
    }

    const { body } = await call('/api/results');
    const raw = JSON.stringify(body);
    for (const person of people) {
      assert.ok(!raw.includes(person.id), 'results leaked a participant id');
      assert.ok(!raw.includes(person.recoveryCode), 'results leaked a recovery code');
    }

    const entry = body.strategies.find((s) => s.id === strategy.id);
    assert.equal(entry.voteCount, 3);
    assert.equal(entry.mean.x, 8);
  });

  it('clears votes on reset but keeps participants and strategies', async () => {
    const token = await adminLogin();
    const before = (await call('/api/admin/participants', { adminToken: token })).body.participants.length;

    await call('/api/admin/votes/reset', { method: 'POST', adminToken: token });

    const after = (await call('/api/admin/participants', { adminToken: token })).body;
    assert.equal(after.participants.length, before);
    assert.equal(after.participation.totalVotes, 0);
    assert.ok((await call('/api/strategies')).body.length > 0);
  });
});
