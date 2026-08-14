/**
 * API tests — touchstones (NPCR.4, free-text only per DBO-8, 2026-08-14)
 *
 * Model:
 * - character.touchstones[] is authoritative (cap 6, humanity descends from anchor)
 * - anchor = 7 if clan='Ventrue', else 6
 * - every entry is {humanity, name, desc?} - no relationships link
 *
 * DBO-8 retired the earlier design where a touchstones[] entry could
 * optionally carry `edge_id`, linking it to a `relationships` document
 * (kind='touchstone', touchstone_meta.humanity). Issue #162 removed the
 * only code path that ever created a linked touchstone, and a live-data
 * query (2026-08-14) confirmed zero of 44 live touchstones used it - so the
 * link, the `relationships` shape, and the server-side enrichment it drove
 * were all removed rather than kept as dead surface. This file's own
 * previous version (git history) exercised that mechanism; these tests
 * exercise its absence.
 *
 * Covers:
 * - characters PUT validates touchstones[]: cap, humanity-in-anchor-range
 * - `edge_id` is rejected as an unknown property (additionalProperties: false)
 * - `relationships` POST/PUT reject kind='touchstone' as an invalid enum value
 * - `touchstone_meta` is rejected as an unknown property on `relationships`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_CHAR_IDS = [];

const OTHER_PC_ID = new ObjectId().toHexString();
const NPC_ID = new ObjectId().toHexString();

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'Quinn Touchstone Test',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    touchstones: [],
    ...overrides,
  };
  const result = await col.insertOne(doc);
  CREATED_CHAR_IDS.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const chars = getCollection('characters');
  for (const id of CREATED_CHAR_IDS) await chars.deleteOne({ _id: id });
  await teardownDb();
});

// ── Characters route: touchstones[] validation ──────────────────────────────

describe('PUT /api/characters/:id touchstones[] validation', () => {
  it('accepts an empty touchstones[]', async () => {
    const char = await seedChar();
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [] });

    expect(res.status).toBe(200);
    expect(res.body.touchstones).toEqual([]);
  });

  it('accepts up to 6 touchstones (cap)', async () => {
    const char = await seedChar({ clan: 'Ventrue' }); // anchor 7 → ratings 7..2
    const six = [
      { humanity: 7, name: 'T1' },
      { humanity: 6, name: 'T2' },
      { humanity: 5, name: 'T3' },
      { humanity: 4, name: 'T4' },
      { humanity: 3, name: 'T5' },
      { humanity: 2, name: 'T6' },
    ];
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: six });
    expect(res.status).toBe(200);
    expect(res.body.touchstones).toHaveLength(6);
  });

  it('rejects more than 6 touchstones', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const seven = Array.from({ length: 7 }, (_, i) => ({ humanity: 7 - i, name: `T${i + 1}` }));
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: seven });
    // Fails at the Ajv layer (maxItems) before the custom validator.
    expect(res.status).toBe(400);
  });

  it('rejects humanity above the clan anchor (non-Ventrue anchor=6)', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 7, name: 'Too high' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/out of range/i);
  });

  it('accepts humanity 7 when clan is Ventrue (anchor=7)', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 7, name: 'Ventrue anchor' }] });
    expect(res.status).toBe(200);
  });

  it('rejects humanity below the 6-slot range (anchor-5)', async () => {
    const char = await seedChar({ clan: 'Daeva' }); // anchor 6, min 1
    // anchor=6, anchor-5=1, so humanity=0 is out of range
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 0, name: 'Too low' }] });
    expect(res.status).toBe(400);
  });

  it('accepts a plain object touchstone with name + desc', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 6, name: "Grandfather's watch", desc: 'An heirloom' }] });
    expect(res.status).toBe(200);
    expect(res.body.touchstones[0]).toEqual({ humanity: 6, name: "Grandfather's watch", desc: 'An heirloom' });
  });

  it('DBO-8: rejects a touchstones[] entry carrying edge_id (retired, additionalProperties: false)', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({
        touchstones: [{ humanity: 6, name: 'Edge-linked', edge_id: new ObjectId().toHexString() }],
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/characters/:id touchstones', () => {
  it('DBO-8: returns touchstones as stored, with no server-side enrichment', async () => {
    const char = await seedChar({
      clan: 'Daeva',
      touchstones: [{ humanity: 6, name: "Grandfather's watch", desc: 'Object touchstone' }],
    });

    const res = await request(app)
      .get(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.touchstones[0]).toEqual({ humanity: 6, name: "Grandfather's watch", desc: 'Object touchstone' });
    expect(res.body.touchstones[0]).not.toHaveProperty('_npc_name');
  });
});

// ── Relationships route: 'touchstone' is no longer a valid kind ────────────

describe("DBO-8: POST /api/relationships rejects kind='touchstone'", () => {
  it('400s on kind=touchstone (not a KIND_ENUM value any more)', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send({
        a: { type: 'pc', id: OTHER_PC_ID },
        b: { type: 'npc', id: NPC_ID },
        kind: 'touchstone',
        direction: 'a_to_b',
        state: 'Priscilla, the sister he failed to save',
        st_hidden: false,
      });

    expect(res.status).toBe(400);
  });

  it('400s on touchstone_meta as an unknown property, even with a valid kind', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send({
        a: { type: 'pc', id: OTHER_PC_ID },
        b: { type: 'npc', id: NPC_ID },
        kind: 'ally',
        direction: 'a_to_b',
        touchstone_meta: { humanity: 6 },
      });

    expect(res.status).toBe(400);
  });
});
