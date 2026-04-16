/**
 * API tests — POST /api/downtime_cycles/:id/confirm-feeding
 * Tests the regent feeding confirmation gate: identity checks, append-only enforcement,
 * gate computation, and edge cases.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

// Synthetic char IDs — no need for real DB characters since identity is a string match
const REGENT_A = new ObjectId().toHexString();
const REGENT_B = new ObjectId().toHexString();
const OTHER    = new ObjectId().toHexString();

// IDs for test territory and cycle documents inserted per-test
let insertedCycleIds = [];
let insertedTerrIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
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

async function insertTerritory(terrId, regentCharId, overrides = {}) {
  const col = getCollection('territories');
  const doc = { id: terrId, name: 'Test Territory', regent_id: regentCharId, ...overrides };
  const result = await col.insertOne(doc);
  insertedTerrIds.push(result.insertedId);
  return doc;
}

// ══════════════════════════════════════
//  CONFIRM-FEEDING
// ══════════════════════════════════════

describe('POST /api/downtime_cycles/:id/confirm-feeding', () => {
  it('Regent can confirm their territory rights', async () => {
    const cycle = await insertCycle();
    await insertTerritory('terr-test-1', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-test-1', rights: [OTHER] });

    expect(res.status).toBe(200);
    expect(res.body.regent_confirmations).toHaveLength(1);
    expect(res.body.regent_confirmations[0].territory_id).toBe('terr-test-1');
    expect(res.body.regent_confirmations[0].rights).toContain(OTHER);
    expect(res.body.regent_confirmations[0].confirmed_at).toBeTruthy();
  });

  it('Regent cannot remove a previously confirmed character (returns 409)', async () => {
    const cycle = await insertCycle({
      regent_confirmations: [{
        territory_id: 'terr-test-2',
        regent_char_id: REGENT_A,
        confirmed_at: new Date().toISOString(),
        rights: [REGENT_B, OTHER],
      }],
    });
    await insertTerritory('terr-test-2', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-test-2', rights: [REGENT_B] }); // removes OTHER

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.removed).toContain(OTHER);
  });

  it('Regent can add additional characters after first confirmation', async () => {
    const cycle = await insertCycle({
      regent_confirmations: [{
        territory_id: 'terr-test-3',
        regent_char_id: REGENT_A,
        confirmed_at: new Date().toISOString(),
        rights: [REGENT_B],
      }],
    });
    await insertTerritory('terr-test-3', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-test-3', rights: [REGENT_B, OTHER] });

    expect(res.status).toBe(200);
    expect(res.body.regent_confirmations[0].rights).toContain(REGENT_B);
    expect(res.body.regent_confirmations[0].rights).toContain(OTHER);
  });

  it('Gate remains false when only one of two territories has confirmed', async () => {
    const cycle = await insertCycle();
    await insertTerritory('terr-gate-a', REGENT_A);
    await insertTerritory('terr-gate-b', REGENT_B);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-gate-a', rights: [] });

    expect(res.status).toBe(200);
    expect(res.body.feeding_rights_confirmed).not.toBe(true);
  });

  it('Gate becomes true when all territories with regents have confirmed', async () => {
    const cycle = await insertCycle();
    await insertTerritory('terr-gate-sole', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-gate-sole', rights: [] });

    expect(res.status).toBe(200);
    expect(res.body.feeding_rights_confirmed).toBe(true);
  });

  it('Player cannot confirm a territory whose Regent they are not', async () => {
    const cycle = await insertCycle();
    await insertTerritory('terr-wrong-regent', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_B]))
      .send({ territory_id: 'terr-wrong-regent', rights: [] });

    expect(res.status).toBe(403);
  });

  it('ST can confirm on behalf of any territory (role bypass)', async () => {
    const cycle = await insertCycle();
    await insertTerritory('terr-st-bypass', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', stUser())
      .send({ territory_id: 'terr-st-bypass', rights: [] });

    expect(res.status).toBe(200);
  });

  it('Territory with no regent_id does not block gate computation', async () => {
    const cycle = await insertCycle();
    // One territory with a regent, one without
    await insertTerritory('terr-with-regent', REGENT_A);
    await insertTerritory('terr-no-regent', null, { regent_id: null });

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-with-regent', rights: [] });

    expect(res.status).toBe(200);
    // Only the territory with a regent matters — gate should be true
    expect(res.body.feeding_rights_confirmed).toBe(true);
  });

  it('Returns 404 for non-existent cycle', async () => {
    const fakeId = new ObjectId();
    const res = await request(app)
      .post(`/api/downtime_cycles/${fakeId}/confirm-feeding`)
      .set('X-Test-User', stUser())
      .send({ territory_id: 'any', rights: [] });
    expect(res.status).toBe(404);
  });

  it('Returns 409 for non-active cycle', async () => {
    const cycle = await insertCycle({ status: 'closed' });
    await insertTerritory('terr-closed', REGENT_A);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .set('X-Test-User', playerUser([REGENT_A]))
      .send({ territory_id: 'terr-closed', rights: [] });

    expect(res.status).toBe(409);
  });

  it('Returns 401 without auth', async () => {
    const cycle = await insertCycle();
    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/confirm-feeding`)
      .send({ territory_id: 'any', rights: [] });
    expect(res.status).toBe(401);
  });
});
