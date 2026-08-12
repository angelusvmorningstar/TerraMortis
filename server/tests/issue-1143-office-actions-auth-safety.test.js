/**
 * issue-1143 — real behavioural coverage for the four route-level defects
 * fixed in server/routes/office-actions.js's POST / handler, all confirmed
 * pre-existing since #691 and deferred out of otc-2-status-actions-server-
 * hardening's scope:
 *
 *   AC1 — actor_id must belong to the authenticated caller, or the caller
 *         must hold an ST role.
 *   AC2 — game_session_id is derived server-side (game_sessions collection);
 *         a client-supplied value can no longer reset budget/dedupe scoping.
 *   AC3 — budget + dedupe + write are atomic enough that a real concurrent
 *         request race cannot exceed budget or double-act on one target.
 *   AC4 — the self-target check compares resolved ObjectIds, not raw
 *         strings (a hex-case-variant pair of the same id is still a
 *         self-target).
 *
 * AC5 (db-setup.js clean skip contract) is unit-tested separately in
 * issue-1143-db-setup-skip.test.js, which needs to mock the DB connection
 * failure path — that would corrupt the shared connection state this file's
 * other tests depend on if done here. This file instead DEMONSTRATES the
 * resulting pattern for real: every describe block below is wrapped in
 * describe.skipIf(!dbAvailable) rather than the bare setupDb()/teardownDb()
 * pairing otc-2-office-actions-api.test.js still uses, so this suite reports
 * a clean vitest skip (not a failed beforeAll + a second erroring afterAll)
 * if MongoDB is unreachable when this file runs.
 *
 * Follows the pattern established by otc-2-office-actions-api.test.js: real
 * Supertest requests against the mounted app + tm_suite_test, prefixed test
 * fixtures, full-collection defensive clears for the shared game_sessions /
 * downtime_cycles collections (a leftover doc from another file could
 * otherwise make findLatestSession()/currentCycleInGamePhase() resolve to
 * the wrong record).
 *
 * DB-backed: real MongoDB required. See db-setup.js.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

// issue-1143 AC5: resolved once at module load (top-level await is valid in
// an ESM vitest test file) so every describe.skipIf below shares one
// connectivity probe rather than re-probing per suite.
const dbAvailable = await isDbAvailable();

let app;
const NAME_PREFIX = 'Issue-1143 Probe';

async function cleanup() {
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('territories').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('downtime_cycles').deleteMany({ label: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('game_sessions').deleteMany({ title: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_actions').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
}

async function seedGameSessionAndCycle() {
  // Full-collection defensive clear — see file header. Matches the same
  // rationale otc-2-office-actions-api.test.js already established for
  // downtime_cycles.
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $lte: today } });
  await getCollection('game_sessions').insertOne({
    title: `${NAME_PREFIX} Session`,
    session_date: today,
    game_number: 999,
  });
  await getCollection('downtime_cycles').deleteMany({});
  await getCollection('downtime_cycles').insertOne({
    label: `${NAME_PREFIX} Cycle`, phase: 'game', game_number: 999,
  });
}

async function seedActor({ city = 0, courtCategory = 'Head of State' } = {}) {
  const actorDoc = {
    name: `${NAME_PREFIX} Actor ${Date.now()}_${Math.random()}`,
    court_category: courtCategory,
    status: { city },
    retired: false,
  };
  const { insertedId } = await getCollection('characters').insertOne(actorDoc);
  return insertedId;
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

beforeAll(async () => {
  // issue-1143 AC5: this top-level beforeAll runs regardless of which
  // describe.skipIf blocks below get skipped, so it must guard itself too —
  // otherwise an unreachable DB would still produce one failure here even
  // with every suite marked skipped.
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  await cleanup();
  // createTestApp() doesn't run server/index.js's real boot sequence, so the
  // production index-creation call there never fires under vitest. Ensure
  // the same partial unique index exists here directly — createIndex is
  // idempotent, matching the precedent in issue-971-cyoa-passages.test.js.
  await getCollection('office_actions').createIndex(
    { game_session_id: 1, actor_id: 1, target_id: 1 },
    { unique: true, partialFilterExpression: { action_type: { $in: ['raise', 'lower'] } } },
  );
});

afterAll(async () => {
  if (!dbAvailable) return;
  await cleanup();
  await teardownDb();
});

describe.skipIf(!dbAvailable)('issue-1143 AC1 — actor_id authorization', () => {
  it('403s a player POSTing an actor_id that is not one of their own character_ids', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', playerUser(['000000000000000000000001']))
      .send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/may not act as this character/i);
  });

  it('allows a player POSTing an actor_id that IS in their own character_ids', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', playerUser([String(actorId)]))
      .send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      });

    expect(res.status).toBe(201);
  });

  it('allows an ST-role caller to act as any actor_id (override)', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      });

    expect(res.status).toBe(201);
  });
});

describe.skipIf(!dbAvailable)('issue-1143 AC2 — server-derived game_session_id', () => {
  it('ignores a forged client-supplied game_session_id and stamps the real one', async () => {
    await seedGameSessionAndCycle();
    const realSession = await getCollection('game_sessions').findOne(
      { title: `${NAME_PREFIX} Session` },
    );
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'totally-forged-session-id', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      });

    expect(res.status).toBe(201);
    expect(res.body.action.game_session_id).toBe(String(realSession._id));
    expect(res.body.action.game_session_id).not.toBe('totally-forged-session-id');
  });

  it('a forged game_session_id cannot be used to reset budget scoping across requests', async () => {
    // Pre-issue-1143 exploit: invent a fresh game_session_id per request to
    // make the budget/dedupe counts always read 0. Post-fix, every request
    // resolves to the SAME real session regardless of what the client sends,
    // so the budget below (Head of State, city 0 => budget 3) is enforced
    // across all four requests even though each one claims a different
    // client-side session id.
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 0 });
    const targets = await seedTargets(4, 1);

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/office_actions')
        .set('X-Test-User', stUser())
        .send({
          game_session_id: `forged-session-${i}`, actor_id: String(actorId), target_id: String(targets[i]), action_type: 'raise',
        });
      expect(res.status, `raise #${i + 1} of 3 (budget 3) should succeed`).toBe(201);
    }

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'forged-session-should-not-reset-budget', actor_id: String(actorId), target_id: String(targets[3]), action_type: 'raise',
      });
    expect(res.status, 'the 4th raise exceeds budget 3 and must be rejected even under a fresh forged session id').toBe(403);
  });

  it('403s when no live game session exists', async () => {
    await getCollection('game_sessions').deleteMany({});
    await getCollection('downtime_cycles').deleteMany({});
    await getCollection('downtime_cycles').insertOne({
      label: `${NAME_PREFIX} Cycle`, phase: 'game', game_number: 999,
    });
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no active game session/i);
  });
});

describe.skipIf(!dbAvailable)('issue-1143 AC4 — self-target check on resolved ObjectIds', () => {
  it('rejects a self-target even when actor_id/target_id differ only by hex case', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const lower = actorId.toHexString();
    const upper = lower.toUpperCase();
    expect(lower).not.toBe(upper); // sanity: the pair really is a different string

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'irrelevant', actor_id: lower, target_id: upper, action_type: 'raise',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot target yourself/i);
  });

  it('still allows the identical-string self-target case (regression check)', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });

    const res = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(actorId), action_type: 'raise',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot target yourself/i);
  });
});

describe.skipIf(!dbAvailable)('issue-1143 AC3 — atomic budget + dedupe under concurrency', () => {
  it('at most one of two concurrent requests wins the last budget slot', async () => {
    await seedGameSessionAndCycle();
    // Head of State, city 0 => effective budget 3. Consume 2 sequentially
    // (unraced) to leave exactly 1 slot, then race two parallel requests at
    // two DIFFERENT targets for that final slot.
    const actorId = await seedActor({ city: 0 });
    const targets = await seedTargets(4, 1);

    for (let i = 0; i < 2; i++) {
      const res = await request(app).post('/api/office_actions')
        .set('X-Test-User', stUser())
        .send({
          game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targets[i]), action_type: 'raise',
        });
      expect(res.status).toBe(201);
    }

    const [resA, resB] = await Promise.all([
      request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targets[2]), action_type: 'raise',
      }),
      request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targets[3]), action_type: 'raise',
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0], `exactly one of the two racing requests should succeed (got ${statuses.join(',')})`).toBe(201);
    expect(statuses[1]).not.toBe(201);

    const finalCount = await getCollection('office_actions').countDocuments({
      actor_id: String(actorId), action_type: 'raise',
    });
    expect(finalCount, 'budget of 3 must never be exceeded regardless of the race outcome').toBe(3);
  });

  it('at most one of two concurrent requests targeting the SAME character succeeds', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1);

    const [resA, resB] = await Promise.all([
      request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      }),
      request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: 'raise',
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0], `exactly one of the two racing same-target requests should succeed (got ${statuses.join(',')})`).toBe(201);
    expect(statuses[1]).not.toBe(201);

    const finalCount = await getCollection('office_actions').countDocuments({
      actor_id: String(actorId), target_id: String(targetId),
    });
    expect(finalCount, 'the unique partial index must prevent a duplicate action doc on the same target').toBe(1);
  });
});
