/**
 * API tests — PATCH /api/characters/:id/safe_place_locations (#506).
 *
 * The player-facing downtime form persists per-Safe-Place street+suburb onto the
 * character so locations carry across downtime cycles. PUT /:id is ST-only, so
 * this narrow endpoint is the sole player write path. It must:
 *   - allow the owning player (and ST) to write; 403 for non-owners
 *   - touch ONLY the `location` field on `Safe Place` domain merits, positionally
 *   - leave every other merit and field untouched
 *   - validate the body shape
 *
 * Mutation tests seed characters directly to DB (same pattern as the CRUD suite).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededIds = [];

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'SPL Test Char',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

/** A character with 2 Safe Places + a Haven + an unrelated merit. */
function meritsFixture() {
  return [
    { category: 'domain', name: 'Safe Place', qualifier: 'Harbour Warehouse', rating: 3 },
    { category: 'general', name: 'Striking Looks', rating: 2 },
    { category: 'domain', name: 'Safe Place', qualifier: 'Northshore Flat', rating: 2 },
    { category: 'domain', name: 'Haven', attached_to: 'Safe Place (Harbour Warehouse)', rating: 3 },
  ];
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const col = getCollection('characters');
  for (const id of seededIds) await col.deleteOne({ _id: id });
  await teardownDb();
});

describe('PATCH /api/characters/:id/safe_place_locations — player-scoped persist (#506)', () => {
  it('owning player persists locations positionally to the right Safe Place merits', async () => {
    const char = await seedChar({ name: 'SPL Owner Write', merits: meritsFixture() });
    const idStr = char._id.toString();

    const res = await request(app)
      .patch(`/api/characters/${idStr}/safe_place_locations`)
      .set('X-Test-User', playerUser([idStr]))
      .send({ locations: ['12 Dock St, Harbourside', 'Flat 4, Northshore'] });
    expect(res.status).toBe(200);

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const safePlaces = stored.merits.filter(m => m.category === 'domain' && m.name === 'Safe Place');
    expect(safePlaces[0].location).toBe('12 Dock St, Harbourside');
    expect(safePlaces[1].location).toBe('Flat 4, Northshore');
  });

  it('leaves non-Safe-Place merits and other fields untouched', async () => {
    const char = await seedChar({ name: 'SPL Untouched', clan: 'Mekhet', merits: meritsFixture() });
    const idStr = char._id.toString();

    await request(app)
      .patch(`/api/characters/${idStr}/safe_place_locations`)
      .set('X-Test-User', playerUser([idStr]))
      .send({ locations: ['A', 'B'] });

    const stored = await getCollection('characters').findOne({ _id: char._id });
    // unrelated merit unchanged, no stray location added
    const striking = stored.merits.find(m => m.name === 'Striking Looks');
    expect(striking).toEqual({ category: 'general', name: 'Striking Looks', rating: 2 });
    // haven untouched (no location key)
    const haven = stored.merits.find(m => m.name === 'Haven');
    expect('location' in haven).toBe(false);
    // other top-level field intact
    expect(stored.clan).toBe('Mekhet');
  });

  it('a shorter array leaves trailing safe places unchanged', async () => {
    const char = await seedChar({ name: 'SPL Partial', merits: meritsFixture() });
    const idStr = char._id.toString();

    await request(app)
      .patch(`/api/characters/${idStr}/safe_place_locations`)
      .set('X-Test-User', playerUser([idStr]))
      .send({ locations: ['only first'] });

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const safePlaces = stored.merits.filter(m => m.category === 'domain' && m.name === 'Safe Place');
    expect(safePlaces[0].location).toBe('only first');
    expect('location' in safePlaces[1]).toBe(false);
  });

  it('writing the same values is idempotent (AC#3 — unchanged)', async () => {
    const merits = meritsFixture();
    merits[0].location = 'Stable Addr';
    const char = await seedChar({ name: 'SPL Idempotent', merits });
    const idStr = char._id.toString();

    await request(app)
      .patch(`/api/characters/${idStr}/safe_place_locations`)
      .set('X-Test-User', playerUser([idStr]))
      .send({ locations: ['Stable Addr', ''] });

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const safePlaces = stored.merits.filter(m => m.category === 'domain' && m.name === 'Safe Place');
    expect(safePlaces[0].location).toBe('Stable Addr');
  });

  it('ST can write any character', async () => {
    const char = await seedChar({ name: 'SPL ST Write', merits: meritsFixture() });
    const idStr = char._id.toString();

    const res = await request(app)
      .patch(`/api/characters/${idStr}/safe_place_locations`)
      .set('X-Test-User', stUser())
      .send({ locations: ['ST set'] });
    expect(res.status).toBe(200);

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const sp = stored.merits.find(m => m.category === 'domain' && m.name === 'Safe Place');
    expect(sp.location).toBe('ST set');
  });

  it('403 when a player writes a character they do not own', async () => {
    const owner = await seedChar({ name: 'SPL Owner' });
    const target = await seedChar({ name: 'SPL Other', merits: meritsFixture() });

    const res = await request(app)
      .patch(`/api/characters/${target._id.toString()}/safe_place_locations`)
      .set('X-Test-User', playerUser([owner._id.toString()]))
      .send({ locations: ['hax'] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('400 when locations is not an array', async () => {
    const char = await seedChar({ name: 'SPL Bad Array', merits: meritsFixture() });
    const res = await request(app)
      .patch(`/api/characters/${char._id.toString()}/safe_place_locations`)
      .set('X-Test-User', playerUser([char._id.toString()]))
      .send({ locations: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('400 when an entry is not a string', async () => {
    const char = await seedChar({ name: 'SPL Bad Entry', merits: meritsFixture() });
    const res = await request(app)
      .patch(`/api/characters/${char._id.toString()}/safe_place_locations`)
      .set('X-Test-User', playerUser([char._id.toString()]))
      .send({ locations: ['ok', 42] });
    expect(res.status).toBe(400);
  });

  it('404 on unknown character', async () => {
    const res = await request(app)
      .patch(`/api/characters/${new ObjectId().toHexString()}/safe_place_locations`)
      .set('X-Test-User', stUser())
      .send({ locations: ['x'] });
    expect(res.status).toBe(404);
  });

  it('400 on malformed id', async () => {
    const res = await request(app)
      .patch('/api/characters/bad-id/safe_place_locations')
      .set('X-Test-User', stUser())
      .send({ locations: ['x'] });
    expect(res.status).toBe(400);
  });

  it('401 without auth', async () => {
    const char = await seedChar({ name: 'SPL No Auth' });
    const res = await request(app)
      .patch(`/api/characters/${char._id.toString()}/safe_place_locations`)
      .send({ locations: ['x'] });
    expect(res.status).toBe(401);
  });
});
