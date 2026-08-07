/**
 * OATH-A (issue #1111, ADR-010 D8) — schema and route reachability.
 *
 * The story's obligation is explicit: **verify by round-trip through the
 * API, not by writing to the collection.** A schema change verified only by
 * a unit test does not prove an ST can create or edit the row — and that is
 * exactly how the five live oath rows came to exist while failing their own
 * validator: they were written straight to Atlas, bypassing both the schema
 * and the PUT allowlist.
 *
 * So every assertion here goes through `POST /api/rules` and
 * `PUT /api/rules/:key`, and the character path goes through the character
 * route's validator.
 *
 * NOTE: this suite is DB-backed and skips wholesale when MongoDB is
 * unreachable. It runs against `tm_suite_test` (setup-env.js hard-overrides
 * MONGODB_DB and db.js refuses any non-`_test` name under vitest), so it
 * needs no production write — unlike AC8, which does and is held pending.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

const KEY = 'oath-a-roundtrip-probe';

const OATH_ROW = {
  key: KEY,
  name: 'Oath Of The Round Trip',
  category: 'merit',
  parent: 'Invictus Oath',
  rating_range: null,
  // The three fields ADR-010 D8 requires. Before this story every one of
  // them was rejected by `additionalProperties: false`.
  cost_model: 'swear_by',
  rating_basis: { type: 'blood_potency_multiple', factor: 2 },
  // OATH-B (#1111) typed `forfeiture` as a discriminator with exactly one
  // declared variant. `{ type: 'default' }` was a placeholder in OATH-A that
  // never named a real variant, so it is now correctly rejected — updated to
  // the actual schedule rather than loosening the schema to accept it.
  forfeiture: { type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1 },
};

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('purchasable_powers').deleteMany({ key: KEY });
});

afterAll(async () => {
  await getCollection('purchasable_powers').deleteMany({ key: KEY });
  await teardownDb();
});

describe('OATH-A D8 — POST /api/rules accepts the oath field family', () => {
  it('creates a swear_by oath carrying cost_model, rating_basis and forfeiture', async () => {
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser()).send(OATH_ROW);
    expect(res.status).toBe(201);
    expect(res.body.cost_model).toBe('swear_by');
    expect(res.body.rating_basis).toEqual({ type: 'blood_potency_multiple', factor: 2 });
    expect(res.body.forfeiture).toEqual({ type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1 });
  });

  it('accepts cost_model "free" — the OTHER five live rows use it', async () => {
    // Declaring the enum as ['swear_by'] alone would have made five live
    // rows newly invalid while fixing five.
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser())
      .send({ ...OATH_ROW, key: KEY + '-free', cost_model: 'free', rating_basis: null });
    expect(res.status).toBe(201);
    expect(res.body.cost_model).toBe('free');
    await getCollection('purchasable_powers').deleteMany({ key: KEY + '-free' });
  });

  it('accepts the highest_status rating_basis variant', async () => {
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser()).send({
      ...OATH_ROW, key: KEY + '-status',
      rating_basis: { type: 'highest_status', pools: ['covenant', 'clan'] },
    });
    expect(res.status).toBe(201);
    expect(res.body.rating_basis.pools).toEqual(['covenant', 'clan']);
    await getCollection('purchasable_powers').deleteMany({ key: KEY + '-status' });
  });

  it('REJECTS an unknown cost_model rather than accepting anything', async () => {
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser())
      .send({ ...OATH_ROW, key: KEY + '-bad', cost_model: 'barter' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('REJECTS a rating_basis whose neighbouring fields belong to the other variant', async () => {
    // Discriminator-typed means each variant carries its OWN fields and does
    // not overload another variant's (ADR-005 D3/D5).
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser())
      .send({ ...OATH_ROW, key: KEY + '-mixed', rating_basis: { type: 'blood_potency_multiple', pools: ['clan'] } });
    expect(res.status).toBe(400);
  });
});

describe('OATH-A D8 — PUT /api/rules/:key lets an ST edit the oath fields', () => {
  it('updates cost_model, rating_basis and forfeiture through the allowlist', async () => {
    // Without UPDATABLE_FIELDS entries these are silently filtered out and
    // the reference data becomes code-deploy-only, contradicting the
    // MongoDB-backed convention.
    const res = await request(app).put('/api/rules/' + KEY).set('X-Test-User', stUser()).send({
      cost_model: 'free',
      rating_basis: { type: 'highest_status', pools: ['clan'] },
      forfeiture: { type: 'chapter_span_then_monthly', chapters: 3, restore_per_month: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.body.cost_model).toBe('free');
    expect(res.body.rating_basis).toEqual({ type: 'highest_status', pools: ['clan'] });
    expect(res.body.forfeiture).toEqual({ type: 'chapter_span_then_monthly', chapters: 3, restore_per_month: 2 });
  });

  it('the edit is actually persisted, not just echoed', async () => {
    const doc = await getCollection('purchasable_powers').findOne({ key: KEY });
    expect(doc.cost_model).toBe('free');
    expect(doc.rating_basis).toEqual({ type: 'highest_status', pools: ['clan'] });
  });
});

describe('OATH-A D8 — the character schema accepts sworn_by', () => {
  const CHAR = {
    name: 'OATH-A Round Trip Probe',
    covenant: 'Invictus',
    merits: [
      { category: 'general', name: 'Resources', cp: 3 },
      {
        category: 'general', name: 'Oath Of The Round Trip', cp: 0,
        sworn_by: {
          dots_required: 3,
          attachments: [{ name: 'Resources', qualifier: null, dots: 3 }],
          sworn_at: { chapter_number: 4, iso: '2026-08-07' },
          history: [],
        },
      },
    ],
  };
  let id;

  afterAll(async () => {
    if (id) await getCollection('characters').deleteOne({ _id: id });
  });

  it('saves a character whose oath carries a pledge', async () => {
    // characterSchema is additionalProperties:false, so without the
    // declaration this POST fails and a player simply cannot swear an oath.
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send(CHAR);
    expect(res.status).toBe(201);
    id = res.body._id;
    const saved = res.body.merits.find(m => m.sworn_by);
    expect(saved.sworn_by.dots_required).toBe(3);
    expect(saved.sworn_by.attachments).toEqual([{ name: 'Resources', qualifier: null, dots: 3 }]);
    expect(saved.sworn_by.sworn_at.chapter_number).toBe(4);
  });

  it('REJECTS an attachment referencing a merit by array index', async () => {
    // Index-based references are a defect even when they pass every test,
    // so the schema refuses the shape outright.
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      ...CHAR,
      name: 'OATH-A Bad Ref Probe',
      merits: [{
        category: 'general', name: 'Oath Of The Round Trip', cp: 0,
        sworn_by: { dots_required: 1, attachments: [{ index: 0, dots: 1 }] },
      }],
    });
    expect(res.status).toBe(400);
  });

  it('REJECTS a zero-dot attachment', async () => {
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      ...CHAR,
      name: 'OATH-A Zero Dot Probe',
      merits: [{
        category: 'general', name: 'Oath Of The Round Trip', cp: 0,
        sworn_by: { dots_required: 0, attachments: [{ name: 'Resources', dots: 0 }] },
      }],
    });
    expect(res.status).toBe(400);
  });
});
