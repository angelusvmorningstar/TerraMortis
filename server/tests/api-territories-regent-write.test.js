/**
 * API tests — RFR.1: PATCH /api/territories/:id/feeding-rights
 *
 * Covers:
 *   - ST happy path (always allowed, bypasses locks)
 *   - Regent's player happy path
 *   - Non-regent 403
 *   - Lock: regent cannot remove a character who submitted DT 'resident' this cycle
 *   - ST override: ST can remove even locked characters
 *   - No active cycle → no lock applies
 *   - Unauth → 401
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const territoryIds = [];
const cycleIds = [];
const submissionIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  // Clean up every territory seeded in this test, tracked by _id (not slug)
  // so tests that share a slug like 'secondcity' don't collide.
  for (const tid of territoryIds) {
    await getCollection('territories').deleteOne({ _id: tid });
  }
  for (const cid of cycleIds) await getCollection('downtime_cycles').deleteOne({ _id: cid });
  for (const sid of submissionIds) await getCollection('downtime_submissions').deleteOne({ _id: sid });
  territoryIds.length = 0;
  cycleIds.length = 0;
  submissionIds.length = 0;
});

afterAll(async () => {
  await teardownDb();
});

async function seedTerritory({ id = 'rfr_test_territory', regent_id = 'regent-char-id', feeding_rights = [] } = {}) {
  const col = getCollection('territories');
  const doc = { id, name: 'RFR Test', ambience: 'Tended', regent_id, lieutenant_id: null, feeding_rights };
  const result = await col.insertOne(doc);
  territoryIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

async function seedActiveCycle() {
  const col = getCollection('downtime_cycles');
  const result = await col.insertOne({ label: 'RFR Test Cycle', status: 'active' });
  cycleIds.push(result.insertedId);
  return { _id: result.insertedId };
}

async function seedSubmission({ cycleId, character_id, territorySlug = 'the_second_city', state = 'resident' }) {
  const col = getCollection('downtime_submissions');
  const doc = {
    character_id,
    character_name: 'Test Char',
    cycle_id: cycleId,
    status: 'submitted',
    responses: {
      feeding_territories: JSON.stringify({ [territorySlug]: state }),
    },
  };
  const result = await col.insertOne(doc);
  submissionIds.push(result.insertedId);
  return result.insertedId;
}

// ── ST happy path ───────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/feeding-rights — ST', () => {
  it('ST can update feeding_rights', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_st', feeding_rights: ['char-a'] });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', stUser())
      .send({ feeding_rights: ['char-a', 'char-b'] });
    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual(['char-a', 'char-b']);
    expect(res.body.updated_at).toBeTruthy();
  });

  it('ST can resolve territory by MongoDB _id', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_st_byid' });
    const res = await request(app)
      .patch(`/api/territories/${terr._id}/feeding-rights`)
      .set('X-Test-User', stUser())
      .send({ feeding_rights: ['char-x'] });
    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual(['char-x']);
  });
});

// ── Regent happy path ───────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/feeding-rights — Regent', () => {
  it('regent player can update their own territory', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_regent', regent_id: 'regent-xyz' });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', playerUser(['regent-xyz']))
      .send({ feeding_rights: ['ally-1', 'ally-2'] });
    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual(['ally-1', 'ally-2']);
  });

  it('only feeding_rights is modified; other body fields ignored', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_scope', regent_id: 'regent-xyz' });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', playerUser(['regent-xyz']))
      .send({ feeding_rights: ['ally'], ambience: 'HACKED', regent_id: 'hijack' });
    expect(res.status).toBe(200);
    expect(res.body.ambience).toBe('Tended');         // unchanged
    expect(res.body.regent_id).toBe('regent-xyz');    // unchanged
    expect(res.body.feeding_rights).toEqual(['ally']);
  });
});

// ── Non-regent blocked ──────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/feeding-rights — blocked', () => {
  it('non-regent player 403', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_nonregent', regent_id: 'someone-else' });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', playerUser(['not-the-regent']))
      .send({ feeding_rights: ['whatever'] });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Regent/i);
  });

  it('unauth 401', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_noauth' });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .send({ feeding_rights: [] });
    expect(res.status).toBe(401);
  });

  it('404 for unknown territory', async () => {
    const res = await request(app)
      .patch('/api/territories/does_not_exist/feeding-rights')
      .set('X-Test-User', stUser())
      .send({ feeding_rights: [] });
    expect(res.status).toBe(404);
  });

  it('400 when feeding_rights is not an array', async () => {
    const terr = await seedTerritory({ id: 'rfr_test_badbody', regent_id: 'regent-xyz' });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', playerUser(['regent-xyz']))
      .send({ feeding_rights: 'not-an-array' });
    expect(res.status).toBe(400);
  });
});

// ── Lock check ──────────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/feeding-rights — locks', () => {
  it('regent cannot remove a character who fed this cycle', async () => {
    const cycle = await seedActiveCycle();
    const terr = await seedTerritory({
      id: 'rfr_test_sc',
      regent_id: 'regent-lock',
      feeding_rights: ['fed-char', 'safe-char'],
    });
    await seedSubmission({
      cycleId: cycle._id,
      character_id: 'fed-char',
      territorySlug: 'rfr_test_sc',  // maps to secondcity — matches terr.id
    });

    const res = await request(app)
      .patch(`/api/territories/${terr._id}/feeding-rights`)
      .set('X-Test-User', playerUser(['regent-lock']))
      .send({ feeding_rights: ['safe-char'] });  // attempts to remove fed-char
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.locked).toEqual(['fed-char']);
  });

  it('ST override: ST can remove even a locked character', async () => {
    const cycle = await seedActiveCycle();
    const terr = await seedTerritory({
      id: 'rfr_test_sc',
      regent_id: 'regent-override',
      feeding_rights: ['fed-char', 'safe-char'],
    });
    await seedSubmission({ cycleId: cycle._id, character_id: 'fed-char', territorySlug: 'the_second_city' });

    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', stUser())
      .send({ feeding_rights: ['safe-char'] });
    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual(['safe-char']);
  });

  it('no active cycle → no lock applies', async () => {
    // Active cycle collection is empty; locks skip
    const terr = await seedTerritory({
      id: 'rfr_test_sc',
      regent_id: 'regent-noscope',
      feeding_rights: ['char-a'],
    });
    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', playerUser(['regent-noscope']))
      .send({ feeding_rights: [] });
    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual([]);
  });

  it('regent can remove a character who did NOT feed with permission', async () => {
    const cycle = await seedActiveCycle();
    const terr = await seedTerritory({
      id: 'rfr_test_sc',
      regent_id: 'regent-clean',
      feeding_rights: ['char-a', 'char-b'],
    });
    // char-a submitted but marked 'poach', not 'resident' → not locked
    await seedSubmission({
      cycleId: cycle._id,
      character_id: 'char-a',
      territorySlug: 'rfr_test_sc',
      state: 'poach',
    });

    const res = await request(app)
      .patch(`/api/territories/${terr.id}/feeding-rights`)
      .set('X-Test-User', playerUser(['regent-clean']))
      .send({ feeding_rights: ['char-b'] });
    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual(['char-b']);
  });
});
