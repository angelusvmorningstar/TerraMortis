/**
 * EQC-1 (issue #1152, epic #1038) — bucket taxonomy migration script.
 *
 * Pure-function tests for planBucketMigration (no DB) plus an integration
 * test driving migrate() against tm_suite_test, mirroring the pattern
 * backfill-free-grants.js's own test suite would use (dry-run default,
 * idempotent, per-mapping summary).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import 'dotenv/config';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { BUCKET_MAP, planBucketMigration, migrate } from '../scripts/migrate-eqc1-bucket-taxonomy.mjs';

describe('planBucketMigration (pure)', () => {
  it('maps weapon -> combat_gear', () => {
    const r = planBucketMigration({ bucket: 'weapon' });
    expect(r).toEqual({ touched: true, fromBucket: 'weapon', toBucket: 'combat_gear', reason: null });
  });

  it('maps armour -> combat_gear', () => {
    const r = planBucketMigration({ bucket: 'armour' });
    expect(r.touched).toBe(true);
    expect(r.toBucket).toBe('combat_gear');
  });

  it('maps equipment -> skill_gear', () => {
    const r = planBucketMigration({ bucket: 'equipment' });
    expect(r.touched).toBe(true);
    expect(r.toBucket).toBe('skill_gear');
  });

  it('maps asset -> container', () => {
    const r = planBucketMigration({ bucket: 'asset' });
    expect(r.touched).toBe(true);
    expect(r.toBucket).toBe('container');
  });

  it('leaves an already-migrated document untouched (idempotency)', () => {
    for (const bucket of ['combat_gear', 'skill_gear', 'tool_utility', 'narrative', 'container']) {
      const r = planBucketMigration({ bucket });
      expect(r.touched).toBe(false);
      expect(r.toBucket).toBe(bucket);
    }
  });

  it('flags an unrecognised bucket value rather than guessing', () => {
    const r = planBucketMigration({ bucket: 'wandwood' });
    expect(r.touched).toBe(false);
    expect(r.toBucket).toBeUndefined();
    expect(r.reason).toMatch(/unrecognised/);
  });

  it('handles a malformed/missing document without throwing', () => {
    expect(planBucketMigration(null).touched).toBe(false);
    expect(planBucketMigration(undefined).touched).toBe(false);
    expect(planBucketMigration({}).touched).toBe(false);
  });

  it('BUCKET_MAP covers exactly the four old bucket values, nothing else', () => {
    expect(Object.keys(BUCKET_MAP).sort()).toEqual(['armour', 'asset', 'equipment', 'weapon']);
  });
});

describe('migrate() — integration against tm_suite_test', () => {
  const seededIds = [];

  beforeAll(async () => { await setupDb(); });
  afterAll(async () => {
    if (seededIds.length) await getCollection('equipment_catalogue').deleteMany({ _id: { $in: seededIds } });
    await teardownDb();
  });
  afterEach(async () => {
    if (seededIds.length) {
      await getCollection('equipment_catalogue').deleteMany({ _id: { $in: seededIds } });
      seededIds.length = 0;
    }
  });

  async function seed(bucket, name) {
    const now = new Date().toISOString();
    const result = await getCollection('equipment_catalogue').insertOne({
      bucket, name, description: 'fixture', availability: 1, tags: [],
      damage_mod: null, damage_type: null, weapon_type: null,
      armour_value: null, defence_penalty: null, skill_domain: null, bonus_dice: null,
      mechanical_effect: null, created_at: now, updated_at: now,
    });
    seededIds.push(result.insertedId);
    return result.insertedId;
  }

  it('dry run makes no writes', async () => {
    const id = await seed('weapon', 'Dry Run Knife');
    const totals = await migrate({ dryRun: true, log: false });
    expect(totals.touched).toBeGreaterThanOrEqual(1);
    const doc = await getCollection('equipment_catalogue').findOne({ _id: id });
    expect(doc.bucket).toBe('weapon');
  });

  it('apply migrates every old-taxonomy document and is idempotent on re-run', async () => {
    const wId = await seed('weapon', 'Apply Knife');
    const aId = await seed('armour', 'Apply Vest');
    const eId = await seed('equipment', 'Apply Lockpick');
    const asId = await seed('asset', 'Apply Haven');

    const first = await migrate({ dryRun: false, log: false });
    expect(first.touched).toBeGreaterThanOrEqual(4);

    const col = getCollection('equipment_catalogue');
    expect((await col.findOne({ _id: wId })).bucket).toBe('combat_gear');
    expect((await col.findOne({ _id: aId })).bucket).toBe('combat_gear');
    expect((await col.findOne({ _id: eId })).bucket).toBe('skill_gear');
    expect((await col.findOne({ _id: asId })).bucket).toBe('container');

    // Idempotency: re-run touches nothing further among these four.
    const second = await migrate({ dryRun: false, log: false });
    const stillOld = await col.find({ _id: { $in: [wId, aId, eId, asId] }, bucket: { $nin: ['combat_gear', 'skill_gear', 'container'] } }).toArray();
    expect(stillOld.length).toBe(0);
    expect(second.touched).toBe(0);
  });

  it('an unrecognised bucket value is reported, not silently dropped or guessed', async () => {
    const id = await seed('wandwood', 'Mystery Item');
    const totals = await migrate({ dryRun: true, log: false });
    const hit = totals.unrecognised.find(u => u.id === String(id));
    expect(hit).toBeDefined();
    expect(hit.bucket).toBe('wandwood');
  });
});
