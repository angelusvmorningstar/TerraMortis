/**
 * Issue #869 — ECM-2 seed script tests.
 *
 * Three slices:
 *   1. Pure-helper unit (toCatalogueDoc / buildSlugMap / formatSlugMap) —
 *      shape contracts on the in-memory transforms, no DB.
 *   2. main() integration end-to-end against the test MongoDB. Covers:
 *      DRY-RUN no-write, live apply inserts all entries, re-run without
 *      --force refuses non-zero, re-run with --force does NOT drop and
 *      DOES append. Discipline pin: [[feedback_script_integration_test]]
 *      — helper-level mocks alone failed previously (the June 16 incident
 *      Khepri called out); this slice exercises the full pipeline.
 *   3. Source-data sanity: every EQUIPMENT_CATALOGUE entry has a
 *      slug-shaped `id` so the slug→ObjectId map is well-defined.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { EQUIPMENT_CATALOGUE } from '../data/equipment-catalogue.js';
import {
  main,
  toCatalogueDoc,
  buildSlugMap,
  formatSlugMap,
} from '../scripts/ecm-migrate.js';

beforeAll(async () => { await setupDb(); });
afterAll(async () => { await teardownDb(); });

// Each integration test starts from a clean collection. The seed script
// owns the whole collection; partial-state interleavings would invalidate
// the idempotency assertions.
async function clearCatalogue() {
  await getCollection('equipment_catalogue').deleteMany({});
}
beforeEach(clearCatalogue);
afterEach(clearCatalogue);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure-helper unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('#869 — toCatalogueDoc strips slug + adds audit-light timestamps', () => {
  it('drops the legacy `id` field per epic D1', () => {
    const src = { id: 'knife', bucket: 'weapon', name: 'Knife', damage_mod: 1 };
    const out = toCatalogueDoc(src, '2026-06-17T00:00:00.000Z');
    expect(out.id).toBeUndefined();
    expect(out.bucket).toBe('weapon');
    expect(out.name).toBe('Knife');
    expect(out.damage_mod).toBe(1);
  });

  it('sets created_at and updated_at to the supplied timestamp', () => {
    const ts = '2026-06-17T11:22:33.444Z';
    const out = toCatalogueDoc({ id: 'x', bucket: 'equipment', name: 'X' }, ts);
    expect(out.created_at).toBe(ts);
    expect(out.updated_at).toBe(ts);
  });

  it('preserves every non-id field including nullables', () => {
    const src = {
      id: 'foo', bucket: 'armour', name: 'Vest',
      description: 'd', availability: 3, tags: ['armour'],
      damage_mod: null, damage_type: null, weapon_type: null,
      armour_value: 2, defence_penalty: -1,
      skill_domain: null, bonus_dice: null,
    };
    const out = toCatalogueDoc(src, '2026-01-01T00:00:00.000Z');
    expect(out.armour_value).toBe(2);
    expect(out.defence_penalty).toBe(-1);
    expect(out.skill_domain).toBeNull();
    expect(out.bonus_dice).toBeNull();
    expect(out.damage_mod).toBeNull();
    expect(out.tags).toEqual(['armour']);
  });
});

describe('#869 — buildSlugMap pairs entries with inserted ids in order', () => {
  it('keys by source slug, values are the parallel ids', () => {
    const src = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
    const map = buildSlugMap(src, ids);
    expect(map.size).toBe(3);
    expect(map.get('a')).toBe(ids[0]);
    expect(map.get('b')).toBe(ids[1]);
    expect(map.get('c')).toBe(ids[2]);
  });

  it('throws on length mismatch', () => {
    expect(() => buildSlugMap([{ id: 'a' }, { id: 'b' }], [new ObjectId()]))
      .toThrow(/entry count.*≠.*inserted/);
  });
});

describe('#869 — formatSlugMap renders a stable INFO-level log line set', () => {
  it('lists each slug → id pair, sorted by slug', () => {
    const map = new Map([
      ['zebra', new ObjectId('507f1f77bcf86cd799439011')],
      ['ant',   new ObjectId('507f1f77bcf86cd799439012')],
    ]);
    const out = formatSlugMap(map);
    const idxA = out.indexOf('ant');
    const idxZ = out.indexOf('zebra');
    expect(idxA).toBeLessThan(idxZ);   // sorted
    expect(out).toMatch(/preserve for ECM-3 backfill/);
    expect(out).toContain('507f1f77bcf86cd799439011');
    expect(out).toContain('507f1f77bcf86cd799439012');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. main() integration — end-to-end against test MongoDB
// ─────────────────────────────────────────────────────────────────────────────

/** Run main() with a controlled process.argv slice. */
async function runMain(extra = []) {
  const origArgv = process.argv;
  process.argv = ['node', '/tmp/ecm-migrate.js', ...extra];
  try {
    return await main();
  } finally {
    process.argv = origArgv;
  }
}

describe('#869 — main() DRY-RUN (no --apply)', () => {
  it('does not write to the collection', async () => {
    const before = await getCollection('equipment_catalogue').countDocuments();
    const result = await runMain();
    expect(result.mode).toBe('dry-run');
    expect(result.sourceCount).toBe(EQUIPMENT_CATALOGUE.length);
    const after = await getCollection('equipment_catalogue').countDocuments();
    expect(after).toBe(before);
  });

  it('returns the first 3 sample entries', async () => {
    const result = await runMain();
    expect(result.sample).toHaveLength(3);
    for (const s of result.sample) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.bucket).toBe('string');
      expect(typeof s.name).toBe('string');
    }
  });

  it('flags wouldRefuse=true when collection is non-empty (DRY-RUN preview of refuse path)', async () => {
    await getCollection('equipment_catalogue').insertOne({ bucket: 'equipment', name: 'pre-seed' });
    const result = await runMain();
    expect(result.wouldRefuse).toBe(true);
  });
});

describe('#869 — main() --apply (live seed)', () => {
  it('inserts every EQUIPMENT_CATALOGUE entry', async () => {
    const result = await runMain(['--apply']);
    expect(result.mode).toBe('apply');
    expect(result.insertedCount).toBe(EQUIPMENT_CATALOGUE.length);

    const stored = await getCollection('equipment_catalogue').find({}).toArray();
    expect(stored).toHaveLength(EQUIPMENT_CATALOGUE.length);

    // Every doc must carry the ECM-1 audit-light timestamps.
    for (const doc of stored) {
      expect(typeof doc.created_at).toBe('string');
      expect(typeof doc.updated_at).toBe('string');
    }
  });

  it('strips the legacy `id` slug from every inserted document (epic D1)', async () => {
    await runMain(['--apply']);
    const stored = await getCollection('equipment_catalogue').find({}).toArray();
    for (const doc of stored) {
      expect(doc.id).toBeUndefined();
    }
  });

  it('returns a slug→ObjectId map covering every source slug', async () => {
    const result = await runMain(['--apply']);
    expect(result.slugMap.size).toBe(EQUIPMENT_CATALOGUE.length);
    for (const entry of EQUIPMENT_CATALOGUE) {
      const id = result.slugMap.get(entry.id);
      expect(id).toBeInstanceOf(ObjectId);
    }
  });

  it('inserted ids resolve to docs whose name matches the source entry', async () => {
    const result = await runMain(['--apply']);
    // Spot-check 3 random entries (deterministic indices for stability).
    for (const idx of [0, Math.floor(EQUIPMENT_CATALOGUE.length / 2), EQUIPMENT_CATALOGUE.length - 1]) {
      const src = EQUIPMENT_CATALOGUE[idx];
      const oid = result.slugMap.get(src.id);
      expect(oid).toBeDefined();
      const doc = await getCollection('equipment_catalogue').findOne({ _id: oid });
      expect(doc?.name).toBe(src.name);
      expect(doc?.bucket).toBe(src.bucket);
    }
  });
});

describe('#869 — main() refuses re-seed without --force', () => {
  it('throws REFUSE_NONEMPTY when collection is non-empty', async () => {
    await runMain(['--apply']);   // first seed
    await expect(runMain(['--apply'])).rejects.toMatchObject({ code: 'REFUSE_NONEMPTY' });
  });

  it('does NOT modify the collection on refuse', async () => {
    await runMain(['--apply']);   // first seed
    const before = await getCollection('equipment_catalogue').countDocuments();
    await expect(runMain(['--apply'])).rejects.toMatchObject({ code: 'REFUSE_NONEMPTY' });
    const after = await getCollection('equipment_catalogue').countDocuments();
    expect(after).toBe(before);
  });

  it('refuse-error message names the non-zero count + suggests drop-first remediation', async () => {
    await runMain(['--apply']);
    try {
      await runMain(['--apply']);
      throw new Error('expected refuse');
    } catch (err) {
      expect(err.code).toBe('REFUSE_NONEMPTY');
      expect(err.message).toMatch(/non-empty/);
      expect(err.message).toMatch(/drop the collection/);
    }
  });
});

describe('#869 — main() --apply --force seeds again WITHOUT dropping', () => {
  it('appends to non-empty collection (does NOT drop existing docs)', async () => {
    await runMain(['--apply']);
    const after_first = await getCollection('equipment_catalogue').find({}).toArray();
    const firstIds = after_first.map(d => String(d._id)).sort();

    const result = await runMain(['--apply', '--force']);
    expect(result.forced).toBe(true);
    expect(result.insertedCount).toBe(EQUIPMENT_CATALOGUE.length);

    const after_force = await getCollection('equipment_catalogue').find({}).toArray();
    expect(after_force.length).toBe(EQUIPMENT_CATALOGUE.length * 2);

    // Every doc inserted in the first run must STILL be present —
    // proves --force did not drop.
    const surviving = after_force.filter(d => firstIds.includes(String(d._id)));
    expect(surviving.length).toBe(after_first.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Source-data sanity
// ─────────────────────────────────────────────────────────────────────────────

describe('#869 — EQUIPMENT_CATALOGUE source-data invariants', () => {
  it('every entry has a unique slug-shaped `id`', () => {
    const slugs = EQUIPMENT_CATALOGUE.map(e => e.id);
    const slugRe = /^[a-z0-9][a-z0-9-]*$/;
    for (const s of slugs) {
      expect(typeof s).toBe('string');
      expect(slugRe.test(s)).toBe(true);
    }
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every entry has bucket in the schema enum', () => {
    const allowed = new Set(['weapon', 'armour', 'equipment', 'asset']);
    for (const e of EQUIPMENT_CATALOGUE) {
      expect(allowed.has(e.bucket)).toBe(true);
    }
  });
});
