import { normalizeDisplayName, normalizeRecoveryCode } from './domain/identity.js';
import {
  buildStrategyResults,
  dashboardPoints,
  unplottedStrategies,
  normalizeResponseInput,
  participantProgress,
} from './domain/results.js';
import { badRequest, forbidden, notFound } from './errors.js';

/**
 * The business layer. Routes are thin wrappers over these functions, and the
 * tests call them directly -- so "voting is locked" is a rule of the system,
 * not a property of the HTTP layer or of the buttons the client renders.
 */

const publicParticipant = (p) => ({
  id: p.id,
  displayName: p.display_name,
  recoveryCode: p.recovery_code,
  joinedAt: p.joined_at,
});

const publicStrategy = (s) => ({
  id: s.id,
  title: s.title,
  description: s.description,
  archived: s.archived_at != null,
});

const publicResponse = (r) => ({
  strategyId: r.strategy_id,
  kind: r.kind,
  benefit: r.benefit,
  effort: r.effort,
  updatedAt: r.updated_at,
});

export async function joinSession(store, sessionId, rawName) {
  const displayName = normalizeDisplayName(rawName);
  const participant = await store.createParticipant(sessionId, displayName);
  return publicParticipant(participant);
}

export async function resumeWithCode(store, sessionId, rawCode) {
  const code = normalizeRecoveryCode(rawCode);
  if (!code) throw badRequest('code_required', 'Enter your resume code.');
  const participant = await store.getParticipantByRecoveryCode(sessionId, code);
  if (!participant) throw notFound('unknown_code', "That code doesn't match anyone here.");
  return publicParticipant(participant);
}

export async function requireParticipant(store, participantId) {
  const participant = participantId ? await store.getParticipant(participantId) : null;
  if (!participant) throw forbidden('unknown_participant', 'Join the session first.');
  return participant;
}

/** Renaming is a label change. The participant id -- and every vote -- is kept. */
export async function renameParticipant(store, participantId, rawName) {
  await requireParticipant(store, participantId);
  const displayName = normalizeDisplayName(rawName);
  return publicParticipant(await store.renameParticipant(participantId, displayName));
}

/**
 * Create or change one participant's response to one strategy.
 * Rejects when the session is LOCKED or the strategy is archived -- enforced by
 * the guarded upsert in the store, so the interface is not what protects this.
 */
export async function submitResponse(store, { sessionId, participantId, strategyId, input }) {
  await requireParticipant(store, participantId);
  const { kind, benefit, effort } = normalizeResponseInput(input);

  const row = await store.upsertResponse({ sessionId, participantId, strategyId, kind, benefit, effort });
  if (row) return publicResponse(row);

  // The write was refused. Work out which rule said no, for the error message.
  const session = await store.getSession(sessionId);
  if (session?.status === 'LOCKED') {
    throw forbidden('voting_locked', 'Voting is locked. Ask the facilitator to reopen it.');
  }
  const strategy = await store.getStrategy(strategyId);
  if (!strategy || strategy.session_id !== sessionId) {
    throw notFound('unknown_strategy', 'That strategy no longer exists.');
  }
  if (strategy.archived_at) {
    throw forbidden('strategy_archived', 'That strategy has been withdrawn from voting.');
  }
  throw badRequest('vote_rejected', 'That vote could not be recorded.');
}

/** Everything a participant's voting screen needs, in one round trip. */
export async function getBallot(store, sessionId, participantId) {
  const participant = await requireParticipant(store, participantId);
  const [session, strategies, responses] = await Promise.all([
    store.getSession(sessionId),
    store.listStrategies(sessionId),
    store.listResponsesForParticipant(participantId),
  ]);
  const live = new Set(strategies.map((s) => s.id));
  return {
    session: { id: session.id, name: session.name, status: session.status },
    participant: publicParticipant(participant),
    strategies: strategies.map(publicStrategy),
    // Responses to archived strategies are kept in the database but are not
    // part of the current ballot.
    responses: responses.filter((r) => live.has(r.strategy_id)).map(publicResponse),
  };
}

/**
 * Aggregates for the Final Dashboard. Public and deliberately anonymous: no
 * participant id, name, or recovery code appears anywhere in this payload.
 */
export async function getResults(store, sessionId, { includeArchived = false } = {}) {
  const [session, strategies, responses] = await Promise.all([
    store.getSession(sessionId),
    store.listStrategies(sessionId, { includeArchived: true }),
    store.listResponses(sessionId),
  ]);
  const results = buildStrategyResults(strategies, responses);
  const visible = includeArchived ? results : results.filter((s) => !s.archived);
  return {
    session: { id: session.id, name: session.name, status: session.status },
    strategies: visible,
    plotted: dashboardPoints(results, { includeArchived }),
    unplotted: unplottedStrategies(results, { includeArchived }),
    participantCount: (await store.listParticipants(sessionId)).length,
  };
}

/** Admin-only: adds the participant roster, including recovery codes. */
export async function getAdminOverview(store, sessionId) {
  const [session, active, withArchived, participants, responses] = await Promise.all([
    store.getSession(sessionId),
    store.listStrategies(sessionId),
    store.listStrategies(sessionId, { includeArchived: true }),
    store.listParticipants(sessionId),
    store.listResponses(sessionId),
  ]);
  const results = buildStrategyResults(withArchived, responses);
  return {
    session: { id: session.id, name: session.name, status: session.status },
    strategies: results,
    plotted: dashboardPoints(results),
    unplotted: unplottedStrategies(results),
    participants: participantProgress(participants, responses, active.map((s) => s.id)),
  };
}

export async function setSessionStatus(store, sessionId, status) {
  if (status !== 'OPEN' && status !== 'LOCKED') {
    throw badRequest('bad_status', 'Status must be OPEN or LOCKED.');
  }
  const session = await store.setSessionStatus(sessionId, status);
  return { id: session.id, name: session.name, status: session.status };
}

export async function createStrategy(store, sessionId, { title, description }) {
  const clean = String(title ?? '').trim();
  if (!clean) throw badRequest('title_required', 'Give the strategy a title.');
  if (clean.length > 120) throw badRequest('title_too_long', 'Keep the title under 120 characters.');
  return publicStrategy(
    await store.createStrategy(sessionId, { title: clean, description: String(description ?? '').trim() }),
  );
}

export async function editStrategy(store, sessionId, strategyId, patch) {
  const existing = await store.getStrategy(strategyId);
  if (!existing || existing.session_id !== sessionId) {
    throw notFound('unknown_strategy', 'That strategy no longer exists.');
  }
  const title = patch.title === undefined ? undefined : String(patch.title).trim();
  if (title !== undefined && !title) throw badRequest('title_required', 'Give the strategy a title.');
  return publicStrategy(await store.updateStrategy(strategyId, { title, description: patch.description }));
}

/**
 * Archive removes a strategy from voting and from the dashboard. It never
 * deletes responses -- restoring brings the historical votes back with it.
 */
export async function archiveStrategy(store, sessionId, strategyId, archived) {
  const existing = await store.getStrategy(strategyId);
  if (!existing || existing.session_id !== sessionId) {
    throw notFound('unknown_strategy', 'That strategy no longer exists.');
  }
  return publicStrategy(await store.setStrategyArchived(strategyId, archived));
}
