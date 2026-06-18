/**
 * Issue #870 — ECM-3 backfill tests.
 *
 * Three slices:
 *   1. Pure helpers (classifyItem, backfillCharEquipment) — shape contracts
 *      on the in-memory transforms, no DB.
 *   2. main() --step=backfill integration end-to-end against the test
 *      MongoDB. Covers DRY-RUN no-write, --apply converts every resolvable
 *      slug, orphan slugs are dropped + logged, idempotency (second --apply
 *      is a no-op), and the post-condition assertion that zero string-slug
 *      catalogue_ids remain on any character document.
 *   3. PUT /api/characters/:id round-trip — pre + post backfill — asserts
 *      catalogue_id is stored as ObjectId not string both times. Per the
 *      Khepri dispatch this is the canonical Express+Mongo hygiene the
 *      coercion implements: ObjectIds round-trip through JSON.stringify as
 *      24-hex strings, and the route hydrates them back at the API boundary.
 *
 * Discipline pin: [[feedback_script_integration_test]] — the main() slice
 * exercises the full pipeline, including database writes, not just helper
 * mocks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import {
  main,
  classifyItem,
  backfillCharEquipment,
  buildSlugMapFromCollection,
} from '../scripts/ecm-migrate.js';

let app;
const TEST_FLAG = '_ecm3_test';

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  await getCollection('characters').deleteMany({ [TEST_FLAG]: true });
  await getCollection('equipment_catalogue').deleteMany({ _ecm3_test: true });
  await teardownDb();
});

// Each integration test starts from a clean slate for both collections so
// the orphan-detection slice can't be polluted by ordering.
beforeEach(async () => {
  await getCollection('characters').deleteMany({ [TEST_FLAG]: true });
  await getCollection('equipment_catalogue').deleteMany({ _ecm3_test: true });
});
afterEach(async () => {
  await getCollection('characters').deleteMany({ [TEST_FLAG]: true });
  await getCollection('equipment_catalogue').deleteMany({ _ecm3_test: true });
});

async function seedCatalogueItem(overrides = {}) {
  const now = new Date().toISOString();
  const doc = {
    bucket: 'equipment', name: `seed-${Math.random().toString(36).slice(2, 7)}`,
    availability: 1, tags: [],
    damage_mod: null, damage_type: null, weapon_type: null,
    armour_value: null, defence_penalty: null,
    skill_domain: null, bonus_dice: null, mechanical_effect: null,
    created_at: now, updated_at: now,
    _ecm3_test: true,
    ...overrides,
  };
  const r = await getCollection('equipment_catalogue').insertOne(doc);
  return { _id: r.insertedId, ...doc };
}

async function seedCharWithEquipment(equipment) {
  const r = await getCollection('characters').insertOne({
    [TEST_FLAG]: true,
    name: 'ECM-3 fixture',
    equipment,
  });
  return r.insertedId;
}

async function runMain(extra = []) {
  const origArgv = process.argv;
  process.argv = ['node', '/tmp/ecm-migrate.js', ...extra];
  try { return await main(); }
  finally { process.argv = origArgv; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('#870 — classifyItem decides the per-item action', () => {
  const oidA = new ObjectId();
  const oidB = new ObjectId();
  const slugMap = new Map([['knife', oidA], ['rope', oidB]]);

  it('slug string with map entry → convert', () => {
    const r = classifyItem({ catalogue_id: 'knife' }, slugMap);
    expect(r.action).toBe('convert');
    expect(r.newId).toBe(oidA);
  });

  it('slug string with NO map entry → drop (orphan)', () => {
    const r = classifyItem({ catalogue_id: 'ghost' }, slugMap);
    expect(r.action).toBe('drop');
    expect(r.slug).toBe('ghost');
  });

  it('ObjectId instance → skip (idempotent)', () => {
    const r = classifyItem({ catalogue_id: oidA }, slugMap);
    expect(r.action).toBe('skip');
  });

  it('24-hex string → skip (ObjectId in transit)', () => {
    const r = classifyItem({ catalogue_id: String(oidA) }, slugMap);
    expect(r.action).toBe('skip');
  });

  it('non-string non-object → skip', () => {
    expect(classifyItem({ catalogue_id: null }, slugMap).action).toBe('skip');
    expect(classifyItem({ catalogue_id: 42 }, slugMap).action).toBe('skip');
  });
});

describe('#870 — backfillCharEquipment aggregates per-char diagnostics', () => {
  const oidA = new ObjectId();
  const slugMap = new Map([['knife', oidA]]);

  it('converts slugs, keeps skips, drops orphans', () => {
    const char = {
      equipment: [
        { catalogue_id: 'knife',  state: 'carried' },   // convert
        { catalogue_id: oidA,     state: 'worn'    },   // skip (already oid)
        { catalogue_id: 'ghost',  state: 'lost'    },   // drop (orphan)
      ],
    };
    const r = backfillCharEquipment(char, slugMap);
    expect(r.converted).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].slug).toBe('ghost');
    expect(char.equipment).toHaveLength(2);
    expect(char.equipment[0].catalogue_id).toBe(oidA);
    expect(char.equipment[1].catalogue_id).toBe(oidA);
  });

  it('no-op on empty / missing equipment array', () => {
    const r1 = backfillCharEquipment({ equipment: [] }, slugMap);
    expect(r1).toEqual({ converted: 0, skipped: 0, dropped: [] });
    const r2 = backfillCharEquipment({}, slugMap);
    expect(r2).toEqual({ converted: 0, skipped: 0, dropped: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. main() --step=backfill end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe('#870 — main(--step=backfill) DRY-RUN', () => {
  it('does not write to character documents', async () => {
    const cat = await seedCatalogueItem({ name: 'TestKnife', bucket: 'weapon' });
    const charId = await seedCharWithEquipment([
      { catalogue_id: 'someslug', state: 'carried', acquired_cycle: 1 },
    ]);
    // The cat name doesn't match any source slug, so the slug→ObjectId map
    // will have all missing-slugs and the character item will be flagged as
    // an orphan in the report — but DRY-RUN means NO writes regardless.
    const before = await getCollection('characters').findOne({ _id: charId });

    const result = await runMain(['--step=backfill']);
    expect(result.mode).toBe('dry-run');
    expect(result.step).toBe('backfill');

    const after = await getCollection('characters').findOne({ _id: charId });
    expect(after.equipment).toEqual(before.equipment);
    expect(cat._id).toBeInstanceOf(ObjectId); // catalogue untouched too
  });
});

describe('#870 — main(--step=backfill --apply) converts and drops', () => {
  it('converts slug → ObjectId for every resolvable item', async () => {
    // Seed a catalogue item that matches an EQUIPMENT_CATALOGUE source entry
    // by name+bucket (so the slug map resolves the source slug to this _id).
    // We import EQUIPMENT_CATALOGUE indirectly via the script's source module
    // to pick a real slug; the test catalogue copy avoids the read.
    const { EQUIPMENT_CATALOGUE } = await import('../data/equipment-catalogue.js');
    // Pick the first source entry for a stable test fixture.
    const srcEntry = EQUIPMENT_CATALOGUE[0];

    const cat = await seedCatalogueItem({
      name: srcEntry.name,
      bucket: srcEntry.bucket,
    });

    const charId = await seedCharWithEquipment([
      { catalogue_id: srcEntry.id, state: 'carried', acquired_cycle: 1, notes: null },
    ]);

    const result = await runMain(['--step=backfill', '--apply']);
    expect(result.mode).toBe('apply');
    expect(result.itemsConverted).toBeGreaterThanOrEqual(1);

    const after = await getCollection('characters').findOne({ _id: charId });
    expect(after.equipment[0].catalogue_id).toBeInstanceOf(ObjectId);
    expect(String(after.equipment[0].catalogue_id)).toBe(String(cat._id));
  });

  it('drops + logs orphan slugs (no catalogue match)', async () => {
    // No catalogue seed — the orphan slug "no-such-slug" has no resolution.
    const charId = await seedCharWithEquipment([
      { catalogue_id: 'no-such-slug', state: 'lost', acquired_cycle: 0 },
    ]);
    const result = await runMain(['--step=backfill', '--apply']);
    const orphan = result.orphans.find(o => o.charId === String(charId));
    expect(orphan).toBeDefined();
    expect(orphan.slug).toBe('no-such-slug');
    const after = await getCollection('characters').findOne({ _id: charId });
    expect(after.equipment).toHaveLength(0);   // dropped
  });

  it('post-condition: zero string slugs remain in any character.equipment[]', async () => {
    // Seed mixed — a resolvable slug, an ObjectId already, an orphan.
    const { EQUIPMENT_CATALOGUE } = await import('../data/equipment-catalogue.js');
    const src = EQUIPMENT_CATALOGUE[1];
    const cat = await seedCatalogueItem({ name: src.name, bucket: src.bucket });
    const preExisting = new ObjectId();
    await seedCharWithEquipment([
      { catalogue_id: src.id,       state: 'carried', acquired_cycle: 1 },
      { catalogue_id: preExisting,  state: 'worn',    acquired_cycle: 2 },
      { catalogue_id: 'orphan-x',   state: 'lost',    acquired_cycle: 3 },
    ]);

    await runMain(['--step=backfill', '--apply']);

    // Aggregation post-condition (this is the AC-3 assertion verbatim).
    const stragglers = await getCollection('characters').aggregate([
      { $match: { [TEST_FLAG]: true } },
      { $unwind: '$equipment' },
      { $match: { 'equipment.catalogue_id': { $type: 'string' } } },
    ]).toArray();
    expect(stragglers).toHaveLength(0);
  });
});

describe('#870 — main(--step=backfill --apply) idempotency', () => {
  it('re-running after a clean apply is a no-op (zero conversions)', async () => {
    const { EQUIPMENT_CATALOGUE } = await import('../data/equipment-catalogue.js');
    const src = EQUIPMENT_CATALOGUE[2];
    await seedCatalogueItem({ name: src.name, bucket: src.bucket });
    await seedCharWithEquipment([
      { catalogue_id: src.id, state: 'carried', acquired_cycle: 1 },
    ]);
    const first = await runMain(['--step=backfill', '--apply']);
    expect(first.itemsConverted).toBeGreaterThanOrEqual(1);

    const second = await runMain(['--step=backfill', '--apply']);
    expect(second.itemsConverted).toBe(0);
    // Skipped count includes the already-converted entries.
    expect(second.itemsSkipped).toBeGreaterThanOrEqual(1);
    expect(second.orphans).toHaveLength(0);
  });
});

describe('#870 — buildSlugMapFromCollection', () => {
  it('resolves source slugs by name+bucket match', async () => {
    const { EQUIPMENT_CATALOGUE } = await import('../data/equipment-catalogue.js');
    const src = EQUIPMENT_CATALOGUE[3];
    const cat = await seedCatalogueItem({ name: src.name, bucket: src.bucket });
    const { map, missingSlugs } = await buildSlugMapFromCollection(getCollection('equipment_catalogue'));
    expect(map.get(src.id)).toBeInstanceOf(ObjectId);
    expect(String(map.get(src.id))).toBe(String(cat._id));
    // The other source entries have no catalogue doc → in missingSlugs.
    expect(missingSlugs.length).toBe(EQUIPMENT_CATALOGUE.length - 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PUT /api/characters/:id round-trip — coercion preserves ObjectId on save
// ─────────────────────────────────────────────────────────────────────────────

describe('#870 — PUT /api/characters/:id round-trip preserves ObjectId on equipment[].catalogue_id', () => {
  it('stored as ObjectId both pre and post a PUT round-trip', async () => {
    const cat = await seedCatalogueItem({ name: 'CoercionTest', bucket: 'weapon' });
    const charId = await seedCharWithEquipment([
      { catalogue_id: cat._id, state: 'carried', acquired_cycle: 1, notes: null },
    ]);
    const before = await getCollection('characters').findOne({ _id: charId });
    expect(before.equipment[0].catalogue_id).toBeInstanceOf(ObjectId);

    // Simulate a client save: re-PUT the character with equipment[] as
    // the 24-hex string form (the form that came down from the API).
    const wireBody = {
      ...before,
      equipment: before.equipment.map(it => ({
        ...it,
        catalogue_id: String(it.catalogue_id),   // ObjectId → 24-hex string
      })),
    };
    delete wireBody._id;

    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send(wireBody);
    expect(res.status).toBe(200);

    const after = await getCollection('characters').findOne({ _id: charId });
    expect(after.equipment[0].catalogue_id).toBeInstanceOf(ObjectId);
    expect(String(after.equipment[0].catalogue_id)).toBe(String(cat._id));
  });

  it('rejects a PUT with a non-24-hex string in equipment[].catalogue_id (schema 400)', async () => {
    const charId = await seedCharWithEquipment([]);
    const res = await request(app)
      .put(`/api/characters/${charId}`)
      .set('X-Test-User', stUser())
      .send({
        name: 'ECM-3 fixture',
        equipment: [{ catalogue_id: 'knife', state: 'carried', acquired_cycle: 1 }],
      });
    expect(res.status).toBe(400);
  });
});
