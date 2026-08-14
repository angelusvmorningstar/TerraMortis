/**
 * DBO-1 — schema declares `special`, cleanup script strips dead fields.
 *
 * Two halves:
 *   1. Schema validation (AC1, AC5): `special` is declared and accepts the
 *      real live shapes; `selected` stays undeclared and is rejected.
 *   2. Cleanup script (AC2, AC3): `planCleanup`/`applyCleanup`, exercised
 *      through their exported functions against `tm_suite_test` only, never
 *      by shelling out. Proves `selected` is stripped everywhere and
 *      `special` is stripped everywhere EXCEPT the literal value
 *      `'standing'`, which must survive byte-for-byte.
 *
 * DB-backed for part 2: real MongoDB required. A skipped suite is not a
 * passing suite — read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Ajv from 'ajv';
import { purchasablePowerSchema } from '../schemas/purchasable_power.schema.js';
import { setupDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { planCleanup, applyCleanup } from '../scripts/dbo-1-purchasable-powers-field-cleanup.mjs';

describe('DBO-1: purchasable_power schema — special declared, selected undeclared', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(purchasablePowerSchema);

  // Minimal real-shape base — mirrors the live Mystery Cult Initiation /
  // Professional Training documents (category, key, name, rating_range),
  // not a bare `{special: ...}` stub.
  const baseMerit = {
    key: 'test-merit', name: 'Test Merit', category: 'merit',
    parent: 'Social', rank: null, rating_range: [1, 5],
    pool: null, resistance: null, cost: null,
    action: null, duration: null, prereq: null, exclusive: null,
    xp_fixed: null, bloodline: null, implemented: true,
    cult: null, offering: null, sub_category: null,
  };

  it('validates the real MCI/PT shape: special === "standing"', () => {
    expect(validate({ ...baseMerit, special: 'standing' })).toBe(true);
  });

  it('validates special: null (the other 515 live rows)', () => {
    expect(validate({ ...baseMerit, special: null })).toBe(true);
  });

  it('validates special absent entirely', () => {
    expect(validate({ ...baseMerit })).toBe(true);
  });

  it('rejects any other special value', () => {
    expect(validate({ ...baseMerit, special: 'anything-else' })).toBe(false);
  });

  it('still rejects a document carrying `selected` — stays undeclared on purpose', () => {
    expect(validate({ ...baseMerit, special: null, selected: true })).toBe(false);
    const additionalProps = (validate.errors || []).map(e => e.params?.additionalProperty);
    expect(additionalProps).toContain('selected');
  });
});

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('DBO-1: dbo-1-purchasable-powers-field-cleanup.mjs', () => {
  const KEY_PREFIX = 'dbo-1-test-';
  const keys = {
    bothStray: `${KEY_PREFIX}both-stray`,       // selected + special:null
    selectedOnly: `${KEY_PREFIX}selected-only`,  // selected only
    specialOnly: `${KEY_PREFIX}special-only`,    // special:null only
    standing: `${KEY_PREFIX}standing`,           // special:'standing' + selected — must survive special, lose selected
    caseVariant: `${KEY_PREFIX}case-variant`,    // special:'Standing' — must NOT be preserved
    whitespaceVariant: `${KEY_PREFIX}ws-variant`, // special:'standing ' — must NOT be preserved
    clean: `${KEY_PREFIX}clean`,                 // neither field — must be left out of the plan entirely
  };

  const fixtures = () => ([
    { key: keys.bothStray, name: 'Both Stray', category: 'merit', selected: true, special: null },
    { key: keys.selectedOnly, name: 'Selected Only', category: 'merit', selected: false },
    { key: keys.specialOnly, name: 'Special Only', category: 'merit', special: null },
    { key: keys.standing, name: 'Standing', category: 'merit', selected: true, special: 'standing' },
    { key: keys.caseVariant, name: 'Case Variant', category: 'merit', special: 'Standing' },
    { key: keys.whitespaceVariant, name: 'Whitespace Variant', category: 'merit', special: 'standing ' },
    { key: keys.clean, name: 'Clean', category: 'merit' },
  ]);

  async function cleanupFixtures() {
    await getCollection('purchasable_powers').deleteMany({ key: { $regex: `^${KEY_PREFIX}` } });
  }

  beforeAll(async () => { await setupDb(); });
  beforeEach(async () => {
    await cleanupFixtures();
    await getCollection('purchasable_powers').insertMany(fixtures());
  });
  afterAll(async () => { await cleanupFixtures(); });

  it('plans exactly the rows needing a change, omitting the clean one', async () => {
    const col = getCollection('purchasable_powers');
    const rows = await planCleanup(col);
    const byKey = Object.fromEntries(
      rows.filter(r => r.key?.startsWith(KEY_PREFIX)).map(r => [r.key, r])
    );

    expect(byKey[keys.bothStray]).toEqual(expect.objectContaining({ unsetSelected: true, unsetSpecial: true }));
    expect(byKey[keys.selectedOnly]).toEqual(expect.objectContaining({ unsetSelected: true, unsetSpecial: false }));
    expect(byKey[keys.specialOnly]).toEqual(expect.objectContaining({ unsetSelected: false, unsetSpecial: true }));
    expect(byKey[keys.standing]).toEqual(expect.objectContaining({ unsetSelected: true, unsetSpecial: false }));
    expect(byKey[keys.caseVariant]).toEqual(expect.objectContaining({ unsetSpecial: true }));
    expect(byKey[keys.whitespaceVariant]).toEqual(expect.objectContaining({ unsetSpecial: true }));
    expect(byKey[keys.clean]).toBeUndefined();
  });

  it('dry run (default) writes nothing', async () => {
    const col = getCollection('purchasable_powers');
    const rows = await planCleanup(col);
    const result = await applyCleanup(col, rows, { apply: false });

    expect(result).toEqual({ cleaned: 0, backedUp: 0 });
    const standing = await col.findOne({ key: keys.standing });
    expect(standing.selected).toBe(true);
    expect(standing.special).toBe('standing');
  });

  it('apply strips selected everywhere and special only where it is not "standing"', async () => {
    const col = getCollection('purchasable_powers');
    const rows = await planCleanup(col);
    const result = await applyCleanup(col, rows, { apply: true });

    expect(result.cleaned).toBe(rows.length);

    const bothStray = await col.findOne({ key: keys.bothStray });
    expect(bothStray).not.toHaveProperty('selected');
    expect(bothStray).not.toHaveProperty('special');

    const selectedOnly = await col.findOne({ key: keys.selectedOnly });
    expect(selectedOnly).not.toHaveProperty('selected');

    const specialOnly = await col.findOne({ key: keys.specialOnly });
    expect(specialOnly).not.toHaveProperty('special');

    const caseVariant = await col.findOne({ key: keys.caseVariant });
    expect(caseVariant).not.toHaveProperty('special');

    const whitespaceVariant = await col.findOne({ key: keys.whitespaceVariant });
    expect(whitespaceVariant).not.toHaveProperty('special');
  });

  it('AC3 — the "standing" row survives byte-for-byte: special kept, only selected removed', async () => {
    const col = getCollection('purchasable_powers');
    const before = await col.findOne({ key: keys.standing });
    const rows = await planCleanup(col);
    await applyCleanup(col, rows, { apply: true });

    const after = await col.findOne({ key: keys.standing });
    expect(after.special).toBe('standing');
    expect(after).not.toHaveProperty('selected');
    // Every other field is untouched.
    const { selected: _dropped, ...restBefore } = before;
    const { selected: _alsoDropped, ...restAfter } = after;
    expect(restAfter).toEqual(restBefore);
  });

  it('is idempotent: re-planning after apply finds nothing left for these fixtures', async () => {
    const col = getCollection('purchasable_powers');
    const firstPlan = await planCleanup(col);
    await applyCleanup(col, firstPlan, { apply: true });

    const secondPlan = await planCleanup(col);
    const remaining = secondPlan.filter(r => r.key?.startsWith(KEY_PREFIX));
    expect(remaining).toEqual([]);
  });
});
