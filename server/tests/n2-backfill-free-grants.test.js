/**
 * N-2 (issue #695, ADR-005 Rev 2 D6) — character-data backfill of legacy
 * `m.free_<slug>` flat fields → `m.free_grants[<slug>]` map.
 *
 * Four+ acceptance gates from the dispatch:
 *   1. Basic copy + unset — legacy value > 0 with no map entry: map gains
 *      the value, legacy field is unset.
 *   2. Conflict skip — when map AND legacy are both non-zero with DIFFERENT
 *      values, the WHOLE merit is skipped (other slugs on the same merit are
 *      NOT touched even if they'd otherwise migrate cleanly).
 *   3. Idempotency — a second --apply pass touches zero docs (every legacy
 *      field was unset on the first pass).
 *   4. Zero-value skip — legacy `free_<slug>: 0` is NOT migrated (creating
 *      an empty map entry would be noise).
 *
 * Plus: equal-values are NOT a conflict (no-op for the slug, but the merit
 * proceeds normally — legacy gets unset, map keeps its value).
 * Plus: --character-id scoping touches only the named character.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { backfill, backfillCharacterMerits, LEGACY_FREE_SLUGS } from '../scripts/backfill-free-grants.js';

const TEST_FLAG = { _test_n2: true };

beforeAll(async () => {
  await setupDb();
  await getCollection('characters').deleteMany(TEST_FLAG);
});

afterAll(async () => {
  await getCollection('characters').deleteMany(TEST_FLAG);
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure-function: backfillCharacterMerits
// ─────────────────────────────────────────────────────────────────────────────

describe('N-2 — backfillCharacterMerits (pure)', () => {
  it('copies legacy non-zero free_<slug> to free_grants and unsets legacy', () => {
    const c = {
      merits: [
        { name: 'Herd', cp: 1, free_lk: 2, free_vm: 1 },
      ],
    };
    const r = backfillCharacterMerits(c);
    expect(r.touched).toBe(true);
    expect(r.fieldsMigrated).toBe(2);
    expect(r.merits[0].free_grants).toEqual({ lk: 2, vm: 1 });
    expect(r.merits[0]).not.toHaveProperty('free_lk');
    expect(r.merits[0]).not.toHaveProperty('free_vm');
    // Input is preserved (non-destructive — dryRun-mode is also non-destructive
    // because the input is shallow-cloned). The returned merits are the canonical
    // post-migration shape.
  });

  it('SKIPS the whole merit when map and legacy disagree on any slug', () => {
    // free_mci=3 conflicts with free_grants.mci=5. Even though free_lk=1
    // would migrate cleanly, the whole merit is skipped — safety guard.
    const c = {
      name: 'Conflicted',
      merits: [
        { name: 'Herd', free_mci: 3, free_lk: 1, free_grants: { mci: 5 } },
      ],
    };
    const r = backfillCharacterMerits(c);
    expect(r.touched).toBe(false);
    expect(r.fieldsMigrated).toBe(0);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      merit_name: 'Herd',
      conflicts: [{ slug: 'mci', mapVal: 5, legacyVal: 3 }],
    });
    // Crucially, free_lk is preserved — the safety guard means the unrelated
    // clean slug is NOT half-migrated.
    expect(r.merits[0].free_lk).toBe(1);
  });

  it('equal map and legacy values are NOT a conflict — legacy is unset, map kept', () => {
    const c = {
      merits: [
        { name: 'Herd', free_lk: 3, free_grants: { lk: 3 } },
      ],
    };
    const r = backfillCharacterMerits(c);
    expect(r.touched).toBe(true);
    expect(r.fieldsMigrated).toBe(1);
    expect(r.merits[0].free_grants).toEqual({ lk: 3 });
    expect(r.merits[0]).not.toHaveProperty('free_lk');
    expect(r.conflicts).toHaveLength(0);
  });

  it('zero legacy values are not migrated (no empty map entry created)', () => {
    const c = {
      merits: [
        { name: 'Herd', free_lk: 0, free_vm: 2 },
      ],
    };
    const r = backfillCharacterMerits(c);
    expect(r.merits[0].free_grants).toEqual({ vm: 2 });
    expect(r.merits[0].free_grants.lk).toBeUndefined();
    expect(r.fieldsMigrated).toBe(1);
    expect(r.perSlug).toEqual({ vm: 1 });
  });

  it('dry-run does NOT mutate the merits array; field counts still report correctly', () => {
    const c = {
      merits: [
        { name: 'Herd', free_lk: 2 },
      ],
    };
    const r = backfillCharacterMerits(c, { dryRun: true });
    expect(r.touched).toBe(true);
    expect(r.fieldsMigrated).toBe(1);
    // Dry-run preserves the in-memory shape exactly. Caller uses the totals
    // for the preview; the mutated array is only written when dryRun is false.
    expect(c.merits[0].free_lk).toBe(2);
    expect(c.merits[0].free_grants).toBeUndefined();
  });

  it('covers all 14 legacy slugs without enumeration drift', () => {
    // Sanity: building a merit with every legacy slug populated should
    // migrate exactly 14 fields and the perSlug counts match the slug set.
    const m = { name: 'Stuffed' };
    for (const slug of LEGACY_FREE_SLUGS) m['free_' + slug] = 1;
    const c = { merits: [m] };
    const r = backfillCharacterMerits(c);
    expect(r.fieldsMigrated).toBe(LEGACY_FREE_SLUGS.length);
    expect(Object.keys(r.perSlug).sort()).toEqual([...LEGACY_FREE_SLUGS].sort());
    expect(Object.keys(r.merits[0].free_grants).sort()).toEqual([...LEGACY_FREE_SLUGS].sort());
    for (const slug of LEGACY_FREE_SLUGS) {
      expect(r.merits[0]).not.toHaveProperty('free_' + slug);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB-driven: backfill() against a live test DB
// ─────────────────────────────────────────────────────────────────────────────

describe('N-2 — backfill (DB-driven)', () => {
  let cleanId, conflictId, otherId;

  beforeAll(async () => {
    // Reset the test surface.
    await getCollection('characters').deleteMany(TEST_FLAG);

    // cleanChar: 3 legacy fields ready to migrate; no map entries.
    const ins1 = await getCollection('characters').insertOne({
      ...TEST_FLAG,
      name: 'N2_Clean',
      merits: [
        { name: 'Herd', category: 'general', cp: 1, xp: 0, free_lk: 2, free_vm: 1, free_mci: 3 },
      ],
    });
    cleanId = ins1.insertedId;

    // conflictChar: one merit with map/legacy disagreement; another merit with
    // a clean migration. After backfill: conflict merit untouched; clean merit
    // migrated.
    const ins2 = await getCollection('characters').insertOne({
      ...TEST_FLAG,
      name: 'N2_Conflict',
      merits: [
        { name: 'Herd', category: 'general', free_mci: 3, free_lk: 1, free_grants: { mci: 5 } },
        { name: 'Mentor', category: 'general', free_pt: 2 },
      ],
    });
    conflictId = ins2.insertedId;

    // otherChar: no legacy fields — should remain untouched.
    const ins3 = await getCollection('characters').insertOne({
      ...TEST_FLAG,
      name: 'N2_Other',
      merits: [
        { name: 'Resources', category: 'influence', cp: 2, xp: 1 },
      ],
    });
    otherId = ins3.insertedId;
  });

  it('--apply migrates clean characters and skips conflicted merits', async () => {
    const totals = await backfill({ dryRun: false, log: false });
    expect(totals.charsScanned).toBeGreaterThanOrEqual(3); // shared test DB may have other docs
    expect(totals.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(totals.conflicts.some(c => c.char_name === 'N2_Conflict' && c.merit_name === 'Herd')).toBe(true);

    const clean = await getCollection('characters').findOne({ _id: cleanId });
    expect(clean.merits[0].free_grants).toEqual({ lk: 2, vm: 1, mci: 3 });
    expect(clean.merits[0]).not.toHaveProperty('free_lk');
    expect(clean.merits[0]).not.toHaveProperty('free_vm');
    expect(clean.merits[0]).not.toHaveProperty('free_mci');

    const conflict = await getCollection('characters').findOne({ _id: conflictId });
    // The Herd merit (conflict) is untouched — both legacy fields still present.
    expect(conflict.merits[0].free_mci).toBe(3);
    expect(conflict.merits[0].free_lk).toBe(1);
    expect(conflict.merits[0].free_grants).toEqual({ mci: 5 });
    // The Mentor merit (no conflict) migrated cleanly.
    expect(conflict.merits[1].free_grants).toEqual({ pt: 2 });
    expect(conflict.merits[1]).not.toHaveProperty('free_pt');
  });

  it('second --apply pass is idempotent (touches zero docs)', async () => {
    const totals = await backfill({ dryRun: false, log: false });
    // The previously-conflicted merit is the only doc still carrying legacy
    // fields; the run reports it as a conflict but doesn't write — so the
    // touched-count is zero.
    expect(totals.charsTouched).toBe(0);
    expect(totals.fieldsMigrated).toBe(0);
    // The Herd merit on N2_Conflict still shows as a conflict on every run
    // until a human resolves it.
    expect(totals.conflicts.some(c => c.char_name === 'N2_Conflict')).toBe(true);
  });

  it('--character-id scoping touches only the named character', async () => {
    // Inject a fresh legacy field on otherChar (which the previous pass left
    // untouched) and scope the backfill to its ID. cleanChar and conflictChar
    // remain unchanged because they're outside the scope filter.
    await getCollection('characters').updateOne(
      { _id: otherId },
      { $set: { merits: [{ name: 'Resources', category: 'influence', free_inv: 1 }] } },
    );
    const totals = await backfill({ dryRun: false, characterId: String(otherId), log: false });
    expect(totals.charsScanned).toBe(1);
    expect(totals.charsTouched).toBe(1);
    expect(totals.fieldsMigrated).toBe(1);

    const other = await getCollection('characters').findOne({ _id: otherId });
    expect(other.merits[0].free_grants).toEqual({ inv: 1 });
    expect(other.merits[0]).not.toHaveProperty('free_inv');
  });
});
