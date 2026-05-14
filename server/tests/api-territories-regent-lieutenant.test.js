/**
 * API tests — PATCH /api/territories/:id/lieutenant (issue #293)
 *
 * Covers:
 *   - ST can set lieutenant (happy path)
 *   - ST can clear lieutenant (null)
 *   - Regent can set their territory's lieutenant
 *   - Regent cannot appoint themselves as lieutenant (400)
 *   - Non-existent character_id → 400
 *   - Retired character → 400
 *   - Non-regent player → 403
 *   - Unauthenticated → 401
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const territoryIds = [];
const characterIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  for (const tid of territoryIds) {
    await getCollection('territories').deleteOne({ _id: tid });
  }
  for (const cid of characterIds) {
    await getCollection('characters').deleteOne({ _id: cid });
  }
  territoryIds.length = 0;
  characterIds.length = 0;
});

afterAll(async () => {
  await teardownDb();
});

async function seedTerritory({ slug = 'lt_test', regent_id = 'regent-lt-char' } = {}) {
  const col = getCollection('territories');
  const doc = { slug, name: 'LT Test', ambience: 'Tended', regent_id, lieutenant_id: null, feeding_rights: [] };
  const result = await col.insertOne(doc);
  territoryIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId, _idStr: String(result.insertedId) };
}

async function seedCharacter({ retired = false } = {}) {
  const col = getCollection('characters');
  const doc = { name: 'Test Lt', moniker: null, honorific: null, retired };
  const result = await col.insertOne(doc);
  characterIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId, _idStr: String(result.insertedId) };
}

// ── ST happy paths ────────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/lieutenant — ST', () => {
  it('ST can set lieutenant_id', async () => {
    const terr = await seedTerritory({ slug: 'lt_st_set', regent_id: 'some-regent' });
    const char = await seedCharacter();
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: char._idStr });
    expect(res.status).toBe(200);
    expect(res.body.lieutenant_id).toBe(char._idStr);
    expect(res.body.updated_at).toBeTruthy();
  });

  it('ST can clear lieutenant_id with null', async () => {
    const terr = await seedTerritory({ slug: 'lt_st_clear' });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: null });
    expect(res.status).toBe(200);
    expect(res.body.lieutenant_id).toBeNull();
  });
});

// ── Regent happy path ─────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/lieutenant — Regent', () => {
  it('regent can appoint a lieutenant on their own territory', async () => {
    const regentCharId = String(new ObjectId());
    const terr = await seedTerritory({ slug: 'lt_regent_set', regent_id: regentCharId });
    const char = await seedCharacter();
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', playerUser([regentCharId]))
      .send({ lieutenant_id: char._idStr });
    expect(res.status).toBe(200);
    expect(res.body.lieutenant_id).toBe(char._idStr);
  });

  it('regent can clear lieutenant (null)', async () => {
    const regentCharId = String(new ObjectId());
    const terr = await seedTerritory({ slug: 'lt_regent_clear', regent_id: regentCharId });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', playerUser([regentCharId]))
      .send({ lieutenant_id: null });
    expect(res.status).toBe(200);
    expect(res.body.lieutenant_id).toBeNull();
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/lieutenant — validation', () => {
  it('rejects self-appointment (regent appointing themselves as lieutenant)', async () => {
    const regentCharId = String(new ObjectId());
    const terr = await seedTerritory({ slug: 'lt_self_appoint', regent_id: regentCharId });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: regentCharId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/cannot appoint themselves/i);
  });

  it('rejects non-existent character ID', async () => {
    const terr = await seedTerritory({ slug: 'lt_nonexistent_char' });
    const nonExistentId = String(new ObjectId());
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: nonExistentId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects retired character', async () => {
    const terr = await seedTerritory({ slug: 'lt_retired_char' });
    const retired = await seedCharacter({ retired: true });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: retired._idStr });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/retired/i);
  });

  it('rejects non-string non-null lieutenant_id', async () => {
    const terr = await seedTerritory({ slug: 'lt_bad_type' });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── Territory lookup errors ───────────────────────────────────────────────────

describe('PATCH /api/territories/:id/lieutenant — territory lookup', () => {
  it('returns 404 for a valid ObjectId that does not exist', async () => {
    const ghostId = String(new ObjectId());
    const res = await request(app)
      .patch(`/api/territories/${ghostId}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: null });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for a malformed territory ID (slug-style string)', async () => {
    const res = await request(app)
      .patch('/api/territories/not-an-objectid/lieutenant')
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when lieutenant_id is a string but not a valid ObjectId', async () => {
    const terr = await seedTerritory({ slug: 'lt_bad_char_id' });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: 'not-a-valid-objectid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── Scope isolation ───────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/lieutenant — scope isolation', () => {
  it('only lieutenant_id and updated_at are modified; other fields untouched', async () => {
    const char = await seedCharacter();
    const terr = await seedTerritory({
      slug: 'lt_scope_check',
      regent_id: 'scope-regent-id',
    });
    // pre-set feeding_rights so we can verify they survive the write
    await getCollection('territories').updateOne(
      { _id: terr._id },
      { $set: { feeding_rights: ['ally-1', 'ally-2'], ambience: 'Curated' } }
    );

    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', stUser())
      .send({ lieutenant_id: char._idStr });

    expect(res.status).toBe(200);
    expect(res.body.lieutenant_id).toBe(char._idStr);
    expect(res.body.regent_id).toBe('scope-regent-id');
    expect(res.body.feeding_rights).toEqual(['ally-1', 'ally-2']);
    expect(res.body.ambience).toBe('Curated');
  });
});

// ── Auth errors ───────────────────────────────────────────────────────────────

describe('PATCH /api/territories/:id/lieutenant — auth', () => {
  it('non-regent player receives 403', async () => {
    const terr = await seedTerritory({ slug: 'lt_non_regent', regent_id: 'some-other-char' });
    const char = await seedCharacter();
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .set('X-Test-User', playerUser(['unrelated-char-id']))
      .send({ lieutenant_id: char._idStr });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('unauthenticated request receives 401', async () => {
    const terr = await seedTerritory({ slug: 'lt_unauth' });
    const res = await request(app)
      .patch(`/api/territories/${terr._idStr}/lieutenant`)
      .send({ lieutenant_id: null });
    expect(res.status).toBe(401);
  });
});
