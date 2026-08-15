/**
 * gdx.6 (#987) — structured vitae_cost/willpower_cost/cost_note on
 * purchasable_powers.
 *
 * Covers:
 *   - parseCostString: classification (zero/parsed/unparsed) against real
 *     row samples this story's own investigation pulled from live tm_suite
 *     (2026-08-15) — see specs/stories/gdx-6-structured-power-costs.md's
 *     Dev Notes for the full cited list.
 *   - planCostMigration: category scoping, bucket counts.
 *   - applyCostMigration / main(): real DB round-trip against
 *     tm_suite_test, dry-run vs --apply, idempotent re-run (AC6 — proven,
 *     not just asserted).
 *   - fmtCostLine (public/js/suite/sheet-helpers.js): the four display
 *     precedence branches from AC7. Import stub technique mirrors
 *     issue-1141-office-tab-render.test.js's own — sheet-helpers.js's
 *     import chain reaches browser globals (window/location/localStorage)
 *     a bare vitest import can't provide.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import {
  parseCostString,
  planCostMigration,
  applyCostMigration,
  COST_CATEGORIES,
} from '../scripts/gdx-6-structured-power-costs.mjs';

const NAME_PREFIX = 'GDX-6 Probe';

async function cleanup() {
  await getCollection('purchasable_powers').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
}

beforeAll(async () => {
  await setupDb();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await teardownDb();
});

// ── parseCostString — real cited samples ────────────────────────────────

describe('parseCostString — real live samples (2026-08-15 investigation)', () => {
  it('zero: null cost (e.g. Feral Whispers, Spirit\'s Touch)', () => {
    expect(parseCostString(null)).toEqual({ classification: 'zero', vitae_cost: 0, willpower_cost: 0, cost_note: null });
  });

  it('zero: "-" sentinel (City Attunement, Conditioning, Cross-Contamination)', () => {
    expect(parseCostString('-')).toEqual({ classification: 'zero', vitae_cost: 0, willpower_cost: 0, cost_note: null });
  });

  it('parsed: plain "N V" (Feral Infection "2 V")', () => {
    expect(parseCostString('2 V')).toEqual({ classification: 'parsed', vitae_cost: 2, willpower_cost: 0, cost_note: null });
  });

  it('parsed: spelled-out "N Vitae" (The Taste of Things Lived "1 Vitae")', () => {
    expect(parseCostString('1 Vitae')).toEqual({ classification: 'parsed', vitae_cost: 1, willpower_cost: 0, cost_note: null });
  });

  it('parsed: plain "N WP" (63 live rites, e.g. Lightning Rod "1 WP")', () => {
    expect(parseCostString('1 WP')).toEqual({ classification: 'parsed', vitae_cost: 0, willpower_cost: 1, cost_note: null });
  });

  it('parsed: combo "N V & M WP" with & separator (Possession "1 V & 1 WP")', () => {
    expect(parseCostString('1 V & 1 WP')).toEqual({ classification: 'parsed', vitae_cost: 1, willpower_cost: 1, cost_note: null });
  });

  it('parsed: combo with + separator, tight spacing (rite "2 V +1 WP")', () => {
    expect(parseCostString('2 V +1 WP')).toEqual({ classification: 'parsed', vitae_cost: 2, willpower_cost: 1, cost_note: null });
  });

  it('parsed: combo with + separator, other tight spacing (rite "3 V + 1WP")', () => {
    expect(parseCostString('3 V + 1WP')).toEqual({ classification: 'parsed', vitae_cost: 3, willpower_cost: 1, cost_note: null });
  });

  it('parsed: "N V per effect" (Celerity/Resilience/Vigour 1-5, every rank)', () => {
    expect(parseCostString('1 V per effect')).toEqual({ classification: 'parsed', vitae_cost: 1, willpower_cost: 0, cost_note: 'per effect' });
  });

  it('parsed: "N V/turn" (Juggernaut\'s Gait "5 V/turn")', () => {
    expect(parseCostString('5 V/turn')).toEqual({ classification: 'parsed', vitae_cost: 5, willpower_cost: 0, cost_note: 'per turn' });
  });

  it('parsed: "N V (qualifier)" keeps the qualifier (Iron Edict "1 V (0 in bond)")', () => {
    expect(parseCostString('1 V (0 in bond)')).toEqual({ classification: 'parsed', vitae_cost: 1, willpower_cost: 0, cost_note: '0 in bond' });
  });

  it('unparsed: genuine choice, not one number (Beast\'s Hackles "Free / 1 V")', () => {
    expect(parseCostString('Free / 1 V')).toEqual({ classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: 'Free / 1 V' });
  });

  it('unparsed: genuine choice, WP base with optional V (Hold my Beer "1 W (Opt 1 V)")', () => {
    expect(parseCostString('1 W (Opt 1 V)')).toEqual({ classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: '1 W (Opt 1 V)' });
  });

  it('unparsed: range, en-dash, WP half not half-populated (Lord of the Land "3–9 V & 1 WP")', () => {
    const r = parseCostString('3–9 V & 1 WP');
    expect(r.classification).toBe('unparsed');
    expect(r.vitae_cost).toBeNull();
    expect(r.willpower_cost).toBeNull(); // deliberately NOT 1, even though the WP half looks clean
    expect(r.cost_note).toBe('3–9 V & 1 WP');
  });

  it('unparsed: "Varies" (Unmarked Grave)', () => {
    expect(parseCostString('Varies')).toEqual({ classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: 'Varies' });
  });

  it('unparsed: body-mutilation devotion, health cost + unquantified Vitae (Eye Behind Glass)', () => {
    const original = '1L (the eye) + Vitae to fix it';
    expect(parseCostString(original)).toEqual({ classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: original });
  });

  it('unparsed: another body-mutilation devotion, verbatim preserved (The Soul Transplant)', () => {
    const original = '1L (sternum) + Vitae; extended surgery on the donor';
    expect(parseCostString(original)).toEqual({ classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: original });
  });

  it('never throws on an unrecognised shape', () => {
    expect(() => parseCostString('???')).not.toThrow();
    expect(parseCostString('???').classification).toBe('unparsed');
  });

  // Review findings (internal 3-layer review, 2026-08-15) — real gaps the
  // original implementation had, none reachable by today's live data, but
  // real regardless: a non-string cost, a whitespace-only cost, and a
  // whitespace-only parenthetical qualifier.

  it('review finding: never throws on a non-string cost (schema types it string|null, but this does not trust that blindly)', () => {
    expect(() => parseCostString(0)).not.toThrow();
    expect(() => parseCostString(false)).not.toThrow();
    expect(() => parseCostString(['1 V'])).not.toThrow();
    expect(parseCostString(0).classification).toBe('unparsed');
  });

  it('review finding: whitespace-only cost is zero, not unparsed-with-garbage', () => {
    expect(parseCostString('   ')).toEqual({ classification: 'zero', vitae_cost: 0, willpower_cost: 0, cost_note: null });
  });

  it('review finding: empty-string cost is zero, not unparsed', () => {
    expect(parseCostString('')).toEqual({ classification: 'zero', vitae_cost: 0, willpower_cost: 0, cost_note: null });
  });

  it('review finding: whitespace-only parenthetical qualifier becomes null, not an empty-string cost_note', () => {
    expect(parseCostString('5 V (   )')).toEqual({ classification: 'parsed', vitae_cost: 5, willpower_cost: 0, cost_note: null });
  });

  it('review finding: unparsed cost_note is trimmed, not the raw untrimmed string', () => {
    expect(parseCostString('  Varies  ')).toEqual({ classification: 'unparsed', vitae_cost: null, willpower_cost: null, cost_note: 'Varies' });
  });
});

// ── planCostMigration ────────────────────────────────────────────────────

describe('planCostMigration', () => {
  it('only reads discipline/devotion/rite categories, never merit/skill/attribute/manoeuvre', async () => {
    const col = getCollection('purchasable_powers');
    const docs = [
      { _id: new ObjectId(), key: 'gdx6-disc', name: `${NAME_PREFIX} Disc`, category: 'discipline', cost: '2 V' },
      { _id: new ObjectId(), key: 'gdx6-merit', name: `${NAME_PREFIX} Merit`, category: 'merit', cost: null },
      { _id: new ObjectId(), key: 'gdx6-skill', name: `${NAME_PREFIX} Skill`, category: 'skill', cost: null },
    ];
    await col.insertMany(docs);

    const plan = await planCostMigration(col);
    const names = [...plan.zero, ...plan.parsed, ...plan.unparsed].map(r => r.name);
    expect(names).toContain(`${NAME_PREFIX} Disc`);
    expect(names).not.toContain(`${NAME_PREFIX} Merit`);
    expect(names).not.toContain(`${NAME_PREFIX} Skill`);
    expect(COST_CATEGORIES).toEqual(['discipline', 'devotion', 'rite']);
  });

  it('buckets a mixed set correctly and counts match', async () => {
    const col = getCollection('purchasable_powers');
    const docs = [
      { _id: new ObjectId(), key: 'gdx6-zero', name: `${NAME_PREFIX} Zero`, category: 'devotion', cost: null },
      { _id: new ObjectId(), key: 'gdx6-parsed', name: `${NAME_PREFIX} Parsed`, category: 'rite', cost: '1 WP' },
      { _id: new ObjectId(), key: 'gdx6-unparsed', name: `${NAME_PREFIX} Unparsed`, category: 'discipline', cost: 'Varies' },
    ];
    await col.insertMany(docs);

    const plan = await planCostMigration(col);
    const zeroNames = plan.zero.map(r => r.name);
    const parsedNames = plan.parsed.map(r => r.name);
    const unparsedNames = plan.unparsed.map(r => r.name);

    expect(zeroNames).toContain(`${NAME_PREFIX} Zero`);
    expect(parsedNames).toContain(`${NAME_PREFIX} Parsed`);
    expect(unparsedNames).toContain(`${NAME_PREFIX} Unparsed`);
    expect(plan.counts.total).toBe(plan.counts.zero + plan.counts.parsed + plan.counts.unparsed);
  });
});

// ── applyCostMigration / main() — real DB round-trip ─────────────────────

describe('applyCostMigration — dry-run vs --apply, idempotency', () => {
  it('dry-run writes nothing', async () => {
    const col = getCollection('purchasable_powers');
    const id = new ObjectId();
    await col.insertOne({ _id: id, key: 'gdx6-dry', name: `${NAME_PREFIX} DryRun`, category: 'devotion', cost: '3 V' });

    const plan = await planCostMigration(col);
    const result = await applyCostMigration(col, plan, { apply: false });
    expect(result.written).toBe(0);

    const after = await col.findOne({ _id: id });
    expect(after.vitae_cost).toBeUndefined();
    expect(after.cost).toBe('3 V'); // untouched either way
  });

  it('--apply sets vitae_cost/willpower_cost/cost_note without touching cost, and never overwrites cost', async () => {
    const col = getCollection('purchasable_powers');
    const id = new ObjectId();
    await col.insertOne({ _id: id, key: 'gdx6-apply', name: `${NAME_PREFIX} Apply`, category: 'discipline', cost: '2 V & 1 WP' });

    const plan = await planCostMigration(col);
    await applyCostMigration(col, plan, { apply: true });

    const after = await col.findOne({ _id: id });
    expect(after.vitae_cost).toBe(2);
    expect(after.willpower_cost).toBe(1);
    expect(after.cost_note).toBeNull();
    expect(after.cost).toBe('2 V & 1 WP'); // legacy field survives untouched
  });

  it('an unparsed row is applied too — vitae_cost/willpower_cost null, cost_note carries the original text', async () => {
    const col = getCollection('purchasable_powers');
    const id = new ObjectId();
    await col.insertOne({ _id: id, key: 'gdx6-unparsed-apply', name: `${NAME_PREFIX} UnparsedApply`, category: 'devotion', cost: 'Free / 1 V' });

    const plan = await planCostMigration(col);
    await applyCostMigration(col, plan, { apply: true });

    const after = await col.findOne({ _id: id });
    expect(after.vitae_cost).toBeNull();
    expect(after.willpower_cost).toBeNull();
    expect(after.cost_note).toBe('Free / 1 V');
  });

  it('AC6: applying twice produces byte-identical results (idempotent by construction)', async () => {
    const col = getCollection('purchasable_powers');
    const id = new ObjectId();
    await col.insertOne({ _id: id, key: 'gdx6-idem', name: `${NAME_PREFIX} Idempotent`, category: 'rite', cost: '1 V' });

    const plan1 = await planCostMigration(col);
    await applyCostMigration(col, plan1, { apply: true });
    const afterFirst = await col.findOne({ _id: id });

    const plan2 = await planCostMigration(col);
    await applyCostMigration(col, plan2, { apply: true });
    const afterSecond = await col.findOne({ _id: id });

    expect(afterSecond).toEqual(afterFirst);
  });
});

// ── fmtCostLine (client) — AC7 precedence branches ───────────────────────

describe('fmtCostLine — display precedence (public/js/suite/sheet-helpers.js)', () => {
  let fmtCostLine;
  const hadLocation = 'location' in globalThis;
  const hadWindow = 'window' in globalThis;

  beforeAll(async () => {
    if (!hadLocation) globalThis.location = { hostname: 'test', pathname: '/' };
    // Review finding: `window = globalThis` (self-alias) meant
    // sheet-helpers.js's own module-top-level `window.suiteToggleExp = ...`
    // / `window.suiteToggleDisc = ...` writes landed directly on
    // `globalThis` — permanent global pollution visible to every later test
    // file in this project's shared single-process vitest run
    // (`fileParallelism: false`/`singleFork: true`). A plain distinct object
    // gives those assignments somewhere to land that `delete globalThis.window`
    // below removes in one shot, taking the leaked functions with it.
    // Confirmed by direct test: import succeeds and fmtCostLine behaves
    // identically either way; `localStorage` (STM-era import chain) is not
    // actually touched at module-eval time, only inside functions this
    // suite never calls, so no stub for it is needed.
    if (!hadWindow) globalThis.window = {};
    ({ fmtCostLine } = await import('../../public/js/suite/sheet-helpers.js'));
  });

  afterAll(() => {
    if (!hadLocation) delete globalThis.location;
    if (!hadWindow) delete globalThis.window;
  });

  it('confirmed free (0/0, no note) renders nothing', () => {
    expect(fmtCostLine({ vitae_cost: 0, willpower_cost: 0, cost_note: null })).toBe('');
  });

  it('a real Vitae-only cost renders "Cost: N Vitae"', () => {
    expect(fmtCostLine({ vitae_cost: 2, willpower_cost: 0, cost_note: null })).toBe('Cost: 2 Vitae');
  });

  it('a real combo cost renders both, joined', () => {
    expect(fmtCostLine({ vitae_cost: 1, willpower_cost: 1, cost_note: null })).toBe('Cost: 1 Vitae & 1 Willpower');
  });

  it('a structured cost with a note appends it in parentheses', () => {
    expect(fmtCostLine({ vitae_cost: 1, willpower_cost: 0, cost_note: 'per effect' })).toBe('Cost: 1 Vitae (per effect)');
  });

  it('both null but a cost_note present shows the note alone (the unparsed case)', () => {
    expect(fmtCostLine({ vitae_cost: null, willpower_cost: null, cost_note: 'Free / 1 V' })).toBe('Cost: Free / 1 V');
  });

  it('fields entirely absent (untouched category) falls back to the legacy cost string', () => {
    expect(fmtCostLine({ cost: '2 V' })).toBe('Cost: 2 V');
  });

  it('fields entirely absent and no legacy cost either renders nothing (matches pre-gdx.6 behaviour)', () => {
    expect(fmtCostLine({})).toBe('');
  });
});
