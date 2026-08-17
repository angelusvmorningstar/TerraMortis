/**
 * cm-2b — live-DB integration tests for the downtime_cycles -> chapters
 * migration.
 *
 * Runs against `tm_suite_test` (forced by tests/helpers/setup-env.js; setupDb()
 * additionally refuses any database whose name does not end `_test`). It
 * exercises the script's EXPORTED FUNCTIONS and never shells out, so nothing
 * here can reach live Atlas.
 *
 * The fixtures mirror the real live shape: a handful of Chapter documents
 * carrying `phase`/`game_number`/`status`, and `downtime_submissions` pointing
 * at them via `cycle_id` — deliberately MIXED-TYPE (ObjectId on DT2+, plain
 * string on DT1), which is the still-unresolved issue #497 split.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { connectDb, getDb } from '../db.js';
import {
  planRename,
  applyRename,
  verifyRename,
  dropSource,
  sourceShapeRefusals,
  targetShapeRefusals,
  targetPhantomRefusals,
  isStoryGroupingShaped,
  canonicalJSON,
  bodyDifferences,
  missingIndexes,
  BURN_IN_MUTABLE_FIELDS,
  main,
  SOURCE_COLLECTION,
  TARGET_COLLECTION,
  OLD_FIELD,
  NEW_FIELD,
  SUBMISSIONS_COLLECTION,
} from '../scripts/cm-2b-downtime-cycles-to-chapters.mjs';

let db;
const silent = () => {};

// Live-shaped ids.
const ID1 = '6b2a8760b3a2b71081036de1';
const ID2 = '6b35cb3defee90c8c11fff62';
const ID3 = '6b7ff93d4f02ce8035b75d53';

const FIXTURE = '_cm2b_fixture';

/** Three Chapters, exactly the shape `downtime_cycles` holds. */
function sourceFixture() {
  return [
    { _id: new ObjectId(ID1), label: 'Downtime 5', game_number: 5, status: 'closed', phase: 'game', [FIXTURE]: true },
    { _id: new ObjectId(ID2), label: 'Downtime 6', game_number: 6, status: 'closed', phase: 'game', [FIXTURE]: true },
    { _id: new ObjectId(ID3), label: 'Downtime 7', game_number: 7, status: 'active', phase: 'downtime', [FIXTURE]: true },
  ];
}

/**
 * Six submissions grouped 3 / 2 / 1. The first group is stored as plain
 * STRINGS (the DT1 shape) and the rest as ObjectIds (DT2+), so every test here
 * exercises the issue #497 mixed-type split rather than assuming one type.
 */
function submissionFixture() {
  const groups = [[ID1, 3, 'string'], [ID2, 2, 'oid'], [ID3, 1, 'oid']];
  const docs = [];
  let n = 0;
  for (const [cycleId, count, storage] of groups) {
    for (let i = 0; i < count; i++) {
      n += 1;
      docs.push({
        character_id: new ObjectId(),
        character_name: `Fixture ${n}`,
        status: 'submitted',
        [OLD_FIELD]: storage === 'string' ? cycleId : new ObjectId(cycleId),
        [FIXTURE]: true,
      });
    }
  }
  return docs;
}

/** What cm-2's OLD `chapters` collection held: Story-groupings. */
function storyGroupingDocs() {
  return [
    { _id: new ObjectId(ID1), number: 1, label: 'Story 1', created_at: '2026-06-11T10:01:04.071Z' },
    { _id: new ObjectId(ID2), number: 2, label: 'Story 2', created_at: '2026-06-19T23:05:33.831Z' },
  ];
}

async function seed({ source = sourceFixture(), subs = submissionFixture() } = {}) {
  if (source.length) await db.collection(SOURCE_COLLECTION).insertMany(source);
  if (subs.length) await db.collection(SUBMISSIONS_COLLECTION).insertMany(subs);
}

async function collectionExists(name) {
  const found = await db.listCollections({ name }).toArray();
  return found.length > 0;
}

/**
 * FIXTURE-SCOPED teardown, narrowed 2026-08-17 after review.
 *
 * This used to run an UNSCOPED `deleteMany` matching any submission that had
 * either FK field at all — i.e. every downtime submission ANY suite had seeded
 * in the shared `tm_suite_test`, not just this one's. `cm-2`'s own precedent
 * test scopes its cleanup to `{_cm2_fixture: true}`; this now matches, plus the
 * three fixture Chapter ids in both storage forms, which catches a fixture
 * document that lost its marker (the `--prefer-new` and interloper cases insert
 * submissions inline).
 *
 * The two CYCLE collections are still dropped outright: `downtime_cycles` has
 * no other consumer at all post-cm-2b, and `chapters` is dropped at the START
 * of each test in a `fileParallelism: false, maxWorkers: 1` runner, so no other
 * suite is mid-flight when it happens.
 */
const FIXTURE_REFS = [ID1, ID2, ID3].flatMap(id => [id, new ObjectId(id)]);

/** `plan.expectedCounts` narrowed to this suite's own three Chapters. */
function fixtureCounts(plan) {
  const out = {};
  for (const id of [ID1, ID2, ID3]) {
    if (plan.expectedCounts.has(id)) out[id] = plan.expectedCounts.get(id);
  }
  return out;
}

async function wipe() {
  for (const name of [SOURCE_COLLECTION, TARGET_COLLECTION]) {
    if (await collectionExists(name)) await db.collection(name).drop();
  }
  await db.collection(SUBMISSIONS_COLLECTION).deleteMany({
    $or: [
      { [FIXTURE]: true },
      { [OLD_FIELD]: { $in: FIXTURE_REFS } },
      { [NEW_FIELD]: { $in: FIXTURE_REFS } },
    ],
  });
}

beforeAll(async () => {
  await setupDb();
  db = getDb();
});

beforeEach(wipe);

afterAll(async () => {
  await wipe();
  await teardownDb();
});

// ── The no-shebang landmine ────────────────────────────────────────────────

describe('cm-2b — script file conventions', () => {
  it('has no shebang (vitest cannot transform one, and this file is imported)', () => {
    const src = fs.readFileSync('./scripts/cm-2b-downtime-cycles-to-chapters.mjs', 'utf8');
    expect(src.startsWith('#!')).toBe(false);
  });

  it('is guarded so importing it never auto-runs main()', () => {
    const src = fs.readFileSync('./scripts/cm-2b-downtime-cycles-to-chapters.mjs', 'utf8');
    expect(src).toContain('import.meta.url === pathToFileURL(process.argv[1]).href');
  });

  it('renames the collection but NOT downtime_submissions itself', () => {
    expect(SOURCE_COLLECTION).toBe('downtime_cycles');
    expect(TARGET_COLLECTION).toBe('chapters');
    expect(SUBMISSIONS_COLLECTION).toBe('downtime_submissions');
    expect(OLD_FIELD).toBe('cycle_id');
    expect(NEW_FIELD).toBe('chapter_id');
  });
});

// ── Shape discrimination (pure) ────────────────────────────────────────────

describe('cm-2b — isStoryGroupingShaped', () => {
  it('recognises a cm-2-era Story-grouping', () => {
    expect(storyGroupingDocs().every(isStoryGroupingShaped)).toBe(true);
  });

  it('recognises a cm-3-era Story-grouping carrying final_chapter_id', () => {
    expect(isStoryGroupingShaped({
      _id: new ObjectId(ID1), number: 1, label: 'Story 1',
      created_at: '2026-06-11T10:01:04.071Z', final_chapter_id: ID2,
    })).toBe(true);
  });

  it('does NOT fire on a real Chapter', () => {
    expect(sourceFixture().some(isStoryGroupingShaped)).toBe(false);
  });

  it('does NOT fire on a bare {_id} document (no evidence either way)', () => {
    expect(isStoryGroupingShaped({ _id: new ObjectId(ID1) })).toBe(false);
  });

  it('does NOT fire on a Story-shaped document that also carries a Chapter marker', () => {
    expect(isStoryGroupingShaped({ _id: new ObjectId(ID1), number: 1, label: 'Story 1', phase: 'game' })).toBe(false);
  });

  it('does NOT fire on a document carrying keys outside the Story-grouping set', () => {
    expect(isStoryGroupingShaped({ _id: new ObjectId(ID1), number: 1, label: 'x', joint_projects: [] })).toBe(false);
  });
});

// ── Dry run ────────────────────────────────────────────────────────────────

describe('cm-2b — dry run', () => {
  it('writes nothing at all', async () => {
    await seed();
    const plan = await planRename(db);
    expect(plan.copies).toHaveLength(3);
    expect(plan.fieldRenames).toHaveLength(6);

    await applyRename(db, plan, { apply: false, log: silent });

    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
    // Counts are FIXTURE-SCOPED since the teardown was narrowed (review,
    // 2026-08-17). `tm_suite_test` is shared, and this suite is no longer the
    // janitor for every other suite's leftover submissions.
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [NEW_FIELD]: { $exists: true } })).toBe(0);
  });

  it('makes the affected-document count explicit and countable (AC2)', async () => {
    await seed();
    const plan = await planRename(db);
    expect(plan.sourceCount).toBe(3);
    expect(plan.targetCount).toBe(0);
    expect(plan.fieldRenames).toHaveLength(6);
    // Grouped 3 / 2 / 1 across the three Chapters, counted by string key so the
    // mixed ObjectId/string storage does not split a group in two. Scoped to
    // this suite's own three Chapters: `expectedCounts` is collection-wide by
    // design, and other suites leave `chapter_id`-carrying submissions behind.
    expect(fixtureCounts(plan)).toEqual({ [ID1]: 3, [ID2]: 2, [ID3]: 1 });
  });
});

// ── Apply ──────────────────────────────────────────────────────────────────

describe('cm-2b — applyRename', () => {
  it('copies every document preserving _id VERBATIM', async () => {
    await seed();
    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });

    expect(res.copied).toBe(3);
    const copied = await db.collection(TARGET_COLLECTION).find({}).toArray();
    expect(copied.map(d => String(d._id)).sort()).toEqual([ID1, ID2, ID3].sort());
  });

  it('carries every other field across verbatim, label included (no relabel)', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const copied = await db.collection(TARGET_COLLECTION).find({}).sort({ game_number: 1 }).toArray();
    expect(copied.map(d => d.label)).toEqual(['Downtime 5', 'Downtime 6', 'Downtime 7']);
    expect(copied.map(d => d.phase)).toEqual(['game', 'game', 'downtime']);
    expect(copied.map(d => d.status)).toEqual(['closed', 'closed', 'active']);
  });

  it('leaves the source collection completely untouched (rollback stays free)', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const src = await db.collection(SOURCE_COLLECTION).find({}).toArray();
    expect(src).toHaveLength(3);
  });

  it(`renames ${OLD_FIELD} to ${NEW_FIELD} on every submission, preserving the value exactly`, async () => {
    await seed();
    const before = await db.collection(SUBMISSIONS_COLLECTION).find({ [FIXTURE]: true }).sort({ character_name: 1 }).toArray();
    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });

    expect(res.fieldsRenamed).toBe(6);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(0);

    const after = await db.collection(SUBMISSIONS_COLLECTION).find({ [FIXTURE]: true }).sort({ character_name: 1 }).toArray();
    expect(after).toHaveLength(6);
    for (let i = 0; i < after.length; i++) {
      // The value moves, its content and BSON TYPE do not change.
      expect(after[i][NEW_FIELD]).toEqual(before[i][OLD_FIELD]);
      expect(typeof after[i][NEW_FIELD]).toBe(typeof before[i][OLD_FIELD]);
    }
    // And the mixed-type split survives intact: three strings, three ObjectIds.
    expect(after.filter(d => typeof d[NEW_FIELD] === 'string')).toHaveLength(3);
    expect(after.filter(d => d[NEW_FIELD] instanceof ObjectId)).toHaveLength(3);
  });

  it('leaves the FK resolvable end to end (3 / 2 / 1, unchanged)', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const grouped = {};
    for (const sub of await db.collection(SUBMISSIONS_COLLECTION).find({ [FIXTURE]: true }).toArray()) {
      const chapter = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(String(sub[NEW_FIELD])) });
      expect(chapter).toBeTruthy();
      grouped[chapter.game_number] = (grouped[chapter.game_number] || 0) + 1;
    }
    expect(grouped).toEqual({ 5: 3, 6: 2, 7: 1 });
  });

  it('verifies after writing', async () => {
    await seed();
    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(res.verified.ok).toBe(true);
    expect(res.verified.problems).toEqual([]);
  });
});

// ── Idempotency ────────────────────────────────────────────────────────────

describe('cm-2b — idempotency', () => {
  it('a second --apply copies nothing and renames no fields', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const second = await planRename(db);
    expect(second.copies).toEqual([]);
    expect(second.fieldRenames).toEqual([]);
    expect(second.refusals).toEqual([]);
    expect(second.noops).toHaveLength(3);

    const res = await applyRename(db, second, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(res.fieldsRenamed).toBe(0);
    expect(res.refused).toBe(0);
    expect(res.verified.ok).toBe(true);
  });
});

// ── Refusals ───────────────────────────────────────────────────────────────

describe('cm-2b — refusals', () => {
  it('refuses when chapters holds a DIFFERING document under the same _id', async () => {
    await seed();
    await db.collection(TARGET_COLLECTION).insertOne({
      _id: new ObjectId(ID1), label: 'Something else entirely', game_number: 99, status: 'closed',
    });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'target-differs')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.refused).toBeGreaterThan(0);
    expect(res.copied).toBe(0);
    const imposter = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(ID1) });
    expect(imposter.game_number).toBe(99);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
    expect(await db.collection(TARGET_COLLECTION).countDocuments({})).toBe(1);
  });

  it('refuses when a submission carries BOTH fields', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'both-fields')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
  });

  it('refuses on a dangling reference', async () => {
    const subs = submissionFixture();
    subs[5][OLD_FIELD] = new ObjectId('6b0000000000000000000000');
    await seed({ subs });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'dangling-ref')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
  });
});

// ── The shape guards ───────────────────────────────────────────────────────

describe('cm-2b — source-shape guard', () => {
  it('fires on a Story-grouping-shaped source document', () => {
    const refusals = sourceShapeRefusals(storyGroupingDocs());
    expect(refusals).toHaveLength(2);
    expect(refusals.every(r => r.kind === 'source-shape')).toBe(true);
    expect(refusals[0].detail).toContain('DOES NOT LOOK LIKE THE COLLECTION THIS SCRIPT WAS BUILT FOR');
  });

  it('does NOT fire on the real Chapter shape', () => {
    expect(sourceShapeRefusals(sourceFixture())).toEqual([]);
  });

  it('planRename refuses outright and plans nothing when the source is wrong-shaped', async () => {
    await seed({ source: storyGroupingDocs(), subs: [] });

    const plan = await planRename(db);
    expect(plan.wrongShape).toBe(true);
    expect(plan.refusals.some(r => r.kind === 'source-shape')).toBe(true);
    expect(plan.copies).toEqual([]);
    expect(plan.fieldRenames).toEqual([]);
  });

  it('applyRename copies nothing against a wrong-shaped source', async () => {
    await seed({ source: storyGroupingDocs(), subs: [] });
    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(res.refused).toBeGreaterThan(0);
    expect(res.copied).toBe(0);
    expect(await collectionExists(TARGET_COLLECTION)).toBe(false);
  });
});

describe('cm-2b — target-shape guard (cm-2 sequencing gate, enforced mechanically)', () => {
  it('fires on a chapters collection still holding cm-2 Story-groupings', () => {
    const refusals = targetShapeRefusals(storyGroupingDocs());
    expect(refusals).toHaveLength(2);
    expect(refusals.every(r => r.kind === 'target-shape')).toBe(true);
    expect(refusals[0].detail).toContain("cm-2's --drop-source has NOT run");
  });

  it('does NOT fire on already-migrated Chapters', () => {
    expect(targetShapeRefusals(sourceFixture())).toEqual([]);
  });

  it('planRename refuses when cm-2 has not finished, and plans nothing', async () => {
    await seed();
    // cm-2's --drop-source never ran: `chapters` is still cm-2's own collection.
    await db.collection(TARGET_COLLECTION).insertMany(storyGroupingDocs());

    const plan = await planRename(db);
    expect(plan.wrongShape).toBe(true);
    expect(plan.refusals.some(r => r.kind === 'target-shape')).toBe(true);
    expect(plan.copies).toEqual([]);
    expect(plan.fieldRenames).toEqual([]);
  });

  it('applyRename writes nothing, so the Story-groupings survive intact', async () => {
    await seed();
    await db.collection(TARGET_COLLECTION).insertMany(storyGroupingDocs());

    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(res.refused).toBeGreaterThan(0);
    expect(res.copied).toBe(0);
    const survivors = await db.collection(TARGET_COLLECTION).find({}).sort({ number: 1 }).toArray();
    expect(survivors.map(d => d.label)).toEqual(['Story 1', 'Story 2']);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
  });

  it('dropSource refuses too, so downtime_cycles survives', async () => {
    await seed({ subs: [] });
    await db.collection(TARGET_COLLECTION).insertMany(storyGroupingDocs());

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.dropped).toBe(false);
    expect(res.problems.join(' ')).toContain("cm-2's --drop-source has NOT run");
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });
});

// ── verifyRename ───────────────────────────────────────────────────────────

describe('cm-2b — verifyRename', () => {
  it('fails when a submission lost its Chapter after the rename', async () => {
    await seed();
    const plan = await planRename(db);
    await applyRename(db, plan, { apply: true, log: silent });

    await db.collection(SUBMISSIONS_COLLECTION).updateOne(
      { [FIXTURE]: true, character_name: 'Fixture 6' },
      { $set: { [NEW_FIELD]: null } },
    );
    const verified = await verifyRename(db, plan);
    expect(verified.ok).toBe(false);
    expect(verified.problems.join(' ')).toContain(ID3);
  });

  it('fails when a Chapter is missing from the target', async () => {
    await seed();
    const plan = await planRename(db);
    await applyRename(db, plan, { apply: true, log: silent });

    await db.collection(TARGET_COLLECTION).deleteOne({ _id: new ObjectId(ID2) });
    const verified = await verifyRename(db, plan);
    expect(verified.ok).toBe(false);
    expect(verified.problems.join(' ')).toContain(ID2);
  });
});

// ── dropSource: the three refusal guards ───────────────────────────────────

describe('cm-2b — dropSource', () => {
  it('GUARD 1: refuses while chapters is empty', async () => {
    await seed();
    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.dropped).toBe(false);
    expect(res.problems.join(' ')).toContain('is empty');
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });

  it('GUARD 2: refuses when a source _id has no corresponding chapters document', async () => {
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

  it('GUARD 3: refuses while submissions still carry the old field', async () => {
    await seed();
    // Copy the documents across but leave the field rename undone.
    const plan = await planRename(db);
    for (const row of plan.copies) {
      const { _id, ...fields } = row.doc;
      await db.collection(TARGET_COLLECTION).insertOne({ _id, ...fields });
    }
    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.problems.join(' ')).toContain(OLD_FIELD);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });

  it('is a dry run by default even once every guard passes', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const res = await dropSource(db, { apply: false, log: silent });
    expect(res.dropped).toBe(false);
    expect(res.refused).toBe(false);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });

  it('drops the source once verification passes, and the data survives', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.dropped).toBe(true);
    expect(res.refused).toBe(false);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(false);
    expect(await db.collection(TARGET_COLLECTION).countDocuments({})).toBe(3);
  });

  it('drops after a Chapter was legitimately edited during the burn-in', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    // The system working: an ST advances the live Chapter's phase.
    await db.collection(TARGET_COLLECTION).updateOne(
      { _id: new ObjectId(ID3) },
      { $set: { phase: 'processing', label: 'Downtime 7 (renamed)' } },
    );

    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(false);
    expect(res.dropped).toBe(true);
    const kept = await db.collection(TARGET_COLLECTION).findOne({ _id: new ObjectId(ID3) });
    expect(kept.phase).toBe('processing');
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

// ── --prefer-new recovery from the both-fields deploy window ───────────────

describe('cm-2b — --prefer-new recovery', () => {
  it('still refuses a both-fields document by default (opt-in, never automatic)', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'both-fields')).toBe(true);
    expect(plan.bothFieldResolutions).toEqual([]);
    expect(plan.refusals.find(r => r.kind === 'both-fields').detail).toContain('--prefer-new');
  });

  it('plans a resolution instead of a refusal, and writes nothing on a dry run', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });

    const plan = await planRename(db, { preferNew: true });
    expect(plan.refusals).toEqual([]);
    expect(plan.bothFieldResolutions).toHaveLength(1);
    expect(plan.bothFieldResolutions[0]).toMatchObject({ keep: ID2, discard: ID1, clearsGrouping: false });

    await applyRename(db, plan, { apply: false, log: silent });
    const untouched = await db.collection(SUBMISSIONS_COLLECTION).findOne({ [FIXTURE]: true, character_name: 'Fixture 1' });
    expect(String(untouched[OLD_FIELD])).toBe(ID1);
    expect(String(untouched[NEW_FIELD])).toBe(ID2);
  });

  it('clears the stale old field, never touches the new one, and verifies', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });

    const res = await applyRename(db, await planRename(db, { preferNew: true }), { apply: true, log: silent });

    expect(res.staleFieldsCleared).toBe(1);
    expect(res.refused).toBe(0);
    const fixed = await db.collection(SUBMISSIONS_COLLECTION).findOne({ [FIXTURE]: true, character_name: 'Fixture 1' });
    expect(OLD_FIELD in fixed).toBe(false);
    expect(String(fixed[NEW_FIELD])).toBe(ID2);   // the deployed app's value, unaltered
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(0);
    expect(res.verified.ok).toBe(true);
  });

  it('flags the null-survivor case, where the submission comes out unattached', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = null;
    await seed({ subs });

    const plan = await planRename(db, { preferNew: true });
    expect(plan.bothFieldResolutions[0]).toMatchObject({ keep: null, discard: ID1, clearsGrouping: true });

    const lines = [];
    await applyRename(db, plan, { apply: true, log: m => lines.push(m) });
    expect(lines.join('\n')).toContain('ATTACHED TO NO CHAPTER');

    const cleared = await db.collection(SUBMISSIONS_COLLECTION).findOne({ [FIXTURE]: true, character_name: 'Fixture 1' });
    expect(OLD_FIELD in cleared).toBe(false);
    expect(cleared[NEW_FIELD]).toBeNull();
  });

  it('a second --prefer-new run is a no-op', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });
    await applyRename(db, await planRename(db, { preferNew: true }), { apply: true, log: silent });

    const second = await planRename(db, { preferNew: true });
    expect(second.bothFieldResolutions).toEqual([]);
    expect(second.copies).toEqual([]);
    expect(second.fieldRenames).toEqual([]);
    expect(second.refusals).toEqual([]);
  });
});

// ── The $rename is scoped to the planned document set ──────────────────────

describe('cm-2b — scoped $rename', () => {
  it('leaves a submission that acquired cycle_id between plan and apply alone', async () => {
    await seed();
    const plan = await planRename(db);
    expect(plan.fieldRenames).toHaveLength(6);

    // Arrives after planning, carrying BOTH fields — so it never passed the
    // both-fields or dangling-ref checks. An unscoped $rename would overwrite
    // its chapter_id (ID2) with its cycle_id (ID1) and lose the attachment.
    const interloper = await db.collection(SUBMISSIONS_COLLECTION).insertOne({
      character_name: 'Interloper', status: 'draft', [FIXTURE]: true,
      [OLD_FIELD]: new ObjectId(ID1), [NEW_FIELD]: new ObjectId(ID2),
    });

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.fieldsRenamed).toBe(6); // the six planned, not seven

    const after = await db.collection(SUBMISSIONS_COLLECTION).findOne({ _id: interloper.insertedId });
    expect(String(after[OLD_FIELD])).toBe(ID1);   // untouched
    expect(String(after[NEW_FIELD])).toBe(ID2);   // NOT clobbered

    // Review fix (2026-08-17): verify does NOT raise a false alarm over it.
    // The interloper is exactly the "a player pressed Save during --apply"
    // case, and the old unscoped verify answered it with
    // "Verification FAILED after writing. Do NOT run --drop-source" —
    // indistinguishable, at the console, from real data loss.
    expect(res.verified.ok).toBe(true);
    expect(res.verified.problems).toEqual([]);
  });

  it('but dropSource — the gate that matters — still refuses over that leftover', async () => {
    await seed();
    const plan = await planRename(db);
    await db.collection(SUBMISSIONS_COLLECTION).insertOne({
      character_name: 'Interloper', status: 'draft', [FIXTURE]: true,
      [OLD_FIELD]: new ObjectId(ID1), [NEW_FIELD]: new ObjectId(ID2),
    });
    await applyRename(db, plan, { apply: true, log: silent });

    // verifyRename is scoped to the plan's own snapshot; dropSource's guard 3
    // is a deliberately UNSCOPED full-collection sweep, so the narrowing above
    // loses no safety at the destructive step.
    const res = await dropSource(db, { apply: true, log: silent });
    expect(res.refused).toBe(true);
    expect(res.dropped).toBe(false);
    expect(res.problems.join(' ')).toContain(OLD_FIELD);
    expect(await collectionExists(SOURCE_COLLECTION)).toBe(true);
  });
});

// ── main() / argv parsing ──────────────────────────────────────────────────
//
// AC10 (the #826 post-mortem rule): a test drives the script's REAL main(),
// not just its internal functions. main() resolves its own db handle, so these
// run against `tm_suite_test` (forced by setup-env.js) and reconnect
// afterwards, because main() closes the shared connection in its `finally`.

describe('cm-2b — main() argv parsing', () => {
  let logSpy;
  let priorExitCode;

  beforeEach(() => {
    priorExitCode = process.exitCode;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
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
    expect(await getDb().collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
  });

  it('produces a machine-diffable dry-run report (AC10)', async () => {
    await seed();
    await main(['node', 'script.mjs']);

    // Fixed, greppable shape — the same contract cm-2's own main() holds.
    expect(out()).toContain(`${SOURCE_COLLECTION}: 3 document(s). ${TARGET_COLLECTION}: 0 document(s).`);
    expect(out()).toContain(`3 to copy, 0 already present, 6 ${SUBMISSIONS_COLLECTION} field rename(s).`);
    expect(out()).toContain(`[DRY RUN] would rename ${OLD_FIELD} -> ${NEW_FIELD} on 6 ${SUBMISSIONS_COLLECTION} document(s)`);
    // Review fix (2026-08-17): the dry-run headline is its OWN sentence, and
    // says so. The old line was `Totals: 0 copied, 3 already present, 0 field
    // rename(s)` on a run that wrote nothing — one real figure among
    // placeholder zeros, with nothing marking which was which.
    expect(out()).toContain('Totals (DRY RUN — nothing was written): would copy 3, 0 already present, would rename 6 field(s), would clear 0 stale field(s), 0 refusal(s).');
    expect(out()).not.toContain('Totals: ');
  });

  it('--apply dispatches the rename with apply=true and never drops the source', async () => {
    await seed();
    await main(['node', 'script.mjs', '--apply']);

    expect(out()).toContain('APPLY (will write)');
    expect(out()).toContain('Totals: 3 copied');
    await connectDb();
    expect(await getDb().collection(TARGET_COLLECTION).countDocuments({})).toBe(3);
    expect(await getDb().collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [NEW_FIELD]: { $exists: true } })).toBe(6);
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
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });

    await main(['node', 'script.mjs', '--prefer-new', '--apply']);
    expect(out()).toContain('--prefer-new');
    expect(out()).toContain('1 stale field(s) cleared');

    await connectDb();
    const fixed = await getDb().collection(SUBMISSIONS_COLLECTION).findOne({ [FIXTURE]: true, character_name: 'Fixture 1' });
    expect(OLD_FIELD in fixed).toBe(false);
    expect(String(fixed[NEW_FIELD])).toBe(ID2);
  });

  it('without --prefer-new the same state refuses and sets a non-zero exit code', async () => {
    const subs = submissionFixture();
    subs[0][NEW_FIELD] = new ObjectId(ID2);
    await seed({ subs });

    await main(['node', 'script.mjs', '--apply']);
    expect(out()).toContain('NOTHING was written');
    expect(out()).toContain('--prefer-new');
    expect(process.exitCode).toBe(1);

    await connectDb();
    expect(await getDb().collection(TARGET_COLLECTION).countDocuments({})).toBe(0);
  });

  it('refuses and exits non-zero when cm-2 has not finished (target-shape)', async () => {
    await seed();
    await db.collection(TARGET_COLLECTION).insertMany(storyGroupingDocs());

    await main(['node', 'script.mjs', '--apply']);
    expect(out()).toContain('WRONG COLLECTION SHAPE');
    expect(out()).toContain("still holds cm-2's Story-groupings");
    expect(process.exitCode).toBe(1);

    await connectDb();
    expect(await getDb().collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// REVIEW REWORK (2026-08-17). Everything below covers a defect the internal
// 3-layer review found in the first pass of this story, not new behaviour.
// ══════════════════════════════════════════════════════════════════════════

describe('cm-2b — canonicalJSON handles BSON (review: ObjectIds all serialised to {})', () => {
  it('distinguishes two different ObjectIds', () => {
    expect(canonicalJSON(new ObjectId(ID1))).not.toBe(canonicalJSON(new ObjectId(ID2)));
  });

  it('distinguishes an ObjectId from the plain string of the same hex', () => {
    expect(canonicalJSON(new ObjectId(ID1))).not.toBe(canonicalJSON(ID1));
  });

  it('is stable under key reordering', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });

  it('sees a difference nested inside an array of objects', () => {
    const a = { joint_projects: [{ _id: 'j1', lead_submission_id: new ObjectId(ID1) }] };
    const b = { joint_projects: [{ _id: 'j1', lead_submission_id: new ObjectId(ID2) }] };
    expect(canonicalJSON(a)).not.toBe(canonicalJSON(b));
    expect(bodyDifferences(a, b)).toEqual(['joint_projects']);
  });

  it('planRename REFUSES on an ObjectId-only difference, which used to pass as a no-op', async () => {
    await seed();
    const source = await db.collection(SOURCE_COLLECTION).findOne({ _id: new ObjectId(ID1) });
    // The same document with one extra ObjectId-valued field. Under the old
    // canonicalJSON both bodies serialised that field to `{}` and compared
    // equal, so this passed silently as a no-op.
    await db.collection(TARGET_COLLECTION).insertOne({ ...source, _cm2b_probe_ref: new ObjectId(ID2) });

    const plan = await planRename(db);
    const refusal = plan.refusals.find(r => r.kind === 'target-differs' && r._id === ID1);
    expect(refusal).toBeTruthy();
    expect(refusal.fields).toContain('_cm2b_probe_ref');
  });
});

describe('cm-2b — burn-in drift tolerance (review: any ST edit refused forever)', () => {
  it('tolerates a phase advance on the target and reports it as drift, not a refusal', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });

    // Exactly what dropSource own comment calls "the system working".
    await db.collection(TARGET_COLLECTION).updateOne(
      { _id: new ObjectId(ID3) },
      { $set: { phase: 'processing', status: 'closed', label: 'Downtime 7 (renamed)' } },
    );

    const plan = await planRename(db);
    expect(plan.refusals).toEqual([]);
    expect(plan.copies).toEqual([]);
    const drift = plan.drifted.find(d => d._id === ID3);
    expect(drift).toBeTruthy();
    expect(drift.fields).toEqual(['label', 'phase', 'status']);

    // And the documented idempotency re-run still reads clean.
    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    expect(res.fieldsRenamed).toBe(0);
    expect(res.refused).toBe(0);
  });

  it('still REFUSES when the drift is in an identity field', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    await db.collection(TARGET_COLLECTION).updateOne(
      { _id: new ObjectId(ID2) },
      { $set: { game_number: 99 } },
    );

    const plan = await planRename(db);
    const refusal = plan.refusals.find(r => r.kind === 'target-differs' && r._id === ID2);
    expect(refusal).toBeTruthy();
    expect(refusal.fields).toEqual(['game_number']);
    expect(BURN_IN_MUTABLE_FIELDS).not.toContain('game_number');
  });
});

describe('cm-2b — target-phantom guard (review: the real sequencing-violation signature)', () => {
  it('is pure and names the phantom', () => {
    const refusals = targetPhantomRefusals(sourceFixture(), [ID1]);
    expect(refusals).toHaveLength(2);
    expect(refusals.every(r => r.kind === 'target-phantom')).toBe(true);
    expect(refusals[0].detail).toContain('sequencing violation');
  });

  it('does not fire on documents that DO have a source counterpart', () => {
    expect(targetPhantomRefusals(sourceFixture(), [ID1, ID2, ID3])).toEqual([]);
  });

  it('planRename refuses when a Chapter was created in chapters before --apply ran', async () => {
    await seed();
    // What `POST /api/chapters` writes once the code has deployed.
    await db.collection(TARGET_COLLECTION).insertOne({
      _id: new ObjectId(), label: 'Downtime 8', game_number: 8, status: 'prep',
      phase: 'downtime', phase_sequence: ['downtime', 'processing', 'prep', 'game'],
    });

    const plan = await planRename(db);
    expect(plan.refusals.some(r => r.kind === 'target-phantom')).toBe(true);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(0);
    // Nothing written: the three source documents are still uncopied.
    expect(await db.collection(TARGET_COLLECTION).countDocuments({})).toBe(1);
    expect(await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [OLD_FIELD]: { $exists: true } })).toBe(6);
  });

  it('dropSource treats a post-cutover Chapter as an advisory, NOT a refusal', async () => {
    await seed();
    await applyRename(db, await planRename(db), { apply: true, log: silent });
    // A Chapter created legitimately after the cutover: no source counterpart,
    // and refusing on it would block --drop-source forever.
    await db.collection(TARGET_COLLECTION).insertOne({
      _id: new ObjectId(), label: 'Downtime 8', game_number: 8, status: 'prep', phase: 'downtime',
    });

    const lines = [];
    const res = await dropSource(db, { apply: true, log: m => lines.push(m) });
    expect(res.refused).toBe(false);
    expect(res.dropped).toBe(true);
    expect(lines.join('\n')).toContain('no downtime_cycles counterpart');
  });
});

describe('cm-2b — isStoryGroupingShaped is a POSITIVE shape check (review)', () => {
  it('still fires on a Story-grouping that has acquired an unexpected field', () => {
    expect(isStoryGroupingShaped({
      _id: new ObjectId(ID1), number: 1, label: 'Story 1',
      created_at: '2026-06-11T10:01:04.071Z', some_future_field: 'x',
    })).toBe(true);
  });

  it('still fires on a Story-grouping missing its label', () => {
    expect(isStoryGroupingShaped({
      _id: new ObjectId(ID1), number: 1, created_at: '2026-06-11T10:01:04.071Z',
    })).toBe(true);
  });

  it('does not fire on a Chapter that happens to carry a stray created_at', () => {
    expect(isStoryGroupingShaped({
      _id: new ObjectId(ID1), label: 'Downtime 5', game_number: 5,
      status: 'closed', created_at: '2026-06-11T10:01:04.071Z',
    })).toBe(false);
  });
});

describe('cm-2b — body-less source document (review: $setOnInsert threw mid-copy)', () => {
  it('copies a bare {_id} document instead of aborting the whole run', async () => {
    const bare = new ObjectId();
    await seed();
    await db.collection(SOURCE_COLLECTION).insertOne({ _id: bare });

    const plan = await planRename(db);
    expect(plan.refusals).toEqual([]);

    const res = await applyRename(db, plan, { apply: true, log: silent });
    expect(res.copied).toBe(4);
    expect(await db.collection(TARGET_COLLECTION).findOne({ _id: bare })).toEqual({ _id: bare });
    // And the other three still landed, which is what "aborting mid-copy" cost.
    expect(await db.collection(TARGET_COLLECTION).countDocuments({})).toBe(4);
  });
});

describe('cm-2b — index parity (review: copy-then-upsert creates only _id_)', () => {
  it('missingIndexes ignores _id_ and matches on key pattern', () => {
    const src = [{ name: '_id_', key: { _id: 1 } }, { name: 'game_number_1', key: { game_number: 1 } }];
    expect(missingIndexes(src, [{ name: '_id_', key: { _id: 1 } }])).toHaveLength(1);
    expect(missingIndexes(src, [{ name: '_id_', key: { _id: 1 } }, { name: 'renamed', key: { game_number: 1 } }])).toEqual([]);
  });

  it('applyRename recreates the source collection indexes on the target', async () => {
    await seed();
    await db.collection(SOURCE_COLLECTION).createIndex({ game_number: 1 }, { name: 'cm2b_probe_game_number' });

    const res = await applyRename(db, await planRename(db), { apply: true, log: silent });
    expect(res.indexesCreated).toBe(1);

    const names = (await db.collection(TARGET_COLLECTION).indexes()).map(i => i.name);
    expect(names).toContain('cm2b_probe_game_number');

    // And verify no longer warns about it.
    const verified = await verifyRename(db, await planRename(db));
    expect(verified.warnings).toEqual([]);
  });

  it('verifyRename WARNS about a missing index without failing the run', async () => {
    await seed();
    await db.collection(SOURCE_COLLECTION).createIndex({ status: 1 }, { name: 'cm2b_probe_status' });
    const plan = await planRename(db);
    // Copy by hand, skipping the index step, to model the pre-fix state.
    for (const row of plan.copies) await db.collection(TARGET_COLLECTION).insertOne(row.doc);
    await db.collection(SUBMISSIONS_COLLECTION).updateMany(
      { _id: { $in: plan.fieldRenames.map(r => r.idValue) } },
      { $rename: { [OLD_FIELD]: NEW_FIELD } },
    );

    const verified = await verifyRename(db, plan);
    expect(verified.ok).toBe(true);                 // not a data problem
    expect(verified.warnings.join(' ')).toContain('cm2b_probe_status');
  });
});
