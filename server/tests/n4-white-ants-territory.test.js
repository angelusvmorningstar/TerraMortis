/**
 * N-4 (issue #696, MNEC White Ants Territory linkage).
 *
 * Three+ acceptance gates from the dispatch:
 *   1. `territories.length === rating` enforced on save — PUT /api/characters/:id
 *      rejects White Ants merits where the array's length doesn't match the
 *      effective rating (cp + xp + sum(free_grants.*) + sum(legacy free_<slug>)).
 *   2. Duplicate Territory selections within the same merit rejected on save.
 *   3. `getNecropolisInfectedTerritories(allChars)` union math — Alice's picks
 *      ∪ Bob's picks (both Sepulcher owners), with deduplication. Non-owners
 *      (Carl, no Sepulcher) contribute zero even with `territories[]` populated.
 *   4. Partial-save tolerance — a PATCH-style body that omits `merits` skips
 *      the validator entirely (no false-positive on touchstone-only saves).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { getNecropolisInfectedTerritories } from '../../public/js/data/rules-helpers.js';

let app;
const TEST_FLAG = { _test_n4: true };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('characters').deleteMany(TEST_FLAG);
});

afterAll(async () => {
  await getCollection('characters').deleteMany(TEST_FLAG);
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure-function: getNecropolisInfectedTerritories union math
// ─────────────────────────────────────────────────────────────────────────────

describe('N-4 — getNecropolisInfectedTerritories', () => {
  const mkChar = (name, sepulcher, waDots, waTerritories) => ({
    name,
    merits: [
      ...(sepulcher > 0 ? [{ name: 'Necropolis Sepulcher', cp: sepulcher, xp: 0 }] : []),
      ...(waDots > 0 ? [{ name: 'White Ants', cp: waDots, xp: 0, territories: waTerritories }] : []),
    ],
  });

  it('returns deduplicated union across all Sepulcher owners', () => {
    const chars = [
      mkChar('Alice', 3, 2, ['terr-a', 'terr-b']),
      mkChar('Bob',   2, 3, ['terr-b', 'terr-c', 'terr-d']),
    ];
    expect(getNecropolisInfectedTerritories(chars)).toEqual(['terr-a', 'terr-b', 'terr-c', 'terr-d']);
  });

  it('non-owners (no Sepulcher) contribute zero even with territories[] populated', () => {
    // Carl has White Ants 5 with picks but no Sepulcher → not a member, ignored.
    const chars = [
      mkChar('Alice', 1, 1, ['terr-a']),
      mkChar('Carl',  0, 5, ['terr-x', 'terr-y', 'terr-z', 'terr-w', 'terr-v']),
    ];
    expect(getNecropolisInfectedTerritories(chars)).toEqual(['terr-a']);
  });

  it('insertion order preserved within the dedup', () => {
    const chars = [
      mkChar('Alice', 1, 3, ['terr-c', 'terr-a', 'terr-b']),
      mkChar('Bob',   1, 2, ['terr-a', 'terr-d']),
    ];
    expect(getNecropolisInfectedTerritories(chars)).toEqual(['terr-c', 'terr-a', 'terr-b', 'terr-d']);
  });

  it('handles missing/empty chars + missing territories gracefully', () => {
    expect(getNecropolisInfectedTerritories(null)).toEqual([]);
    expect(getNecropolisInfectedTerritories([])).toEqual([]);
    expect(getNecropolisInfectedTerritories([{ name: 'X' }])).toEqual([]);
    expect(getNecropolisInfectedTerritories([{ name: 'X', merits: null }])).toEqual([]);
    // Sepulcher owner with White Ants but no territories[] field.
    expect(getNecropolisInfectedTerritories([{
      name: 'X', merits: [
        { name: 'Necropolis Sepulcher', cp: 1 },
        { name: 'White Ants', cp: 2 },
      ],
    }])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server middleware: length === rating, no duplicates, partial-body tolerance
// ─────────────────────────────────────────────────────────────────────────────

describe('N-4 — PUT /api/characters/:id White Ants validation', () => {
  let charId;

  beforeAll(async () => {
    const ins = await getCollection('characters').insertOne({
      ...TEST_FLAG,
      name: 'N4_Validator_Char',
      merits: [
        { name: 'Necropolis Sepulcher', category: 'general', cp: 2, xp: 0 },
      ],
    });
    charId = ins.insertedId;
  });

  it('accepts a White Ants save where territories.length === rating', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'Necropolis Sepulcher', category: 'general', cp: 2, xp: 0 },
          { name: 'White Ants', category: 'general', cp: 2, xp: 0, territories: ['ter-a', 'ter-b'] },
        ],
      });
    expect(res.status).toBe(200);
  });

  it('rejects when territories.length < rating', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'Necropolis Sepulcher', category: 'general', cp: 2, xp: 0 },
          { name: 'White Ants', category: 'general', cp: 3, xp: 0, territories: ['ter-a', 'ter-b'] }, // rating 3, 2 picks
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('White Ants territories length');
    expect(res.body.detail).toMatchObject({ rating: 3, territories_length: 2 });
  });

  it('rejects when territories.length > rating', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'White Ants', category: 'general', cp: 1, xp: 0, territories: ['ter-a', 'ter-b'] }, // rating 1, 2 picks
        ],
      });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate territory slugs within the same merit', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'White Ants', category: 'general', cp: 3, xp: 0, territories: ['ter-a', 'ter-b', 'ter-a'] },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('distinct');
    expect(res.body.detail).toMatchObject({ duplicate: 'ter-a' });
  });

  it('includes free_grants in the rating calc (N-1 union)', async () => {
    // Sepulcher 2 (cp) + free_grants.necro 1 → effective rating 3; needs 3 picks.
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'White Ants', category: 'general', cp: 2, xp: 0, free_grants: { necro: 1 }, territories: ['ter-a', 'ter-b', 'ter-c'] },
        ],
      });
    expect(res.status).toBe(200);
  });

  it('partial body that omits merits skips the validator (touchstone-style PATCH)', async () => {
    // Even with a broken White Ants persisted, a body that doesn't carry the
    // merits array shouldn't trigger validation — only the fields you send
    // are checked.
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({ humanity: 6 });
    expect(res.status).toBe(200);
  });

  it('rating-zero White Ants accepts an empty territories[] (degenerate-but-legal)', async () => {
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        merits: [
          { name: 'White Ants', category: 'general', cp: 0, xp: 0, territories: [] },
        ],
      });
    expect(res.status).toBe(200);
  });
});
