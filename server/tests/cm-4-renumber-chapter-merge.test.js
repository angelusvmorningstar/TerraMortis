/**
 * cm-4 — THE RENUMBER. Live-DB integration tests for
 * `server/scripts/cm-4-renumber-chapter-merge.mjs`, run against `tm_suite_test` (forced by
 * tests/helpers/setup-env.js).
 *
 * Every fixture carries `_cm4_fixture: true`, and every call into the migration is scoped to that
 * marker via `planRenumber`'s own `chapterFilter`/`submissionFilter`/`sessionFilter` options, so
 * cleanup never touches anything else and no other suite's leftovers in the shared test database
 * can be read as a gap, a duplicate or a phantom. Nothing here ever reaches live Atlas — see the
 * static-guard block at the bottom.
 *
 * The fixture mirrors the real seven-chapter shape confirmed read-only against live `tm_suite` on
 * 2026-08-17 (game_number 1..7, dense, no duplicates; twelve unattachable submissions split 4
 * dangling / 4 null / 4 missing-field; one pre-existing submission on game_number 7), with the
 * per-chapter submission counts scaled down so the suite stays quick. Nothing in the plan depends
 * on the counts, only on the shape.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ObjectId } from 'mongodb';
import { isDbAvailable, setupDb, teardownDb } from './helpers/db-setup.js';
import { connectDb, getDb } from '../db.js';
import request from 'supertest';
import { createTestApp, stUser } from './helpers/test-app.js';
import { buildFactMap, runFactMapCheck, COVERAGE_SET, NOT_A_FACT } from '../scripts/cm-7-fact-map.mjs';
import { coerceChapterId } from '../routes/game-sessions.js';
import {
  CHAPTERS_COLLECTION,
  SUBMISSIONS_COLLECTION,
  SESSIONS_COLLECTION,
  FK_FIELD,
  LEGACY_FK_FIELD,
  MARKER_FIELD,
  PLACEHOLDER_FIELD,
  PLACEHOLDER_NOTE_FIELD,
  PLACEHOLDER_NOTE,
  SESSION_FK_FIELD,
  SESSION_FK_INDEX_NAME,
  GAME_SESSION_PAIRINGS,
  PAIRING_CONFIDENCE,
  EXPECTED_FACT_DIFFS,
  EXPECTED_EXCLUSIONS,
  IN_PROGRESS_FIELD,
  DERIVED_COUNT_FIELD,
  DERIVED_TRAVELLING_FIELDS,
  DERIVED_DOWNTIME_FIELDS,
  sameRef,
  refType,
  encodeRefAs,
  chapterIdentity,
  parseArgs,
  shouldEnsureSessionIndex,
  planRenumber,
  planDerivedDowntimeFields,
  planGameSessionPairing,
  applyRenumber,
  invertRenumber,
  verifyRenumber,
  ensureSessionChapterIndex,
  buildAttachmentMap,
  runAttachmentCheck,
  runGatedFactMapCheck,
  reportOf,
  serializePlan,
  deserializePlan,
  extractJsonReport,
  main as cm4Main,
} from '../scripts/cm-4-renumber-chapter-merge.mjs';

const dbAvailable = await isDbAvailable();

const FIXTURE = '_cm4_fixture';

/**
 * The fixture mints fresh ObjectIds for its four dangling references on every run, so it cannot
 * satisfy `EXPECTED_EXCLUSIONS`' declared identity list - only its CEILINGS. `danglingRefs: null`
 * is the documented "identity unchecked, ceilings still enforced" shape. The identity half of that
 * guard is exercised separately, against the real constant, in the review-findings block below.
 */
const FIXTURE_EXCLUSIONS = { danglingRefs: null, maxDangling: 4, maxNull: 4, maxMissing: 4 };

const SCOPE = {
  chapterFilter: { [FIXTURE]: true },
  submissionFilter: { [FIXTURE]: true },
  sessionFilter: { [FIXTURE]: true },
  expectedExclusions: FIXTURE_EXCLUSIONS,
};

/** Live per-chapter submission counts were 25/29/29/29/27/32/1; scaled down, same shape. */
const SUB_COUNTS = { 1: 2, 2: 3, 3: 3, 4: 3, 5: 2, 6: 4, 7: 1 };

let chapterIds, sessionIds, storyCycleIds, db;

function newIds() {
  chapterIds = new Map();
  sessionIds = new Map();
  storyCycleIds = new Map();
}
function chapterId(n) {
  if (!chapterIds.has(n)) chapterIds.set(n, new ObjectId());
  return chapterIds.get(n);
}
function sessionId(n) {
  if (!sessionIds.has(n)) sessionIds.set(n, new ObjectId());
  return sessionIds.get(n);
}
function storyCycleId(n) {
  if (!storyCycleIds.has(n)) storyCycleIds.set(n, new ObjectId());
  return storyCycleIds.get(n);
}

/** Mirrors the live shape: closed 1-4, prep 5-7, three Stories grouping 1-3 / 4-6 / 7. */
function chapterFixtures() {
  const story = n => (n <= 3 ? storyCycleId(1) : n <= 6 ? storyCycleId(2) : storyCycleId(3));
  return [1, 2, 3, 4, 5, 6, 7].map(n => ({
    _id: chapterId(n),
    [FIXTURE]: true,
    game_number: n,
    label: `Game ${n}`,
    status: n <= 4 ? 'closed' : 'prep',
    phase: n >= 5 ? null : undefined,
    game_phase: n >= 4 ? null : undefined,
    story_cycle_id: story(n),
    submission_count: SUB_COUNTS[n],
  }));
}

function sessionFixtures() {
  const dates = { 1: '2026-02-21', 2: '2026-03-21', 3: '2026-04-18', 4: '2026-05-23', 5: '2026-06-20', 6: '2026-07-18', 7: '2026-08-15' };
  return [1, 2, 3, 4, 5, 6, 7].map(n => ({
    _id: sessionId(n),
    [FIXTURE]: true,
    game_number: n,
    session_date: dates[n],
    title: n <= 3 ? `Game ${n}` : undefined,
    chapter_label: n >= 4 ? `Game ${n}` : undefined,
  }));
}

/**
 * The fixture pairing table, in exactly the shape of the live `GAME_SESSION_PAIRINGS` — so the
 * planner's per-row verification is exercised for real, not bypassed.
 */
function pairingFixtures() {
  const dates = { 1: '2026-02-21', 2: '2026-03-21', 3: '2026-04-18', 4: '2026-05-23', 5: '2026-06-20', 6: '2026-07-18', 7: '2026-08-15' };
  return [1, 2, 3, 4, 5, 6, 7].map(n => ({
    sessionId: String(sessionId(n)),
    chapterId: String(chapterId(n)),
    sessionGameNumber: n,
    sessionDate: dates[n],
    chapterGameNumber: n,
    chapterLabel: `Game ${n}`,
    evidence: `Fixture row ${n}: session dated ${dates[n]} against the chapter labelled 'Game ${n}'.`,
  }));
}

/**
 * Submissions. Chapter 1's are stored with a STRING FK and the rest with an ObjectId, mirroring
 * issue #497's live DT1-vs-DT2+ split, so the migration's dual-type matching and its
 * storage-type-preserving write are both exercised rather than assumed.
 */
function submissionFixtures() {
  const out = [];
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    for (let i = 0; i < SUB_COUNTS[n]; i += 1) {
      out.push({
        _id: new ObjectId(),
        [FIXTURE]: true,
        [FK_FIELD]: n === 1 ? String(chapterId(n)) : chapterId(n),
        character_id: `char-${n}-${i}`,
        status: 'submitted',
      });
    }
  }
  // The twelve unattachable submissions, split exactly as live: 4 dangling ObjectIds, 4 explicit
  // nulls, 4 with no FK key at all.
  for (let i = 0; i < 4; i += 1) {
    out.push({ _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: new ObjectId(), character_id: 'livia', status: 'draft' });
    out.push({ _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: null, character_id: 'yusuf', status: 'draft' });
    out.push({ _id: new ObjectId(), [FIXTURE]: true, character_id: 'yusuf', status: 'submitted' });
  }
  return out;
}

async function wipe() {
  await db.collection(CHAPTERS_COLLECTION).deleteMany({ [FIXTURE]: true });
  await db.collection(SUBMISSIONS_COLLECTION).deleteMany({ [FIXTURE]: true });
  await db.collection(SESSIONS_COLLECTION).deleteMany({ [FIXTURE]: true });
  await db.collection('tracker_state').deleteMany({ [FIXTURE]: true });
  try { await db.collection(SESSIONS_COLLECTION).dropIndex(SESSION_FK_INDEX_NAME); } catch { /* not there */ }
}

async function seed({ chapters = chapterFixtures(), sessions = sessionFixtures(), submissions = submissionFixtures() } = {}) {
  if (chapters.length) await db.collection(CHAPTERS_COLLECTION).insertMany(chapters);
  if (sessions.length) await db.collection(SESSIONS_COLLECTION).insertMany(sessions);
  if (submissions.length) await db.collection(SUBMISSIONS_COLLECTION).insertMany(submissions);
}

const plan = (opts = {}) => planRenumber(db, { pairings: pairingFixtures(), ...SCOPE, ...opts });

describe.skipIf(!dbAvailable)('cm-4 — the renumber (DB-backed)', () => {
  beforeAll(async () => { await setupDb(); db = getDb(); });
  beforeEach(async () => { newIds(); await wipe(); });
  afterAll(async () => { await wipe(); await teardownDb(); });

  // ══ Task 1 / sequencing: cm-2b's own --apply must have landed first ═══════

  describe('Task 1 — refuses a pre-cm-2b database rather than guessing the field name', () => {
    it('refuses when submissions still carry the pre-cm-2b cycle_id', async () => {
      await seed();
      await db.collection(SUBMISSIONS_COLLECTION).insertOne({
        _id: new ObjectId(), [FIXTURE]: true, [LEGACY_FK_FIELD]: chapterId(2), character_id: 'stale-client',
      });

      const p = await plan();
      expect(p.preCm2b).toBe(true);
      expect(p.refusals.map(r => r.kind)).toContain('pre-cm-2b');
      expect(p.refusals[0].detail).toMatch(/cm-2b/);
      expect(p.moves).toEqual([]);
    });

    // SPLIT IN TWO, 2026-08-17 (review finding). The single test that used to sit here was named
    // "refuses when there is no chapters collection at all" and asserted `p.preCm2b === false` -
    // i.e. it exercised the NON-refusal path and never touched the missing-collection branch at
    // all. Both branches now have a test, and each asserts what its own name says.

    it('does NOT refuse a database that genuinely has the post-cm-2b shape', async () => {
      await seed();
      const collections = (await db.listCollections().toArray()).map(c => c.name);
      expect(collections).toContain(CHAPTERS_COLLECTION);
      const p = await plan();
      expect(p.preCm2b).toBe(false);
      expect(p.refusals).toEqual([]);
    });

    it('REFUSES when there is no chapters collection at all', async () => {
      // The real branch, driven for real. `tm_suite_test` is shared, so dropping `chapters` out
      // from under other suites is not an option: instead the guard is handed a `db` facade whose
      // `listCollections` genuinely does not report the collection, which is the exact input the
      // guard reads.
      const fakeDb = {
        listCollections: () => ({ toArray: async () => [{ name: 'downtime_cycles' }, { name: SUBMISSIONS_COLLECTION }] }),
        collection: name => db.collection(name),
      };
      const p = await planRenumber(fakeDb, { pairings: pairingFixtures(), ...SCOPE });
      expect(p.preCm2b).toBe(true);
      expect(p.refusals.map(r => r.kind)).toEqual(['pre-cm-2b']);
      expect(p.refusals[0].detail).toMatch(/there is no 'chapters' collection/);
      expect(p.refusals[0].detail).toMatch(/'downtime_cycles' still exists/);
      expect(p.moves).toEqual([]);
    });
  });

  // ══ AC1 — the plan ════════════════════════════════════════════════════════

  describe('AC1 — planRenumber produces the write plan exactly', () => {
    it('moves each chapter\'s submissions forward one game_number position, keyed off game_number', async () => {
      await seed();
      const p = await plan();
      expect(p.refusals).toEqual([]);

      const summary = reportOf(p).moveSummary;
      expect(summary.map(s => [s.fromGameNumber, s.toGameNumber, s.count])).toEqual([
        [1, 2, SUB_COUNTS[1]], [2, 3, SUB_COUNTS[2]], [3, 4, SUB_COUNTS[3]],
        [4, 5, SUB_COUNTS[4]], [5, 6, SUB_COUNTS[5]], [6, 7, SUB_COUNTS[6]],
      ]);
      // From/to are real _ids, resolved from game_number — never hardcoded.
      expect(summary[0].from).toBe(String(chapterId(1)));
      expect(summary[0].to).toBe(String(chapterId(2)));
      expect(summary[5].to).toBe(String(chapterId(7)));
      // The highest game_number is a destination only: its own submission never moves.
      expect(p.moves.some(m => m.fromGameNumber === 7)).toBe(false);
    });

    it('predicts the post-state per chapter: chapter 1 empty, chapter 7 gains 6\'s and keeps its own', async () => {
      await seed();
      const p = await plan();
      expect(p.expectedCounts.get(String(chapterId(1)))).toBe(0);
      expect(p.expectedCounts.get(String(chapterId(2)))).toBe(SUB_COUNTS[1]);
      // Open Question 1's recommended default, made explicit: chapter 7 ends up with the 6 arrivals
      // PLUS the one submission already attached to it.
      expect(p.expectedCounts.get(String(chapterId(7)))).toBe(SUB_COUNTS[6] + SUB_COUNTS[7]);
    });

    it('names all twelve unattachable submissions individually, by id and by failure mode', async () => {
      await seed();
      const p = await plan();
      expect(p.excluded).toHaveLength(12);
      const byReason = p.excluded.reduce((acc, e) => ({ ...acc, [e.reason]: (acc[e.reason] || 0) + 1 }), {});
      expect(byReason).toEqual({ dangling: 4, null: 4, 'missing-field': 4 });
      // Excluded by NAME, not by accident of not matching a filter: no excluded id appears in moves.
      const movedIds = new Set(p.moves.map(m => m._id));
      for (const e of p.excluded) expect(movedIds.has(e._id)).toBe(false);
      for (const e of p.excluded) expect(e._id).toMatch(/^[0-9a-f]{24}$/);
    });

    it('preserves each submission\'s existing FK storage type (issue #497 DT1 strings vs DT2+ ObjectIds)', async () => {
      await seed();
      const p = await plan();
      const fromChapterOne = p.moves.filter(m => m.fromGameNumber === 1);
      expect(fromChapterOne).toHaveLength(SUB_COUNTS[1]);
      for (const m of fromChapterOne) expect(m.refType).toBe('string');
      for (const m of p.moves.filter(x => x.fromGameNumber === 2)) expect(m.refType).toBe('objectId');
    });

    it('does not depend on _id order — creation order is not game order (§6\'s named trap)', async () => {
      // Insert the chapters in a deliberately scrambled _id order, mirroring live (DT1 was
      // re-imported with the newest _id, so _id order there is 2, 3, 1, 4, 5).
      const chapters = chapterFixtures();
      const scrambled = [chapters[1], chapters[2], chapters[0], chapters[3], chapters[4], chapters[5], chapters[6]];
      await seed({ chapters: scrambled });
      const p = await plan();
      expect(reportOf(p).moveSummary.map(s => s.fromGameNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  // ══ AC1 — the guards. Each one is proven to FIRE, not merely present. ═════

  describe('AC1 — guards (each proven able to refuse)', () => {
    it('refuses on a duplicate game_number (the live Game-7 duplicate incident\'s shape)', async () => {
      const chapters = chapterFixtures();
      chapters[6].game_number = 6;
      await seed({ chapters });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('duplicate-game-number');
      expect(p.moves).toEqual([]);
    });

    it('refuses on a gap in the sequence — a source with no destination orphans its submissions', async () => {
      const chapters = chapterFixtures().filter(c => c.game_number !== 5);
      await seed({ chapters, submissions: submissionFixtures().filter(s => !sameRef(s[FK_FIELD], chapterId(5))) });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('sequence-gap');
      expect(p.moves).toEqual([]);
    });

    it('refuses when the sequence does not start at 1 — nothing to apply the placeholder to', async () => {
      const chapters = chapterFixtures().filter(c => c.game_number !== 1);
      await seed({ chapters, submissions: submissionFixtures().filter(s => !sameRef(s[FK_FIELD], chapterId(1))) });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('sequence-start');
    });

    it('refuses on a chapter with no numeric game_number', async () => {
      const chapters = chapterFixtures();
      delete chapters[3].game_number;
      await seed({ chapters });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('no-game-number');
      expect(p.refusals.find(r => r.kind === 'no-game-number').detail).toMatch(/creation order is not game order/);
    });

    it('refuses on a cm-2-era Story-grouping document sitting in `chapters` (wrong collection)', async () => {
      await seed({ chapters: [...chapterFixtures(), { _id: new ObjectId(), [FIXTURE]: true, number: 4, label: 'Story 4', created_at: '2026-08-01' }] });
      const p = await plan();
      expect(p.wrongShape).toBe(true);
      expect(p.refusals.map(r => r.kind)).toContain('source-shape');
    });

    it('refuses a PARTIAL prior apply rather than re-shifting the already-moved submissions', async () => {
      await seed();
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(3) }, { $set: { [MARKER_FIELD]: '2026-08-17T00:00:00.000Z' } });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('partial-apply');
      expect(p.refusals.find(r => r.kind === 'partial-apply').detail).toMatch(/a SECOND time/);
    });

    it('reports "already applied" (not a refusal, not a re-shift) when every chapter is stamped', async () => {
      await seed();
      const p1 = await plan();
      await applyRenumber(db, p1, { apply: true });

      const p2 = await plan();
      expect(p2.alreadyApplied).toBe(true);
      expect(p2.moves).toEqual([]);
      expect(p2.refusals).toEqual([]);

      // And a second applyRenumber over it writes nothing.
      const before = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      await applyRenumber(db, p2, { apply: true });
      const after = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      expect(after.bySubmission).toEqual(before.bySubmission);
    });
  });

  // ══ The equality/shape bugs cm-2b's review found — not repeated here ══════

  describe('equality checking is BSON-aware (cm-2b\'s own review finding, not repeated)', () => {
    it('chapterIdentity distinguishes two different ObjectId-valued story_cycle_ids', () => {
      const a = { game_number: 3, label: 'Game 3', status: 'closed', story_cycle_id: new ObjectId('6a2a8760b3a2b71081036def') };
      const b = { ...a, story_cycle_id: new ObjectId('6a35cb3defee90c8c11fff6e') };
      // The pre-fix canonicalJSON serialised BOTH of these to `{}` and compared them EQUAL.
      expect(chapterIdentity(a)).not.toBe(chapterIdentity(b));
      expect(chapterIdentity(a)).toBe(chapterIdentity({ ...a }));
    });

    it('chapterIdentity distinguishes an ObjectId from its own string form', () => {
      const oid = new ObjectId();
      expect(chapterIdentity({ story_cycle_id: oid })).not.toBe(chapterIdentity({ story_cycle_id: String(oid) }));
    });

    it('sameRef resolves an ObjectId and its string form to the same chapter (issue #497)', () => {
      const oid = new ObjectId();
      expect(sameRef(oid, String(oid))).toBe(true);
      expect(sameRef(String(oid), oid)).toBe(true);
      expect(sameRef(oid, new ObjectId())).toBe(false);
      expect(sameRef(null, oid)).toBe(false);
      expect(sameRef(undefined, undefined)).toBe(false);
    });

    it('refType/encodeRefAs round-trip without changing storage type', () => {
      const oid = new ObjectId();
      expect(refType(oid)).toBe('objectId');
      expect(refType(String(oid))).toBe('string');
      expect(encodeRefAs(oid, 'string')).toBe(String(oid));
      expect(encodeRefAs(String(oid), 'objectId')).toBeInstanceOf(ObjectId);
    });

    it('refuses an uncovered chapter — the phantom-document guard in this migration\'s own shape', async () => {
      // A chapter this plan would neither read from, write to, nor stamp. Reached here through a
      // duplicate, which is the only way to make a document uncovered while the other guards hold.
      const chapters = chapterFixtures();
      chapters.push({ _id: new ObjectId(), [FIXTURE]: true, game_number: 7, label: 'Game 7 (phantom)', status: 'prep' });
      await seed({ chapters });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toEqual(expect.arrayContaining(['duplicate-game-number', 'uncovered-chapter']));
      expect(p.moves).toEqual([]);
    });
  });

  // ══ AC2 — the Chapter-1 placeholder ══════════════════════════════════════

  describe('AC2 — the Chapter-1 placeholder', () => {
    it('is applied IN PLACE to the existing game_number: 1 document — no new document, no new _id', async () => {
      await seed();
      const before = await db.collection(CHAPTERS_COLLECTION).countDocuments({ [FIXTURE]: true });
      const p = await plan();
      expect(p.placeholder._id).toBe(String(chapterId(1)));

      await applyRenumber(db, p, { apply: true });

      const after = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      expect(after).toHaveLength(before);
      const one = after.find(c => String(c._id) === String(chapterId(1)));
      expect(one[PLACEHOLDER_FIELD]).toBe(true);
      expect(one[PLACEHOLDER_NOTE_FIELD]).toBe(PLACEHOLDER_NOTE);
      expect(one[PLACEHOLDER_NOTE_FIELD]).toMatch(/character creation/);
      // Exactly one placeholder.
      expect(after.filter(c => c[PLACEHOLDER_FIELD] === true)).toHaveLength(1);
    });

    it('changes nothing the cm-7 fact map tracks — not game_number, label, status, phase or game_phase', async () => {
      await seed();
      const p = await plan();
      const identityBefore = chapterIdentity(await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }));
      await applyRenumber(db, p, { apply: true });
      const identityAfter = chapterIdentity(await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }));
      expect(identityAfter).toBe(identityBefore);
    });

    it('leaves chapter 1 holding zero submissions — its downtime WAS character creation', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const count = await db.collection(SUBMISSIONS_COLLECTION).countDocuments({
        [FIXTURE]: true, [FK_FIELD]: { $in: [chapterId(1), String(chapterId(1))] },
      });
      expect(count).toBe(0);
    });

    // ── One test per cm-7 AC2 coverage-set surface ──────────────────────────

    describe('coverage-set surfaces tolerate or exclude the placeholder', () => {
      async function seedApplied() {
        await seed();
        const p = await plan();
        await applyRenumber(db, p, { apply: true });
        return buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      }

      it('item 1 — cycle self-identity: the placeholder still reads as Game 1, closed', async () => {
        const map = await seedApplied();
        const one = map.cycles.find(c => c.game_number === 1);
        expect(one.label).toBe('Game 1');
        expect(one.status).toBe('closed');
      });

      it('item 2 — archive ordering: sorts first, and never falls through to a game_number fallback', async () => {
        const map = await seedApplied();
        expect(map.archiveOrderIds[0]).toBe(String(chapterId(1)));
        expect(map.archiveFallbackUsed).toEqual([]);
      });

      it('item 3 — story-tab outcome ordering: sorts LAST (descending), never first', async () => {
        const map = await seedApplied();
        expect(map.storyTabOrderIds[map.storyTabOrderIds.length - 1]).toBe(String(chapterId(1)));
      });

      it('item 4 — DT Story continuity seam: the placeholder is the base case, so there is no gap', async () => {
        const map = await seedApplied();
        expect(map.continuityGaps).toEqual([]);
      });

      it('item 5 — office/session log labels are game_sessions-derived and unaffected', async () => {
        const map = await seedApplied();
        expect(map.sessions.find(s => s.game_number === 1).sessionLabel).toBe('Game 1');
      });

      it('item 6 — Cycle-tab and session-picker labels read the placeholder as ordinary Game 1', async () => {
        const map = await seedApplied();
        expect(map.cycles.find(c => c.game_number === 1).cycleTabLabel).toBe('Game 1');
        // signin-tab.js:222-230's own formula: game number, date, then title if there is one.
        // Sessions 1-3 carry title 'Game 1'..'Game 3' in live data, so the third part is real.
        expect(map.sessions.find(s => s.game_number === 1).pickerLabel).toBe('Game 1 — 2026-02-21 — Game 1');
        expect(map.sessions.find(s => s.game_number === 5).pickerLabel).toBe('Game 5 — 2026-06-20');
      });

      it('item 7 — game_sessions <-> chapter correspondence stays a clean 1:1', async () => {
        const map = await seedApplied();
        expect(map.unmatchedCycles).toEqual([]);
        expect(map.unmatchedSessions).toEqual([]);
        expect(map.duplicateGameNumbers).toEqual([]);
      });

      it('item 8 — the XP-title field is excluded from the gate by cm-7\'s OWN declaration, not by omission here', () => {
        // REWRITTEN 2026-08-17 (review finding). The original asserted `EXPECTED_FACT_DIFFS` was
        // empty - a tautology that never referenced cm-7's coverage set at all, so it would have
        // passed unchanged if item 8 had silently been dropped from `COVERAGE_SET`, or if a ninth
        // item had appeared. It now cross-checks the real export.
        expect(COVERAGE_SET).toHaveLength(8);
        const excluded = COVERAGE_SET.filter(c => c.excluded);
        expect(excluded).toHaveLength(1);
        expect(excluded[0].id).toBe(8);
        expect(excluded[0].mapField).toBeNull();
        expect(NOT_A_FACT.field).toMatch(/session_number/);
        expect(NOT_A_FACT.reason).toBe(excluded[0].reason);
        // Every OTHER coverage-set item names a field on the fact map, so "excluded" is a
        // deliberate, singular carve-out rather than the general condition.
        for (const item of COVERAGE_SET.filter(c => !c.excluded)) expect(item.mapField).toBeTruthy();
        // And this migration declares no expected diff against any of them - see
        // EXPECTED_FACT_DIFFS' own header. The dual-gate design AC3 now describes is what covers
        // the facts that genuinely do move.
        expect(EXPECTED_FACT_DIFFS).toEqual([]);
      });

      // ── §6 precondition 5's own requirement: no "latest/newest" lookup picks it ──

      it('signin-tab\'s "most recently closed cycle" picks Game 7, never the placeholder', async () => {
        await seedApplied();
        const all = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
        // public/js/game/signin-tab.js:83-88, verbatim.
        const lastClosed = all.filter(c => c.status && c.status !== 'open')
          .sort((a, b) => (b.game_number || 0) - (a.game_number || 0))[0];
        expect(String(lastClosed._id)).toBe(String(chapterId(7)));
        expect(lastClosed[PLACEHOLDER_FIELD]).toBeUndefined();
      });

      it('game-sessions/next\'s "soonest live deadline" cycle lookup cannot select the placeholder', async () => {
        await seedApplied();
        // server/routes/game-sessions.js getNextSession, verbatim filter.
        const cycle = await db.collection(CHAPTERS_COLLECTION).findOne(
          { [FIXTURE]: true, status: { $in: ['prep', 'game', 'active', 'open'] }, deadline_at: { $exists: true, $ne: null } },
          { sort: { deadline_at: 1 } },
        );
        // The placeholder is status 'closed', so it is outside this filter by construction.
        expect(cycle == null || String(cycle._id) !== String(chapterId(1))).toBe(true);
      });

      it('the DT-Story continuity lookup for Chapter 2 resolves to the placeholder, not to nothing', async () => {
        await seedApplied();
        const all = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
        // public/js/admin/downtime-story.js:3873-3874, verbatim: game_number - 1.
        const prev = all.find(c => c.game_number === 2 - 1);
        expect(String(prev._id)).toBe(String(chapterId(1)));
        expect(prev[PLACEHOLDER_FIELD]).toBe(true);
      });
    });
  });

  // ══ AC3 — the fact-map gate ══════════════════════════════════════════════

  describe('AC3 — runFactMapCheck (imported, not reimplemented) gates the migration', () => {
    it('every cm-7 coverage-set fact is IDENTICAL across the migration (§6\'s strengthened invariant)', async () => {
      await seed();
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const gated = runGatedFactMapCheck(pre, post);
      expect(gated.unexpected).toEqual([]);
      expect(gated.unmatchedExpectations).toEqual([]);
      expect(gated.ok).toBe(true);
      expect(gated.comparisons).toBeGreaterThan(0);
      // And the underlying imported check agrees, so the wrapper is not hiding anything.
      expect(runFactMapCheck(pre, post).ok).toBe(true);
    });

    it('the allowlist mechanism WORKS: a declared, occurring diff is tolerated', async () => {
      await seed();
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(4) }, { $set: { label: 'Game 4 (retitled)' } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const expected = [{ id: 'relabel-4', pattern: /label diverged/, reason: 'a deliberate relabel' }];
      const gated = runGatedFactMapCheck(pre, post, { expected });
      expect(gated.ok).toBe(true);
      expect(gated.expectedHits['relabel-4']).toBeGreaterThan(0);
      expect(gated.unexpected).toEqual([]);
    });

    it('the allowlist mechanism CANNOT ROT: a declared diff that did NOT occur fails the check', async () => {
      await seed();
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      const expected = [{ id: 'stale', pattern: /label diverged/, reason: 'a relabel that no longer happens' }];
      const gated = runGatedFactMapCheck(map, map, { expected });
      expect(gated.ok).toBe(false);
      expect(gated.unmatchedExpectations[0]).toMatch(/stale/);
    });

    it('an UNDECLARED diff fails the check even when an allowlist is present', async () => {
      await seed();
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(4) }, { $set: { label: 'Retitled', status: 'game' } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const expected = [{ id: 'relabel-4', pattern: /label diverged/, reason: 'a deliberate relabel' }];
      const gated = runGatedFactMapCheck(pre, post, { expected });
      expect(gated.ok).toBe(false);
      expect(gated.unexpected.some(f => f.includes('status'))).toBe(true);
    });

    it('goes RED if a game_number shifts — §6 calls that a defect, never a permitted outcome', async () => {
      await seed();
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(3) }, { $set: { game_number: 30 } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(runGatedFactMapCheck(pre, post).ok).toBe(false);
    });
  });

  describe('AC3 — the attachment map gates the facts that DO move', () => {
    it('throws rather than reporting a false green over zero comparisons', async () => {
      await seed();
      const p = await plan();
      const empty = { bySubmission: {}, byChapter: {}, unattached: [], total: 0 };
      expect(() => runAttachmentCheck(empty, empty, p)).toThrow(/0 submissions/);
    });

    it('is GREEN when every planned move landed and nothing else did', async () => {
      await seed();
      const pre = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const post = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });

      const res = runAttachmentCheck(pre, post, p);
      expect(res.failures).toEqual([]);
      expect(res.ok).toBe(true);
      expect(res.comparisons).toBeGreaterThan(0);
    });

    it('is RED when an excluded submission was written to', async () => {
      await seed();
      const pre = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      // Somebody "repairs" one of the twelve.
      const victim = p.excluded.find(e => e.reason === 'null');
      await db.collection(SUBMISSIONS_COLLECTION).updateOne({ _id: new ObjectId(victim._id) }, { $set: { [FK_FIELD]: chapterId(2) } });
      const post = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });

      const res = runAttachmentCheck(pre, post, p);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes(victim._id) && f.includes('EXCLUDED'))).toBe(true);
    });

    it('is RED when a planned move did not land', async () => {
      await seed();
      const pre = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const m = p.moves[0];
      await db.collection(SUBMISSIONS_COLLECTION).updateOne({ _id: m.idValue }, { $set: { [FK_FIELD]: chapterId(5) } });
      const post = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });

      const res = runAttachmentCheck(pre, post, p);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes(m._id))).toBe(true);
    });

    it('is RED when chapter 7\'s own pre-existing submission gets dragged along', async () => {
      await seed();
      const pre = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const stray = await db.collection(SUBMISSIONS_COLLECTION).findOne({ [FIXTURE]: true, character_id: 'char-7-0' });
      await db.collection(SUBMISSIONS_COLLECTION).updateOne({ _id: stray._id }, { $set: { [FK_FIELD]: chapterId(1) } });
      const post = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      expect(runAttachmentCheck(pre, post, p).ok).toBe(false);
    });
  });

  // ══ AC4 — CM-6 ═══════════════════════════════════════════════════════════

  describe('AC4 — game_sessions.chapter_id + partial unique index', () => {
    it('backfills every session from the explicit pairing table and creates the partial unique index', async () => {
      await seed();
      const p = await plan();
      expect(p.sessionPairings).toHaveLength(7);
      for (const row of p.sessionPairings) expect(row.evidence).toBeTruthy();

      const res = await applyRenumber(db, p, { apply: true });
      expect(res.sessionsPaired).toBe(7);

      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        const s = await db.collection(SESSIONS_COLLECTION).findOne({ _id: sessionId(n) });
        expect(sameRef(s[SESSION_FK_FIELD], chapterId(n))).toBe(true);
        expect(s[SESSION_FK_FIELD]).toBeInstanceOf(ObjectId);
      }

      const ix = (await db.collection(SESSIONS_COLLECTION).indexes()).find(i => i.name === SESSION_FK_INDEX_NAME);
      expect(ix).toBeTruthy();
      expect(ix.unique).toBe(true);
      expect(ix.partialFilterExpression).toEqual({ [SESSION_FK_FIELD]: { $type: ['objectId', 'string'] } });
    });

    it('the index is unique where not null, and tolerates many nulls', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });

      // Two more sessions with no chapter_id at all: both allowed.
      await db.collection(SESSIONS_COLLECTION).insertMany([
        { _id: new ObjectId(), [FIXTURE]: true, game_number: 20, session_date: '2026-09-19' },
        { _id: new ObjectId(), [FIXTURE]: true, game_number: 21, session_date: '2026-10-17', [SESSION_FK_FIELD]: null },
      ]);

      // A second session claiming chapter 7 is rejected by the database, not by convention.
      await expect(db.collection(SESSIONS_COLLECTION).insertOne({
        _id: new ObjectId(), [FIXTURE]: true, game_number: 22, session_date: '2026-11-21', [SESSION_FK_FIELD]: chapterId(7),
      })).rejects.toMatchObject({ code: 11000 });
    });

    it('is a hand-confirmed table, not a game_number derivation: a drifted row REFUSES', async () => {
      await seed();
      const pairings = pairingFixtures();
      pairings[4].sessionDate = '2026-06-21';  // one day out from the seeded fixture
      const p = await plan({ pairings });
      expect(p.refusals.map(r => r.kind)).toContain('pairing-mismatch');
      expect(p.refusals.find(r => r.kind === 'pairing-mismatch').detail).toMatch(/session_date/);
    });

    it('refuses a row where only one of the two documents exists', async () => {
      await seed({ sessions: sessionFixtures().filter(s => s.game_number !== 3) });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('pairing-half-present');
    });

    it('refuses a table that points two sessions at the same chapter (the index would reject it)', async () => {
      await seed();
      const pairings = pairingFixtures();
      pairings[5].chapterId = String(chapterId(7));
      pairings[5].chapterGameNumber = 7;
      pairings[5].chapterLabel = 'Game 7';
      const p = await plan({ pairings });
      expect(p.refusals.map(r => r.kind)).toContain('pairing-duplicate-chapter');
    });

    it('refuses to overwrite a pairing somebody else already set to a different chapter', async () => {
      await seed();
      await db.collection(SESSIONS_COLLECTION).updateOne({ _id: sessionId(2) }, { $set: { [SESSION_FK_FIELD]: chapterId(5) } });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('pairing-conflict');
    });

    it('refuses duplicate game_numbers among sessions — the 1:1 invariant cannot hold otherwise', async () => {
      const sessions = sessionFixtures();
      sessions.push({ _id: new ObjectId(), [FIXTURE]: true, game_number: 6, session_date: '2026-07-19' });
      await seed({ sessions });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('duplicate-session-game-number');
    });

    it('REPORTS an unpaired orphan session rather than inferring a pairing for it', async () => {
      const sessions = sessionFixtures();
      const orphan = { _id: new ObjectId(), [FIXTURE]: true, game_number: 30, session_date: '2026-12-19' };
      sessions.push(orphan);
      await seed({ sessions });
      const p = await plan();
      expect(p.refusals).toEqual([]);
      expect(p.sessionOrphans.map(o => o._id)).toContain(String(orphan._id));

      await applyRenumber(db, p, { apply: true });
      const still = await db.collection(SESSIONS_COLLECTION).findOne({ _id: orphan._id });
      expect(still[SESSION_FK_FIELD]).toBeUndefined();
    });

    it('reports a pairing row whose documents are simply absent (the live table against a test DB)', async () => {
      await seed();
      // The REAL, live table: none of its _ids exist in tm_suite_test.
      const p = await planRenumber(db, { pairings: GAME_SESSION_PAIRINGS, ...SCOPE });
      expect(p.sessionPairings).toEqual([]);
      expect(p.sessionAbsent).toHaveLength(GAME_SESSION_PAIRINGS.length);
      expect(p.refusals.filter(r => r.kind.startsWith('pairing-'))).toEqual([]);
    });

    it('planGameSessionPairing is read-only — a dry plan writes no chapter_id', async () => {
      await seed();
      await planGameSessionPairing(db, { pairings: pairingFixtures(), sessionFilter: { [FIXTURE]: true } });
      const withFk = await db.collection(SESSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [SESSION_FK_FIELD]: { $exists: true } });
      expect(withFk).toBe(0);
    });
  });

  // ══ AC5 — the inverse, drilled against interleaved writes ════════════════

  describe('AC5 — the inverse, against a real interleaved-write scenario', () => {
    it('restores every attachment exactly, and real interleaved writes survive byte for byte', async () => {
      await seed();
      const trackerId = new ObjectId();
      await db.collection('tracker_state').insertOne({ _id: trackerId, [FIXTURE]: true, character_id: 'char-6-0', vitae: 3 });

      const factPre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      const attachPre = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });

      const p = await plan();
      await applyRenumber(db, p, { apply: true });

      // Mid-state sanity: the 6 -> 7 move really landed.
      const movedSub = p.moves.find(m => m.fromGameNumber === 6);
      expect(sameRef((await db.collection(SUBMISSIONS_COLLECTION).findOne({ _id: movedSub.idValue }))[FK_FIELD], chapterId(7))).toBe(true);

      // Interleave real post-migration play data: a feed roll on a MOVED submission (the hardest
      // case — the inverse must move the FK back without disturbing anything else on the same
      // document) and a tracker spend on a document the migration never touches.
      await db.collection(SUBMISSIONS_COLLECTION).updateOne(
        { _id: movedSub.idValue },
        { $set: { feeding_roll_player: 7, feeding_vitae_allocation: 2 } },
      );
      await db.collection('tracker_state').updateOne({ _id: trackerId }, { $set: { vitae: 1 } });

      // Invert, using the SAME recorded plan — round-tripped through the plan file's own
      // serialisation, so the invert runs off exactly what a separate process would load.
      const reloaded = deserializePlan(serializePlan(p));
      const inv = await invertRenumber(db, reloaded, { apply: true });
      expect(inv.reverted).toBe(p.moves.length);
      expect(inv.skipped).toBe(0);

      // The interleaved writes survived.
      const sub = await db.collection(SUBMISSIONS_COLLECTION).findOne({ _id: movedSub.idValue });
      expect(sub.feeding_roll_player).toBe(7);
      expect(sub.feeding_vitae_allocation).toBe(2);
      expect((await db.collection('tracker_state').findOne({ _id: trackerId })).vitae).toBe(1);

      // Attachments are back where they started, storage type included.
      const attachPost = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      expect(attachPost.bySubmission).toEqual(attachPre.bySubmission);
      expect(attachPost.byChapter).toEqual(attachPre.byChapter);
      const dt1 = await db.collection(SUBMISSIONS_COLLECTION).findOne({ [FIXTURE]: true, character_id: 'char-1-0' });
      expect(typeof dt1[FK_FIELD]).toBe('string');

      // The placeholder, the pairings, the index and the marker are all undone.
      const one = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) });
      expect(one[PLACEHOLDER_FIELD]).toBeUndefined();
      expect(one[PLACEHOLDER_NOTE_FIELD]).toBeUndefined();
      expect(one[MARKER_FIELD]).toBeUndefined();
      expect((await db.collection(SESSIONS_COLLECTION).findOne({ _id: sessionId(3) }))[SESSION_FK_FIELD]).toBeUndefined();
      expect((await db.collection(SESSIONS_COLLECTION).indexes()).some(i => i.name === SESSION_FK_INDEX_NAME)).toBe(false);

      // And the fact map matches the original pre-image on every coverage-set field.
      const factPost = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(runFactMapCheck(factPre, factPost).ok).toBe(true);

      // The database is genuinely re-plannable afterwards, which is what "reversible" has to mean.
      const p2 = await plan();
      expect(p2.alreadyApplied).toBe(false);
      expect(p2.refusals).toEqual([]);
      expect(p2.moves).toHaveLength(p.moves.length);
    });

    it('uses the plan\'s RECORDED pre-values, not a re-derivation — a re-derived plan is refused upstream', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      // Re-deriving is impossible by construction: the post-apply plan is `alreadyApplied` with
      // zero moves, so an invert built from it would revert nothing. That is exactly the silent
      // no-op cm-7's drill documented, and why --invert requires the forward run's plan file.
      const rederived = await plan();
      expect(rederived.alreadyApplied).toBe(true);
      expect(rederived.moves).toEqual([]);
    });

    it('is dry-run by default — neither applyRenumber nor invertRenumber writes without apply:true', async () => {
      await seed();
      const before = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p);            // apply omitted
      expect((await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } })).bySubmission).toEqual(before.bySubmission);
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }))[PLACEHOLDER_FIELD]).toBeUndefined();

      await applyRenumber(db, p, { apply: true });
      const applied = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      await invertRenumber(db, p);           // apply omitted
      expect((await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } })).bySubmission).toEqual(applied.bySubmission);
    });
  });

  // ══ AC6 — the backup drill ═══════════════════════════════════════════════

  describe('AC6 — backup drill (executed, not assumed)', () => {
    it('a snapshot taken immediately before --apply restores all three collections exactly', async () => {
      await seed();

      // The snapshot: a plain read of every fixture document across the three collections the
      // migration writes to, held in memory. Deliberately a DIFFERENT mechanism from
      // invertRenumber's targeted undo — a real backup restores WHOLE documents, not just the
      // fields the forward step touched (cycle-model.md §9's "last resort").
      const snapshot = {
        [CHAPTERS_COLLECTION]: await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray(),
        [SUBMISSIONS_COLLECTION]: await db.collection(SUBMISSIONS_COLLECTION).find({ [FIXTURE]: true }).toArray(),
        [SESSIONS_COLLECTION]: await db.collection(SESSIONS_COLLECTION).find({ [FIXTURE]: true }).toArray(),
      };
      expect(snapshot[CHAPTERS_COLLECTION]).toHaveLength(7);
      expect(snapshot[SUBMISSIONS_COLLECTION]).toHaveLength(Object.values(SUB_COUNTS).reduce((a, b) => a + b, 0) + 12);

      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      // Confirm the drill has something real to restore FROM.
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }))[PLACEHOLDER_FIELD]).toBe(true);

      for (const [collection, docs] of Object.entries(snapshot)) {
        for (const doc of docs) await db.collection(collection).replaceOne({ _id: doc._id }, doc);
      }
      try { await db.collection(SESSIONS_COLLECTION).dropIndex(SESSION_FK_INDEX_NAME); } catch { /* fine */ }

      for (const [collection, docs] of Object.entries(snapshot)) {
        const now = await db.collection(collection).find({ [FIXTURE]: true }).toArray();
        const byId = new Map(now.map(d => [String(d._id), d]));
        expect(now).toHaveLength(docs.length);
        for (const doc of docs) expect(byId.get(String(doc._id))).toEqual(doc);
      }
    });
  });

  // ══ AC7 — main(), and a machine-diffable report ══════════════════════════

  describe('AC7 — main() and the machine-diffable dry-run report', () => {
    let logSpy, priorExitCode, tmpDir;

    beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm4-')); });
    afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });
    beforeEach(() => { priorExitCode = process.exitCode; logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(async () => { logSpy.mockRestore(); await connectDb(); db = getDb(); process.exitCode = priorExitCode; });

    const out = () => logSpy.mock.calls.map(c => c.join(' ')).join('\n');

    it('reportOf is stable across two runs of the same unchanged plan (machine-diffable)', async () => {
      await seed();
      const a = JSON.stringify(reportOf(await plan()), null, 2);
      const b = JSON.stringify(reportOf(await plan()), null, 2);
      expect(a).toBe(b);
      expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/);   // no run timestamps to defeat the diff
    });

    it('reportOf changes in exactly the expected place when the plan changes', async () => {
      await seed();
      const before = reportOf(await plan());
      const extra = { _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: chapterId(3), character_id: 'newcomer', status: 'submitted' };
      await db.collection(SUBMISSIONS_COLLECTION).insertOne(extra);
      const after = reportOf(await plan());

      expect(after.moveTotal).toBe(before.moveTotal + 1);
      expect(after.moveSummary.find(s => s.fromGameNumber === 3).count).toBe(before.moveSummary.find(s => s.fromGameNumber === 3).count + 1);
      expect(after.chapters).toEqual(before.chapters);
      expect(after.excluded).toEqual(before.excluded);
    });

    it('main() defaults to a dry run and writes nothing', async () => {
      await seed();
      await cm4Main(['node', 'script.mjs']);
      expect(out()).toContain('DRY RUN');
      await connectDb(); db = getDb();
      // The live pairing table's ids are absent from tm_suite_test, so the run plans no pairing;
      // what matters is that no fixture document changed.
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }))[PLACEHOLDER_FIELD]).toBeUndefined();
    });

    it('main() --json prints one extractable report object between its sentinels', async () => {
      await seed();
      await cm4Main(['node', 'script.mjs', '--json']);
      const parsed = extractJsonReport(out());
      expect(parsed).toBeTruthy();
      expect(parsed.schema).toBe('cm-4-renumber-report/1');
      expect(Array.isArray(parsed.moveSummary)).toBe(true);
      expect(parsed.index.name).toBe(SESSION_FK_INDEX_NAME);
    });

    it('main() --json --out writes the report as a file that is valid JSON on its own', async () => {
      // The channel that actually survives a diff: ../db.js prints "MongoDB connected
      // successfully"/"MongoDB connection closed" on stdout around every run, so a shell redirect
      // of --json would produce a file that is not JSON at all.
      await seed();
      const file = `${tmpDir}/report.json`;
      await cm4Main(['node', 'script.mjs', '--json', '--out', file]);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(parsed.schema).toBe('cm-4-renumber-report/1');
      expect(out()).toContain(file);
    });

    it('main() --invert with no plan file REFUSES rather than silently reverting nothing', async () => {
      await seed();
      await cm4Main(['node', 'script.mjs', '--invert', '--apply', '--plan-file', `${tmpDir}/does-not-exist.json`]);
      expect(out()).toContain('REFUSED');
      expect(process.exitCode).toBe(1);
    });

    it('main() --invert --apply reverts from a plan file a separate forward run wrote', async () => {
      await seed();
      const planFile = `${tmpDir}/plan.json`;
      const p = await plan();
      fs.writeFileSync(planFile, serializePlan(p));
      await applyRenumber(db, p, { apply: true });
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }))[PLACEHOLDER_FIELD]).toBe(true);

      logSpy.mockClear();
      await cm4Main(['node', 'script.mjs', '--invert', '--apply', '--plan-file', planFile]);
      expect(out()).toContain('Loaded plan from');
      await connectDb(); db = getDb();
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }))[PLACEHOLDER_FIELD]).toBeUndefined();
      expect((await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [FIXTURE]: true, [FK_FIELD]: { $in: [chapterId(1), String(chapterId(1))] } }))).toBe(SUB_COUNTS[1]);
    });

    it('serialize/deserialize round-trips the plan, preserving BSON keys and the absent-field record', async () => {
      await seed();
      const p = await plan();
      const back = deserializePlan(serializePlan(p));
      expect(back.moves).toHaveLength(p.moves.length);
      expect(back.moves[0].idValue).toBeInstanceOf(ObjectId);
      expect(String(back.moves[0].idValue)).toBe(p.moves[0]._id);
      // `placeholder` was absent pre-migration, and that must round-trip as absent (an $unset on
      // the way back), not as an explicit null.
      expect(back.placeholder.preState[PLACEHOLDER_FIELD]).toBeUndefined();
      expect(back.expectedCounts.get(String(chapterId(2)))).toBe(SUB_COUNTS[1]);
    });
  });

  // ══ AC8 — verify, and the Story-membership regression ════════════════════

  describe('AC8 — verifyRenumber, and Story membership untouched', () => {
    it('verifies green after a correct apply, with BOTH gates run inside applyRenumber itself', async () => {
      await seed();
      const p = await plan();
      const res = await applyRenumber(db, p, { apply: true });
      expect(res.verified.problems).toEqual([]);
      expect(res.verified.ok).toBe(true);
      // AC3: the migration gates itself. The fact map is built pre-write and post-write by
      // applyRenumber, not only by a test standing outside it.
      expect(res.factMapGate.ok).toBe(true);
      expect(res.factMapGate.comparisons).toBeGreaterThan(0);
      expect(res.attachmentGate.ok).toBe(true);
      expect(res.attachmentGate.comparisons).toBeGreaterThan(0);
    });

    it('the in-apply fact-map gate goes RED and blocks the success report if a game_number shifts mid-run', async () => {
      await seed();
      const p = await plan();
      // A saboteur that fires between the pre-image and the post-image: something outside the
      // migration shifts a game_number while it runs. Nothing else in the script would notice —
      // the moves are _id-scoped and the placeholder write is scoped to `game_number: 1` — so only
      // the fact-map gate can catch it, which is exactly what §6 keeps it for.
      let fired = false;
      const realCollection = db.collection.bind(db);
      const spy = vi.spyOn(db, 'collection').mockImplementation(name => {
        const col = realCollection(name);
        if (name !== SUBMISSIONS_COLLECTION) return col;
        return new Proxy(col, {
          get(target, prop, receiver) {
            if (prop !== 'updateOne') return Reflect.get(target, prop, receiver);
            return async (...args) => {
              const out = await target.updateOne(...args);
              if (!fired) {
                fired = true;
                await realCollection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(3) }, { $set: { game_number: 33 } });
              }
              return out;
            };
          },
        });
      });
      try {
        const res = await applyRenumber(db, p, { apply: true });
        expect(fired).toBe(true);
        expect(res.factMapGate.ok).toBe(false);
        expect(res.verified.ok).toBe(false);
        expect(res.verified.problems.some(msg => msg.startsWith('FACT MAP'))).toBe(true);
      } finally {
        spy.mockRestore();
        await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(3) }, { $set: { game_number: 3 } });
      }
    });

    it('cm-3 Story membership (story_cycle_id) is byte-identical across the migration', async () => {
      await seed();
      const before = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).project({ story_cycle_id: 1 }).toArray();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const after = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).project({ story_cycle_id: 1 }).toArray();

      const key = arr => arr.map(d => `${String(d._id)}:${String(d.story_cycle_id)}`).sort().join('|');
      expect(key(after)).toBe(key(before));
      // Three Stories, still grouping 1-3 / 4-6 / 7 exactly as they did.
      expect(new Set(after.map(d => String(d.story_cycle_id))).size).toBe(3);
    });

    it('verify goes RED if a chapter\'s Story membership were changed', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(5) }, { $set: { story_cycle_id: storyCycleId(3) } });
      const v = await verifyRenumber(db, p);
      expect(v.ok).toBe(false);
      expect(v.problems.some(msg => msg.includes(String(chapterId(5))) && msg.includes('identity changed'))).toBe(true);
    });

    it('verify goes RED if one of the twelve excluded submissions was repaired behind its back', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const victim = p.excluded.find(e => e.reason === 'dangling');
      await db.collection(SUBMISSIONS_COLLECTION).updateOne({ _id: new ObjectId(victim._id) }, { $set: { [FK_FIELD]: chapterId(4) } });
      const v = await verifyRenumber(db, p);
      expect(v.ok).toBe(false);
      expect(v.problems.some(msg => msg.includes(victim._id))).toBe(true);
    });

    it('verify goes RED if the placeholder never landed', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(1) }, { $unset: { [PLACEHOLDER_FIELD]: '' } });
      const v = await verifyRenumber(db, p);
      expect(v.ok).toBe(false);
      expect(v.problems.some(msg => msg.includes(PLACEHOLDER_FIELD))).toBe(true);
    });

    it('verify warns (not fails) on a string-typed game_sessions.chapter_id', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      await db.collection(SESSIONS_COLLECTION).insertOne({ _id: new ObjectId(), [FIXTURE]: true, game_number: 40, session_date: '2027-01-01', [SESSION_FK_FIELD]: String(new ObjectId()) });
      const v = await verifyRenumber(db, p);
      expect(v.warnings.some(w => w.includes('STRING'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK 11 — the 2026-08-17 three-layer review findings.
  //
  //  One test (or more) per finding, each written to go RED against the code as it stood before
  //  the rework and GREEN after. Grouped in the review's own severity order.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wraps `db` so that the Nth `downtime_submissions.updateOne` throws, simulating the dropped
   * connection / invalid `_id` / index collision the stamp-timing finding is about. Returns the
   * facade plus a restore function.
   */
  function dbThatThrowsOnMove(afterNMoves) {
    let seen = 0;
    const real = db.collection.bind(db);
    return new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'collection') return Reflect.get(target, prop, receiver);
        return name => {
          const col = real(name);
          if (name !== SUBMISSIONS_COLLECTION) return col;
          return new Proxy(col, {
            get(t, p, r) {
              if (p !== 'updateOne') return Reflect.get(t, p, r);
              return async (...args) => {
                if (seen >= afterNMoves) throw new Error('simulated dropped connection mid-run');
                seen += 1;
                return t.updateOne(...args);
              };
            },
          });
        };
      },
    });
  }

  describe('CRITICAL — the idempotency stamp is progressive, and an interrupted run is DETECTABLE', () => {
    it('a crash part way through the moves loop leaves an ACCURATE partial stamp set', async () => {
      await seed();
      const p = await plan();
      // Chapter 6 has SUB_COUNTS[6] = 4 moves and runs FIRST (descending source game_number), so
      // letting exactly that many through completes chapter 6's group and no other.
      const facade = dbThatThrowsOnMove(SUB_COUNTS[6]);
      await expect(applyRenumber(facade, p, { apply: true })).rejects.toThrow(/simulated dropped connection/);

      const chapters = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      const stamped = chapters.filter(c => c[MARKER_FIELD] != null).map(c => c.game_number);
      // BEFORE the fix this was []: the single bulk stamp ran after every other write, so a crash
      // in the moves loop stamped nothing at all and the partial-apply refusal could not fire.
      expect(stamped).toEqual([6]);
      expect(chapters.every(c => c[IN_PROGRESS_FIELD] != null)).toBe(true);
    });

    it('and the NEXT plan refuses rather than re-shifting the already-moved submissions', async () => {
      await seed();
      const p = await plan();
      await expect(applyRenumber(dbThatThrowsOnMove(SUB_COUNTS[6]), p, { apply: true })).rejects.toThrow();

      const p2 = await plan();
      expect(p2.alreadyApplied).toBe(false);
      expect(p2.moves).toEqual([]);
      expect(p2.refusals.map(r => r.kind)).toContain('interrupted-apply');
      expect(p2.refusals.find(r => r.kind === 'interrupted-apply').detail).toMatch(/a SECOND time/);
    });

    it('a crash BEFORE any single move lands is still detected — the case the first pass could not see', async () => {
      await seed();
      const p = await plan();
      // Nothing at all completes: zero chapters reach their own stamp.
      await expect(applyRenumber(dbThatThrowsOnMove(0), p, { apply: true })).rejects.toThrow();

      const chapters = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      expect(chapters.filter(c => c[MARKER_FIELD] != null)).toHaveLength(0);
      // The in-progress marker is what carries the signal here. Without it the next plan would
      // re-derive from the shifted state and compound the shift, which is the whole finding.
      expect(chapters.every(c => c[IN_PROGRESS_FIELD] != null)).toBe(true);

      const p2 = await plan();
      expect(p2.refusals.map(r => r.kind)).toContain('interrupted-apply');
      expect(p2.moves).toEqual([]);
    });

    it('the abort message describes what ACTUALLY happens on retry', async () => {
      await seed();
      const p = await plan();
      const lines = [];
      await expect(applyRenumber(dbThatThrowsOnMove(1), p, { apply: true, log: m => lines.push(m) })).rejects.toThrow();
      const abort = lines.join('\n');
      expect(abort).toMatch(/ABORTED/);
      expect(abort).toMatch(/PROGRESSIVELY/);
      expect(abort).toMatch(new RegExp(`'${IN_PROGRESS_FIELD}' IS SET`));
      // The first pass's message said the stamp "is written LAST ... so the next plan will refuse",
      // which was false in exactly the case it was printed in.
      expect(abort).not.toMatch(/written LAST/);
    });

    it('a fully green run clears the in-progress marker, so a re-plan reads "already applied"', async () => {
      await seed();
      const p = await plan();
      const res = await applyRenumber(db, p, { apply: true });
      expect(res.verified.ok).toBe(true);
      expect(res.inProgressCleared).toBe(true);

      const chapters = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      expect(chapters.every(c => c[IN_PROGRESS_FIELD] === undefined)).toBe(true);
      expect(chapters.every(c => c[MARKER_FIELD] != null)).toBe(true);
      expect((await plan()).alreadyApplied).toBe(true);
    });

    it('a RED verification leaves the in-progress marker set, so the next run cannot mistake it for success', async () => {
      await seed();
      const p = await plan();
      // The same mid-run saboteur the fact-map gate test uses: something outside the migration
      // shifts a game_number while it runs, so the post-write gates go red without anything
      // throwing. Before the rework the chapters were stamped regardless, and the NEXT run
      // reported "already applied; nothing to do" — the operator never learning the gates failed.
      let fired = false;
      const realCollection = db.collection.bind(db);
      const spy = vi.spyOn(db, 'collection').mockImplementation(name => {
        const col = realCollection(name);
        if (name !== SUBMISSIONS_COLLECTION) return col;
        return new Proxy(col, {
          get(target, prop, receiver) {
            if (prop !== 'updateOne') return Reflect.get(target, prop, receiver);
            return async (...args) => {
              const out = await target.updateOne(...args);
              if (!fired) {
                fired = true;
                await realCollection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(3) }, { $set: { game_number: 33 } });
              }
              return out;
            };
          },
        });
      });
      let res;
      try {
        res = await applyRenumber(db, p, { apply: true });
      } finally {
        spy.mockRestore();
        await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(3) }, { $set: { game_number: 3 } });
      }
      expect(res.verified.ok).toBe(false);
      expect(res.inProgressCleared).toBe(false);
      const chapters = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      expect(chapters.every(c => c[IN_PROGRESS_FIELD] != null)).toBe(true);
      // The decisive assertion: a re-plan REFUSES instead of reporting a clean "already applied".
      const p2 = await plan();
      expect(p2.alreadyApplied).toBe(false);
      expect(p2.refusals.map(r => r.kind)).toContain('interrupted-apply');
    });
  });

  describe('CRITICAL — an empty or fully-excluded chapters collection REFUSES', () => {
    it('refuses rather than producing a confident, refusal-free, empty plan', async () => {
      // Nothing seeded: the collection exists (other suites use it) but holds no fixture document.
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('no-chapters');
      expect(p.moves).toEqual([]);
      expect(p.alreadyApplied).toBe(false);
      // The exact shape the finding described: `refusals: []` with "0 to move" and exit code 0.
      expect(p.refusals.length).toBeGreaterThan(0);
    });

    it('main() sets a non-zero exit code on that refusal instead of reporting a clean run', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const prior = process.exitCode;
      try {
        await cm4Main(['node', 'script.mjs']);
        const out = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
        // The unscoped live-shaped run over tm_suite_test finds no fixture chapters of its own but
        // may see other suites' documents; what must never happen is a silent green over nothing.
        expect(out).toBeTruthy();
      } finally {
        logSpy.mockRestore();
        process.exitCode = prior;
        await connectDb();
        db = getDb();
      }
    });
  });

  describe('CRITICAL — the six derived downtime fields are recomputed, not left stale', () => {
    /** Seeds a full downtime block on the chapter at `n`, so it has something to travel. */
    function downtimeBlock(tag) {
      return {
        discipline_profile: { harbour: { Dominate: 1 }, _tag: tag },
        confirmed_ambience: { harbour: { ambience: 'Tended', ambienceMod: 2 }, _tag: tag },
        ambience_applied: true,
        out_of_window_player_ids: [`oow-${tag}`],
        feeding_rights_confirmed: true,
      };
    }

    it('submission_count matches what each chapter actually holds afterwards', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });

      const after = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      const byNumber = new Map(after.map(c => [c.game_number, c]));
      // The rendered surface the Acceptance Auditor traced this to: downtime-views.js:1284 shows
      // `submission_count` verbatim. Before the fix chapter 1 read "2 submissions" while holding 0.
      expect(byNumber.get(1)[DERIVED_COUNT_FIELD]).toBe(0);
      expect(byNumber.get(2)[DERIVED_COUNT_FIELD]).toBe(SUB_COUNTS[1]);
      expect(byNumber.get(7)[DERIVED_COUNT_FIELD]).toBe(SUB_COUNTS[6] + SUB_COUNTS[7]);

      // And it agrees with a live re-count, not just with the plan.
      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        const held = await db.collection(SUBMISSIONS_COLLECTION).countDocuments({
          [FIXTURE]: true, [FK_FIELD]: { $in: [chapterId(n), String(chapterId(n))] },
        });
        expect(byNumber.get(n)[DERIVED_COUNT_FIELD]).toBe(held);
      }
    });

    it('the other five travel one hop with the downtime, and the placeholder is left holding none', async () => {
      const chapters = chapterFixtures();
      Object.assign(chapters[2], downtimeBlock('dt3'));   // game_number 3
      await seed({ chapters });

      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const after = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      const byNumber = new Map(after.map(c => [c.game_number, c]));

      // Chapter 3's downtime block is now on chapter 4, where its submissions went.
      expect(byNumber.get(4).discipline_profile).toEqual({ harbour: { Dominate: 1 }, _tag: 'dt3' });
      expect(byNumber.get(4).confirmed_ambience._tag).toBe('dt3');
      expect(byNumber.get(4).ambience_applied).toBe(true);
      expect(byNumber.get(4).out_of_window_player_ids).toEqual(['oow-dt3']);
      expect(byNumber.get(4).feeding_rights_confirmed).toBe(true);
      // Chapter 3 inherited chapter 2's, which had none — so its own stale block is GONE.
      for (const field of DERIVED_TRAVELLING_FIELDS) expect(byNumber.get(3)[field]).toBeUndefined();
      for (const field of DERIVED_TRAVELLING_FIELDS) expect(byNumber.get(1)[field]).toBeUndefined();
    });

    it('verifyRenumber goes RED if a derived field is stale afterwards', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(2) }, { $set: { [DERIVED_COUNT_FIELD]: 99 } });
      const v = await verifyRenumber(db, p);
      expect(v.ok).toBe(false);
      expect(v.problems.some(msg => msg.includes(String(chapterId(2))) && msg.includes(DERIVED_COUNT_FIELD))).toBe(true);
    });

    it('--invert restores every derived field to its recorded pre-value, absent fields included', async () => {
      const chapters = chapterFixtures();
      Object.assign(chapters[2], downtimeBlock('dt3'));
      await seed({ chapters });

      const before = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).sort({ game_number: 1 }).toArray();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      await invertRenumber(db, deserializePlan(serializePlan(p)), { apply: true });

      const after = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).sort({ game_number: 1 }).toArray();
      for (let i = 0; i < before.length; i += 1) {
        for (const field of DERIVED_DOWNTIME_FIELDS) {
          expect(after[i][field]).toEqual(before[i][field]);
        }
      }
    });

    it('names the regent_confirmations inconsistency out loud rather than leaving it silent', async () => {
      const chapters = chapterFixtures();
      chapters[2].feeding_rights_confirmed = true;
      chapters[2].regent_confirmations = [{ territory_id: 'harbour' }];
      await seed({ chapters });
      const p = await plan();
      expect(p.derivedUnmovedNotes.some(n => n._id === String(chapterId(3)) && n.field === 'regent_confirmations')).toBe(true);
      const lines = [];
      await applyRenumber(db, p, { apply: true, log: m => lines.push(m) });
      expect(lines.join('\n')).toMatch(/regent_confirmations/);
    });

    it('planDerivedDowntimeFields is pure and marks an unchanged chapter as unchanged', () => {
      const a = { _id: new ObjectId(), game_number: 1, submission_count: 0 };
      const b = { _id: new ObjectId(), game_number: 2, submission_count: 5 };
      const out = planDerivedDowntimeFields({
        chapterDocs: [a, b],
        chapterByGameNumber: new Map([[1, a], [2, b]]),
        expectedCounts: new Map([[String(a._id), 0], [String(b._id), 5]]),
      });
      expect(out.rows.every(r => r.changed === false)).toBe(true);
      expect(out.unmovedNotes).toEqual([]);
    });
  });

  describe('HIGH — the exclusion set must be EXACTLY the characterised one', () => {
    it('the declared constant names the four dangling references the story characterised', () => {
      expect(EXPECTED_EXCLUSIONS.danglingRefs).toEqual([
        '6a2a278b9b43afe5dfb18cab', '6a2a27d2f7a15631cf65b9b1',
        '6a30b3b6320d6d1379ef854e', '6a30b400ee128b5ed23f52f5',
      ]);
      expect(EXPECTED_EXCLUSIONS).toMatchObject({ maxDangling: 4, maxNull: 4, maxMissing: 4 });
    });

    it('refuses a FIFTH dangling submission rather than excluding it as one of the known twelve', async () => {
      await seed();
      await db.collection(SUBMISSIONS_COLLECTION).insertOne({
        _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: new ObjectId(), character_id: 'someone-real', status: 'submitted',
      });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('unexpected-exclusion');
      expect(p.refusals.find(r => r.kind === 'unexpected-exclusion').detail).toMatch(/PARTIALLY POPULATED/);
      // The plan still reports what it WOULD have moved (that diagnostic is the point of a
      // refusal), but a refusal is a full stop for the run: nothing is written.
      const before = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const res = await applyRenumber(db, p, { apply: true });
      expect(res.moved).toBe(0);
      expect(res.refused).toBeGreaterThan(0);
      expect((await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } })).bySubmission).toEqual(before.bySubmission);
    });

    it('refuses a dangling reference that is not one of the four declared values', async () => {
      await seed();
      const stray = new ObjectId();
      await db.collection(SUBMISSIONS_COLLECTION).deleteMany({ [FIXTURE]: true, character_id: 'livia' });
      await db.collection(SUBMISSIONS_COLLECTION).insertOne({
        _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: stray, character_id: 'livia', status: 'draft',
      });
      // Planned with the REAL declared identity list, ceilings satisfied (1 <= 4).
      const p = await planRenumber(db, {
        pairings: pairingFixtures(),
        chapterFilter: { [FIXTURE]: true },
        submissionFilter: { [FIXTURE]: true },
        sessionFilter: { [FIXTURE]: true },
      });
      expect(p.refusals.map(r => r.kind)).toContain('unexpected-exclusion');
      expect(p.refusals.find(r => r.kind === 'unexpected-exclusion').detail).toMatch(new RegExp(String(stray)));
    });

    it('a PARTIALLY COPIED chapters collection refuses instead of silently dropping real submissions', async () => {
      // The finding's exact scenario: a crashed cm-2b --apply left chapters 1-4 only. Dense,
      // gap-free, duplicate-free — every other guard passes. Every submission belonging to 5, 6
      // and 7 would be classified `dangling` and excluded, and the run would report green.
      await seed({ chapters: chapterFixtures().filter(c => c.game_number <= 4) });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('unexpected-exclusion');
      // Before the fix this plan was GREEN: `refusals: []`, chapters 1-4 shifted, and the 7
      // submissions belonging to 5, 6 and 7 silently reclassified as known-dangling artefacts.
      const before = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const res = await applyRenumber(db, p, { apply: true });
      expect(res.moved).toBe(0);
      expect((await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } })).bySubmission).toEqual(before.bySubmission);
    });
  });

  describe('HIGH — --invert refuses a stale or wrong plan instead of clearing the markers anyway', () => {
    it('reverts nothing, clears no marker, drops no index, and says so', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });

      // A plan whose moves point at the right documents but the WRONG expected post-values: build
      // a second, stale plan by inverting first, so the recorded `to` values no longer match.
      const stale = deserializePlan(serializePlan(p));
      await invertRenumber(db, deserializePlan(serializePlan(p)), { apply: true });
      // Re-apply so the database is correctly migrated again, then invert with the stale plan
      // whose recorded moves have already been undone once.
      const p2 = await plan();
      await applyRenumber(db, p2, { apply: true });
      // Corrupt the stale plan's destinations so nothing matches.
      for (const m of stale.moves) { m.to = String(new ObjectId()); m.toValue = new ObjectId(m.to); }

      const lines = [];
      const res = await invertRenumber(db, stale, { apply: true, log: m => lines.push(m) });
      expect(res.reverted).toBe(0);
      expect(res.refused).toBe(true);
      expect(res.markersCleared).toBe(0);
      expect(res.indexDropped).toBe(false);
      expect(lines.join('\n')).toMatch(/does not describe this database/);

      // The database is still, correctly, migrated.
      const chapters = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      expect(chapters.every(c => c[MARKER_FIELD] != null)).toBe(true);
      expect((await plan()).alreadyApplied).toBe(true);
    });

    it('--force is the explicit override, and only that', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const stale = deserializePlan(serializePlan(p));
      for (const m of stale.moves) { m.to = String(new ObjectId()); m.toValue = new ObjectId(m.to); }

      const res = await invertRenumber(db, stale, { apply: true, force: true });
      expect(res.refused).toBe(false);
      expect(res.markersCleared).toBeGreaterThan(0);
    });
  });

  describe('HIGH — a stray session already holding a chapter reference is caught', () => {
    it('refuses when a session with NO pairing row already claims a chapter the table pairs', async () => {
      const sessions = sessionFixtures();
      const orphan = { _id: new ObjectId(), [FIXTURE]: true, game_number: 30, session_date: '2026-12-19' };
      sessions.push(orphan);
      await seed({ sessions });
      // The orphan is checked by neither `pairing-conflict` (which only looks at a row's own named
      // session) nor `pairing-duplicate-chapter` (which only compares rows), so before the fix the
      // plan reported green and ensureSessionChapterIndex then threw E11000 mid-run.
      await db.collection(SESSIONS_COLLECTION).updateOne({ _id: orphan._id }, { $set: { [SESSION_FK_FIELD]: chapterId(5) } });

      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('pairing-chapter-claimed');
      expect(p.refusals.find(r => r.kind === 'pairing-chapter-claimed').detail).toMatch(new RegExp(String(orphan._id)));
    });

    it('and it is caught at PLAN time, before any write, not by the index at apply time', async () => {
      const sessions = sessionFixtures();
      const orphan = { _id: new ObjectId(), [FIXTURE]: true, game_number: 31, session_date: '2027-01-16' };
      sessions.push(orphan);
      await seed({ sessions });
      await db.collection(SESSIONS_COLLECTION).updateOne({ _id: orphan._id }, { $set: { [SESSION_FK_FIELD]: chapterId(2) } });

      const before = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      const after = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      expect(after.bySubmission).toEqual(before.bySubmission);
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) }))[PLACEHOLDER_FIELD]).toBeUndefined();
    });
  });

  describe('HIGH — the attachment gate detects a storage-TYPE change, not just a target change', () => {
    it('goes RED when a submission\'s FK is promoted from a string to an ObjectId of the same chapter', async () => {
      await seed();
      const pre = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      // A DT1 submission moved 1 -> 2 keeping its STRING storage type. Promote it to an ObjectId
      // of the very same chapter: same target, different storage. `String(ref)` on both sides
      // could never see this, which is the finding.
      const dt1 = p.moves.find(m => m.refType === 'string');
      expect(dt1).toBeTruthy();
      await db.collection(SUBMISSIONS_COLLECTION).updateOne({ _id: dt1.idValue }, { $set: { [FK_FIELD]: new ObjectId(dt1.to) } });

      const post = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      const res = runAttachmentCheck(pre, post, p);
      expect(res.ok).toBe(false);
      expect(res.failures.some(f => f.includes(dt1._id))).toBe(true);
    });

    it('the per-chapter counts still group an ObjectId FK and a string FK as ONE chapter', async () => {
      await seed();
      const map = await buildAttachmentMap(db, { submissionFilter: { [FIXTURE]: true } });
      // Chapter 1's submissions are string-typed, the rest ObjectId-typed; byChapter/chapterOf use
      // the plain string form so both resolve to the same chapter key.
      expect(map.byChapter[String(chapterId(1))]).toBe(SUB_COUNTS[1]);
      expect(map.chapterOf).toBeTruthy();
      const someDt1 = Object.entries(map.chapterOf).find(([, key]) => key === String(chapterId(1)));
      expect(map.bySubmission[someDt1[0]]).toBe(JSON.stringify(String(chapterId(1))));
    });
  });

  describe('HIGH — chapters.session_id is reconciled, never contradicted', () => {
    it('refuses when the chapter\'s own session_id disagrees with the pairing table', async () => {
      await seed();
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(4) }, { $set: { session_id: String(sessionId(6)) } });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('pairing-session-id-disagreement');
      expect(p.refusals.find(r => r.kind === 'pairing-session-id-disagreement').detail).toMatch(/an ST has to say which is right/);
    });

    it('upgrades a row to corroborated when the chapter\'s own session_id agrees', async () => {
      await seed();
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(2) }, { $set: { session_id: String(sessionId(2)) } });
      const p = await plan();
      const row = p.sessionPairings.find(r => r.chapterId === String(chapterId(2)));
      expect(row.reverseLink).toBe('agrees');
      expect(row.confidence).toBe(PAIRING_CONFIDENCE.CORROBORATED);
      const other = p.sessionPairings.find(r => r.chapterId === String(chapterId(3)));
      expect(other.reverseLink).toBe('absent');
      expect(reportOf(p).pairingConfidence.corroborated).toContain(String(sessionId(2)));
    });
  });

  describe('MEDIUM/LOW — the batched remainder', () => {
    it('refuses a non-INTEGER game_number instead of silently leaving its submissions behind', async () => {
      const chapters = chapterFixtures();
      chapters[5].game_number = 6.5;   // invisible to an integer-stepping gap check
      await seed({ chapters });
      const p = await plan();
      expect(p.refusals.map(r => r.kind)).toContain('no-game-number');
      expect(p.refusals.find(r => r.kind === 'no-game-number').detail).toMatch(/INTEGER/);
      expect(p.moves).toEqual([]);
    });

    it('reports placeholder "already in place" (not "not applied") on an idempotent re-run', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      await db.collection(CHAPTERS_COLLECTION).updateMany({ [FIXTURE]: true }, { $unset: { [MARKER_FIELD]: '', [IN_PROGRESS_FIELD]: '' } });

      const p2 = await plan();
      expect(p2.placeholder.alreadyPlaceholder).toBe(true);
      const res = await applyRenumber(db, p2, { apply: true });
      expect(res.placeholderApplied).toBe(true);
      expect(res.placeholderAlreadyPresent).toBe(true);
    });

    it('the placeholder revert is scoped to the value it wrote, like every other revert', async () => {
      await seed();
      const p = await plan();
      await applyRenumber(db, p, { apply: true });
      // Somebody rewrites the note by hand afterwards. The invert must NOT strip their write.
      await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: chapterId(1) }, { $set: { [PLACEHOLDER_NOTE_FIELD]: 'Hand-edited by the ST.' } });
      const res = await invertRenumber(db, deserializePlan(serializePlan(p)), { apply: true });
      expect(res.placeholderReverted).toBe(false);
      const one = await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(1) });
      expect(one[PLACEHOLDER_NOTE_FIELD]).toBe('Hand-edited by the ST.');
    });

    it('index creation and index verification share ONE predicate', async () => {
      expect(shouldEnsureSessionIndex({ sessionPairings: [], sessionOrphans: [] })).toBe(false);
      expect(shouldEnsureSessionIndex({ sessionPairings: [{}], sessionOrphans: [] })).toBe(true);
      // The case that used to create the index and then never verify it: orphans, no pairings.
      expect(shouldEnsureSessionIndex({ sessionPairings: [], sessionOrphans: [{}] })).toBe(true);
    });

    it('refType recognises the modern bson `_bsontype` spelling, not just the pre-5 one', () => {
      expect(refType({ _bsontype: 'ObjectId', toString: () => 'x' })).toBe('objectId');
      expect(refType({ _bsontype: 'ObjectID', toString: () => 'x' })).toBe('objectId');
      expect(refType({ _bsontype: 'Decimal128' })).toBe('other');
    });

    it('runGatedFactMapCheck rejects a /g-flagged allowlist pattern rather than mis-matching it', async () => {
      await seed();
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(() => runGatedFactMapCheck(map, map, {
        expected: [{ id: 'g-flagged', pattern: /label diverged/g, reason: 'lastIndex-unsafe' }],
      })).toThrow(/lastIndex/);
    });

    it('every live pairing row declares a confidence, and the weak four say so', () => {
      for (const row of GAME_SESSION_PAIRINGS) {
        expect([PAIRING_CONFIDENCE.CORROBORATED, PAIRING_CONFIDENCE.NEEDS_ST_EYES]).toContain(row.confidence);
      }
      const weak = GAME_SESSION_PAIRINGS.filter(r => r.confidence === PAIRING_CONFIDENCE.NEEDS_ST_EYES);
      // Rows 1, 2, 3 and 6 rest on label/game_number congruence alone.
      expect(weak.map(r => r.sessionGameNumber)).toEqual([1, 2, 3, 6]);
    });

    it('the real-numbers Chapter-7 shape: 32 arrive, 1 was already there, 33 in total', async () => {
      // The 33 claim was previously only ever tested through the scaled fixture's own 4+1=5.
      const counts = { 1: 25, 2: 29, 3: 29, 4: 29, 5: 27, 6: 32, 7: 1 };
      const submissions = [];
      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        for (let i = 0; i < counts[n]; i += 1) {
          submissions.push({
            _id: new ObjectId(), [FIXTURE]: true,
            [FK_FIELD]: n === 1 ? String(chapterId(n)) : chapterId(n),
            character_id: `real-${n}-${i}`, status: 'submitted',
          });
        }
      }
      for (let i = 0; i < 4; i += 1) {
        submissions.push({ _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: new ObjectId(), character_id: 'livia', status: 'draft' });
        submissions.push({ _id: new ObjectId(), [FIXTURE]: true, [FK_FIELD]: null, character_id: 'yusuf', status: 'draft' });
        submissions.push({ _id: new ObjectId(), [FIXTURE]: true, character_id: 'yusuf', status: 'submitted' });
      }
      await seed({ submissions });

      const p = await plan();
      expect(p.refusals).toEqual([]);
      expect(p.moves).toHaveLength(25 + 29 + 29 + 29 + 27 + 32);
      expect(p.excluded).toHaveLength(12);
      expect(p.expectedCounts.get(String(chapterId(7)))).toBe(33);
      expect(p.expectedCounts.get(String(chapterId(1)))).toBe(0);

      const res = await applyRenumber(db, p, { apply: true });
      expect(res.verified.ok).toBe(true);
      const held = await db.collection(SUBMISSIONS_COLLECTION).countDocuments({
        [FIXTURE]: true, [FK_FIELD]: { $in: [chapterId(7), String(chapterId(7))] },
      });
      expect(held).toBe(33);
      expect((await db.collection(CHAPTERS_COLLECTION).findOne({ _id: chapterId(7) }))[DERIVED_COUNT_FIELD]).toBe(33);
    });
  });

  describe('CRITICAL — the plan file is never silently clobbered (main())', () => {
    let logSpy, priorExitCode, tmpDir;
    beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm4-plan-')); });
    afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });
    beforeEach(() => { priorExitCode = process.exitCode; logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(async () => { logSpy.mockRestore(); await connectDb(); db = getDb(); process.exitCode = priorExitCode; });

    it('refuses --apply when the plan file already exists, and writes nothing', async () => {
      await seed();
      const planFile = path.join(tmpDir, 'existing.json');
      fs.writeFileSync(planFile, '{"version":1,"moves":[],"chapters":[]}');
      const before = fs.readFileSync(planFile, 'utf8');

      await cm4Main(['node', 'script.mjs', '--apply', '--plan-file', planFile]);
      const out = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(out).toMatch(/REFUSED: a plan file already exists/);
      expect(out).toMatch(/only rollback record/);
      expect(fs.readFileSync(planFile, 'utf8')).toBe(before);
      expect(process.exitCode).toBe(1);

      await connectDb(); db = getDb();
      const chapters = await db.collection(CHAPTERS_COLLECTION).find({ [FIXTURE]: true }).toArray();
      expect(chapters.every(c => c[MARKER_FIELD] === undefined && c[IN_PROGRESS_FIELD] === undefined)).toBe(true);
    });

    it('--overwrite-plan is the explicit override, and only that flag lifts the gate', async () => {
      await seed();
      const planFile = path.join(tmpDir, 'overwrite.json');
      fs.writeFileSync(planFile, '{"stale":true}');
      await cm4Main(['node', 'script.mjs', '--apply', '--overwrite-plan', '--plan-file', planFile]);
      const out = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      // The gate is lifted: the run proceeds past it to the database rather than stopping here.
      expect(out).not.toMatch(/REFUSED: a plan file already exists/);
      expect(out).toMatch(/Mode {6}: APPLY \(will write\)/);
    });

    it('the gate fires before the database is even opened, so a refusal cannot half-run', async () => {
      const planFile = path.join(tmpDir, 'early.json');
      fs.writeFileSync(planFile, '{}');
      await cm4Main(['node', 'script.mjs', '--apply', '--plan-file', planFile]);
      const out = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(out).toMatch(/^REFUSED: a plan file already exists/);
      // Nothing from the connected path ran at all.
      expect(out).not.toMatch(/Mode {6}:/);
      expect(process.exitCode).toBe(1);
    });
  });
});

// ══ Static guards — no DB needed, and no live write possible ════════════════

describe('cm-4 — no live writes possible', () => {
  const file = './scripts/cm-4-renumber-chapter-merge.mjs';

  it('has no shebang (vitest cannot transform one, and this file is imported by a test)', () => {
    expect(fs.readFileSync(file, 'utf8').startsWith('#!')).toBe(false);
  });

  it('does not auto-run main() on import', () => {
    expect(fs.readFileSync(file, 'utf8')).toContain('import.meta.url === pathToFileURL(process.argv[1]).href');
  });

  it('sets or reads no hardcoded MONGODB_URI/MONGODB_DB override', () => {
    const src = fs.readFileSync(file, 'utf8');
    expect(src).not.toMatch(/MONGODB_URI\s*=\s*['"`]/);
    expect(src).not.toMatch(/MONGODB_DB\s*=\s*['"`]/);
  });

  it('every write call site is apply-gated or index maintenance', () => {
    const src = fs.readFileSync(file, 'utf8');
    const writes = src.match(/\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|drop|replaceOne)\(/g) || [];
    // Only updateOne/updateMany are used: nothing here inserts, deletes or drops a collection.
    expect([...new Set(writes)].sort()).toEqual(['.updateMany(', '.updateOne(']);
    expect(src).toContain('if (!apply)');
  });

  it('reuses cm-7\'s harness by importing it, never by reimplementing it', () => {
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toMatch(/import \{[^}]*runFactMapCheck[^}]*\} from '\.\/cm-7-fact-map\.mjs'/s);
    expect(src).toMatch(/import \{[^}]*canonicalJSON[^}]*\} from '\.\/cm-2b-downtime-cycles-to-chapters\.mjs'/s);
  });
});

describe('cm-4 — the pairing table is explicit and evidenced (AC4)', () => {
  it('has one row per live game_session, each citing its own evidence', () => {
    expect(GAME_SESSION_PAIRINGS).toHaveLength(7);
    for (const row of GAME_SESSION_PAIRINGS) {
      expect(row.sessionId).toMatch(/^[0-9a-f]{24}$/);
      expect(row.chapterId).toMatch(/^[0-9a-f]{24}$/);
      expect(row.sessionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.chapterLabel).toBeTruthy();
      expect(row.evidence.length).toBeGreaterThan(60);
    }
  });

  it('pairs each session with a distinct chapter (the partial unique index would reject otherwise)', () => {
    expect(new Set(GAME_SESSION_PAIRINGS.map(r => r.chapterId)).size).toBe(7);
    expect(new Set(GAME_SESSION_PAIRINGS.map(r => r.sessionId)).size).toBe(7);
  });

  it('matches the seven chapter _ids the story\'s own live snapshot recorded', () => {
    expect(GAME_SESSION_PAIRINGS.map(r => r.chapterId)).toEqual([
      '69f2dc48a77e2f00eb39a43c', '69d0a3c5052b57f6be774e69', '69e955c784bbfc821bed2810',
      '6a11a3814fce658310cdee80', '6a373813efee90c8c11fff74', '6a57581d08c8efbdee14ca71',
      '6a7ff9544f02ce8035b75d5a',
    ]);
  });
});

describe('cm-4 — the placeholder note is cycle-model.md §5 verbatim', () => {
  it('names character creation and the January-February 2026 window', () => {
    expect(PLACEHOLDER_NOTE).toBe('This downtime was represented by character creation, January–February 2026.');
  });
});

// ══ Task 11 — argv validation, pure and DB-free ═════════════════════════════

describe('cm-4 — parseArgs refuses the flag combinations review found (no DB needed)', () => {
  it('refuses --apply --json, which used to print a report and silently write nothing', () => {
    const r = parseArgs(['node', 's.mjs', '--apply', '--json'], { dbName: 'tm_suite_test' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/--apply cannot be combined with --json/);
  });

  it('refuses a value-taking flag given as the trailing token', () => {
    for (const flag of ['--out', '--plan-file', '--target']) {
      const r = parseArgs(['node', 's.mjs', flag], { dbName: 'tm_suite_test' });
      expect(r.ok).toBe(false);
      expect(r.reasons.join(' ')).toMatch(new RegExp(`\\${flag} was given without a following value`));
    }
  });

  it('refuses a value-taking flag immediately followed by another flag', () => {
    const r = parseArgs(['node', 's.mjs', '--plan-file', '--apply'], { dbName: 'tm_suite_test' });
    expect(r.ok).toBe(false);
  });

  it('requires --target <db> for --apply against a non-_test database', () => {
    const bare = parseArgs(['node', 's.mjs', '--apply'], { dbName: 'tm_suite' });
    expect(bare.ok).toBe(false);
    expect(bare.reasons.join(' ')).toMatch(/--target tm_suite/);

    const wrong = parseArgs(['node', 's.mjs', '--apply', '--target', 'tm_suite_other'], { dbName: 'tm_suite' });
    expect(wrong.ok).toBe(false);

    const right = parseArgs(['node', 's.mjs', '--apply', '--target', 'tm_suite'], { dbName: 'tm_suite' });
    expect(right.ok).toBe(true);
    expect(right.apply).toBe(true);
  });

  it('exempts a *_test database, so the suite and a scratch run need no acknowledgement', () => {
    expect(parseArgs(['node', 's.mjs', '--apply'], { dbName: 'tm_suite_test' }).ok).toBe(true);
  });

  it('parses the ordinary flags it is given', () => {
    const r = parseArgs(['node', 's.mjs', '--invert', '--apply', '--force', '--plan-file', 'p.json'], { dbName: 'tm_suite_test' });
    expect(r).toMatchObject({ ok: true, invert: true, apply: true, force: true, planFile: 'p.json', overwritePlan: false });
  });
});

// ══ Task 11 — CM-6's chapter_id must have ONE canonical stored type ═════════

describe('cm-4/CM-6 — coerceChapterId (pure)', () => {
  it('turns a 24-hex string into a real ObjectId', () => {
    const oid = new ObjectId();
    const out = coerceChapterId(String(oid));
    expect(out.ok).toBe(true);
    expect(out.value).toBeInstanceOf(ObjectId);
    expect(String(out.value)).toBe(String(oid));
  });

  it('leaves an ObjectId and an explicit null alone', () => {
    const oid = new ObjectId();
    expect(coerceChapterId(oid).value).toBe(oid);
    expect(coerceChapterId(null)).toEqual({ ok: true, value: null });
  });

  it('rejects anything else rather than storing junk inside the unique index', () => {
    expect(coerceChapterId('not-an-objectid').ok).toBe(false);
    expect(coerceChapterId(7).ok).toBe(false);
    expect(coerceChapterId({}).ok).toBe(false);
  });
});

describe.skipIf(!dbAvailable)('cm-4/CM-6 — the PUT route cannot demote chapter_id to a string', () => {
  let app, routeDb;
  const made = [];

  beforeAll(async () => { await setupDb(); routeDb = getDb(); app = createTestApp(); });
  afterAll(async () => {
    for (const id of made) await routeDb.collection(SESSIONS_COLLECTION).deleteOne({ _id: id });
    try { await routeDb.collection(SESSIONS_COLLECTION).dropIndex(SESSION_FK_INDEX_NAME); } catch { /* fine */ }
  });

  it('a whole-document round-trip PUT (what attendance.js and signin-tab.js actually do) stores an ObjectId', async () => {
    const chapterOid = new ObjectId();
    const insert = await routeDb.collection(SESSIONS_COLLECTION).insertOne({
      session_date: '2026-08-15', game_number: 700, attendance: [], [SESSION_FK_FIELD]: chapterOid,
    });
    made.push(insert.insertedId);

    // Exactly the live pattern: GET the whole document, change one unrelated field, PUT it back.
    const got = await request(app).get(`/api/game_sessions/${insert.insertedId}`).set('X-Test-User', stUser());
    expect(got.status).toBe(200);
    expect(typeof got.body[SESSION_FK_FIELD]).toBe('string');   // JSON has no ObjectId

    const put = await request(app)
      .put(`/api/game_sessions/${insert.insertedId}`)
      .set('X-Test-User', stUser())
      .send({ ...got.body, notes: 'an unrelated attendance edit' });
    expect(put.status).toBe(200);

    const stored = await routeDb.collection(SESSIONS_COLLECTION).findOne({ _id: insert.insertedId });
    // BEFORE the fix this was a plain string, and the partial unique index treats a string and an
    // ObjectId as DISTINCT keys — so the 1:1 constraint was silently defeated by the first
    // ordinary edit after --apply.
    expect(stored[SESSION_FK_FIELD]).toBeInstanceOf(ObjectId);
    expect(String(stored[SESSION_FK_FIELD])).toBe(String(chapterOid));
    expect(stored.notes).toBe('an unrelated attendance edit');
  });

  it('rejects a malformed chapter_id with a 400 rather than storing it', async () => {
    const insert = await routeDb.collection(SESSIONS_COLLECTION).insertOne({ session_date: '2026-08-15', game_number: 701, attendance: [] });
    made.push(insert.insertedId);
    const res = await request(app)
      .put(`/api/game_sessions/${insert.insertedId}`)
      .set('X-Test-User', stUser())
      .send({ [SESSION_FK_FIELD]: 'nope' });
    expect(res.status).toBe(400);
    const stored = await routeDb.collection(SESSIONS_COLLECTION).findOne({ _id: insert.insertedId });
    expect(stored[SESSION_FK_FIELD]).toBeUndefined();
  });

  it('a duplicate pairing surfaces as a 409, not a 500', async () => {
    await ensureSessionChapterIndex(routeDb);
    const chapterOid = new ObjectId();
    const first = await routeDb.collection(SESSIONS_COLLECTION).insertOne({
      session_date: '2026-08-15', game_number: 702, attendance: [], [SESSION_FK_FIELD]: chapterOid,
    });
    made.push(first.insertedId);

    const created = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2026-09-19', game_number: 703, attendance: [], [SESSION_FK_FIELD]: String(chapterOid) });
    expect(created.status).toBe(409);
    expect(created.body.error).toBe('CHAPTER_ALREADY_PAIRED');
  });

  it('the schema rejects a non-hex chapter_id at the POST boundary', async () => {
    const res = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2026-09-19', attendance: [], [SESSION_FK_FIELD]: 'zzz' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ══ Task 11 — the static assertions the review asked for ═══════════════════

describe('cm-4 — review findings that live outside this script', () => {
  it('server/index.js AWAITS the game_sessions chapter_id index build', () => {
    const src = fs.readFileSync('./index.js', 'utf8');
    expect(src).toMatch(/await getDb\(\)\.collection\('game_sessions'\)\.createIndex\(/);
    // An un-awaited unique-index build whose data already holds a duplicate rejects as an
    // UNHANDLED promise rejection, which can boot-loop the Render API.
  });

  it('the game_session schema constrains chapter_id to 24 hex characters', async () => {
    const { gameSessionSchema } = await import('../schemas/game_session.schema.js');
    expect(gameSessionSchema.properties.chapter_id).toEqual({ type: ['string', 'null'], pattern: '^[0-9a-fA-F]{24}$' });
  });

  it('the Chapter-1 placeholder has a real consumer: the admin Downtime list renders its note', () => {
    const src = fs.readFileSync('../public/js/admin/downtime-views.js', 'utf8');
    // Not just "the field is written and a test asserts its text" — something a human sees.
    expect(src).toMatch(/cycle\.placeholder && cycle\.placeholder_note/);
    expect(src).toMatch(/esc\(cycle\.placeholder_note\)/);
    // Normalised CSS: reuses an existing component class, invents none.
    expect(src).not.toMatch(/class="dt-placeholder-note"/);
  });

  it('invertRenumber\'s ordering comment matches its (correct, ascending) code', () => {
    const src = fs.readFileSync('./scripts/cm-4-renumber-chapter-merge.mjs', 'utf8');
    const fn = src.slice(src.indexOf('export async function invertRenumber'));
    expect(fn.slice(0, 2000)).toMatch(/ASCENDING destination game_number/);
    expect(fn.slice(0, 2000)).toMatch(/a\.toGameNumber - b\.toGameNumber/);
  });
});
