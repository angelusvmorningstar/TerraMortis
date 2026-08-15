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
import { readFileSync } from 'fs';
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
  await getCollection('contested_roll_requests').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_action_budgets').deleteMany({});
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
  // oaq.2: the pending-dedupe index lives on contested_roll_requests now —
  // same idempotent-createIndex-in-test precedent as above.
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
    expect(res.body.request.game_session_id).toBe(String(realSession._id));
    expect(res.body.request.game_session_id).not.toBe('totally-forged-session-id');
  });

  it('a forged game_session_id cannot be used to reset budget scoping across requests', async () => {
    // Pre-issue-1143 exploit: invent a fresh game_session_id per request to
    // make the budget/dedupe counts always read 0. Post-fix, every request
    // resolves to the SAME real session regardless of what the client sends,
    // so the budget below (Head of State, city 0 => budget 3) is enforced
    // across all four requests even though each one claims a different
    // client-side session id. oaq.2: budget is enforced at ACCEPT time, not
    // submission — the forged id is sent on each SUBMISSION (the only place
    // a client ever sends it) and accept still resolves the real session.
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 0 });
    const targets = await seedTargets(4, 1);

    for (let i = 0; i < 3; i++) {
      const submitRes = await request(app).post('/api/office_actions')
        .set('X-Test-User', stUser())
        .send({
          game_session_id: `forged-session-${i}`, actor_id: String(actorId), target_id: String(targets[i]), action_type: 'raise',
        });
      expect(submitRes.status).toBe(201);
      const acceptRes = await request(app).put(`/api/office_actions/${submitRes.body.request._id}/accept`).set('X-Test-User', stUser());
      expect(acceptRes.status, `raise #${i + 1} of 3 (budget 3) should succeed`).toBe(200);
    }

    const submitRes = await request(app).post('/api/office_actions')
      .set('X-Test-User', stUser())
      .send({
        game_session_id: 'forged-session-should-not-reset-budget', actor_id: String(actorId), target_id: String(targets[3]), action_type: 'raise',
      });
    expect(submitRes.status).toBe(201);
    const acceptRes = await request(app).put(`/api/office_actions/${submitRes.body.request._id}/accept`).set('X-Test-User', stUser());
    expect(acceptRes.status, 'the 4th raise exceeds budget 3 and must be rejected even under a fresh forged session id').toBe(403);
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
  it('at most one of two concurrent ACCEPTS wins the last budget slot', async () => {
    await seedGameSessionAndCycle();
    // Head of State, city 0 => effective budget 3. oaq.2: budget is
    // enforced at accept time, not submission — submit all 4 up front
    // (unraced, submission never checks budget), accept 2 sequentially to
    // fill 2 of 3 slots, then race the accept of the LAST TWO pending
    // requests concurrently for the final slot.
    const actorId = await seedActor({ city: 0 });
    const targets = await seedTargets(4, 1);

    const requestIds = [];
    for (const t of targets) {
      const res = await request(app).post('/api/office_actions')
        .set('X-Test-User', stUser())
        .send({
          game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(t), action_type: 'raise',
        });
      expect(res.status).toBe(201);
      requestIds.push(res.body.request._id);
    }

    for (let i = 0; i < 2; i++) {
      const res = await request(app).put(`/api/office_actions/${requestIds[i]}/accept`).set('X-Test-User', stUser());
      expect(res.status).toBe(200);
    }

    const [resA, resB] = await Promise.all([
      request(app).put(`/api/office_actions/${requestIds[2]}/accept`).set('X-Test-User', stUser()),
      request(app).put(`/api/office_actions/${requestIds[3]}/accept`).set('X-Test-User', stUser()),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0], `exactly one of the two racing accepts should succeed (got ${statuses.join(',')})`).toBe(200);
    expect(statuses[1]).not.toBe(200);

    const finalCount = await getCollection('office_actions').countDocuments({
      actor_id: String(actorId), action_type: 'raise',
    });
    expect(finalCount, 'budget of 3 must never be exceeded regardless of the race outcome').toBe(3);
  });

  it('at most one of two concurrent SUBMISSIONS targeting the SAME character succeeds', async () => {
    // oaq.2: dedupe now happens at SUBMISSION time via the pending-scoped
    // unique index on contested_roll_requests (AC2), not at apply time —
    // submission itself is where "already have a pending request against
    // this target" is enforced.
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
    expect(statuses[0], `exactly one of the two racing same-target submissions should succeed (got ${statuses.join(',')})`).toBe(201);
    expect(statuses[1]).not.toBe(201);

    const finalCount = await getCollection('contested_roll_requests').countDocuments({
      actor_id: String(actorId), target_id: String(targetId), request_type: 'status_action',
    });
    expect(finalCount, 'the pending-scoped unique index must prevent a duplicate pending request on the same target').toBe(1);
  });

  it('REGRESSION (2-round internal/external review, 2026-08-12): concurrent grant_first on one target — at most one succeeds', async () => {
    // Two earlier versions of this route's atomicity fix (a non-transactional
    // insert-then-rank pattern, then a first transaction-based rewrite using
    // a blind `characters.updateOne($set)`) both left grant_first/strip_last
    // completely unprotected against a same-target race: the shared unique
    // index only ever covered raise/lower, and a blind $set inside a
    // transaction does not create a write conflict — it just silently
    // overwrites whatever the other transaction already committed. Verified
    // live pre-fix: 29/30 tight races produced a double-201 (external Codex
    // review + an internal Acceptance Auditor pass, both 2026-08-12). Fixed
    // by making the target's status.city write a compare-and-swap (the
    // update filter includes the exact old_status the request read), so a
    // stale write matches zero documents and is rejected as a 409 instead of
    // silently overwriting.
    //
    // oaq.2: the CAS now lives in the ACCEPT handler, not submission — and
    // AC2's pending-dedupe index would trivially block a second SAME-actor
    // submission before it ever reached a CAS at all, which would prove
    // nothing about the CAS itself. Two DIFFERENT actors submit separately
    // (both succeed — dedupe is per-actor), then their accepts race.
    await seedGameSessionAndCycle();
    let doubleWins = 0;
    for (let i = 0; i < 10; i++) {
      const actorA = await seedActor({ city: 3 });
      const actorB = await seedActor({ city: 3 });
      const [targetId] = await seedTargets(1, 0);
      const submitA = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorA), target_id: String(targetId), action_type: 'grant_first',
      });
      const submitB = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorB), target_id: String(targetId), action_type: 'grant_first',
      });
      expect(submitA.status).toBe(201);
      expect(submitB.status).toBe(201);

      const [r1, r2] = await Promise.all([
        request(app).put(`/api/office_actions/${submitA.body.request._id}/accept`).set('X-Test-User', stUser()),
        request(app).put(`/api/office_actions/${submitB.body.request._id}/accept`).set('X-Test-User', stUser()),
      ]);
      if ([r1.status, r2.status].filter(s => s === 200).length > 1) doubleWins++;
    }
    expect(doubleWins, `${doubleWins}/10 iterations let two concurrent grant_first accepts both succeed on the same target`).toBe(0);
  }, 20000);

  it('REGRESSION (Acceptance Auditor, 2026-08-12): two DIFFERENT actors racing the same target never lose an update', async () => {
    // Two different Head-of-State-tier officers (a realistic scenario — this
    // project's court model explicitly allows several categories to have
    // multiple concurrent holders) both raising the SAME target concurrently
    // used to silently lose one of the two increments: both read the same
    // old_status before either wrote, both computed the same new_status, and
    // a blind $set let the second writer overwrite the first with no error
    // and no indication anything was wrong — the target ended one dot short
    // of what two real raises should have produced, while BOTH actions still
    // logged as successful. Verified live pre-fix: 4/5 runs lost an update
    // (against a fully non-transactional prior version of this route).
    // Fixed by the same compare-and-swap described above — the loser's CAS
    // now fails to match (409), so at most one of the two raises actually
    // lands, and if both land (because they didn't truly overlap) the
    // second one reads the first one's already-committed result and stacks
    // correctly rather than clobbering it.
    //
    // oaq.2: budget/CAS now live at accept time — both actors submit
    // separately (dedupe is per-actor, both succeed), then their accepts
    // race.
    await seedGameSessionAndCycle();
    let lostUpdates = 0;
    for (let i = 0; i < 10; i++) {
      const actorA = await seedActor({ city: 3 });
      const actorB = await seedActor({ city: 3 });
      const [targetId] = await seedTargets(1, 3);
      const submitA = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorA), target_id: String(targetId), action_type: 'raise',
      });
      const submitB = await request(app).post('/api/office_actions').set('X-Test-User', stUser()).send({
        game_session_id: 'irrelevant', actor_id: String(actorB), target_id: String(targetId), action_type: 'raise',
      });
      expect(submitA.status).toBe(201);
      expect(submitB.status).toBe(201);

      const [r1, r2] = await Promise.all([
        request(app).put(`/api/office_actions/${submitA.body.request._id}/accept`).set('X-Test-User', stUser()),
        request(app).put(`/api/office_actions/${submitB.body.request._id}/accept`).set('X-Test-User', stUser()),
      ]);
      const wins = [r1.status, r2.status].filter(s => s === 200).length;
      const finalTarget = await getCollection('characters').findOne({ _id: targetId });
      if (wins === 2 && finalTarget.status.city !== 5) lostUpdates++;
    }
    expect(lostUpdates, `${lostUpdates}/10 iterations lost an update when two different actors' accepts raced on the same target`).toBe(0);
  }, 20000);

  it('REGRESSION (external review, Pass 1, 2026-08-12): the budget claim must be a real atomic counter, not a derived count', async () => {
    // The FIRST atomicity fix compared a raw countDocuments() total to
    // budget after each insert. Under a real HTTP round trip (auth check,
    // session lookup, phase gate query, actor/target lookups all awaited
    // before the insert), two requests racing for the last slot rarely land
    // close enough together to expose the flaw through this test's own
    // harness — but an external Codex review's tighter, direct-to-collection
    // probe (no intervening awaits) reproduced it in 28/30 runs: both
    // concurrent inserts see the SAME total count after both land, so BOTH
    // self-evict, undershooting the budget by one instead of exactly one
    // winning. The current implementation replaces the derived count with a
    // single atomic conditional $inc on a per-(session, actor) counter
    // document (server/routes/office-actions.js, the `office_action_budgets`
    // collection) — a real point of write contention that forces MongoDB's
    // transaction machinery to serialize concurrent claims rather than
    // letting two requests each read a stale snapshot. This asserts the
    // route uses that mechanism (not a regression-proof of the race itself,
    // since HTTP-level timing can't reliably force the old bug — see Dev
    // Notes for why a tight direct-collection probe was used to originally
    // prove it and to prove this fix, run once during development, not kept
    // as a flaky permanent test).
    const routeSource = readFileSync(
      new URL('../routes/office-actions.js', import.meta.url), 'utf8',
    );
    expect(routeSource).toContain("getCollection('office_action_budgets')");
    expect(routeSource).toContain('$inc');
  });
});
