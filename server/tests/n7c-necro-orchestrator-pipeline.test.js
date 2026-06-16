/**
 * N-7c (issue #771) — end-to-end pipeline test for the Necropolis pool grant.
 *
 * Per Khepri's lesson extending feedback_render_wiring_placement: the existing
 * N-7 suites tested the helpers (hasNecropolisSepulcher / getNecropolisTargets /
 * poolAvailableFor) with manually-seeded `_grant_pools`, which silently bypassed
 * the producer — the orchestrator dispatch in applyDerivedMerits that fills
 * _grant_pools from the rule_grant doc. The missing dispatch slipped past the
 * 25-case behavioural + static suite because the test seam mocked the pool
 * state directly.
 *
 * This file runs the full pipeline:
 *   1. Build a Sepulcher-3 character with Catacombs.
 *   2. Run `applyDerivedMerits` against a rules cache containing the N-3
 *      Necropolis Sepulcher rule_grant doc.
 *   3. Assert `c._grant_pools` actually received the necro entry.
 *   4. Call `shRenderDomainMerits` and assert the rendered HTML contains the
 *      pool counter AND the NECRO stepper.
 *
 * If the orchestrator regresses (line removed from mci.js), this test fails
 * on assertion 3 long before render — catching the producer-level bug at the
 * producer level. Helper-mocked tests can't do that.
 */

// Browser shims — sheet.js + applyDerivedMerits's import chain transitively
// pull api.js's `location` reference.
globalThis.location = {
  origin: 'http://localhost:8080',
  hostname: 'localhost',
  href: 'http://localhost:8080/admin',
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
};

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

let applyDerivedMerits;
let shRenderDomainMerits;
let shRenderGeneralMerits;
let stateMod;
let loadRulesMod;

// N-3 rule_grant doc shape — matches what seed-rules-necropolis.js writes.
// `amount_basis: 'rating_of_source'` makes the pool equal the Sepulcher's own
// purchased rating (cp+xp). `condition: 'merit_present'` is the gate the
// pool-evaluator uses to pick up this rule.
const NECRO_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  category: 'necro',
  pool_targets: [
    'Catacombs', 'Caldarium', 'Garbage Pit',
    'Labyrinth Guardians', 'Dark Temple', 'White Ants',
  ],
};

function mkRulesCache() {
  return {
    rule_grant: [NECRO_GRANT],
    rule_nine_again: [],
    rule_skill_bonus: [],
    rule_speciality_grant: [],
    rule_tier_budget: [],
    rule_disc_attr: [],
    rule_derived_stat_modifier: [],
  };
}

beforeAll(async () => {
  const mciUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'mci.js')).href;
  ({ applyDerivedMerits } = await import(mciUrl));

  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits, shRenderGeneralMerits } = await import(sheetUrl));

  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
});

beforeEach(() => {
  const cache = mkRulesCache();
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue(cache);
  // getRulesBySource is what the orchestrator's per-source dispatch calls.
  // Real shape mirrors load-rules.js:50-58 — filter by source across each
  // family. Most families are empty for this test so we just return the
  // grants for the requested source.
  vi.spyOn(loadRulesMod, 'getRulesBySource').mockImplementation((source) => ({
    grants:           (cache.rule_grant            || []).filter(r => r.source === source),
    nineAgain:        (cache.rule_nine_again       || []).filter(r => r.source === source),
    skillBonus:       (cache.rule_skill_bonus      || []).filter(r => r.source === source),
    specialityGrants: (cache.rule_speciality_grant || []).filter(r => r.source === source),
    tierBudget:       (cache.rule_tier_budget      || []).find(r => r.source === source) || null,
  }));
});

function mkYusufLike(catacombsCp = 0, catacombsFreeNecro = 0) {
  return {
    _id: 'n7c-yusuf',
    name: 'N7c Yusuf',
    clan: 'Nosferatu',
    covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits: [
      { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: catacombsCp, xp: 0,
        free_grants: catacombsFreeNecro ? { necro: catacombsFreeNecro } : {} },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Producer-level: orchestrator fills _grant_pools
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7c — applyDerivedMerits dispatches Necropolis pool evaluator', () => {
  it('fills c._grant_pools with the necro entry after applyDerivedMerits runs', () => {
    const c = mkYusufLike();
    applyDerivedMerits(c, []);

    const necroEntry = (c._grant_pools || []).find(p => p.category === 'necro');
    expect(necroEntry, 'Necropolis pool entry must be present in _grant_pools after orchestrator runs').toBeDefined();
    expect(necroEntry.source).toBe('Necropolis Sepulcher');
    expect(necroEntry.amount).toBe(3); // rating_of_source: Sepulcher cp=3 xp=0
    expect(necroEntry.names).toEqual(expect.arrayContaining(['Catacombs', 'Caldarium', 'White Ants']));
  });

  it('emits no necro pool entry when Sepulcher is absent', () => {
    const c = {
      _id: 'n7c-no-sep', name: 'N7c No Sepulcher',
      clan: 'Nosferatu', covenant: 'Invictus',
      status: { city: 0, clan: 0, covenant: {} },
      attributes: {}, skills: {}, disciplines: {}, powers: [],
      merits: [{ name: 'Catacombs', category: 'domain', cp: 0, xp: 0 }],
    };
    applyDerivedMerits(c, []);
    const necroEntry = (c._grant_pools || []).find(p => p.category === 'necro');
    expect(necroEntry).toBeUndefined();
  });

  it('pool amount tracks Sepulcher purchased rating (cp + xp)', () => {
    const c = mkYusufLike();
    c.merits[0].cp = 1;
    c.merits[0].xp = 4; // total 5
    applyDerivedMerits(c, []);
    const necroEntry = (c._grant_pools || []).find(p => p.category === 'necro');
    expect(necroEntry.amount).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end: orchestrator → render produces the pool counter + stepper
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7c — full pipeline: applyDerivedMerits → shRenderDomainMerits', () => {
  it('renders the Necropolis pool counter in the domain section', () => {
    const c = mkYusufLike();
    applyDerivedMerits(c, []);

    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    // Pool counters for all three categories are rendered by _renderPoolCounters
    // calls that live inside shRenderGeneralMerits (sheet.js:1335) — the domain
    // section's counter surfaces from the general renderer, not the domain one.
    // Production wiring assembles general + influence + domain blocks together,
    // so the counter renders for users; this test calls the general renderer
    // directly to surface the counter assertion in isolation.
    const html = shRenderGeneralMerits(c, true);
    expect(html).toContain('Necropolis Sepulcher');
    expect(html).toMatch(/0\s*\/\s*3/); // 0 used / 3 available
  });

  it('renders the NECRO stepper with cap 3 on a fresh Catacombs row', () => {
    const c = mkYusufLike(0, 0);
    applyDerivedMerits(c, []);

    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);
    expect(html).toContain('NECRO');
    expect(html).toContain('free_grants.necro');
    // a11y additions per N-7c secondary fix — id + aria-label so browsers
    // don't flag the form-field warning.
    expect(html).toMatch(/id="bd-necro-\d+"/);
    expect(html).toContain('aria-label="Necropolis pool allocation"');
  });

  it('pool counter reflects spent dots when free_grants.necro is set', () => {
    const c = mkYusufLike(0, 2); // Catacombs has 2 necro dots allocated
    applyDerivedMerits(c, []);

    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderGeneralMerits(c, true);
    expect(html).toMatch(/2\s*\/\s*3/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guard — orchestrator dispatch present at the right place
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7c — orchestrator dispatch sanity guard', () => {
  it('applyDerivedMerits contains the Necropolis Sepulcher pool dispatch', () => {
    const src = read('public/js/editor/mci.js');
    expect(src).toMatch(/applyPoolRulesFromDb\(c,\s*getRulesBySource\(['"]Necropolis Sepulcher['"]\)\)/);
  });

  it('NECRO stepper has id + aria-label for accessibility', () => {
    const src = read('public/js/editor/xp.js');
    expect(src).toMatch(/id="bd-necro-/);
    expect(src).toMatch(/aria-label="Necropolis pool allocation"/);
  });
});
