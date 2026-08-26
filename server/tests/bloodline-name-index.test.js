/**
 * `server/lib/bloodline-name-index.js` — `ensureBloodlineNameIndex`.
 *
 * ADMR-1 (2026-08-26) relocated this behavioural coverage here from
 * `bl4-bloodlines-write-api.test.js`, which was deleted wholesale when the
 * ST-facing bloodlines write route it belonged to retired to TM Admin.
 * `ensureBloodlineNameIndex` itself is NOT dead code even though the live
 * write route is gone: `server/scripts/archive/seed-bloodlines.js` - frozen,
 * but still smoke-tested by `bl3b-archived-seed-smoke.test.js` for exactly
 * this reason - still calls it, so this repo keeps both the function and its
 * own dedicated behavioural coverage, independent of any HTTP route.
 *
 * The original test called this function INDIRECTLY, through the now-removed
 * `POST /api/bloodlines` route (which memoised one call to it per process).
 * Rewritten to call `ensureBloodlineNameIndex(collection)` directly - the
 * function's own real, documented signature - rather than reconstruct a
 * route just to reach it.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ensureBloodlineNameIndex, BLOODLINE_NAME_INDEX } from '../lib/bloodline-name-index.js';

const seeded = [];

async function clearSeeded() {
  if (!seeded.length) return;
  await getCollection('bloodlines').deleteMany({ _id: { $in: seeded } });
  seeded.length = 0;
}

beforeEach(async () => {
  await setupDb();
  // Drop it first. The index survives between runs in the test database, and
  // a test that inherits a collated index from a previous run passes whatever
  // the code now says — which is exactly how this pair first failed to
  // discriminate when the collation was reverted to check it.
  try { await getCollection('bloodlines').dropIndex(BLOODLINE_NAME_INDEX); }
  catch { /* IndexNotFound / NamespaceNotFound — nothing to drop */ }
  await clearSeeded();
});

afterAll(async () => {
  await clearSeeded();
  await teardownDb();
});

describe('ensureBloodlineNameIndex — bloodline_name_unique is case-insensitive at the DATABASE', () => {
  it('creates the index with a case-insensitive collation when absent', async () => {
    const col = getCollection('bloodlines');
    const result = await ensureBloodlineNameIndex(col);
    expect(result).toBe('created');
    const idx = (await col.indexes()).find(i => i.name === BLOODLINE_NAME_INDEX);
    expect(idx, `expected ${BLOODLINE_NAME_INDEX} to exist`).toBeTruthy();
    expect(idx.unique).toBe(true);
    expect(idx.collation?.strength).toBe(2);
  });

  it('is safe to call repeatedly - MongoDB itself no-ops an identical createIndex call', async () => {
    // Not a call to the 'unchanged' branch: that branch only fires when the
    // FIRST createIndex call throws (error 85/86, an index of the same name
    // with DIFFERENT options already exists) and the existing one turns out
    // to already be correct. An identical createIndex call succeeds silently
    // at the driver level and never throws at all, so a plain repeat call
    // returns 'created' again, both times - this test exists to pin that
    // real, slightly non-obvious behaviour rather than assume it.
    const col = getCollection('bloodlines');
    const first = await ensureBloodlineNameIndex(col);
    const second = await ensureBloodlineNameIndex(col);
    expect(first).toBe('created');
    expect(second).toBe('created');
  });

  it('refuses a case-different duplicate that never passes through any route at all', async () => {
    // Driver-level, deliberately bypassing any application-level scan: this is
    // the half of the rule the application cannot enforce, and the half a
    // race needs. If this insert succeeds, two documents collapse onto one
    // cache key and one of them is permanently unreachable for costing.
    const col = getCollection('bloodlines');
    await ensureBloodlineNameIndex(col);

    const now = new Date().toISOString();
    const first = await col.insertOne({
      name: 'Zzz Index Collate', slug: 'zzz-index-collate', clan: 'Mekhet',
      disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'], notes: null,
      created_at: now, updated_at: now,
    });
    seeded.push(first.insertedId);

    let code = null;
    try {
      const dupe = await col.insertOne({
        name: 'zzz INDEX collate', slug: 'zzz-index-collate-2', clan: 'Mekhet',
        disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'], notes: null,
        created_at: now, updated_at: now,
      });
      seeded.push(dupe.insertedId);
    } catch (err) {
      code = err?.code;
    }
    expect(code, 'expected E11000 from the collated unique index').toBe(11000);
  });
});
