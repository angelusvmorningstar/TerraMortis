/**
 * API tests — GET /api/rules/aggregate (issue #256 perf coalescing).
 *
 * The aggregated endpoint coalesces the 7 per-category rule-engine
 * endpoints into a single round-trip used by the client's
 * `preloadRules()` on boot. Cuts wire overhead from 7 TLS+auth
 * handshakes to 1.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const insertedIds = { rule_grant: [], rule_nine_again: [], rule_skill_bonus: [] };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  for (const [coll, ids] of Object.entries(insertedIds)) {
    if (!ids.length) continue;
    await getCollection(coll).deleteMany({ _id: { $in: ids } });
    insertedIds[coll] = [];
  }
});

afterAll(async () => {
  await teardownDb();
});

async function insertRuleDoc(collection, doc) {
  const result = await getCollection(collection).insertOne(doc);
  insertedIds[collection].push(result.insertedId);
  return result.insertedId;
}

describe('GET /api/rules/aggregate', () => {
  it('returns 400 when categories query param is missing', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when categories is empty after trim', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate?categories=')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an unknown category', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate?categories=grant,not_a_real_category')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.allowed).toContain('grant');
  });

  it('returns one rule_<category> field per requested category', async () => {
    const grantId = await insertRuleDoc('rule_grant', {
      source: 'Test Source', grant_type: 'merit', target: 'Allies', amount: 1,
    });
    const nineId = await insertRuleDoc('rule_nine_again', {
      source: 'Test Source 9A', target_skills: 'asset_skills',
    });
    const res = await request(app)
      .get('/api/rules/aggregate?categories=grant,nine_again')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rule_grant)).toBe(true);
    expect(Array.isArray(res.body.rule_nine_again)).toBe(true);
    const grantDoc = res.body.rule_grant.find(d => String(d._id) === String(grantId));
    expect(grantDoc).toBeTruthy();
    expect(grantDoc.source).toBe('Test Source');
    const nineDoc = res.body.rule_nine_again.find(d => String(d._id) === String(nineId));
    expect(nineDoc).toBeTruthy();
  });

  it('deduplicates repeated categories in the query', async () => {
    await insertRuleDoc('rule_skill_bonus', { source: 'Dedup Test', target_skill: 'dot4_skill', amount: 1 });
    const res = await request(app)
      .get('/api/rules/aggregate?categories=skill_bonus,skill_bonus,skill_bonus')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['rule_skill_bonus']);
  });

  it('supports all 7 production rule categories at once', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate?categories=grant,nine_again,skill_bonus,speciality_grant,tier_budget,disc_attr,derived_stat_modifier')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(expect.arrayContaining([
      'rule_grant', 'rule_nine_again', 'rule_skill_bonus',
      'rule_speciality_grant', 'rule_tier_budget',
      'rule_disc_attr', 'rule_derived_stat_modifier',
    ]));
  });

  it('player role gets 403 (matches ST-only auth on individual rules-engine endpoints)', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate?categories=grant')
      .set('X-Test-User', playerUser([new ObjectId().toHexString()]));
    expect(res.status).toBe(403);
  });

  it('returns 401 when no auth header is supplied', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate?categories=grant');
    expect(res.status).toBe(401);
  });

  it('returns empty arrays for categories with no docs', async () => {
    const res = await request(app)
      .get('/api/rules/aggregate?categories=tier_budget')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rule_tier_budget)).toBe(true);
  });
});
