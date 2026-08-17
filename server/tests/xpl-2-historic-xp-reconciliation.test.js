/**
 * xpl.2 — historic XP reconciliation.
 *
 * Two parts:
 *   1. Unit tests for the item parser and `classifyRow`'s classification
 *      logic, built from REAL row shapes and REAL character merit data
 *      pulled directly from production `tm_suite` while dev-storying this
 *      (2026-08-18) — Yusuf Kalusicj's Safe Place/Closed Book rows, Anichka's
 *      Mandragora Garden row, Macheath's Allies/Contacts rows. Macheath's
 *      case is deliberately the interesting one: he holds TWO merits named
 *      "Allies" (Street rating 5, Underworld rating 1) — a real instance of
 *      the same duplicate-named-merit shape xpl.1's own code review already
 *      found and fixed in `xp-ledger-diff.js`. A row's `item` string carries
 *      no qualifier, so confirmation must check every same-named entry, not
 *      just one.
 *   2. A live-DB integration test (tm_suite_test only) proving the full
 *      plan -> apply round-trip: a confirmed row inserts a correctly-shaped
 *      `xp_ledger` document, a second `--apply` run does not duplicate it,
 *      an unconfirmable row is never written even though `--apply` ran, and
 *      (code review, 2026-08-18) a submission with TWO confirmed rows gets
 *      BOTH inserted — the exact real shape (Macheath's own submission) that
 *      the original submission-id-scoped idempotency guard silently dropped.
 *
 * DB-backed part: real MongoDB required. See db-setup.js. A skipped suite is
 * not a passing suite — read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import {
  SCOPE_GAME_NUMBERS,
  MERIT_XP_RATE,
  parseMeritItem,
  parseXpSpendRows,
  classifyRow,
  planReconciliation,
  applyReconciliation,
} from '../scripts/xpl-2-historic-xp-reconciliation.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — unit tests, no DB
// ─────────────────────────────────────────────────────────────────────────────

describe('parseMeritItem', () => {
  it('parses a graduated-form merit item', () => {
    expect(parseMeritItem('Safe Place|grad|2|3')).toEqual({
      name: 'Safe Place', form: 'grad', currentDots: 2, maxTarget: 3,
    });
  });

  it('parses a flat-form merit item', () => {
    expect(parseMeritItem('True Worm|flat|2|0')).toEqual({
      name: 'True Worm', form: 'flat', rating: 2,
    });
  });

  it('handles a bare trait name (attribute/skill/discipline shape) as an unknown form', () => {
    expect(parseMeritItem('Investigation')).toEqual({ name: 'Investigation', form: '' });
  });

  it('reports a truncated graduated-form item (missing target segment) as malformed rather than defaulting the target to 0', () => {
    expect(parseMeritItem('Safe Place|grad|2')).toEqual({ name: 'Safe Place', form: 'grad-malformed' });
  });

  it('reports a graduated-form item with a non-numeric target as malformed', () => {
    expect(parseMeritItem('Safe Place|grad|2|abc')).toEqual({ name: 'Safe Place', form: 'grad-malformed' });
  });
});

describe('parseXpSpendRows', () => {
  it('parses a real multi-row JSON string (Yusuf Kalusicj)', () => {
    const raw = '[{"category":"merit","item":"True Worm|flat|2|0","dotsBuying":0,"xpCost":2},' +
      '{"category":"merit","item":"Safe Place|grad|2|3","dotsBuying":1,"xpCost":1},' +
      '{"category":"merit","item":"Closed Book|grad|0|3","dotsBuying":1,"xpCost":1}]';
    const rows = parseXpSpendRows(raw);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ category: 'merit', item: 'Safe Place|grad|2|3', dotsBuying: 1, xpCost: 1 });
  });

  it('returns an empty array for undefined/empty input', () => {
    expect(parseXpSpendRows(undefined)).toEqual([]);
    expect(parseXpSpendRows('')).toEqual([]);
  });

  it('returns an empty array for malformed JSON rather than throwing', () => {
    expect(parseXpSpendRows('{not valid json')).toEqual([]);
  });

  it('returns an empty array when the JSON parses but is not an array', () => {
    expect(parseXpSpendRows('{"category":"merit"}')).toEqual([]);
  });
});

describe('classifyRow', () => {
  it('confirms a graduated merit row when the matching live entry meets the target (Anichka-shape, positive case)', () => {
    const row = { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 };
    const meritEntriesByName = new Map([['Mandragora Garden', [{ rating: 3 }]]]);
    expect(classifyRow(row, meritEntriesByName)).toEqual({
      classification: 'confirmed', trait_name: 'Mandragora Garden', maxTarget: 3, currentDots: 0,
    });
  });

  it('is unconfirmable when the real live rating is below target (Anichka\'s actual production Mandragora Garden row: target 3, live rating 1)', () => {
    const row = { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 };
    const meritEntriesByName = new Map([['Mandragora Garden', [{ rating: 1 }]]]);
    const result = classifyRow(row, meritEntriesByName);
    expect(result.classification).toBe('unconfirmable');
    expect(result.trait_name).toBe('Mandragora Garden');
    expect(result.reason).toMatch(/targets 3 dots/);
    // AC3 symmetry (code review, 2026-08-18): unconfirmable grad rows still
    // carry the structured target/current-dots detail, not just free text.
    expect(result.maxTarget).toBe(3);
    expect(result.currentDots).toBe(0);
  });

  it('is unconfirmable when the character has no live merit by that name at all (Yusuf\'s actual production Safe Place/Closed Book rows)', () => {
    const row = { category: 'merit', item: 'Safe Place|grad|2|3', dotsBuying: 1, xpCost: 1 };
    const meritEntriesByName = new Map(); // Yusuf's live sheet has no "Safe Place" merit
    const result = classifyRow(row, meritEntriesByName);
    expect(result.classification).toBe('unconfirmable');
    expect(result.reason).toMatch(/no live merit by that name/);
    expect(result.maxTarget).toBe(3);
  });

  it('confirms via ANY same-named entry, not just the first (Macheath\'s actual production Allies row: two "Allies" merits, Street=5 and Underworld=1, target=3)', () => {
    const row = { category: 'merit', item: 'Allies|grad|2|3', dotsBuying: 1 };
    const meritEntriesByName = new Map([
      ['Allies', [{ area: 'Underworld', rating: 1 }, { area: 'Street', rating: 5 }]],
    ]);
    expect(classifyRow(row, meritEntriesByName)).toMatchObject({ classification: 'confirmed', trait_name: 'Allies' });
  });

  it('does NOT confirm when every same-named entry is below target', () => {
    const row = { category: 'merit', item: 'Allies|grad|2|3', dotsBuying: 1 };
    const meritEntriesByName = new Map([
      ['Allies', [{ area: 'Underworld', rating: 1 }, { area: 'Bureaucracy', rating: 2 }]],
    ]);
    const result = classifyRow(row, meritEntriesByName);
    expect(result.classification).toBe('unconfirmable');
    expect(result.reason).toMatch(/best current live rating is 2/);
  });

  it('is unconfirmable for a flat-form merit row (no before/after to compare)', () => {
    const row = { category: 'merit', item: 'True Worm|flat|2|0', dotsBuying: 1, xpCost: 2 };
    const result = classifyRow(row, new Map([['True Worm', [{ rating: 2 }]]]));
    expect(result.classification).toBe('unconfirmable');
    expect(result.reason).toMatch(/flat-form/);
  });

  it('is unconfirmable for a malformed graduated-form row (missing target) rather than trivially confirming against any rating', () => {
    const row = { category: 'merit', item: 'Truncated Merit|grad|2', dotsBuying: 1 };
    // Even a live entry with rating 0 would have "confirmed" this under the
    // old `maxTarget = Number(undefined) || 0` bug (0 >= 0). It must not.
    const result = classifyRow(row, new Map([['Truncated Merit', [{ rating: 0 }]]]));
    expect(result.classification).toBe('unconfirmable');
    expect(result.reason).toMatch(/malformed/);
  });

  it('is unconfirmable for a skill row (no dots snapshot at all — Macheath\'s Investigation shape)', () => {
    const row = { category: 'skill', item: 'Investigation', dotsBuying: 1 };
    const result = classifyRow(row, new Map());
    expect(result.classification).toBe('unconfirmable');
    expect(result.trait_name).toBe('Investigation');
    expect(result.reason).toMatch(/skill row carries no before\/after/);
  });

  it('is unconfirmable for an attribute row the same way as a skill row', () => {
    const row = { category: 'attribute', item: 'Strength', dotsBuying: 1 };
    expect(classifyRow(row, new Map()).classification).toBe('unconfirmable');
  });

  it('is unconfirmable for a discipline row the same way', () => {
    const row = { category: 'discipline', item: 'Auspex', dotsBuying: 1 };
    expect(classifyRow(row, new Map()).classification).toBe('unconfirmable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — live-DB integration test (tm_suite_test only)
// ─────────────────────────────────────────────────────────────────────────────

const dbAvailable = await isDbAvailable();

// Deterministic fixture ids so this suite only ever touches its own rows.
const oid = n => new ObjectId(`ab12cd34`.padStart(8, '0') + String(n).padStart(16, '0'));

const CHAPTER_1 = oid(1); // game_number 1 — must be excluded (no submissions anyway)
const CHAPTER_2 = oid(2); // game_number 2 — must be excluded (no xp_spend data)
const CHAPTER_3 = oid(3); // in scope

const CHAR_CONFIRMED = oid(10);   // has live merits that corroborate the historic requests
const CHAR_UNCONFIRMABLE = oid(11); // does not
const CHAR_MULTI = oid(12);       // Macheath-shape: two confirmed rows in one submission
const CHAR_DUP = oid(13);         // requests the same target twice, across two submissions

const SUB_CONFIRMED = oid(20);
const SUB_UNCONFIRMABLE = oid(21);
const SUB_OUT_OF_SCOPE = oid(22); // sits on the excluded game_number:2 chapter
const SUB_MULTI = oid(23);        // two confirmed rows, one submission (Macheath shape)
const SUB_MALFORMED = oid(24);    // malformed grad item + negative dotsBuying
const SUB_NO_CHAR = oid(25);      // character_id does not resolve to any live character
const SUB_NO_DATE = oid(26);      // confirmed merit, but no submitted_at/created_at at all
const SUB_DUP_A = oid(27);        // first of two submissions requesting the same target
const SUB_DUP_B = oid(28);        // second — must be recognised as the same purchase, not double-inserted

const ALL_CHAPTER_IDS = [CHAPTER_1, CHAPTER_2, CHAPTER_3];
const ALL_CHAR_IDS = [CHAR_CONFIRMED, CHAR_UNCONFIRMABLE, CHAR_MULTI, CHAR_DUP];
const ALL_SUB_IDS = [
  SUB_CONFIRMED, SUB_UNCONFIRMABLE, SUB_OUT_OF_SCOPE, SUB_MULTI,
  SUB_MALFORMED, SUB_NO_CHAR, SUB_NO_DATE, SUB_DUP_A, SUB_DUP_B,
];

/** These fixtures never carry a real ObjectId `_id` document key for
 * `xp_ledger` rows (inserts get their own auto `_id`); scope ledger cleanup
 * to `character_id`, which every inserted row does carry. */
const LEDGER_CLEANUP_CHAR_IDS = [CHAR_CONFIRMED, CHAR_UNCONFIRMABLE, CHAR_MULTI, CHAR_DUP];

describe.skipIf(!dbAvailable)('xpl.2 historic reconciliation — live DB', () => {
  beforeAll(async () => {
    await setupDb();
  });

  beforeEach(async () => {
    await getCollection('chapters').deleteMany({ _id: { $in: ALL_CHAPTER_IDS } });
    await getCollection('chapters').insertMany([
      { _id: CHAPTER_1, game_number: 1, label: 'Game 1', placeholder: true, submission_count: 0 },
      { _id: CHAPTER_2, game_number: 2, label: 'Game 2', submission_count: 1 },
      { _id: CHAPTER_3, game_number: 3, label: 'Game 3', submission_count: 2 },
    ]);

    await getCollection('characters').deleteMany({ _id: { $in: ALL_CHAR_IDS } });
    await getCollection('characters').insertMany([
      {
        _id: CHAR_CONFIRMED,
        name: 'XPL2 Fixture Confirmed',
        merits: [
          { category: 'domain', name: 'Mandragora Garden', rating: 3 },
        ],
      },
      {
        _id: CHAR_UNCONFIRMABLE,
        name: 'XPL2 Fixture Unconfirmable',
        merits: [
          { category: 'domain', name: 'Mandragora Garden', rating: 1 },
        ],
      },
      {
        // Macheath shape: two DIFFERENT merits, both corroborated live.
        _id: CHAR_MULTI,
        name: 'XPL2 Fixture Multi',
        merits: [
          { category: 'influence', name: 'Allies', area: 'Street', rating: 5 },
          { category: 'influence', name: 'Contacts', area: 'Street', rating: 7 },
        ],
      },
      {
        _id: CHAR_DUP,
        name: 'XPL2 Fixture Duplicate Request',
        merits: [
          { category: 'domain', name: 'Mandragora Garden', rating: 3 },
        ],
      },
    ]);

    await getCollection('downtime_submissions').deleteMany({ _id: { $in: ALL_SUB_IDS } });
    await getCollection('downtime_submissions').insertMany([
      {
        _id: SUB_CONFIRMED,
        chapter_id: CHAPTER_3,
        character_id: CHAR_CONFIRMED,
        character_name: 'XPL2 Fixture Confirmed',
        submitted_at: '2026-05-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 }, // no xpCost — cost reconstruction path
          ]),
        },
      },
      {
        _id: SUB_UNCONFIRMABLE,
        chapter_id: CHAPTER_3,
        character_id: CHAR_UNCONFIRMABLE,
        character_name: 'XPL2 Fixture Unconfirmable',
        submitted_at: '2026-05-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 },
            { category: 'skill', item: 'Investigation', dotsBuying: 0 }, // zero row — must not appear in either bucket
          ]),
        },
      },
      {
        _id: SUB_OUT_OF_SCOPE,
        chapter_id: CHAPTER_2, // excluded game_number
        character_id: CHAR_CONFIRMED,
        character_name: 'XPL2 Fixture Confirmed',
        submitted_at: '2026-02-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 },
          ]),
        },
      },
      {
        // The bug all three review layers converged on: two confirmed rows,
        // one submission. Must produce TWO ledger rows, not one.
        _id: SUB_MULTI,
        chapter_id: CHAPTER_3,
        character_id: CHAR_MULTI,
        character_name: 'XPL2 Fixture Multi',
        submitted_at: '2026-05-15T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Allies|grad|2|3', dotsBuying: 1 },
            { category: 'merit', item: 'Contacts|grad|4|5', dotsBuying: 1, xpCost: 1 },
          ]),
        },
      },
      {
        _id: SUB_MALFORMED,
        chapter_id: CHAPTER_3,
        character_id: CHAR_CONFIRMED,
        character_name: 'XPL2 Fixture Confirmed',
        submitted_at: '2026-05-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|2', dotsBuying: 1 }, // malformed: missing target
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: -1 }, // negative dotsBuying
          ]),
        },
      },
      {
        _id: SUB_NO_CHAR,
        chapter_id: CHAPTER_3,
        character_id: null, // no character link at all
        character_name: 'XPL2 Fixture No Character',
        submitted_at: '2026-05-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 },
          ]),
        },
      },
      {
        _id: SUB_NO_DATE,
        chapter_id: CHAPTER_3,
        character_id: CHAR_CONFIRMED,
        character_name: 'XPL2 Fixture Confirmed',
        // No submitted_at, no created_at.
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 },
          ]),
        },
      },
      {
        // Two different submissions independently requesting the SAME
        // character reach the SAME target on the SAME merit — a duplicate
        // historic request. Must be credited exactly once.
        _id: SUB_DUP_A,
        chapter_id: CHAPTER_3,
        character_id: CHAR_DUP,
        character_name: 'XPL2 Fixture Duplicate Request',
        submitted_at: '2026-05-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 },
          ]),
        },
      },
      {
        _id: SUB_DUP_B,
        chapter_id: CHAPTER_3,
        character_id: CHAR_DUP,
        character_name: 'XPL2 Fixture Duplicate Request',
        submitted_at: '2026-06-01T00:00:00.000Z',
        responses: {
          xp_spend: JSON.stringify([
            { category: 'merit', item: 'Mandragora Garden|grad|0|3', dotsBuying: 1 },
          ]),
        },
      },
    ]);

    // Clean up any prior run's ledger rows for these fixture characters.
    await getCollection('xp_ledger').deleteMany({ character_id: { $in: LEDGER_CLEANUP_CHAR_IDS } });
  });

  afterAll(async () => {
    await getCollection('chapters').deleteMany({ _id: { $in: ALL_CHAPTER_IDS } });
    await getCollection('characters').deleteMany({ _id: { $in: ALL_CHAR_IDS } });
    await getCollection('downtime_submissions').deleteMany({ _id: { $in: ALL_SUB_IDS } });
    await getCollection('xp_ledger').deleteMany({ character_id: { $in: LEDGER_CLEANUP_CHAR_IDS } });
    await teardownDb();
  });

  it('scopes to game_number 3-7 only, excluding the out-of-scope submission entirely', async () => {
    const plan = await planReconciliation(
      getCollection('downtime_submissions'),
      getCollection('characters'),
      getCollection('chapters'),
    );

    const allSubmissionIds = [...plan.confirmed, ...plan.unconfirmable].map(r => String(r.submission_id));
    expect(allSubmissionIds).not.toContain(String(SUB_OUT_OF_SCOPE));
  });

  it('classifies the confirmed and unconfirmable fixture rows correctly, and excludes the zero row from both buckets', async () => {
    const plan = await planReconciliation(
      getCollection('downtime_submissions'),
      getCollection('characters'),
      getCollection('chapters'),
    );

    const confirmedForSub = plan.confirmed.filter(r => String(r.submission_id) === String(SUB_CONFIRMED));
    expect(confirmedForSub).toHaveLength(1);
    expect(confirmedForSub[0]).toMatchObject({
      trait_name: 'Mandragora Garden', maxTarget: 3, dotsBuying: 1, game_number: 3,
    });

    const unconfirmedForSub = plan.unconfirmable.filter(r => String(r.submission_id) === String(SUB_UNCONFIRMABLE));
    expect(unconfirmedForSub).toHaveLength(1); // the merit row only — the zero skill row must not appear here
    expect(unconfirmedForSub[0].trait_name).toBe('Mandragora Garden');
  });

  it('plans BOTH rows of a multi-confirmed-row submission as confirmed (Macheath shape)', async () => {
    const plan = await planReconciliation(
      getCollection('downtime_submissions'),
      getCollection('characters'),
      getCollection('chapters'),
    );
    const confirmedForMulti = plan.confirmed.filter(r => String(r.submission_id) === String(SUB_MULTI));
    expect(confirmedForMulti).toHaveLength(2);
    expect(confirmedForMulti.map(r => r.trait_name).sort()).toEqual(['Allies', 'Contacts']);
  });

  it('reports a malformed grad item and a negative dotsBuying as distinct unconfirmable rows, not silently dropped or zero-bucketed', async () => {
    const plan = await planReconciliation(
      getCollection('downtime_submissions'),
      getCollection('characters'),
      getCollection('chapters'),
    );
    const forSub = plan.unconfirmable.filter(r => String(r.submission_id) === String(SUB_MALFORMED));
    expect(forSub).toHaveLength(2);
    expect(forSub.some(r => /malformed/.test(r.reason) && r.dotsBuying === 1)).toBe(true);
    expect(forSub.some(r => /malformed or negative/.test(r.reason) && r.dotsBuying === -1)).toBe(true);
    // Neither leaked into the confirmed bucket or the zero count.
    expect(plan.confirmed.some(r => String(r.submission_id) === String(SUB_MALFORMED))).toBe(false);
  });

  it('reports a missing character link as its own reason, not a misleading "no live merit by that name"', async () => {
    const plan = await planReconciliation(
      getCollection('downtime_submissions'),
      getCollection('characters'),
      getCollection('chapters'),
    );
    const forSub = plan.unconfirmable.filter(r => String(r.submission_id) === String(SUB_NO_CHAR));
    expect(forSub).toHaveLength(1);
    expect(forSub[0].reason).toMatch(/no character_id at all/);
  });

  it('routes an otherwise-confirmed row with no submitted_at/created_at to unconfirmable instead of writing at:null', async () => {
    const plan = await planReconciliation(
      getCollection('downtime_submissions'),
      getCollection('characters'),
      getCollection('chapters'),
    );
    expect(plan.confirmed.some(r => String(r.submission_id) === String(SUB_NO_DATE))).toBe(false);
    const forSub = plan.unconfirmable.filter(r => String(r.submission_id) === String(SUB_NO_DATE));
    expect(forSub).toHaveLength(1);
    expect(forSub[0].reason).toMatch(/neither submitted_at nor created_at/);
    expect(forSub[0].maxTarget).toBe(3); // still confirmed against live state — only the date is missing
  });

  it('round-trips a confirmed row through --apply into a correctly-shaped xp_ledger document, is idempotent on a second run, and never writes the unconfirmable row', async () => {
    const submissionsCol = getCollection('downtime_submissions');
    const charactersCol = getCollection('characters');
    const chaptersCol = getCollection('chapters');
    const ledgerCol = getCollection('xp_ledger');

    const plan = await planReconciliation(submissionsCol, charactersCol, chaptersCol);
    const confirmedForSub = plan.confirmed.filter(r => String(r.submission_id) === String(SUB_CONFIRMED));

    const first = await applyReconciliation(ledgerCol, confirmedForSub, { apply: true });
    expect(first).toEqual({ inserted: 1, wouldInsert: 0, skipped: 0 });

    const inserted = await ledgerCol.findOne({ character_id: CHAR_CONFIRMED, trait_name: 'Mandragora Garden' });
    expect(inserted).toMatchObject({
      character_id: CHAR_CONFIRMED,
      category: 'merit',
      trait_name: 'Mandragora Garden',
      delta: 1 * MERIT_XP_RATE, // no xpCost on the fixture row — cost reconstruction path
      new_total: 3 * MERIT_XP_RATE, // maxTarget-based cumulative total
      at: '2026-05-01T00:00:00.000Z',
      st_username: 'historic-reconciliation',
    });
    expect(inserted.reason).toContain(String(SUB_CONFIRMED));
    expect(inserted.reason).toContain('Game 3');

    // Second --apply run: idempotent, no duplicate.
    const second = await applyReconciliation(ledgerCol, confirmedForSub, { apply: true });
    expect(second).toEqual({ inserted: 0, wouldInsert: 0, skipped: 1 });
    const count = await ledgerCol.countDocuments({ character_id: CHAR_CONFIRMED, trait_name: 'Mandragora Garden' });
    expect(count).toBe(1);

    // The unconfirmable submission's row was never passed to applyReconciliation
    // at all (main()'s own wiring only ever forwards plan.confirmed) — confirm
    // nothing for it exists in the ledger regardless.
    const unconfirmedLedgerRow = await ledgerCol.findOne({ character_id: CHAR_UNCONFIRMABLE });
    expect(unconfirmedLedgerRow).toBeNull();
  });

  it('dry-run mode reports wouldInsert, not inserted, and writes nothing', async () => {
    const submissionsCol = getCollection('downtime_submissions');
    const charactersCol = getCollection('characters');
    const chaptersCol = getCollection('chapters');
    const ledgerCol = getCollection('xp_ledger');

    const plan = await planReconciliation(submissionsCol, charactersCol, chaptersCol);
    const confirmedForSub = plan.confirmed.filter(r => String(r.submission_id) === String(SUB_CONFIRMED));

    const result = await applyReconciliation(ledgerCol, confirmedForSub, { apply: false });
    expect(result).toEqual({ inserted: 0, wouldInsert: 1, skipped: 0 });

    const count = await ledgerCol.countDocuments({ character_id: CHAR_CONFIRMED });
    expect(count).toBe(0);
  });

  it('inserts BOTH rows of a multi-confirmed-row submission (regression test for the critical idempotency-collision bug)', async () => {
    const submissionsCol = getCollection('downtime_submissions');
    const charactersCol = getCollection('characters');
    const chaptersCol = getCollection('chapters');
    const ledgerCol = getCollection('xp_ledger');

    const plan = await planReconciliation(submissionsCol, charactersCol, chaptersCol);
    const confirmedForMulti = plan.confirmed.filter(r => String(r.submission_id) === String(SUB_MULTI));
    expect(confirmedForMulti).toHaveLength(2); // guard the fixture itself before trusting the apply result

    const result = await applyReconciliation(ledgerCol, confirmedForMulti, { apply: true });
    expect(result).toEqual({ inserted: 2, wouldInsert: 0, skipped: 0 });

    const rows = await ledgerCol.find({ character_id: CHAR_MULTI }).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.trait_name).sort()).toEqual(['Allies', 'Contacts']);
    const allies = rows.find(r => r.trait_name === 'Allies');
    const contacts = rows.find(r => r.trait_name === 'Contacts');
    expect(allies).toMatchObject({ delta: 1, new_total: 3 }); // reconstructed cost — no xpCost on this row
    expect(contacts).toMatchObject({ delta: 1, new_total: 5 }); // row's own xpCost: 1

    // Re-running does not duplicate either row.
    const second = await applyReconciliation(ledgerCol, confirmedForMulti, { apply: true });
    expect(second).toEqual({ inserted: 0, wouldInsert: 0, skipped: 2 });
    expect(await ledgerCol.countDocuments({ character_id: CHAR_MULTI })).toBe(2);
  });

  it('credits a duplicate historic request for the same character+trait+target exactly once, across two different submissions', async () => {
    const submissionsCol = getCollection('downtime_submissions');
    const charactersCol = getCollection('characters');
    const chaptersCol = getCollection('chapters');
    const ledgerCol = getCollection('xp_ledger');

    const plan = await planReconciliation(submissionsCol, charactersCol, chaptersCol);
    const confirmedForDup = plan.confirmed.filter(r => String(r.character_id) === String(CHAR_DUP));
    expect(confirmedForDup).toHaveLength(2); // both submissions independently confirm — the plan itself doesn't dedup

    const result = await applyReconciliation(ledgerCol, confirmedForDup, { apply: true });
    // One inserts, the second is recognised as the same real purchase and skipped —
    // not because it re-processed the same row, but because character+trait+new_total
    // already matches what the first insert wrote.
    expect(result).toEqual({ inserted: 1, wouldInsert: 0, skipped: 1 });
    expect(await ledgerCol.countDocuments({ character_id: CHAR_DUP })).toBe(1);
  });

  it('SCOPE_GAME_NUMBERS matches the live cm-4 renumber (3-7) — a drift guard, not a behavioral test on its own (query scoping is covered above)', () => {
    expect(SCOPE_GAME_NUMBERS).toEqual([3, 4, 5, 6, 7]);
  });
});
