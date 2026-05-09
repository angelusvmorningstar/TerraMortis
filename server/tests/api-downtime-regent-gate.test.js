/**
 * API tests — POST /api/downtime_cycles/:id/confirm-feeding
 *
 * Tests the regent feeding confirmation gate: identity checks, append-only
 * enforcement, gate computation, and edge cases.
 *
 * Post-ADR-002 strict cutover: territory_id in the request body is the
 * territory's MongoDB _id (ObjectId-string), not its slug.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

const REGENT_A = new ObjectId().toHexString();
const REGENT_B = new ObjectId().toHexString();
const OTHER    = new ObjectId().toHexString();

let insertedCycleIds = [];
let insertedTerrIds = [];

// Issue #241: tm_suite_test was populated with 5 production-like territories
// carrying `regent_id` values by the regent-id migration script run on
// 2026-05-05 (server/scripts/migrate-regent-to-id.js + backup at
// scripts/_backups/territory-fk-migration-2026-05-05T05-36-59-765Z.json).
// The confirm-feeding gate at routes/downtime.js:139 queries every
// territory with `regent_id` set; pre-existing territories leak into the
// query alongside the test's own inserts and force allConfirmed=false
// because the test only confirms its single territory. Snapshot the
// pre-existing regent_id values in beforeAll, null them out for the
// suite's lifetime, restore in afterAll. The test DB is throwaway so
// the temporary mutation is bounded to this suite's run; restoring
// keeps the snapshot intact for subsequent test files in the same
// vitest worker.
let _seededRegentSnapshot = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  const terrCol = getCollection('territories');
  _seededRegentSnapshot = await terrCol
    .find({ regent_id: { $exists: true, $ne: null } })
    .project({ _id: 1, regent_id: 1, lieutenant_id: 1 })
    .toArray();
  if (_seededRegentSnapshot.length) {
    const ids = _seededRegentSnapshot.map(d => d._id);
    await terrCol.updateMany(
      { _id: { $in: ids } },
      { $set: { regent_id: null, lieutenant_id: null } }
    );
  }
});

afterEach(async () => {
  const cycleCol = getCollection('downtime_cycles');
  const terrCol  = getCollection('territories');
  for (const id of insertedCycleIds) await cycleCol.deleteOne({ _id: id });
  for (const id of insertedTerrIds) await terrCol.deleteOne({ _id: id });
  insertedCycleIds = [];
  insertedTerrIds  = [];
});

afterAll(async () => {
  // Restore any seeded territories' regent_id we nulled in beforeAll
  // (issue #241) so subsequent test files in the same worker — and
  // manual ST smoke runs against tm_suite_test — see the original
  // state.
  if (_seededRegentSnapshot.length) {
    const terrCol = getCollection('territories');
    for (const doc of _seededRegentSnapshot) {
      await terrCol.updateOne(
        { _id: doc._id },
        { $set: { regent_id: doc.regent_id, lieutenant_id: doc.lieutenant_id ?? null } }
      );
    }
  }
  await teardownDb();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertCycle(overrides = {}) {
  const col = getCollection('downtime_cycles');
  const doc = {
    label: 'Test Cycle',
    game_number: 999,
    status: 'active',
    regent_confirmations: [],
    ...overrides,
  };
  const result = await col.insertOne(doc);
  insertedCycleIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

async function insertTerritory(slug, regentCharId, overrides = {}) {
  const col = getCollection('territories');
  const doc = { slug, name: 'Test Territory', regent_id: regentCharId, ...overrides };
  const result = await col.insertOne(doc);
  insertedTerrIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId, _idStr: String(result.insertedId) };
}

// ══════════════════════════════════════
//  CONFIRM-FEEDING
// ══════════════════════════════════════

describe('POST /api/downtime_cycles/:id/confirm-feeding', () => {
  it('Regent can confirm their territory rights', async () => {
    const cycle = await insertCycle();
    const terr = await insertTerritory('terr-test-1', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terr._idStr, rights: [OTHER] });

    expect(res.status).toBe(200);
    expect(res.body.regent_confirmations).toHaveLength(1);
    expect(res.body.regent_confirmations[0].territory_id).toBe(terr._idStr);
    expect(res.body.regent_confirmations[0].rights).toContain(OTHER);
    expect(res.body.regent_confirmations[0].confirmed_at).toBeTruthy();
  });

  it('Regent cannot remove a previously confirmed character (returns 409)', async () => {
    const terr = await insertTerritory('terr-test-2', REGENT_A);
    const cycle = await insertCycle({
      regent_confirmations: [{
        territory_id: terr._idStr,
        regent_char_id: REGENT_A,
        confirmed_at: new Date().toISOString(),
        rights: [REGENT_B, OTHER],
      }],
    });

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terr._idStr, rights: [REGENT_B] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.removed).toContain(OTHER);
  });

  it('Regent can add additional characters after first confirmation', async () => {
    const terr = await insertTerritory('terr-test-3', REGENT_A);
    const cycle = await insertCycle({
      regent_confirmations: [{
        territory_id: terr._idStr,
        regent_char_id: REGENT_A,
        confirmed_at: new Date().toISOString(),
        rights: [REGENT_B],
      }],
    });

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terr._idStr, rights: [REGENT_B, OTHER] });

    expect(res.status).toBe(200);
    expect(res.body.regent_confirmations[0].rights).toContain(REGENT_B);
    expect(res.body.regent_confirmations[0].rights).toContain(OTHER);
  });

  it('Gate remains false when only one of two territories has confirmed', async () => {
    const cycle = await insertCycle();
    const terrA = await insertTerritory('terr-gate-a', REGENT_A);
    await insertTerritory('terr-gate-b', REGENT_B);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terrA._idStr, rights: [] });

    expect(res.status).toBe(200);
    expect(res.body.feeding_rights_confirmed).not.toBe(true);
  });

  it('Gate becomes true when all territories with regents have confirmed', async () => {
    const cycle = await insertCycle();
    const terr = await insertTerritory('terr-gate-sole', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terr._idStr, rights: [] });

    expect(res.status).toBe(200);
    expect(res.body.feeding_rights_confirmed).toBe(true);
  });

  it('Player cannot confirm a territory whose Regent they are not', async () => {
    const cycle = await insertCycle();
    const terr = await insertTerritory('terr-wrong-regent', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_B]))
      .send({ territory_id: terr._idStr, rights: [] });

    expect(res.status).toBe(403);
  });

  it('ST can confirm on behalf of any territory (role bypass)', async () => {
    const cycle = await insertCycle();
    const terr = await insertTerritory('terr-st-bypass', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', stUser())
      .send({ territory_id: terr._idStr, rights: [] });

    expect(res.status).toBe(200);
  });

  it('Territory with no regent_id does not block gate computation', async () => {
    const cycle = await insertCycle();
    const terrA = await insertTerritory('terr-with-regent', REGENT_A);
    await insertTerritory('terr-no-regent', null, { regent_id: null });

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terrA._idStr, rights: [] });

    expect(res.status).toBe(200);
    expect(res.body.feeding_rights_confirmed).toBe(true);
  });

  it('Returns 404 for non-existent cycle', async () => {
    const fakeId = new ObjectId();
    const res = await request(app)
      .post(`/api/downtime_cycles/${fakeId}/confirm-feeding`)
      .set('X-Test-User', stUser())
      .send({ territory_id: new ObjectId().toHexString(), rights: [] });
    expect(res.status).toBe(404);
  });

  it('Returns 409 for non-active cycle', async () => {
    const cycle = await insertCycle({ status: 'closed' });
    const terr = await insertTerritory('terr-closed', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: terr._idStr, rights: [] });

    expect(res.status).toBe(409);
  });

  it('Returns 400 for slug-style territory_id (strict cutover)', async () => {
    const cycle = await insertCycle();
    await insertTerritory('terr-slug-rejected', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', stUser())
      .send({ territory_id: 'terr-slug-rejected', rights: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('Returns 401 without auth', async () => {
    const cycle = await insertCycle();
    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .send({ territory_id: new ObjectId().toHexString(), rights: [] });
    expect(res.status).toBe(401);
  });
});
