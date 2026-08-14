/**
 * DBO-8 — cleanup script for orphaned `relationships` documents carrying
 * `kind: 'touchstone'`, a shape retired by this story (issue #162 removed
 * the only path that ever created a linked touchstone; live data confirmed
 * zero of 44 touchstones used it).
 *
 * DB-backed: real MongoDB required. A skipped suite is not a passing suite —
 * read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { planCleanup, applyCleanup } from '../scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('DBO-8: dbo-8-orphaned-touchstone-edges-cleanup.mjs', () => {
  const KEY_PREFIX = 'dbo-8-test-';
  const ids = {
    orphan: `${KEY_PREFIX}orphan`,
    other: `${KEY_PREFIX}other-kind`,
  };

  const fixtures = () => ([
    {
      _id: ids.orphan, kind: 'touchstone', status: 'retired',
      a: { type: 'pc', id: 'a1' }, b: { type: 'npc', id: 'b1' },
      touchstone_meta: { humanity: 6 },
    },
    {
      _id: ids.other, kind: 'ally', status: 'active',
      a: { type: 'pc', id: 'a2' }, b: { type: 'npc', id: 'b2' },
    },
  ]);

  async function cleanupFixtures() {
    await getCollection('relationships').deleteMany({ _id: { $in: [ids.orphan, ids.other] } });
  }

  beforeAll(async () => { await setupDb(); });
  beforeEach(async () => {
    await cleanupFixtures();
    await getCollection('relationships').insertMany(fixtures());
  });
  afterAll(async () => { await cleanupFixtures(); });

  it('plans exactly the kind: touchstone documents, leaving other kinds out', async () => {
    const col = getCollection('relationships');
    const rows = await planCleanup(col);
    const byId = Object.fromEntries(rows.filter(r => String(r._id).startsWith(KEY_PREFIX)).map(r => [r._id, r]));

    expect(byId[ids.orphan]).toBeDefined();
    expect(byId[ids.other]).toBeUndefined();
  });

  it('dry run (default) writes nothing', async () => {
    const col = getCollection('relationships');
    const rows = (await planCleanup(col)).filter(r => String(r._id).startsWith(KEY_PREFIX));
    const result = await applyCleanup(col, rows, { apply: false });

    expect(result).toEqual({ deleted: 0, backedUp: 0 });
    expect(await col.findOne({ _id: ids.orphan })).not.toBeNull();
  });

  it('apply deletes only the kind: touchstone document, leaving the other kind untouched', async () => {
    const col = getCollection('relationships');
    const rows = (await planCleanup(col)).filter(r => String(r._id).startsWith(KEY_PREFIX));
    const result = await applyCleanup(col, rows, { apply: true });

    expect(result.deleted).toBe(1);
    expect(await col.findOne({ _id: ids.orphan })).toBeNull();
    expect(await col.findOne({ _id: ids.other })).not.toBeNull();
  });

  it('is idempotent: re-planning after apply finds nothing left for these fixtures', async () => {
    const col = getCollection('relationships');
    const firstPlan = (await planCleanup(col)).filter(r => String(r._id).startsWith(KEY_PREFIX));
    await applyCleanup(col, firstPlan, { apply: true });

    const secondPlan = await planCleanup(col);
    const remaining = secondPlan.filter(r => String(r._id).startsWith(KEY_PREFIX));
    expect(remaining).toEqual([]);
  });

  it('Codex review, DBO-8 (Medium): does not delete a row whose kind changed away from touchstone after planning', async () => {
    // This shape is real, not hypothetical: an ST successfully PUTs an
    // existing kind:'touchstone' row to a schema-valid kind (e.g. 'ally')
    // between this script's plan and apply steps. Deleting by _id alone
    // would destroy that now-legitimate relationship; the fix re-checks
    // kind at delete time against a fresh read.
    const col = getCollection('relationships');
    const rows = (await planCleanup(col)).filter(r => String(r._id).startsWith(KEY_PREFIX));
    expect(rows.some(r => r._id === ids.orphan)).toBe(true);

    // Simulate the reconciling PUT landing after planning, before apply.
    await col.updateOne({ _id: ids.orphan }, { $set: { kind: 'ally' }, $unset: { touchstone_meta: '' } });

    const result = await applyCleanup(col, rows, { apply: true });

    expect(result.deleted).toBe(0);
    const survivor = await col.findOne({ _id: ids.orphan });
    expect(survivor).not.toBeNull();
    expect(survivor.kind).toBe('ally');
  });
});
