/**
 * API tests — /api/rules/<family> endpoints (rules engine, ST-only).
 *
 * Covers: valid create, extra-field rejection, player blocked, unauthenticated,
 * list empty collection, update non-existent 404, delete existing.
 * Plus cyclic-reference rejections on rule_grant and short-budgets on rule_tier_budget.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
const insertedIds = {};

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  insertedIds.grant              = [];
  insertedIds.speciality_grant   = [];
  insertedIds.skill_bonus        = [];
  insertedIds.nine_again         = [];
  insertedIds.disc_attr          = [];
  insertedIds.derived_stat_mod   = [];
  insertedIds.tier_budget        = [];
  insertedIds.status_floor       = [];
});

afterAll(async () => {
  const cleanup = [
    ['rule_grant',                insertedIds.grant],
    ['rule_speciality_grant',     insertedIds.speciality_grant],
    ['rule_skill_bonus',          insertedIds.skill_bonus],
    ['rule_nine_again',           insertedIds.nine_again],
    ['rule_disc_attr',            insertedIds.disc_attr],
    ['rule_derived_stat_modifier',insertedIds.derived_stat_mod],
    ['rule_tier_budget',          insertedIds.tier_budget],
    ['rule_status_floor',         insertedIds.status_floor],
  ];
  for (const [coll, ids] of cleanup) {
    if (ids.length) {
      await getCollection(coll).deleteMany({ _id: { $in: ids } }).catch(() => {});
    }
  }
  await teardownDb();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const BOGUS_ID = new ObjectId().toHexString();

function st()     { return stUser(); }
function player() { return playerUser(); }

// ── rule_grant ────────────────────────────────────────────────────────────────

describe('rule_grant', () => {
  const BASE = '/api/rules/grant';

  it('unauthenticated returns 401', async () => {
    const r = await request(app).get(BASE);
    expect(r.status).toBe(401);
  });

  it('player blocked returns 403', async () => {
    const r = await request(app).get(BASE).set('X-Test-User', player());
    expect(r.status).toBe(403);
  });

  it('ST lists empty collection → 200 []', async () => {
    const r = await request(app).get(BASE).set('X-Test-User', st());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('ST creates valid rule_grant → 201 with _id', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'Professional Training', tier: 1,
        grant_type: 'merit', target: 'Contacts',
        amount: 2, amount_basis: 'flat',
      });
    expect(r.status).toBe(201);
    expect(r.body._id).toBeTruthy();
    expect(r.body.source).toBe('Professional Training');
    insertedIds.grant.push(new ObjectId(r.body._id));
  });

  it('extra field → 400 VALIDATION_ERROR', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'PT', grant_type: 'merit', target: 'Allies',
        amount: 1, amount_basis: 'flat', extra: 'oops',
      });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('VALIDATION_ERROR');
  });

  it('missing required field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'PT', grant_type: 'merit', target: 'Allies', amount: 1 });
    expect(r.status).toBe(400);
  });

  it('self-target (source === target) → 400 cyclic self-grant', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'Professional Training', grant_type: 'merit',
        target: 'Professional Training',
        amount: 1, amount_basis: 'flat',
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/cyclic/i);
  });

  it('cyclic read_refs + self-target → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'Professional Training', grant_type: 'merit',
        target: 'Professional Training',
        amount: 1, amount_basis: 'rating_of_source',
        read_refs: [{ kind: 'merit', name: 'Professional Training', predicate: '>=', value: 4 }],
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/cyclic/i);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({
        source: 'PT', grant_type: 'merit', target: 'Contacts',
        amount: 1, amount_basis: 'flat',
      });
    expect(r.status).toBe(404);
  });

  it('ST deletes existing → 204', async () => {
    const create = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'OHM', tier: 1, grant_type: 'merit', target: 'Contacts',
        amount: 1, amount_basis: 'flat',
      });
    expect(create.status).toBe(201);
    const del = await request(app)
      .delete(`${BASE}/${create.body._id}`)
      .set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_speciality_grant ─────────────────────────────────────────────────────

describe('rule_speciality_grant', () => {
  const BASE = '/api/rules/speciality_grant';

  it('player blocked → 403', async () => {
    const r = await request(app).get(BASE).set('X-Test-User', player());
    expect(r.status).toBe(403);
  });

  it('ST lists empty → 200 []', async () => {
    const r = await request(app).get(BASE).set('X-Test-User', st());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('ST creates valid doc → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Mystery Cult Initiation', tier: 1, target_skill: 'Occult', spec: 'Spirits' });
    expect(r.status).toBe(201);
    expect(r.body._id).toBeTruthy();
    insertedIds.speciality_grant.push(new ObjectId(r.body._id));
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'MCI', target_skill: 'Occult', spec: 'X', extra: true });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ source: 'MCI', target_skill: 'Occult', spec: 'Spirits' });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Bloodline', target_skill: 'Academics', spec: 'History' });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_skill_bonus ──────────────────────────────────────────────────────────

describe('rule_skill_bonus', () => {
  const BASE = '/api/rules/skill_bonus';

  it('player blocked → 403', async () => {
    expect((await request(app).get(BASE).set('X-Test-User', player())).status).toBe(403);
  });

  it('ST creates valid doc → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Professional Training', tier: 4, target_skill: 'Drive', amount: 1 });
    expect(r.status).toBe(201);
    insertedIds.skill_bonus.push(new ObjectId(r.body._id));
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'PT', tier: 4, target_skill: 'Drive', amount: 1, extra: true });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ source: 'PT', target_skill: 'Drive', amount: 1 });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE).set('X-Test-User', st())
      .send({ source: 'MCI', tier: 3, target_skill: 'Occult', amount: 1 });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_nine_again ───────────────────────────────────────────────────────────

describe('rule_nine_again', () => {
  const BASE = '/api/rules/nine_again';

  it('player blocked → 403', async () => {
    expect((await request(app).get(BASE).set('X-Test-User', player())).status).toBe(403);
  });

  it('ST creates valid doc with skills array → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Professional Training', tier: 2, target_skills: ['Drive', 'Firearms'] });
    expect(r.status).toBe(201);
    insertedIds.nine_again.push(new ObjectId(r.body._id));
  });

  it('ST creates valid doc with asset_skills sentinel → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Oath of the Hard Motherfucker', target_skills: 'asset_skills' });
    expect(r.status).toBe(201);
    insertedIds.nine_again.push(new ObjectId(r.body._id));
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'PT', target_skills: ['Drive'], extra: true });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ source: 'PT', target_skills: ['Drive'] });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE).set('X-Test-User', st())
      .send({ source: 'OHM', target_skills: ['Brawl'] });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_disc_attr ────────────────────────────────────────────────────────────

describe('rule_disc_attr', () => {
  const BASE = '/api/rules/disc_attr';

  it('player blocked → 403', async () => {
    expect((await request(app).get(BASE).set('X-Test-User', player())).status).toBe(403);
  });

  it('ST creates valid doc → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ discipline: 'Vigour', target_kind: 'attribute', target_name: 'Strength', amount_basis: 'rating' });
    expect(r.status).toBe(201);
    insertedIds.disc_attr.push(new ObjectId(r.body._id));
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ discipline: 'Vigour', target_kind: 'attribute', target_name: 'Strength', amount_basis: 'rating', extra: 1 });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ discipline: 'Vigour', target_kind: 'attribute', target_name: 'Strength', amount_basis: 'rating' });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE).set('X-Test-User', st())
      .send({ discipline: 'Resilience', target_kind: 'attribute', target_name: 'Stamina', amount_basis: 'rating' });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_derived_stat_modifier ────────────────────────────────────────────────

describe('rule_derived_stat_modifier', () => {
  const BASE = '/api/rules/derived_stat_modifier';

  it('player blocked → 403', async () => {
    expect((await request(app).get(BASE).set('X-Test-User', player())).status).toBe(403);
  });

  it('ST creates valid flat modifier → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Giant', target_stat: 'size', mode: 'flat', flat_amount: 1 });
    expect(r.status).toBe(201);
    insertedIds.derived_stat_mod.push(new ObjectId(r.body._id));
  });

  it('ST creates valid skill_swap modifier → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Defensive Combat', target_stat: 'defence', mode: 'skill_swap', swap_from: 'Athletics', swap_to: 'Brawl' });
    expect(r.status).toBe(201);
    insertedIds.derived_stat_mod.push(new ObjectId(r.body._id));
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Giant', target_stat: 'size', mode: 'flat', flat_amount: 1, extra: true });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ source: 'Giant', target_stat: 'size', mode: 'flat' });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE).set('X-Test-User', st())
      .send({ source: 'Fleet of Foot', target_stat: 'speed', mode: 'rating' });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_tier_budget ──────────────────────────────────────────────────────────

describe('rule_tier_budget', () => {
  const BASE = '/api/rules/tier_budget';

  it('player blocked → 403', async () => {
    expect((await request(app).get(BASE).set('X-Test-User', player())).status).toBe(403);
  });

  it('ST creates valid doc → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'Mystery Cult Initiation', budgets: [0, 1, 1, 2, 3, 3] });
    expect(r.status).toBe(201);
    expect(r.body.budgets).toEqual([0, 1, 1, 2, 3, 3]);
    insertedIds.tier_budget.push(new ObjectId(r.body._id));
  });

  it('budgets too short (length < 2) → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'MCI', budgets: [0] });
    expect(r.status).toBe(400);
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({ source: 'MCI', budgets: [0, 1, 1], extra: true });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ source: 'MCI', budgets: [0, 1] });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE).set('X-Test-User', st())
      .send({ source: 'PT', budgets: [0, 1, 1, 2, 3, 3] });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});

// ── rule_status_floor ─────────────────────────────────────────────────────────

describe('rule_status_floor', () => {
  const BASE = '/api/rules/status_floor';

  it('player blocked → 403', async () => {
    expect((await request(app).get(BASE).set('X-Test-User', player())).status).toBe(403);
  });

  it('ST creates valid doc → 201', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'Oath of the Safe Word',
        target_status_kind: 'covenant',
        target_status_name: 'Carthian Movement',
        floor_value: 1,
      });
    expect(r.status).toBe(201);
    insertedIds.status_floor.push(new ObjectId(r.body._id));
  });

  it('extra field → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'OTS', target_status_kind: 'covenant',
        target_status_name: 'Invictus', floor_value: 1, extra: true,
      });
    expect(r.status).toBe(400);
  });

  it('invalid target_status_kind enum → 400', async () => {
    const r = await request(app)
      .post(BASE)
      .set('X-Test-User', st())
      .send({
        source: 'OTS', target_status_kind: 'gang',
        target_status_name: 'Invictus', floor_value: 1,
      });
    expect(r.status).toBe(400);
  });

  it('update non-existent → 404', async () => {
    const r = await request(app)
      .put(`${BASE}/${BOGUS_ID}`)
      .set('X-Test-User', st())
      .send({ source: 'OTS', target_status_kind: 'covenant', target_status_name: 'Invictus', floor_value: 1 });
    expect(r.status).toBe(404);
  });

  it('delete existing → 204', async () => {
    const c = await request(app)
      .post(BASE).set('X-Test-User', st())
      .send({ source: 'Oath of the Scapegoat', target_status_kind: 'city', target_status_name: 'General', floor_value: 0 });
    const del = await request(app).delete(`${BASE}/${c.body._id}`).set('X-Test-User', st());
    expect(del.status).toBe(204);
  });
});
