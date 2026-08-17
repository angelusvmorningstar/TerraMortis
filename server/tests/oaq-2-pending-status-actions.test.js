/**
 * oaq.2 — real behavioural coverage for the pending-lifecycle rewrite of
 * Status Actions: `POST /api/office_actions` now creates a PENDING record
 * (in `contested_roll_requests`, `request_type: 'status_action'`) instead of
 * applying the effect immediately; a new ST-only accept/decline pair does
 * the actual mutation.
 *
 *   AC1 — submission no longer applies the action; validates preconditions
 *         against the CURRENT target status and creates a pending record.
 *   AC2 — a second concurrent pending submission for the same
 *         (session, actor, target) is rejected (409); a NEW submission is
 *         allowed once a prior one resolves.
 *   AC3 — accept re-reads the target live, re-validates, claims budget,
 *         writes the target, resolves the pending record — all inside one
 *         transaction.
 *   AC4 — decline marks the record declined; no character mutation, no
 *         budget claim.
 *   AC5 — accept rejects (without corrupting the record) if the target's
 *         precondition no longer holds by approval time.
 *   AC6 — accept rejects (403) if budget is exhausted at approval time.
 *   AC8 — two STs cannot both resolve the same pending record.
 *
 * AC7 (client-side office-tab.js) is covered separately — see
 * public/js/tabs/office-tab.js and its own test coverage, not here.
 *
 * Follows the pattern established by issue-1143-office-actions-auth-safety.
 * test.js: real Supertest requests against the mounted app + tm_suite_test,
 * prefixed test fixtures, full-collection defensive clears for the shared
 * game_sessions/chapters collections, describe.skipIf(!dbAvailable)
 * for a clean skip when MongoDB is unreachable.
 *
 * DB-backed: real MongoDB required. See db-setup.js.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

const dbAvailable = await isDbAvailable();

let app;
const NAME_PREFIX = 'OAQ-2 Probe';

async function cleanup() {
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('territories').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('chapters').deleteMany({ label: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('game_sessions').deleteMany({ title: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_actions').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('contested_roll_requests').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_action_budgets').deleteMany({});
}

async function seedGameSessionAndCycle() {
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $lte: today } });
  await getCollection('game_sessions').insertOne({
    title: `${NAME_PREFIX} Session`, session_date: today, game_number: 999,
  });
  await getCollection('chapters').deleteMany({});
  await getCollection('chapters').insertOne({
    label: `${NAME_PREFIX} Cycle`, phase: 'game', game_number: 999,
  });
}

async function seedActor({ city = 0, courtCategory = 'Head of State' } = {}) {
  const { insertedId } = await getCollection('characters').insertOne({
    name: `${NAME_PREFIX} Actor ${Date.now()}_${Math.random()}`,
    court_category: courtCategory, status: { city }, retired: false,
  });
  return insertedId;
}

async function seedTargets(count, startingCity = 1) {
  const docs = Array.from({ length: count }, (_, i) => ({
    name: `${NAME_PREFIX} Target ${Date.now()}_${i}_${Math.random()}`,
    status: { city: startingCity }, retired: false,
  }));
  const result = await getCollection('characters').insertMany(docs);
  return Object.values(result.insertedIds);
}

async function submit(actorId, targetId, actionType, userHeader = stUser()) {
  return request(app).post('/api/office_actions').set('X-Test-User', userHeader).send({
    game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: actionType,
  });
}

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  await cleanup();
  await getCollection('contested_roll_requests').createIndex(
    { game_session_id: 1, actor_id: 1, target_id: 1 },
    { unique: true, partialFilterExpression: { request_type: 'status_action', status: 'pending' } },
  );
});

afterAll(async () => {
  if (!dbAvailable) return;
  await cleanup();
  await teardownDb();
});

describe.skipIf(!dbAvailable)('oaq.2 AC1 — submission creates a pending record, does not apply', () => {
  it('a raise submission does NOT change target status.city immediately', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const res = await submit(actorId, targetId, 'raise');
    expect(res.status).toBe(201);
    expect(res.body.request).toBeTruthy();
    expect(res.body.request.status).toBe('pending');
    expect(res.body.request.request_type).toBe('status_action');
    expect(res.body.new_status, 'submission response must not carry an applied new_status').toBeUndefined();

    const target = await getCollection('characters').findOne({ _id: targetId });
    expect(target.status.city, 'status.city must be unchanged until an ST accepts').toBe(3);
  });

  it('rejects a submission whose precondition already fails against the CURRENT target status', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 0); // already at 0 — grant_first would be valid, but strip_last is not

    const res = await submit(actorId, targetId, 'strip_last');
    expect(res.status).toBe(400);
  });

  it('still enforces auth/session/phase gates from issue-1143 on submission', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await submit(actorId, targetId, 'raise', playerUser(['000000000000000000000001']));
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!dbAvailable)('oaq.2 AC2 — pending dedupe per (session, actor, target)', () => {
  it('a second concurrent pending submission for the same target is rejected (409)', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const first = await submit(actorId, targetId, 'raise');
    expect(first.status).toBe(201);

    const second = await submit(actorId, targetId, 'raise');
    expect(second.status).toBe(409);
  });

  it('allows a NEW submission for the same target once the prior one is declined', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const first = await submit(actorId, targetId, 'raise');
    expect(first.status).toBe(201);
    const requestId = first.body.request._id;

    const declineRes = await request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser());
    expect(declineRes.status).toBe(200);

    const second = await submit(actorId, targetId, 'raise');
    expect(second.status, 'a resubmission after a decline must not be blocked by the pending-scoped index').toBe(201);
  });

  it('REGRESSION (internal review, 2026-08-12): a resubmission for the same target is rejected after the prior one was ACCEPTED, not just while pending', async () => {
    // Product decision: once a paid raise/lower on a (actor, target) pair
    // has been accepted, that same actor cannot spend another budget slot
    // on the same target again this session — only a decline frees up a
    // retry. Before this fix, the pending-scoped index alone allowed a
    // second submission here (since the first was already 'resolved', not
    // 'pending'), which then reached `accept` and crashed with an uncaught
    // E11000 from the OLD office_actions unique index (built for the prior
    // apply-immediately design) — a real bug an internal review found and
    // reproduced live. This test also serves as the regression guard for
    // that crash: the fix prevents the second submission from ever
    // existing, so accept never sees the conflict.
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const first = await submit(actorId, targetId, 'raise');
    expect(first.status).toBe(201);
    const acceptRes = await request(app).put(`/api/office_actions/${first.body.request._id}/accept`).set('X-Test-User', stUser());
    expect(acceptRes.status).toBe(200);

    const second = await submit(actorId, targetId, 'raise');
    expect(second.status, 'a resubmission after an ACCEPT must be rejected, not reach accept and crash').toBe(409);
  });

  it('a DIFFERENT actor can still target the same character after the first actor already acted on them', async () => {
    // The "once resolved" rule is scoped per (actor, target), not per
    // target alone — a second Head-of-State-tier officer must still be
    // able to act on someone another officer already raised this session.
    await seedGameSessionAndCycle();
    const actorA = await seedActor({ city: 3 });
    const actorB = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const first = await submit(actorA, targetId, 'raise');
    expect(first.status).toBe(201);
    const acceptRes = await request(app).put(`/api/office_actions/${first.body.request._id}/accept`).set('X-Test-User', stUser());
    expect(acceptRes.status).toBe(200);

    const second = await submit(actorB, targetId, 'raise');
    expect(second.status, 'a different actor must not be blocked by another actor already having acted on this target').toBe(201);
  });
});

describe.skipIf(!dbAvailable)('oaq.2 AC3/AC6 — accept applies the effect, claims budget, resolves', () => {
  it('accept applies status.city, marks the record resolved, and logs to office_actions', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const acceptRes = await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.new_status).toBe(4);

    const target = await getCollection('characters').findOne({ _id: targetId });
    expect(target.status.city).toBe(4);

    const pending = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(requestId) });
    expect(pending.status).toBe('resolved');

    const logged = await getCollection('office_actions').findOne({ target_id: String(targetId) });
    expect(logged).toBeTruthy();
    expect(logged.new_status).toBe(4);
  });

  it('accept rejects with 403 when budget is exhausted at approval time (even though submission never checked it)', async () => {
    await seedGameSessionAndCycle();
    // Head of State, city 0 => budget 3.
    const actorId = await seedActor({ city: 0 });
    const targets = await seedTargets(4, 1);

    // Submit 4 raises — all allowed, since submission no longer checks budget.
    const submitted = [];
    for (const t of targets) {
      const res = await submit(actorId, t, 'raise');
      expect(res.status).toBe(201);
      submitted.push(res.body.request._id);
    }

    // Accept the first 3 — should all succeed (fills the budget of 3).
    for (let i = 0; i < 3; i++) {
      const res = await request(app).put(`/api/office_actions/${submitted[i]}/accept`).set('X-Test-User', stUser());
      expect(res.status).toBe(200);
    }

    // The 4th accept must be rejected — budget exhausted.
    const fourth = await request(app).put(`/api/office_actions/${submitted[3]}/accept`).set('X-Test-User', stUser());
    expect(fourth.status).toBe(403);

    // The pending record must still exist as pending, not silently corrupted.
    const stillPending = await getCollection('contested_roll_requests').findOne({ target_id: String(targets[3]) });
    expect(stillPending.status).toBe('pending');
  });
});

describe.skipIf(!dbAvailable)('oaq.2 AC4 — decline', () => {
  it('decline marks the record declined, makes no character mutation, claims no budget', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const declineRes = await request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser());
    expect(declineRes.status).toBe(200);

    const target = await getCollection('characters').findOne({ _id: targetId });
    expect(target.status.city, 'a decline must never mutate the target').toBe(3);

    const pending = await getCollection('contested_roll_requests').findOne({ target_id: String(targetId) });
    expect(pending.status).toBe('declined');

    const logged = await getCollection('office_actions').findOne({ target_id: String(targetId) });
    expect(logged, 'a declined request should never appear in the applied-action log').toBeNull();

    // Scoped to THIS test's actor specifically (budgetKey is
    // `${game_session_id}:${actor_id}`) rather than a global count, since
    // earlier tests in this same file legitimately create budget docs for
    // their own actors and this file's collection-wide cleanup only runs
    // once at beforeAll, not between individual tests.
    const thisActorBudgetDocs = await getCollection('office_action_budgets')
      .countDocuments({ _id: { $regex: `:${actorId}$` } });
    expect(thisActorBudgetDocs, 'a decline must never claim a budget slot').toBe(0);
  });
});

describe.skipIf(!dbAvailable)('oaq.2 AC5 — accept rejects when the target changed since submission', () => {
  it('accept rejects if a DIFFERENT action already changed the target before this one was accepted', async () => {
    await seedGameSessionAndCycle();
    const actorA = await seedActor({ city: 3 });
    const actorB = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 0); // starts at 0 — grant_first is valid right now

    const submitA = await submit(actorA, targetId, 'grant_first');
    expect(submitA.status).toBe(201);
    const submitB = await submit(actorB, targetId, 'grant_first');
    // AC2's pending-dedupe is scoped by actor, so actor B's submission for
    // the SAME target under a DIFFERENT actor is allowed to queue too.
    expect(submitB.status).toBe(201);

    // Accept A first — target goes to 1.
    const acceptA = await request(app).put(`/api/office_actions/${submitA.body.request._id}/accept`).set('X-Test-User', stUser());
    expect(acceptA.status).toBe(200);

    // Now accept B — its stored precondition (grant_first requires old_status===0)
    // no longer holds against the CURRENT target (now 1). Must be rejected,
    // not silently forced through.
    const acceptB = await request(app).put(`/api/office_actions/${submitB.body.request._id}/accept`).set('X-Test-User', stUser());
    expect(acceptB.status).toBe(400);

    // B's pending record must not have been marked resolved by the failed accept.
    const bDoc = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(submitB.body.request._id) });
    expect(bDoc.status, 'a rejected accept must leave the record inspectable, not silently resolved').toBe('pending');
  });
});

describe.skipIf(!dbAvailable)('oaq.2 AC8 — race-safety on accept/decline', () => {
  it('two concurrent accepts on the SAME pending record: at most one succeeds', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const [r1, r2] = await Promise.all([
      request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser()),
      request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser()),
    ]);
    const wins = [r1.status, r2.status].filter(s => s === 200).length;
    expect(wins, 'exactly one of two concurrent accepts on the same record should succeed').toBe(1);

    const target = await getCollection('characters').findOne({ _id: targetId });
    expect(target.status.city, 'the target must reflect exactly one applied raise, not two').toBe(4);
  });

  it('an accept after a decline (or vice versa) is rejected as no-longer-pending', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const declineRes = await request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser());
    expect(declineRes.status).toBe(200);

    const lateAccept = await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());
    expect(lateAccept.status).toBe(409);
  });

  it('REGRESSION (internal review, 2026-08-12): a concurrent accept AND decline on the SAME pending record — exactly one wins, never both', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const [acceptRes, declineRes] = await Promise.all([
      request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser()),
      request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser()),
    ]);
    const wins = [acceptRes.status, declineRes.status].filter(s => s === 200).length;
    expect(wins, 'exactly one of a concurrent accept+decline on the same record should succeed').toBe(1);

    const pending = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(requestId) });
    expect(['resolved', 'declined']).toContain(pending.status);

    const target = await getCollection('characters').findOne({ _id: targetId });
    if (pending.status === 'resolved') expect(target.status.city).toBe(4);
    else expect(target.status.city).toBe(3);
  });
});

describe.skipIf(!dbAvailable)('oaq.2 REGRESSION (internal review, 2026-08-12): contested-rolls.js cannot orphan a pending Status Action', () => {
  it('PUT /api/contested_roll_requests/:id/void rejects a status_action pending record (404), never voids it', async () => {
    // contested-rolls.js's /void route pre-dates oaq.2 and originally had no
    // reason to distinguish request types (only contested_roll documents
    // existed). Reused unguarded, it could mark a pending status_action
    // 'voided' — a status neither route family recognizes, permanently
    // orphaning the record (office-actions.js's own _findPending only ever
    // matches status:'pending').
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const voidRes = await request(app).put(`/api/contested_roll_requests/${requestId}/void`).set('X-Test-User', stUser());
    expect(voidRes.status, 'void must not be able to touch a status_action record at all').toBe(404);

    const pending = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(requestId) });
    expect(pending.status, 'the record must be untouched, still pending, still reachable by the correct accept/decline routes').toBe('pending');

    // Confirm it's still genuinely usable through the correct route.
    const acceptRes = await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());
    expect(acceptRes.status).toBe(200);
  });
});
