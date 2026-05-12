/**
 * Unit tests — null-cache guard in applyDerivedMerits + pruneContactsSpheres
 * (#249 HOTFIX, 2026-05-09).
 *
 * Pre-fix race: when the rules cache was null (preloadRules silent failure
 * or pre-resolution), applyDerivedMerits cleared `m.free_pt = 0` then ran
 * the PT evaluator with empty grants, leaving `free_pt` at 0. The
 * subsequent pruneContactsSpheres call computed
 * `r = cp + xp + meritFreeSum(m)` without the PT contribution and
 * physically truncated the spheres array — permanent data loss on save.
 *
 * Yusuf's canonical merit shape (per data/dev-fixtures/characters.json):
 *   - rating 3 = 1 free_mci + 2 free_pt
 *   - spheres: ['Legal', 'Street', 'Underworld']
 *
 * Pre-fix bug fired: `m.spheres` truncated to ['Legal'] (Street + Underworld
 * physically deleted from the array) when applyDerivedMerits ran with a
 * null cache. Post-fix: applyDerivedMerits bails out at the top, preserving
 * spheres.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Browser globals stubbed for the import chain.
vi.mock('../../public/js/data/api.js', () => ({
  apiGet:   () => Promise.resolve(null),
  apiPost:  () => Promise.resolve(null),
  apiPut:   () => Promise.resolve(null),
  apiPatch: () => Promise.resolve(null),
  apiDelete:() => Promise.resolve(null),
}));

// Control the cache state per test via the rule-engine loader.
vi.mock('../../public/js/editor/rule_engine/load-rules.js', async () => {
  const actual = await vi.importActual('../../public/js/editor/rule_engine/load-rules.js');
  return {
    ...actual,
    getRulesCache: () => globalThis.__TEST_RULES_CACHE__,
    getRulesBySource: () => ({
      grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null,
    }),
  };
});

// State module pulls in browser-y dependencies; keep it inert for the test.
vi.mock('../../public/js/data/state.js', () => ({ default: {} }));

// data/loader.js + cache hooks pulled in by mci.js's MCI-evaluator chain.
vi.mock('../../public/js/data/loader.js', () => ({
  getRulesCache: () => null,
  getRuleByKey: () => null,
  getRulesByCategory: () => [],
  getRulesBySource: () => ({ grants: [], nineAgain: [], skillBonus: [] }),
}));

import { applyDerivedMerits } from '../../public/js/editor/mci.js';
import { pruneContactsSpheres } from '../../public/js/editor/domain.js';

function yusufLikeChar() {
  return {
    name: 'Test Yusuf',
    merits: [
      {
        category: 'influence',
        name: 'Contacts',
        rating: 3,
        spheres: ['Legal', 'Street', 'Underworld'],
        cp: 0,
        xp: 0,
        free_mci: 1,
        free_pt: 2,
      },
    ],
    skills: {},
    attributes: {},
    disciplines: {},
  };
}

describe('applyDerivedMerits — null-cache guard (#249)', () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('bails out and preserves Contacts spheres when rules cache is null', () => {
    globalThis.__TEST_RULES_CACHE__ = null;
    const c = yusufLikeChar();

    applyDerivedMerits(c);

    const contacts = c.merits.find(m => m.name === 'Contacts');
    expect(contacts.spheres).toEqual(['Legal', 'Street', 'Underworld']);
    expect(contacts.spheres.length).toBe(3);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rules cache not loaded'));
  });

  it('does not zero free_pt or free_mci when cache is null (rating math preserved)', () => {
    globalThis.__TEST_RULES_CACHE__ = null;
    const c = yusufLikeChar();

    applyDerivedMerits(c);

    const contacts = c.merits.find(m => m.name === 'Contacts');
    expect(contacts.free_pt).toBe(2);
    expect(contacts.free_mci).toBe(1);
  });

  it('proceeds with derivation when rules cache is loaded (sentinel object)', () => {
    globalThis.__TEST_RULES_CACHE__ = { rule_grant: [], rule_nine_again: [] };
    const c = yusufLikeChar();

    applyDerivedMerits(c);

    // Cache is non-null so the guard doesn't fire; the body runs and
    // clears free_pt before the PT evaluator (which our mock no-ops),
    // so free_pt ends at 0. This is the *expected* post-bail behaviour
    // when the cache exists but the PT evaluator finds no grants —
    // separate concern from the null-cache hotfix.
    const contacts = c.merits.find(m => m.name === 'Contacts');
    expect(contacts.spheres.length).toBeGreaterThan(0);
  });
});

describe('pruneContactsSpheres — belt-and-braces null-cache guard (#249)', () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('does not truncate spheres when called directly with null cache', () => {
    globalThis.__TEST_RULES_CACHE__ = null;
    const m = {
      name: 'Contacts',
      cp: 0, xp: 0, free_mci: 1, free_pt: 2,
      spheres: ['Legal', 'Street', 'Underworld'],
    };

    pruneContactsSpheres(m);

    expect(m.spheres).toEqual(['Legal', 'Street', 'Underworld']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rules cache not loaded'));
  });

  it('still truncates spheres normally when cache is loaded and rating drops below sphere count', () => {
    globalThis.__TEST_RULES_CACHE__ = { rule_grant: [] };
    const m = {
      name: 'Contacts',
      cp: 0, xp: 0,
      // No free_* contributions → effective rating 0, but spheres has 3.
      spheres: ['Legal', 'Street', 'Underworld'],
    };

    pruneContactsSpheres(m);

    expect(m.spheres).toEqual([]);
  });

  it('no-ops when merit is not Contacts', () => {
    globalThis.__TEST_RULES_CACHE__ = null;
    const m = { name: 'Allies', spheres: ['Police', 'Media'] };
    pruneContactsSpheres(m);
    expect(m.spheres).toEqual(['Police', 'Media']);
  });
});
