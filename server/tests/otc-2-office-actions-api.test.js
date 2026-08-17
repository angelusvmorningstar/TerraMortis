/**
 * otc.2 — real behavioural coverage for the two defects fixed in
 * server/routes/office-actions.js: the budget calculation (was missing the
 * regent-ambience bonus and the 10-dot cap) and the game-phase gate (Status
 * Actions previously had no relationship to the live game state at all).
 *
 * feature.691.hos-city-status-power.test.js proves the ROUTE SOURCE contains
 * certain calls (source-text/regex assertions); it never drives a real
 * request. This file drives real requests against a live mounted app +
 * tm_suite_test, per the pattern established in oath-b-d6-api-roundtrip.test.js.
 *
 * DB-backed: skips wholesale when MongoDB is unreachable (setup-env.js/db.js
 * hard-override MONGODB_DB to *_test under vitest).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
const NAME_PREFIX = 'OTC-2 Probe';
// issue-1143: game_session_id is no longer client-trusted — the server
// derives it itself from the game_sessions collection (findLatestSession()
// in office-actions.js). This value is still SENT in request bodies below
// (the schema requires the field) but the server ignores it for scoping; a
// real game_sessions doc is seeded in beforeAll so the route has something
// authoritative to resolve to. Kept only as a placeholder value now.
const GAME_SESSION_ID = 'otc-2-test-session';

async function cleanup() {
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('territories').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('chapters').deleteMany({ label: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('game_sessions').deleteMany({ title: { $regex: `^${NAME_PREFIX}` } });
  // Scoped by actor_name, not game_session_id — since issue-1143, the
  // persisted game_session_id is the REAL server-derived session's _id, not
  // this file's placeholder constant.
  await getCollection('office_actions').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('contested_roll_requests').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_action_budgets').deleteMany({});
}

// oaq.2: POST /api/office_actions now only SUBMITS (pending ST review) — it
// no longer applies the effect or enforces budget. This helper submits then
// immediately accepts as an ST, so this file's existing budget-formula
// assertions (which predate oaq.2 and test calcEffectiveCityStatus's
// correctness, not the pending workflow itself) keep testing the same
// underlying property against the new two-step flow.
async function submitAndAccept(actorId, targetId, actionType) {
  const submitRes = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
    game_session_id: GAME_SESSION_ID, actor_id: String(actorId), target_id: String(targetId), action_type: actionType,
  });
  if (submitRes.status !== 201) return submitRes;
  return request(app).put(`/api/office_actions/${submitRes.body.request._id}/accept`).set('X-Test-User', stUser());
}

async function seedGameSession() {
  // issue-1143: clears ALL game_sessions with session_date <= today, not
  // just this file's own prefixed ones — findLatestSession() picks the
  // single most recent match across the WHOLE shared tm_suite_test
  // collection, so a leftover session from another file with today's date
  // could otherwise outrank (or tie with) this one. Mirrors the same
  // defensive full-collection-clear already used for downtime_cycles below
  // (Codex review finding, otc.2).
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $lte: today } });
  await getCollection('game_sessions').insertOne({
    title: `${NAME_PREFIX} Session`,
    session_date: today,
    game_number: 999,
  });
}

async function seedActor({ city = 0, regentAmbience = null } = {}) {
  const actorDoc = {
    name: `${NAME_PREFIX} Actor ${Date.now()}_${Math.random()}`,
    court_category: 'Head of State',
    status: { city },
    retired: false,
  };
  const { insertedId: actorId } = await getCollection('characters').insertOne(actorDoc);

  if (regentAmbience) {
    await getCollection('territories').insertOne({
      name: `${NAME_PREFIX} Territory`,
      slug: 'otc-2-probe-territory',
      ambience: regentAmbience,
      regent_id: String(actorId),
    });
  }
  return actorId;
}

async function seedTargets(count, startingCity = 1) {
  const docs = Array.from({ length: count }, (_, i) => ({
    name: `${NAME_PREFIX} Target ${Date.now()}_${i}_${Math.random()}`,
    status: { city: startingCity },
    retired: false,
  }));
  const result = await getCollection('characters').insertMany(docs);
  return Object.values(result.insertedIds);
}

async function seedGameCycle(gameNumber = 900) {
  const { insertedId } = await getCollection('chapters').insertOne({
    label: `${NAME_PREFIX} Cycle`,
    phase: 'game',
    game_number: gameNumber,
  });
  return insertedId;
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await cleanup();
  await seedGameSession();
});

afterAll(async () => {
  await cleanup();
  await teardownDb();
});

describe('otc.2 — POST /api/office_actions phase gate', () => {
  it('rejects a raise with 403 when no cycle is in game phase', async () => {
    // Clears ALL cycles, not just this file's prefixed ones — the route
    // scans every chapters document, so a leftover 'game'-phase
    // cycle from elsewhere in the shared tm_suite_test would make these
    // negative tests pass for the wrong reason (Codex review finding,
    // 2026-08-12). vitest runs this project's test files sequentially in
    // one process (fileParallelism: false), so this is safe for the
    // duration of this file's own run.
    await getCollection('chapters').deleteMany({});
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID,
      actor_id: String(actorId),
      target_id: String(targetId),
      action_type: 'raise',
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no game session/i);
  });

  it('rejects a raise with 403 when the only cycle is in prep phase (not game)', async () => {
    // Clears ALL cycles, not just this file's prefixed ones — the route
    // scans every chapters document, so a leftover 'game'-phase
    // cycle from elsewhere in the shared tm_suite_test would make these
    // negative tests pass for the wrong reason (Codex review finding,
    // 2026-08-12). vitest runs this project's test files sequentially in
    // one process (fileParallelism: false), so this is safe for the
    // duration of this file's own run.
    await getCollection('chapters').deleteMany({});
    await getCollection('chapters').insertOne({
      label: `${NAME_PREFIX} Cycle`, phase: 'prep', game_number: 901,
    });
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID,
      actor_id: String(actorId),
      target_id: String(targetId),
      action_type: 'raise',
    });

    expect(res.status).toBe(403);
  });

  it('rejects grant_first and strip_last too, not just the paid types', async () => {
    // Clears ALL cycles, not just this file's prefixed ones — the route
    // scans every chapters document, so a leftover 'game'-phase
    // cycle from elsewhere in the shared tm_suite_test would make these
    // negative tests pass for the wrong reason (Codex review finding,
    // 2026-08-12). vitest runs this project's test files sequentially in
    // one process (fileParallelism: false), so this is safe for the
    // duration of this file's own run.
    await getCollection('chapters').deleteMany({});
    const actorId = await seedActor({ city: 3 });
    const [target0, target1] = await seedTargets(2, 0);
    await getCollection('characters').updateOne({ _id: target1 }, { $set: { 'status.city': 1 } });

    const grantRes = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID, actor_id: String(actorId), target_id: String(target0), action_type: 'grant_first',
    });
    expect(grantRes.status).toBe(403);

    const stripRes = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID, actor_id: String(actorId), target_id: String(target1), action_type: 'strip_last',
    });
    expect(stripRes.status).toBe(403);
  });

  it('allows a raise once a cycle is in game phase', async () => {
    await seedGameCycle(902);
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID,
      actor_id: String(actorId),
      target_id: String(targetId),
      action_type: 'raise',
    });

    expect(res.status).toBe(201);
  });

  it('rejects lower too — GATED_TYPES must cover all four action types, not just raise', async () => {
    await getCollection('chapters').deleteMany({});
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 2); // status.city: 2, so lower would otherwise be valid

    const res = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID, actor_id: String(actorId), target_id: String(targetId), action_type: 'lower',
    });
    expect(res.status).toBe(403);
  });

  it('THE STALE-CYCLE REGRESSION: rejects when an OLDER cycle is stuck in game phase but the CURRENT (highest game_number) cycle has moved on', async () => {
    // Found by external review (Codex, reasoning_effort=high, 2026-08-12),
    // reproduced live: the original gate filtered ALL cycles for phase
    // 'game' and took the highest game_number AMONG THOSE MATCHES, so a
    // stale cycle stuck in game phase outranked a genuinely newer cycle
    // that had moved on — the newer cycle was never in the filtered set.
    await getCollection('chapters').deleteMany({});
    await getCollection('chapters').insertOne({
      label: `${NAME_PREFIX} Stale Game Cycle`, phase: 'game', game_number: 905,
    });
    await getCollection('chapters').insertOne({
      label: `${NAME_PREFIX} Current Prep Cycle`, phase: 'prep', game_number: 906,
    });
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
      game_session_id: GAME_SESSION_ID,
      actor_id: String(actorId),
      target_id: String(targetId),
      action_type: 'raise',
    });

    expect(res.status, 'the true current cycle (game_number 906) is in prep, not game — this must be rejected regardless of the stale game_number 905 cycle').toBe(403);
  });
});

describe('otc.2 — POST /api/office_actions budget = effective City Status (the regression)', () => {
  it('includes the regent-ambience bonus, which the old formula silently dropped', async () => {
    // Clears ALL cycles, not just this file's prefixed ones — the route
    // scans every chapters document, so a leftover 'game'-phase
    // cycle from elsewhere in the shared tm_suite_test would make these
    // negative tests pass for the wrong reason (Codex review finding,
    // 2026-08-12). vitest runs this project's test files sequentially in
    // one process (fileParallelism: false), so this is safe for the
    // duration of this file's own run.
    await getCollection('chapters').deleteMany({});
    await seedGameCycle(903);

    // city 0 + Head of State title (+3) + Verdant ambience (+1) = 4.
    // The OLD formula (base + title only, no ambience) computed budget 3 —
    // the 4th raise below would have been rejected under the bug.
    // oaq.2: budget is enforced at ACCEPT time, not submission — each
    // raise below is submitted then immediately accepted by an ST.
    const actorId = await seedActor({ city: 0, regentAmbience: 'Verdant' });
    const targets = await seedTargets(4, 1);

    for (let i = 0; i < 4; i++) {
      const res = await submitAndAccept(actorId, targets[i], 'raise');
      expect(res.status, `raise #${i + 1} of 4 should succeed under the corrected budget of 4`).toBe(200);
    }

    // The 5th distinct target exceeds the real budget of 4 and must be rejected at accept time.
    const [overBudgetTarget] = await seedTargets(1);
    const res = await submitAndAccept(actorId, overBudgetTarget, 'raise');
    expect(res.status).toBe(403);
  });

  it('caps the budget at 10, which the old formula never applied', async () => {
    // Clears ALL cycles, not just this file's prefixed ones — the route
    // scans every chapters document, so a leftover 'game'-phase
    // cycle from elsewhere in the shared tm_suite_test would make these
    // negative tests pass for the wrong reason (Codex review finding,
    // 2026-08-12). vitest runs this project's test files sequentially in
    // one process (fileParallelism: false), so this is safe for the
    // duration of this file's own run.
    await getCollection('chapters').deleteMany({});
    await seedGameCycle(904);

    // city 8 + Head of State title (+3) = raw 11. The OLD formula used this
    // raw, uncapped sum as the budget (11). The correct effective City
    // Status caps at 10 — the 11th raise below must be rejected under the
    // fix, where it would have been the OLD formula's still-valid 11th use.
    // oaq.2: budget is enforced at ACCEPT time — submit then accept each.
    const actorId = await seedActor({ city: 8 });
    const targets = await seedTargets(10, 1);

    for (let i = 0; i < 10; i++) {
      const res = await submitAndAccept(actorId, targets[i], 'raise');
      expect(res.status, `raise #${i + 1} of 10 should succeed under the capped budget of 10`).toBe(200);
    }

    const [eleventhTarget] = await seedTargets(1);
    const res = await submitAndAccept(actorId, eleventhTarget, 'raise');
    expect(res.status, 'the 11th raise exceeds the capped budget of 10 and must be rejected').toBe(403);
  });
});
