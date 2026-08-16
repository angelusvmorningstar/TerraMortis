/**
 * cm-2 — live-DB integration tests for the chapters -> story_cycles migration.
 *
 * Runs against `tm_suite_test` (forced by tests/helpers/setup-env.js; setupDb()
 * additionally refuses any database whose name does not end `_test`). It
 * exercises the script's EXPORTED FUNCTIONS and never shells out, so nothing
 * here can reach live Atlas.
 *
 * The fixtures mirror the real live shape found by the story's own read-only
 * investigation on 2026-08-16: three documents numbered 1-3 labelled
 * "Chapter 1" / "Chapter 2" / "Chapter 3", grouping seven downtime cycles
 * 3 / 3 / 1, every `chapter_id` a non-null STRING.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { connectDb, getDb } from '../db.js';
import {
  planLabel,
  planRename,
  applyRename,
  verifyRename,
  dropSource,
  sourceShapeRefusals,
  main,
  SOURCE_COLLECTION,
  TARGET_COLLECTION,
  OLD_FIELD,
  NEW_FIELD,
  CYCLES_COLLECTION,
} from '../scripts/cm-2-chapters-to-story-cycles.mjs';

let db;
const silent = () => {};

// Live-shaped ids: 24-hex, held by downtime_cycles as STRINGS.
const ID1 = '6a2a8760b3a2b71081036def';
const ID2 = '6a35cb3defee90c8c11fff6e';
const ID3 = '6a7ff93d4f02ce8035b75d59';

function sourceFixture() {
  return [
    { _id: new ObjectId(ID1), number: 1, label: 'Chapter 1', created_at: '2026-06-11T10:01:04.071Z' },
    { _id: new ObjectId(ID2), number: 2, label: 'Chapter 2', created_at: '2026-06-19T23:05:33.831Z' },
    { _id: new ObjectId(ID3), number: 3, label: 'Chapter 3', created_at: '2026-08-15T05:29:33.599Z' },
  ];
}

/** Seven cycles grouped 3 / 3 / 1, exactly as live. */
function cycleFixture() {
  const groups = [[ID1, [1, 2, 3]], [ID2, [4, 5, 6]], [ID3, [7]]];
  const docs = [];
  for (const [chapterId, games] of groups) {
    for (const game of games) {
      docs.push({
        label: `Downtime ${game}`,
        game_number: game,
        status: 'closed',
        [OLD_FIELD]: chapterId,
        _cm2_fixture: true,
      });
    }
  }
  return docs;
}

async function seed({ source = sourceFixture(), cycles = cycleFixture() } = {}) {
  if (source.length) await db.collection(SOURCE_COLLECTION).insertMany(source);
  if (cycles.length) await db.collection(CYCLES_COLLECTION).insertMany(cycles);
}

async function collectionExists(name) {
  const found = await db.listCollections({ name }).toArray();
  return found.length > 0;
}

beforeAll(async () => {
  await setupDb();
  db = getDb();
});

beforeEach(async () => {
  // tm_suite_test only (setupDb enforces the _test suffix). A leftover cycle
  // carrying either FK field would otherwise be read as a dangling reference.
  for (const name of [SOURCE_COLLECTION, TARGET_COLLECTION]) {
    if (await collectionExists(name)) await db.collection(name).drop();
  }
  await db.collection(CYCLES_COLLECTION).deleteMany({
    $or: [{ [OLD_FIELD]: { $exists: true } }, { [NEW_FIELD]: { $exists: true } }],
  });
});

afterAll(async () => {
  for (const name of [SOURCE_COLLECTION, TARGET_COLLECTION]) {
    if (await collectionExists(name)) await db.collection(name).drop();
  }
  await db.collection(CYCLES_COLLECTION).deleteMany({ _cm2_fixture: true });
  await teardownDb();
});

// ── The no-shebang landmine ────────────────────────────────────────────────

describe('cm-2 — script file conventions', () => {
  it('has no shebang (vitest cannot transform one, and this file is imported)', () => {
    const src = fs.readFileSync('./scripts/cm-2-chapters-to-story-cycles.mjs', 'utf8');
    expect(src.startsWith('#!')).toBe(false);
  });

  it('is guarded so importing it never auto-runs main()', () => {
    const src = fs.readFileSync('./scripts/cm-2-chapters-to-story-cycles.mjs', 'utf8');
    expect(src).toContain('import.meta.url === pathToFileURL(process.argv[1]).href');
  });
});

// ── planLabel (pure) ───────────────────────────────────────────────────────

describe('cm-2 — planLabel', () => {
  it('rewrites "Chapter N" to "Story N" when N matches the document number', () => {
    expect(planLabel({ number: 2, label: 'Chapter 2' })).toEqual({ action: 'relabel', label: 'Story 2' });
  });

  it('is case- and space-tolerant', () => {
    expect(planLabel({ number: 3, label: '  chapter  3 ' })).toEqual({ action: 'relabel', label: 'Story 3' });
  });

  it('treats an already-"Story N" label as done (idempotency)', () => {
    expect(planLabel({ number: 1, label: 'Story 1' })).toEqual({ action: 'unchanged', label: 'Story 1' });
  });

  it('keeps ST-authored prose verbatim rather than guessing', () => {
    const doc = { number: 2, label: 'Chapter Two: The Price of Power' };
    expect(planLabel(doc)).toEqual({ action: 'kept', label: 'Chapter Two: The Price of Power' });
  });

  it('keeps a "Chapter N" label whose N contradicts the document number', () => {
    expect(planLabel({ number: 2, label: 'Chapter 9' })).toEqual({ action: 'kept', label: 'Chapter 9' });
  });
});

// ── Dry run ────────────────────────────────────────────────────────────────

describe('cm-2 — dry run', () => {
  it('writes nothing at all', async () => {
    await seed();
    const plan = await planRename(db);
    expect(plan.copies).toHaveLength(3);
    expect(plan.fieldRenames).toHaveLength(7);

    await applyRename(db, plan, { apply: false, log: silent });

    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(7);
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [NEW_FIELD]: { $exists: true } })).toBe(0);
  });

  it('proposes the new labels without writing them', async () => {
    await seed();
    const plan = await planRename(db);
    expect(plan.copies.map(c => c.newLabel).sort()).toEqual(['Story 1', 'Story 2', 'Story 3']);
    expect(plan.copies.map(c => c.oldLabel).sort()).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);

    await applyRename(db, plan, { apply: false, log: silent });
    const stillOld = await db.collection(SOURCE_COLLECTION).find({}).toArray();
    expect(stillOld.map(d => d.label).sort()).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
  });
});

// ── Apply ──────────────────────────────────────────────────────────────────

describe('cm-2 — applyRename', () => {
  it('copies every document preserving _id VERBATIM', async () => {
    await seed();
    const plan = await planRename(db);
    const res = await applyRename(db, plan, { apply: true, log: silent });

    expect(res.copied).toBe(3);
    const copied = await db.collection(TARGET_COLLECTION).find({}).toArray();
    expect(copied.map(d => String(d._id)).sort()).toEqual([ID1, ID2, ID3].sort());
    // Every other field carried across untouched.
    const one = copied.find(d => String(d._id) === ID1);
    expect(one.number).toBe(1);
    expect(one.created_at).toBe('2026-06-11T10:01:04.071Z');
  });

  it('relabels "Chapter N" to "Story N" on the copies', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const copied = await db.collection(TARGET_COLLECTION).find({}).sort({ number: 1 }).toArray();
    expect(copied.map(d => d.label)).toEqual(['Story 1', 'Story 2', 'Story 3']);
  });

  it('leaves the source collection completely untouched (rollback stays free)', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const src = await db.collection(SOURCE_COLLECTION).find({}).sort({ number: 1 }).toArray();
    expect(src).toHaveLength(3);
    expect(src.map(d => d.label)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
  });

  it(`renames ${OLD_FIELD} to ${NEW_FIELD} on every cycle, preserving the string type`, async () => {
    await seed();
    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });

    expect(res.fieldsRenamed).toBe(7);
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(0);
    const cycles = await db.collection(CYCLES_COLLECTION).find({ _cm2_fixture: true }).toArray();
    expect(cycles).toHaveLength(7);
    for (const cy of cycles) expect(typeof cy[NEW_FIELD]).toBe('string');
  });

  it('leaves the FK resolvable end to end (3 / 3 / 1, unchanged)', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const grouped = {};
    for (const cy of await db.collection(CYCLES_COLLECTION).find({ _cm2_fixture: true }).toArray()) {
      const story = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(cy[NEW_FIELD]) });
      expect(story).toBeTruthy();
      grouped[story.number] = (grouped[story.number] || 0) + 1;
    }
    expect(grouped).toEqual({ 1: 3, 2: 3, 3: 1 });
  });

  it('verifies after writing', async () => {
    await seed();
    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(res.verified.ok).toBe(true);
    expect(res.verified.problems).toEqual([]);
  });

  it('keeps an ST-authored label verbatim and reports it', async () => {
    const source = sourceFixture();
    source[1].label = 'Chapter Two: The Price of Power';
    await seed({ source });

    const plan = await planRename(db);
    expect(plan.keptLabels).toHaveLength(1);
    expect(plan.keptLabels[0].label).toBe('Chapter Two: The Price of Power');

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.labelsKept).toBe(1);
    const kept = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(ID2) });
    expect(kept.label).toBe('Chapter Two: The Price of Power');
  });
});

// ── Idempotency ────────────────────────────────────────────────────────────

describe('cm-2 — idempotency', () => {
  it('a second --apply copies nothing, relabels nothing and renames no fields', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const secondPlan = await planRename(db);
    expect(secondPlan.copies).toEqual([]);
    expect(secondPlan.relabels).toEqual([]);
    expect(secondPlan.fieldRenames).toEqual([]);
    expect(secondPlan.refusals).toEqual([]);
    expect(secondPlan.noops).toHaveLength(3);

    const res = await applyRename(db, secondPlan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(res.relabelled).toBe(0);
    expect(res.fieldsRenamed).toBe(0);
    expect(res.refused).toBe(0);
    expect(res.verified.ok).toBe(true);
  });

  it('does not re-transform an already-relabelled document into "Story Story 1"', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const labels = (await db.collection(TARGET_COLLECTION).find({}).sort({ number: 1 }).toArray())
      .map(d => d.label);
    expect(labels).toEqual(['Story 1', 'Story 2', 'Story 3']);
  });

  it('finishes the relabel when an earlier run copied but did not relabel', async () => {
    await seed();
    // Simulate a pre-relabel copy: same _id, same body, ORIGINAL label.
    await db.collection(TARGET_COLLECTION).insertMany(sourceFixture());

    const plan = await planRename(db);
    expect(plan.copies).toEqual([]);
    expect(plan.relabels).toHaveLength(3);
    expect(plan.refusals).toEqual([]);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.relabelled).toBe(3);
    const labels = (await db.collection(TARGET_COLLECTION).find({}).sort({ number: 1 }).toArray())
      .map(d => d.label);
    expect(labels).toEqual(['Story 1', 'Story 2', 'Story 3']);
  });
});

// ── Refusals ───────────────────────────────────────────────────────────────

describe('cm-2 — refusals', () => {
  it('refuses when story_cycles holds a DIFFERING document under the same _id', async () => {
    await seed();
    await db.collection(TARGET_COLLECTION).insertOne({
      _id: new ObjectId(ID1), number: 99, label: 'Something else entirely',
    });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'target-differs')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.refused).toBeGreaterThan(0);
    expect(res.copied).toBe(0);
    // Nothing written: the imposter is untouched and no field rename happened.
    const imposter = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(ID1) });
    expect(imposter.number).toBe(99);
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(7);
    expect(await db.collection(TARGET_COLLECTION).countDocuments({})).toBe(1);
  });

  it('refuses when a cycle carries BOTH fields', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'both-fields')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(7);
  });

  it('refuses on a dangling reference', async () => {
    const cycles = cycleFixture();
    cycles[6][OLD_FIELD] = '6a0000000000000000000000';
    await seed({ cycles });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'dangling-ref')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(7);
  });
});

// ── verifyRename ───────────────────────────────────────────────────────────

describe('cm-2 — verifyRename', () => {
  it('fails when a grouping was lost after the rename', async () => {
    await seed();
    const plan = await planRename(db);
    await applyRename(db, plan, { apply: true, log: silent });

    await db.collection(CYCLES_COLLECTION).updateOne(
      { _cm2_fixture: true, game_number: 7 },
      { $set: { [NEW_FIELD]: null } },
    );
    const verified = await verifyRename(db, plan);
    expect(verified.ok).toBe(false);
    expect(verified.problems.join(' ')).toContain(ID3);
  });
});

// ── dropSource ─────────────────────────────────────────────────────────────

describe('cm-2 — dropSource', () => {
  it('refuses while story_cycles is empty', async () => {
    await seed();
    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.dropped).toBe(false);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });

  it('refuses while cycles still carry the old field', async () => {
    await seed();
    // Copy the documents across but leave the field rename undone.
    const plan = await planRename(db);
    for (const row of plan.copies) {
      const { _id, ...fields } = row.doc;
      await db.collection(TARGET_COLLECTION).insertOne({ _id, ...fields });
    }
    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });

  it('is a dry run by default even once verification passes', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const res = await dropSource(db, { apply: false, log: silent });
    expect(res.dropped).toBe(false);
    expect(res.refused).toBe(false);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });

  it('drops the source once verification passes', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.dropped).toBe(true);
    expect(res.refused).toBe(false);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(false);
    // The migrated data survives the drop intact.
    expect(await db.collection(TARGET_COLLECTION).countDocuments({})).toBe(3);
  });

  it('a second --drop-source is a no-op, not an error', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    await dropSource(db, { apply: true, log: silent });

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.alreadyDropped).toBe(true);
    expect(res.dropped).toBe(false);
    expect(res.refused).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Senior Developer Review patches (2026-08-16). Each block below is the test
// that proves one review finding is actually fixed.
// ══════════════════════════════════════════════════════════════════════════

// ── P1: the source-shape guard ─────────────────────────────────────────────
//
// cm-2b renames `downtime_cycles` -> `chapters`. Re-running this script after
// that would copy live game cycles into `story_cycles` and then let
// `--drop-source` delete the entire live cycle data set.

/** What `chapters` holds AFTER cm-2b: real downtime cycles. */
function downtimeCycleShapedSource() {
  return [
    { _id: new ObjectId(ID1), label: 'Downtime 5', game_number: 5, game_phase: 'processing', status: 'closed' },
    { _id: new ObjectId(ID2), label: 'Downtime 6', game_number: 6, phase: 'open', status: 'active' },
  ];
}

describe('cm-2 — P1 source-shape guard', () => {
  it('fires on a downtime-cycle-shaped source document', () => {
    const refusals = sourceShapeRefusals(downtimeCycleShapedSource());
    expect(refusals).toHaveLength(2);
    expect(refusals.every(r => r.kind === 'source-shape')).toBe(true);
    // The message must distinguish this from the in-progress-migration refusals.
    expect(refusals[0].detail).toContain('DOES NOT LOOK LIKE THE COLLECTION THIS SCRIPT WAS BUILT FOR');
    expect(refusals[0].detail).toContain('game_number');
  });

  it('does NOT fire on the real Story-grouping shape', () => {
    expect(sourceShapeRefusals(sourceFixture())).toEqual([]);
    // Nor on a Story-grouping whose label is ST-authored prose.
    const prose = sourceFixture();
    prose[1].label = 'Chapter Two: The Price of Power';
    expect(sourceShapeRefusals(prose)).toEqual([]);
  });

  it('planRename refuses outright and plans nothing when the source is wrong-shaped', async () => {
    await seed({ source: downtimeCycleShapedSource(), cycles: [] });

    const plan = await planRename(db);
    expect(plan.wrongSourceShape).toBe(true);
    expect(plan.refusals.some(r => r.kind === 'source-shape')).toBe(true);
    // Nothing is planned over a collection we do not understand.
    expect(plan.copies).toEqual([]);
    expect(plan.fieldRenames).toEqual([]);
  });

  it('applyRename copies nothing against a wrong-shaped source', async () => {
    // The real post-cm-2b state, which is what makes this dangerous: cm-2b has
    // renamed `downtime_cycles` -> `chapters`, so there are no `downtime_cycles`
    // documents left to trip the dangling-reference refusal. NOTHING else in
    // the plan logic finds these documents suspicious - `{ label: 'Downtime 5',
    // number: undefined }` matches no other refusal. Only the shape guard does.
    await seed({ source: downtimeCycleShapedSource(), cycles: [] });

    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(res.refused).toBeGreaterThan(0);
    expect(res.copied).toBe(0);
    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
  });

  it('leaves live downtime cycles untouched when the source is wrong-shaped', async () => {
    await seed({ source: downtimeCycleShapedSource(), cycles: cycleFixture() });

    await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(7);
  });

  it('dropSource refuses against a wrong-shaped source, so the collection survives', async () => {
    await seed({ source: downtimeCycleShapedSource(), cycles: [] });
    // Make every other drop gate pass, so ONLY the shape guard can refuse.
    await db.collection(TARGET_COLLECTION).insertMany(downtimeCycleShapedSource());

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.dropped).toBe(false);
    expect(res.problems.join(' ')).toContain('DOES NOT LOOK LIKE THE COLLECTION THIS SCRIPT WAS BUILT FOR');
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });
});

// ── P2: --drop-source gates on ID existence, not content equality ──────────
//
// By drop time, `story_cycles` has been the live, actively-edited copy for a
// whole burn-in. An ST renaming a Story is the system working, not a fault.

describe('cm-2 — P2 drop gate', () => {
  it('drops after a target label was legitimately renamed during the burn-in', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    // Exactly what the script's own advice tells the ST to do: rename a Story
    // in the Cycle tab. Content now differs from the source; the _id does not.
    await db.collection(TARGET_COLLECTION).updateOne(
      { _id: new ObjectId(ID1) },
      { $set: { label: 'The Long Night' } },
    );

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(false);
    expect(res.dropped).toBe(true);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(false);
    // The ST's rename survived the drop.
    const kept = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(ID1) });
    expect(kept.label).toBe('The Long Night');
  });

  it('drops after a target `number` was legitimately edited too (whole-body drift)', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    await db.collection(TARGET_COLLECTION).updateOne(
      { _id: new ObjectId(ID2) },
      { $set: { number: 9, label: 'Story 9', st_note: 'renumbered by hand' } },
    );

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(false);
    expect(res.dropped).toBe(true);
  });

  it('still REFUSES when a source _id has no corresponding target document', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    // Real data loss: the copy of ID3 is gone while the source still holds it.
    await db.collection(TARGET_COLLECTION).deleteOne({ _id: new ObjectId(ID3) });

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.dropped).toBe(false);
    expect(res.problems.join(' ')).toContain(ID3);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });
});

// ── P3: --prefer-new recovery from the both-fields deploy window ───────────

describe('cm-2 — P3 --prefer-new recovery', () => {
  it('still refuses a both-fields document by default (opt-in, never automatic)', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'both-fields')).toBe(true);
    expect(plan.bothFieldResolutions).toEqual([]);
    // and the refusal now names the way out
    expect(plan.refusals.find(r => r.kind === 'both-fields').detail).toContain('--prefer-new');
  });

  it('plans a resolution instead of a refusal, and writes nothing on a dry run', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });

    const plan = await planRename(db, { preferNew: true });
    expect(plan.refusals).toEqual([]);
    expect(plan.bothFieldResolutions).toHaveLength(1);
    expect(plan.bothFieldResolutions[0]).toMatchObject({ keep: ID2, discard: ID1, clearsGrouping: false });

    await applyRename(db, plan, { apply: false, log: silent });
    const untouched = await db.collection(CYCLES_COLLECTION).findOne({ _cm2_fixture: true, game_number: 1 });
    expect(untouched[OLD_FIELD]).toBe(ID1);
    expect(untouched[NEW_FIELD]).toBe(ID2);
  });

  it('clears the stale old field, never touches the new one, and verifies', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });

    const plan = await planRename(db, { preferNew: true });
    const res = await applyRename(db, plan, { apply: true, log: silent });

    expect(res.staleFieldsCleared).toBe(1);
    expect(res.refused).toBe(0);
    const fixed = await db.collection(CYCLES_COLLECTION).findOne({ _cm2_fixture: true, game_number: 1 });
    expect(OLD_FIELD in fixed).toBe(false);
    expect(fixed[NEW_FIELD]).toBe(ID2); // the deployed app's value, unaltered
    expect(await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(0);
    expect(res.verified.ok).toBe(true);
  });

  it('flags the null-survivor case, where the ST cleared the grouping in the deploy window', async () => {
    const cycles = cycleFixture();
    // The realistic shape: in the deploy/migrate window the Story dropdown is
    // empty, so the only thing an ST can pick is "none".
    cycles[0][NEW_FIELD] = null;
    await seed({ cycles });

    const plan = await planRename(db, { preferNew: true });
    expect(plan.bothFieldResolutions[0]).toMatchObject({ keep: null, discard: ID1, clearsGrouping: true });

    const lines = [];
    await applyRename(db, plan, { apply: true, log: m => lines.push(m) });
    expect(lines.join('\n')).toContain('UNGROUPED');

    const cleared = await db.collection(CYCLES_COLLECTION).findOne({ _cm2_fixture: true, game_number: 1 });
    expect(OLD_FIELD in cleared).toBe(false);
    expect(cleared[NEW_FIELD]).toBeNull();
  });

  it('a second --prefer-new run is a no-op', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });
    await applyRename(db, await planRename(db, { preferNew: true }), { apply: true, log: silent });

    const second = await planRename(db, { preferNew: true });
    expect(second.bothFieldResolutions).toEqual([]);
    expect(second.copies).toEqual([]);
    expect(second.fieldRenames).toEqual([]);
    expect(second.refusals).toEqual([]);
  });
});

// ── P5: the $rename is scoped to the planned document set ──────────────────

describe('cm-2 — P5 scoped $rename', () => {
  it('leaves a document that acquired chapter_id between plan and apply alone', async () => {
    await seed();
    const plan = await planRename(db);
    expect(plan.fieldRenames).toHaveLength(7);

    // Arrives after planning, carrying BOTH fields — so it never passed the
    // both-fields or dangling-ref checks. An unscoped $rename would overwrite
    // its story_cycle_id (ID2) with its chapter_id (ID1) and lose the grouping.
    const interloper = await db.collection(CYCLES_COLLECTION).insertOne({
      label: 'Downtime 8', game_number: 8, _cm2_fixture: true,
      [OLD_FIELD]: ID1, [NEW_FIELD]: ID2,
    });

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.fieldsRenamed).toBe(7); // the seven planned, not eight

    const after = await db.collection(CYCLES_COLLECTION).findOne({ _id: interloper.insertedId });
    expect(after[OLD_FIELD]).toBe(ID1);   // untouched
    expect(after[NEW_FIELD]).toBe(ID2);   // NOT clobbered

    // And the leftover is reported rather than swept under the carpet.
    expect(res.verified.ok).toBe(false);
    expect(res.verified.problems.join(' ')).toContain(OLD_FIELD);
  });
});

// ── P6: labels are never fabricated or coerced ─────────────────────────────

describe('cm-2 — P6 label coercion', () => {
  it('planLabel returns a missing label as missing, not as an empty string', () => {
    expect(planLabel({ number: 4 })).toEqual({ action: 'kept', label: undefined });
    expect(planLabel({ number: 5, label: 42 })).toEqual({ action: 'kept', label: 42 });
  });

  it('copies a label-less document without fabricating a label field', async () => {
    const source = [
      ...sourceFixture(),
      { _id: new ObjectId('6a1111111111111111111111'), number: 4, created_at: '2026-08-16T00:00:00.000Z' },
    ];
    await seed({ source });

    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const copied = await db.collection(TARGET_COLLECTION).findOne({ number: 4 });
    expect(copied).toBeTruthy();
    expect('label' in copied).toBe(false);
  });

  it('preserves a non-string label verbatim rather than destroying it', async () => {
    const source = [
      ...sourceFixture(),
      { _id: new ObjectId('6a2222222222222222222222'), number: 5, label: 42 },
    ];
    await seed({ source });

    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const copied = await db.collection(TARGET_COLLECTION).findOne({ number: 5 });
    expect(copied.label).toBe(42);
  });
});

// ── P12: main() / argv parsing ─────────────────────────────────────────────
//
// main() owns the flag parsing and the dispatch, and had no coverage at all.
// It resolves its own db handle, so these run against `tm_suite_test` (forced
// by setup-env.js) and reconnect afterwards, because main() closes the shared
// connection in its `finally`.

describe('cm-2 — P12 main() argv parsing', () => {
  let logSpy;
  let priorExitCode;

  beforeEach(() => {
    priorExitCode = process.exitCode;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    // main() closes the shared client in its finally block.
    await connectDb();
    db = getDb();
    process.exitCode = priorExitCode;
  });

  const out = () => logSpy.mock.calls.map(c => c.join(' ')).join('\n');

  it('defaults to a dry run: announces DRY RUN and writes nothing', async () => {
    await seed();
    await main(['node', 'script.mjs']);

    expect(out()).toContain('DRY RUN');
    expect(out()).toContain('Re-run with --apply to write.');
    await connectDb();
    expect(await getDb().collection(TARGET_COLLECTION).countDocuments({})).toBe(0);
    expect(await getDb().collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } })).toBe(7);
  });

  it('--apply dispatches the rename with apply=true', async () => {
    await seed();
    await main(['node', 'script.mjs', '--apply']);

    expect(out()).toContain('APPLY (will write)');
    expect(out()).toContain('3 copied');
    await connectDb();
    expect(await getDb().collection(TARGET_COLLECTION).countDocuments({})).toBe(3);
    expect(await getDb().collection(CYCLES_COLLECTION).countDocuments({ [NEW_FIELD]: { $exists: true } })).toBe(7);
    // --apply alone must NEVER drop the source.
    expect(await getDb().listCollections({ name: SOURCE_COLLECTION }).toArray()).toHaveLength(1);
  });

  it('--drop-source without --apply is a dry run: reports, drops nothing', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    await main(['node', 'script.mjs', '--drop-source']);

    expect(out()).toContain('DROP SOURCE');
    expect(out()).toContain('Re-run with --drop-source --apply to drop.');
    await connectDb();
    expect(await getDb().listCollections({ name: SOURCE_COLLECTION }).toArray()).toHaveLength(1);
  });

  it('--drop-source --apply drops, and a second run reports "Already dropped"', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    await main(['node', 'script.mjs', '--drop-source', '--apply']);
    expect(out()).toContain(`Dropped ${SOURCE_COLLECTION}`);
    await connectDb();
    expect(await getDb().listCollections({ name: SOURCE_COLLECTION }).toArray()).toHaveLength(0);

    logSpy.mockClear();
    await main(['node', 'script.mjs', '--drop-source', '--apply']);
    expect(out()).toContain('Already dropped');
  });

  it('--prefer-new is parsed and passed through to the plan', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });

    await main(['node', 'script.mjs', '--prefer-new', '--apply']);
    expect(out()).toContain('--prefer-new');
    expect(out()).toContain('1 stale field(s) cleared');

    await connectDb();
    const fixed = await getDb().collection(CYCLES_COLLECTION).findOne({ _cm2_fixture: true, game_number: 1 });
    expect(OLD_FIELD in fixed).toBe(false);
    expect(fixed[NEW_FIELD]).toBe(ID2);
  });

  it('without --prefer-new the same state refuses and sets a non-zero exit code', async () => {
    const cycles = cycleFixture();
    cycles[0][NEW_FIELD] = ID2;
    await seed({ cycles });

    await main(['node', 'script.mjs', '--apply']);
    expect(out()).toContain('NOTHING was written');
    expect(out()).toContain('--prefer-new');
    expect(process.exitCode).toBe(1);

    await connectDb();
    expect(await getDb().collection(TARGET_COLLECTION).countDocuments({})).toBe(0);
  });
});
