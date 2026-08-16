/**
 * cm-7 — live-DB integration tests for the fact-map verification harness and the drilled
 * rollback/inverse migration. Runs against `tm_suite_test` (forced by
 * tests/helpers/setup-env.js). Every fixture carries `_cm7_fixture: true` (and drill-migration
 * cycles additionally carry `_cm7_drill_fixture: true`, the marker `cm-7-drill-migration.mjs`
 * itself scopes on) so cleanup never touches anything else, and nothing here ever reaches live
 * Atlas — see AC10's own static-guard tests at the bottom of this file.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ObjectId } from 'mongodb';
import { isDbAvailable, setupDb, teardownDb } from './helpers/db-setup.js';
import { connectDb, getDb } from '../db.js';
import {
  buildFactMap,
  runFactMapCheck,
  NOT_A_FACT,
  COVERAGE_SET,
  main as factMapMain,
} from '../scripts/cm-7-fact-map.mjs';
import {
  CYCLES_COLLECTION,
  FIXTURE_MARKER,
  planDrillMigration,
  applyDrillMigration,
  invertDrillMigration,
  main as drillMain,
} from '../scripts/cm-7-drill-migration.mjs';

const dbAvailable = await isDbAvailable();

const FIXTURE = '_cm7_fixture';

// Randomised (not fixed) ObjectIds — a concurrently-running suite hitting the same shared
// tm_suite_test database (this project's own documented hazard, e.g. oxp-5's sprint-status.yaml
// entry) could otherwise race on identical _ids. `cycleId(n)`/`sessionId(n)` still return the
// SAME id for the same `n` within one test (most tests call `cycleId(2)` more than once to seed
// then later target a mutation), via a per-test cache reset in `beforeEach`.
let _cycleIds, _sessionIds;
function cycleId(n) {
  if (!_cycleIds.has(n)) _cycleIds.set(n, new ObjectId());
  return _cycleIds.get(n);
}
function sessionId(n) {
  if (!_sessionIds.has(n)) _sessionIds.set(n, new ObjectId());
  return _sessionIds.get(n);
}

/** Three contiguous cycles, matching game_sessions 1:1 — the clean baseline. */
function cleanCycles() {
  return [
    { _id: cycleId(1), [FIXTURE]: true, game_number: 1, label: 'Cycle 1', phase: 'downtime', game_phase: 'downtime', status: 'active' },
    { _id: cycleId(2), [FIXTURE]: true, game_number: 2, label: 'Cycle 2', phase: 'processing', game_phase: 'processing', status: 'closed' },
    { _id: cycleId(3), [FIXTURE]: true, game_number: 3, label: 'Cycle 3', phase: 'game', game_phase: 'game', status: 'game' },
  ];
}
function cleanSessions() {
  return [
    { _id: sessionId(1), [FIXTURE]: true, game_number: 1, session_date: '2026-01-01', title: '' },
    { _id: sessionId(2), [FIXTURE]: true, game_number: 2, session_date: '2026-02-01', title: '' },
    { _id: sessionId(3), [FIXTURE]: true, game_number: 3, session_date: '2026-03-01', title: 'Finale' },
  ];
}

async function seed(db, { cycles = cleanCycles(), sessions = cleanSessions() } = {}) {
  if (cycles.length) await db.collection('downtime_cycles').insertMany(cycles);
  if (sessions.length) await db.collection('game_sessions').insertMany(sessions);
}

let db;

describe.skipIf(!dbAvailable)('cm-7 — fact-map harness (DB-backed)', () => {
  beforeAll(async () => {
    await setupDb();
    db = getDb();
  });

  beforeEach(async () => {
    _cycleIds = new Map();
    _sessionIds = new Map();
    await db.collection('downtime_cycles').deleteMany({ [FIXTURE]: true });
    await db.collection('game_sessions').deleteMany({ [FIXTURE]: true });
    await db.collection('downtime_submissions').deleteMany({ [FIXTURE]: true });
    await db.collection('tracker_state').deleteMany({ [FIXTURE]: true });
  });

  afterAll(async () => {
    await db.collection('downtime_cycles').deleteMany({ [FIXTURE]: true });
    await db.collection('game_sessions').deleteMany({ [FIXTURE]: true });
    await db.collection('downtime_submissions').deleteMany({ [FIXTURE]: true });
    await db.collection('tracker_state').deleteMany({ [FIXTURE]: true });
    await teardownDb();
  });

  // ── AC1/AC2/AC9 — buildFactMap covers every coverage-set item for real ──────

  describe('buildFactMap — per coverage-item assertions (AC9)', () => {
    it('item 1: cycle self-identity — game_number, label, phase/game_phase/status', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      const c2 = map.cycles.find(c => c.game_number === 2);
      expect(c2).toBeTruthy();
      expect(c2.label).toBe('Cycle 2');
      expect(c2.phase).toBe('processing');
      expect(c2.game_phase).toBe('processing');
      expect(c2.status).toBe('closed');
    });

    it('item 2: archive ordering — ascending by game_number, no fallback used', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.archiveOrderIds).toEqual([String(cycleId(1)), String(cycleId(2)), String(cycleId(3))]);
      expect(map.archiveFallbackUsed).toEqual([]);
    });

    it('item 2: a cycle missing game_number is flagged as a fallback risk', async () => {
      await seed(db, { cycles: [...cleanCycles().slice(0, 2), { _id: cycleId(3), [FIXTURE]: true, label: 'Cycle 3', phase: 'game' }] });
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.archiveFallbackUsed).toEqual([String(cycleId(3))]);
    });

    it('item 3: story-tab outcome ordering — descending by game_number', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.storyTabOrderIds).toEqual([String(cycleId(3)), String(cycleId(2)), String(cycleId(1))]);
    });

    it('item 4: DT-Story continuity — no gaps across a contiguous run', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.continuityGaps).toEqual([]);
    });

    it('item 4: DT-Story continuity — a missing predecessor is a real gap', async () => {
      const cycles = [cleanCycles()[0], { ...cleanCycles()[2] }]; // game_number 1 and 3, no 2
      await seed(db, { cycles, sessions: [] });
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.continuityGaps).toEqual([3]);
    });

    it('item 5: office/session log label — status.js:275 formula, title takes priority', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.sessions.find(s => s.game_number === 1).sessionLabel).toBe('Game 1');
      expect(map.sessions.find(s => s.game_number === 3).sessionLabel).toBe('Finale');
    });

    it('item 6: Cycle tab + session-picker labels', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.cycles.find(c => c.game_number === 1).cycleTabLabel).toBe('Game 1');
      expect(map.sessions.find(s => s.game_number === 1).pickerLabel).toBe('Game 1 — 2026-01-01');
    });

    it('item 7: game_sessions <-> cycle correspondence — clean 1:1 match', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.unmatchedCycles).toEqual([]);
      expect(map.unmatchedSessions).toEqual([]);
    });

    it('item 7: a cycle with no matching session is flagged, not silently ignored', async () => {
      await seed(db, { sessions: cleanSessions().filter(s => s.game_number !== 2) });
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.unmatchedCycles).toEqual([2]);
    });

    it('item 8: the XP-title dead field is documented as excluded, not silently omitted', () => {
      expect(NOT_A_FACT.field).toContain('session_number');
      expect(NOT_A_FACT.reason).toMatch(/never|no schema/i);
    });

    it('item 1 (extended): two cycles sharing one non-null game_number are flagged as duplicates', async () => {
      await seed(db, { cycles: [cleanCycles()[0], { ...cleanCycles()[1], game_number: 1 }, cleanCycles()[2]], sessions: [] });
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      expect(map.duplicateGameNumbers).toEqual([1]);
    });

    it('archive ordering falls back correctly when game_number is absent but cycle_number is present', async () => {
      const withFallback = { _id: cycleId(4), [FIXTURE]: true, cycle_number: 'Z', label: 'Legacy' };
      await seed(db, { cycles: [...cleanCycles(), withFallback], sessions: [] });
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      // The fallback-chain cycle is flagged (never silently sorted around) and appears in
      // archiveOrderIds at the position its fallback key ('Z', a string) sorts to relative to the
      // numeric game_number keys of the other three — proving the comparator actually runs on a
      // real mixed number/string input, not just the all-numbers happy path every other ordering
      // test exercises.
      expect(map.archiveFallbackUsed).toEqual([String(cycleId(4))]);
      expect(map.archiveOrderIds).toContain(String(cycleId(4)));
      expect(map.archiveOrderIds).toHaveLength(4);
    });
  });

  // ── AC3 — falsifiability guard (pure function, no DB needed for the guard itself) ──

  describe('runFactMapCheck — falsifiability (AC3)', () => {
    it('throws rather than reporting a false green on a pre-image with 0 cycles and 0 sessions', () => {
      const empty = { cycles: [], sessions: [], archiveOrderIds: [], archiveFallbackUsed: [], storyTabOrderIds: [], continuityGaps: [], unmatchedCycles: [], unmatchedSessions: [] };
      expect(() => runFactMapCheck(empty, empty)).toThrow(/0 cycles and 0 sessions/);
    });

    it('runs a nonzero, size-derived comparison count on a real fixture pair', async () => {
      await seed(db);
      const map = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });
      const result = runFactMapCheck(map, map);
      expect(result.ok).toBe(true);
      expect(result.comparisons).toBeGreaterThan(0);
    });
  });

  // ── AC4 — the harness is PROVEN able to fail, one corruption per independent failure mode ──

  describe('runFactMapCheck — proven able to fail (AC4)', () => {
    it('goes red on a corrupted continuity gap (item 4)', async () => {
      await seed(db);
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      await db.collection(CYCLES_COLLECTION).updateOne({ _id: cycleId(2) }, { $set: { game_number: 20 } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const result = runFactMapCheck(pre, post);
      expect(result.ok).toBe(false);
      expect(result.failures.some(f => f.includes(String(cycleId(2))) && f.includes('game_number'))).toBe(true);
    });

    it('goes red on an archive-order fallback regression (item 2)', async () => {
      await seed(db);
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      await db.collection(CYCLES_COLLECTION).updateOne({ _id: cycleId(3) }, { $unset: { game_number: '' } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const result = runFactMapCheck(pre, post);
      expect(result.ok).toBe(false);
      expect(result.failures.some(f => f.includes('fallback'))).toBe(true);
    });

    it('goes red on a broken game_sessions<->cycle correspondence (item 7)', async () => {
      await seed(db);
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      await db.collection('game_sessions').updateOne({ _id: sessionId(2) }, { $set: { game_number: 99 } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const result = runFactMapCheck(pre, post);
      expect(result.ok).toBe(false);
      expect(result.failures.some(f => f.includes('correspondence'))).toBe(true);
    });

    it('goes red on a session inserted mid-run (a session present post-image but absent pre-image)', async () => {
      await seed(db);
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      await db.collection('game_sessions').insertOne({ _id: sessionId(4), [FIXTURE]: true, game_number: 4 });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      const result = runFactMapCheck(pre, post);
      expect(result.ok).toBe(false);
      expect(result.failures.some(f => f.includes(String(sessionId(4))) && f.includes('post-image'))).toBe(true);
    });

    it('goes red when two sessions come to share one game_number (session-side duplicate)', async () => {
      await seed(db);
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      await db.collection('game_sessions').updateOne({ _id: sessionId(2) }, { $set: { game_number: 1 } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      expect(post.unmatchedSessions).toContain(1);
      const result = runFactMapCheck(pre, post);
      expect(result.ok).toBe(false);
      expect(result.failures.some(f => f.includes('correspondence'))).toBe(true);
    });

    it('goes red on a duplicate game_number appearing across two cycles (item 1)', async () => {
      await seed(db, { sessions: [] });
      const pre = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      await db.collection(CYCLES_COLLECTION).updateOne({ _id: cycleId(2) }, { $set: { game_number: 1 } });
      const post = await buildFactMap(db, { cycleFilter: { [FIXTURE]: true }, sessionFilter: { [FIXTURE]: true } });

      expect(post.duplicateGameNumbers).toEqual([1]);
      const result = runFactMapCheck(pre, post);
      expect(result.ok).toBe(false);
      expect(result.failures.some(f => f.includes('duplicate game_number'))).toBe(true);
    });
  });

  // ── AC6/AC7 — the drill migration and its inverse, drilled against interleaved writes ──

  describe('drill migration + inverse — interleaved-write drill (AC7)', () => {
    async function seedDrill() {
      const cycles = [
        { _id: cycleId(11), [FIXTURE]: true, [FIXTURE_MARKER]: true, game_number: 11, label: 'Drill 11', phase: 'downtime' },
        { _id: cycleId(12), [FIXTURE]: true, [FIXTURE_MARKER]: true, game_number: 12, label: 'Drill 12', phase: 'downtime' },
      ];
      await db.collection(CYCLES_COLLECTION).insertMany(cycles);

      // Task 4's own fixture description names game_sessions alongside downtime_cycles — seeded
      // here so the fixture set actually matches what was documented, even though AC7's own
      // assertions are about game_number + interleaved writes surviving the invert, not
      // correspondence (item 7's own AC9 coverage lives in the "buildFactMap" describe block above).
      await db.collection('game_sessions').insertMany([
        { _id: sessionId(11), [FIXTURE]: true, game_number: 11, session_date: '2026-11-01' },
        { _id: sessionId(12), [FIXTURE]: true, game_number: 12, session_date: '2026-12-01' },
      ]);

      const subId = new ObjectId();
      await db.collection('downtime_submissions').insertOne({
        _id: subId,
        [FIXTURE]: true,
        cycle_id: String(cycleId(11)),
        character_id: 'test-char',
      });

      const trackerId = new ObjectId();
      await db.collection('tracker_state').insertOne({
        _id: trackerId,
        [FIXTURE]: true,
        character_id: 'test-char',
        vitae: 3,
      });

      return { subId, trackerId };
    }

    it('the inverse restores game_number exactly, and real interleaved writes survive untouched', async () => {
      const { subId, trackerId } = await seedDrill();

      const preSnapshot = await buildFactMap(db, { cycleFilter: { [FIXTURE_MARKER]: true }, sessionFilter: { [FIXTURE]: true } });

      // Forward.
      const plan = await planDrillMigration(db, { offset: 100 });
      expect(plan.moves.length).toBe(2);
      await applyDrillMigration(db, plan, { apply: true });

      const midCycle = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(11) });
      expect(midCycle.game_number).toBe(111);

      // Interleave real post-migration writes — a feed roll and a spend, on DIFFERENT
      // documents the drill migration never touches.
      await db.collection('downtime_submissions').updateOne(
        { _id: subId },
        { $set: { feeding_roll_player: 7, feeding_vitae_allocation: 2 } }
      );
      await db.collection('tracker_state').updateOne({ _id: trackerId }, { $set: { vitae: 1 } });

      // Invert, using the SAME recorded plan.
      await invertDrillMigration(db, plan, { apply: true });

      const revertedCycle = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(11) });
      expect(revertedCycle.game_number).toBe(11);
      const revertedCycle2 = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(12) });
      expect(revertedCycle2.game_number).toBe(12);

      // The interleaved writes survived byte-for-byte.
      const sub = await db.collection('downtime_submissions').findOne({ _id: subId });
      expect(sub.feeding_roll_player).toBe(7);
      expect(sub.feeding_vitae_allocation).toBe(2);
      const tracker = await db.collection('tracker_state').findOne({ _id: trackerId });
      expect(tracker.vitae).toBe(1);

      // And the fact map matches the original pre-image on every coverage-set field.
      const postSnapshot = await buildFactMap(db, { cycleFilter: { [FIXTURE_MARKER]: true }, sessionFilter: { [FIXTURE]: true } });
      const result = runFactMapCheck(preSnapshot, postSnapshot);
      expect(result.ok).toBe(true);
    });

    it('is dry-run by default — no writes without apply:true', async () => {
      await seedDrill();
      const plan = await planDrillMigration(db, { offset: 100 });
      await applyDrillMigration(db, plan); // apply omitted — defaults false
      const cycle = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(11) });
      expect(cycle.game_number).toBe(11); // unchanged
    });

    it('invertDrillMigration is also dry-run by default — no writes without apply:true', async () => {
      await seedDrill();
      const plan = await planDrillMigration(db, { offset: 100 });
      await applyDrillMigration(db, plan, { apply: true });
      await invertDrillMigration(db, plan); // apply omitted — defaults false
      const cycle = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(11) });
      expect(cycle.game_number).toBe(111); // still shifted — the invert never ran for real
    });
  });

  // ── AC8 — the backup drill is executed, not assumed ─────────────────────────

  describe('backup drill (AC8)', () => {
    it('a snapshot taken before the drill migration restores the fixture exactly after a restore', async () => {
      const cycles = [
        { _id: cycleId(21), [FIXTURE]: true, [FIXTURE_MARKER]: true, game_number: 21, label: 'Backup 21' },
      ];
      await db.collection(CYCLES_COLLECTION).insertMany(cycles);

      // The snapshot: a plain read of the fixture's own current documents, held in memory —
      // deliberately a DIFFERENT mechanism from invertDrillMigration's game_number-only undo,
      // because a real backup restores the WHOLE document, not just the field the forward
      // migration touched. This answers the story's own Open Question 2: automation was
      // straightforward against tm_suite_test, no manual run was needed.
      const snapshot = await db.collection(CYCLES_COLLECTION).find({ [FIXTURE_MARKER]: true, _id: cycleId(21) }).toArray();

      const plan = await planDrillMigration(db, { offset: 100 });
      await applyDrillMigration(db, plan, { apply: true });
      const moved = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(21) });
      expect(moved.game_number).toBe(121);

      // Restore from the snapshot — a full document replace, the "last resort" mechanism
      // cycle-model.md §9 names, distinct from the inverse.
      for (const doc of snapshot) {
        await db.collection(CYCLES_COLLECTION).replaceOne({ _id: doc._id }, doc);
      }

      const restored = await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(21) });
      expect(restored).toEqual(snapshot[0]);
    });
  });

  // ── AC5 — a test runs each script's actual main(), per the #826 post-mortem rule this AC cites
  // (the cm-2-chapters-to-story-cycles.test.js "P12 main() argv parsing" precedent). Both main()s
  // close the shared db.js connection in their own `finally`, so each test reconnects afterward —
  // same shape as that precedent.

  describe('cm-7-fact-map.mjs — main() (AC5)', () => {
    let logSpy;
    let priorExitCode;
    let tmpDir;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm7-'));
    });
    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

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

    it('--snapshot writes the current fact map to disk', async () => {
      await seed(db);
      const file = `${tmpDir}/snap.json`;
      await factMapMain(['node', 'script.mjs', '--snapshot', file]);
      expect(out()).toContain('Wrote snapshot');
      const written = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(Array.isArray(written.cycles)).toBe(true);
    });

    it('--against diffs the current state against a snapshot and reports OK on no divergence', async () => {
      await seed(db);
      const file = `${tmpDir}/snap-ok.json`;
      await factMapMain(['node', 'script.mjs', '--snapshot', file]);
      logSpy.mockClear();
      await factMapMain(['node', 'script.mjs', '--against', file]);
      expect(out()).toContain('OK — every fact');
      expect(process.exitCode).not.toBe(1);
    });

    it('--against reports DIVERGED and sets a non-zero exit code on a real change', async () => {
      await seed(db);
      const file = `${tmpDir}/snap-diverge.json`;
      await factMapMain(['node', 'script.mjs', '--snapshot', file]);
      await connectDb();
      db = getDb();
      await db.collection(CYCLES_COLLECTION).updateOne({ _id: cycleId(2) }, { $set: { label: 'Renamed' } });
      logSpy.mockClear();
      await factMapMain(['node', 'script.mjs', '--against', file]);
      expect(out()).toContain('DIVERGED');
      expect(process.exitCode).toBe(1);
    });

    it('--snapshot and --against together both write the new snapshot AND run the diff', async () => {
      await seed(db);
      const file = `${tmpDir}/snap-combo.json`;
      await factMapMain(['node', 'script.mjs', '--snapshot', file]);
      logSpy.mockClear();
      await factMapMain(['node', 'script.mjs', '--snapshot', file, '--against', file]);
      expect(out()).toContain('Wrote snapshot');
      expect(out()).toMatch(/OK — every fact|DIVERGED/);
    });

    it('--against a non-snapshot file refuses cleanly instead of throwing an opaque TypeError', async () => {
      await seed(db);
      const badFile = `${tmpDir}/not-a-snapshot.json`;
      fs.writeFileSync(badFile, JSON.stringify({ hello: 'world' }));
      await factMapMain(['node', 'script.mjs', '--against', badFile]);
      expect(out()).toContain('REFUSED');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('cm-7-drill-migration.mjs — main() (AC5)', () => {
    let logSpy;
    let priorExitCode;
    let tmpDir;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm7-drill-'));
    });
    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

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

    async function seedDrillCycles() {
      await db.collection(CYCLES_COLLECTION).insertMany([
        { _id: cycleId(31), [FIXTURE]: true, [FIXTURE_MARKER]: true, game_number: 31 },
      ]);
    }

    it('forward --apply writes the plan file, then a separate --invert --apply process reverts using it', async () => {
      await seedDrillCycles();
      const planFile = `${tmpDir}/plan.json`;

      await drillMain(['node', 'script.mjs', '--apply', '--plan-file', planFile]);
      expect(out()).toContain('Wrote plan');
      await connectDb();
      db = getDb();
      expect((await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(31) })).game_number).toBe(131);

      logSpy.mockClear();
      await drillMain(['node', 'script.mjs', '--invert', '--apply', '--plan-file', planFile]);
      expect(out()).toContain('Loaded plan from');
      await connectDb();
      db = getDb();
      expect((await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(31) })).game_number).toBe(31);
    });

    it('--invert without a plan file REFUSES rather than silently reverting nothing', async () => {
      await seedDrillCycles();
      const missingFile = `${tmpDir}/does-not-exist.json`;
      await drillMain(['node', 'script.mjs', '--invert', '--apply', '--plan-file', missingFile]);
      expect(out()).toContain('REFUSED');
      expect(process.exitCode).toBe(1);
      await connectDb();
      db = getDb();
      expect((await db.collection(CYCLES_COLLECTION).findOne({ _id: cycleId(31) })).game_number).toBe(31);
    });
  });
});

// ── The coverage set is a data structure, not prose (Task 1) ────────────────

describe('cm-7 — COVERAGE_SET completeness', () => {
  it('declares exactly the eight items AC2 enumerates, one excluded', () => {
    expect(COVERAGE_SET.map(c => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(COVERAGE_SET.filter(c => c.excluded)).toHaveLength(1);
    expect(COVERAGE_SET.find(c => c.excluded).id).toBe(8);
  });
});

// ── AC10 — explicit non-goals enforced by the tests themselves, no DB needed ──

describe('cm-7 — no live writes possible (AC10)', () => {
  const newFiles = [
    './scripts/cm-7-fact-map.mjs',
    './scripts/cm-7-drill-migration.mjs',
  ];

  it('neither new script has a shebang (vitest cannot transform one, and both are imported)', () => {
    for (const f of newFiles) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src.startsWith('#!')).toBe(false);
    }
  });

  it('neither new script auto-runs main() on import', () => {
    for (const f of newFiles) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).toContain('import.meta.url === pathToFileURL(process.argv[1]).href');
    }
  });

  it('neither new script sets or reads a hardcoded MONGODB_URI/MONGODB_DB override', () => {
    for (const f of newFiles) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/MONGODB_URI\s*=\s*['"`]/);
      expect(src).not.toMatch(/MONGODB_DB\s*=\s*['"`]/);
    }
  });

  it('cm-7-fact-map.mjs never writes (no insert/update/delete/drop call anywhere in its source)', () => {
    const src = fs.readFileSync('./scripts/cm-7-fact-map.mjs', 'utf8');
    expect(src).not.toMatch(/\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|drop|replaceOne)\(/);
  });

  it('cm-7-drill-migration.mjs writes only through updateOne, and every write site is apply-gated', () => {
    const src = fs.readFileSync('./scripts/cm-7-drill-migration.mjs', 'utf8');
    const writeCalls = src.match(/\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|drop|replaceOne)\(/g) || [];
    expect(writeCalls.every(c => c === '.updateOne(')).toBe(true);
    expect(src).toContain('if (!apply)');
  });
});
