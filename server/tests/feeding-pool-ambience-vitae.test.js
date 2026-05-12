/**
 * Unit tests — ambience is a Vitae modifier, not a dice pool component (#176).
 *
 * Per Damnation City §158 ambience modifies Vitae yield, not the dice rolled
 * to hunt. Pre-fix `computeBestFeedingPool` summed `ambMod` into `total`,
 * inflating the dice count + double-counting ambience into vitae (more dice
 * → more vessels → more vitae × 2). Post-fix `total` excludes ambMod and
 * the `ambience.mod` field on the returned object stays unchanged so
 * downstream display + Vitae-yield logic can surface it as a separate
 * contribution.
 *
 * Worked example from the issue body (#176 AC):
 *   Presence 8 + Empathy 3 + Auspex 4 + ambience +3 = 15 dice (NOT 18) +
 *   +3 Vitae from ambience.
 *
 * Auspex isn't on Seduction's allowlist; the test mirrors the AC's spirit
 * with method-allowed components instead — Seduction's Majesty is the
 * canonical disc for the example.
 */

import { describe, it, expect, vi } from 'vitest';

// `feeding-pool.js`'s import chain pulls in api.js which references the
// browser-only `location` global at module load. Mock api.js to a stub
// so the chain can resolve under Node. Same hoist-friendly pattern as
// the sibling prereq tests' accessors mock.
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: () => Promise.resolve(null),
  apiPost: () => Promise.resolve(null),
  apiPut: () => Promise.resolve(null),
  apiPatch: () => Promise.resolve(null),
  apiDelete: () => Promise.resolve(null),
}));

vi.mock('../../public/js/data/loader.js', () => ({
  getRulesCache: () => ({}),
  getRuleByKey: () => null,
  getRulesByCategory: () => [],
  getRulesBySource: () => ({ grants: [], nineAgain: [], skillBonus: [] }),
}));

import { computeBestFeedingPool } from '../../public/js/data/feeding-pool.js';

function makeChar({ presence = 8, empathy = 3, majesty = 4 } = {}) {
  return {
    attributes: {
      Presence:    { dots: presence, bonus: 0 },
      Manipulation:{ dots: 0,        bonus: 0 },
    },
    skills: {
      Empathy:    { dots: empathy, bonus: 0, specs: [], nine_again: false },
      Socialise:  { dots: 0,       bonus: 0, specs: [], nine_again: false },
      Persuasion: { dots: 0,       bonus: 0, specs: [], nine_again: false },
    },
    disciplines: {
      Majesty: { dots: majesty, cp: 0, xp: 0, free: 0 },
    },
    merits: [],
  };
}

describe('computeBestFeedingPool — ambience excluded from dice total (#176)', () => {
  it('worked example: Presence 8 + Empathy 3 + Majesty 4 + ambience +3 = 15 dice (NOT 18)', () => {
    const char = makeChar();
    const result = computeBestFeedingPool({
      char,
      methodId: 'seduction',
      territorySlug: 'academy', // ambienceMod: +3 (Curated)
    });
    expect(result).toBeTruthy();
    expect(result.total).toBe(15);
    expect(result.ambience.mod).toBe(3);
  });

  it('preserves ambience.mod field on the returned object', () => {
    const result = computeBestFeedingPool({
      char: makeChar(),
      methodId: 'seduction',
      territorySlug: 'academy',
    });
    expect(result.ambience).toBeTruthy();
    expect(result.ambience.mod).toBe(3);
    expect(result.ambience.label).toBe('Curated');
    expect(result.ambience.territorySlug).toBe('academy');
  });

  it('ambience does not affect dice when territory has zero ambience modifier', () => {
    const result = computeBestFeedingPool({
      char: makeChar(),
      methodId: 'seduction',
      territorySlug: 'dockyards', // ambienceMod: 0 (Settled)
    });
    expect(result.total).toBe(15);
    expect(result.ambience.mod).toBe(0);
  });

  it('negative ambience does not subtract from dice (Hostile / Barrens territories)', () => {
    const result = computeBestFeedingPool({
      char: makeChar(),
      methodId: 'seduction',
      territorySlug: 'harbour', // ambienceMod: -2 (Untended)
    });
    // Pre-fix: would have been 13 (15 + (-2)). Post-fix: 15.
    expect(result.total).toBe(15);
    expect(result.ambience.mod).toBe(-2);
  });

  it('returns null when no method id is supplied', () => {
    expect(computeBestFeedingPool({ char: makeChar() })).toBeNull();
  });
});
