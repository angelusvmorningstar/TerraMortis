/**
 * BL-2 (issue #1008) — `clanDiscList` rewired to the cache, with a loud miss.
 *
 * AC 3, 8, 9. This is the file that matters. `clanDiscList` feeds the XP cost
 * multiplier at `editor/edit.js:654` (in-clan 3/dot, out-of-clan 4), so every
 * assertion here is really an assertion about what a player is charged.
 *
 * The old implementation was:
 *   BLOODLINE_DISCS[c?.bloodline] || CLAN_DISCS[c?.clan] || []
 * whose miss path returned the CLAN list: well-formed, plausible, wrong, and
 * silent. That is how Ocka Keats' disciplines cost 4 instead of 3 for two
 * weeks (data-map.md drift pattern #15).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BLOODLINE_DISCS, BLOODLINE_CLANS, CLAN_DISCS } from '../../public/js/data/constants.js';
import { buildSeedDocs } from '../scripts/seed-bloodlines.js';

const api = vi.hoisted(() => ({ get: null }));
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: async (...a) => api.get(...a),
}));

// The miss label goes through `displayName`, which honours redact mode (an ST
// may be sharing their screen), and redact mode reads three browser globals.
// Stub them so the tests exercise the real labelling path rather than
// `_missLabel`'s last-resort catch.
globalThis.location ??= { hostname: 'localhost', pathname: '/admin.html' };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

/**
 * The documents `GET /api/bloodlines` will actually serve once the seed runs.
 *
 * Built by the REAL seed builder rather than hand-rolled from the constants,
 * with `notes` projected out exactly as `server/routes/bloodlines.js` does. The
 * first cut of this file constructed the documents itself, which made the
 * all-23 equivalence test a tautology — it proved the cache round-trips its own
 * input and would have stayed green against a seed that dropped a discipline.
 * This way the chain under test is seed builder → route shape → cache →
 * accessor, which is the chain that actually runs.
 */
function docsFromConstants() {
  return buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })
    .map(({ notes, ...served }, i) => ({ _id: String(i), ...served }));
}

/** Fresh module graph per test — the cache is module-level state. */
async function freshModules({ payload = docsFromConstants(), load = true } = {}) {
  vi.resetModules();
  api.get = typeof payload === 'function' ? payload : async () => payload;
  const cache = await import('../../public/js/data/bloodlines-cache.js');
  const accessors = await import('../../public/js/data/accessors.js');
  if (load) await cache.loadBloodlines();
  return { cache, accessors };
}

beforeEach(() => { api.get = null; });

// ─────────────────────────────────────────────────────────────────────────────
// The three paths (AC 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — clanDiscList, no bloodline', () => {
  it('falls back to the clan list, exactly as before', async () => {
    const { accessors } = await freshModules();
    expect(accessors.clanDiscList({ clan: 'Gangrel' })).toEqual(CLAN_DISCS.Gangrel);
    expect(accessors.clanDiscList({ clan: 'Gangrel', bloodline: null })).toEqual(CLAN_DISCS.Gangrel);
    expect(accessors.clanDiscList({ clan: 'Gangrel', bloodline: '' })).toEqual(CLAN_DISCS.Gangrel);
  });

  it('is not a miss — a character without a bloodline is the normal case', async () => {
    const { cache, accessors } = await freshModules();
    accessors.clanDiscList({ name: 'Plain Gangrel', clan: 'Gangrel' });
    expect(cache.getBloodlineMisses()).toEqual([]);
  });

  it('returns an empty list for no clan and no bloodline, without a miss', async () => {
    const { cache, accessors } = await freshModules();
    expect(accessors.clanDiscList({ name: 'Blank' })).toEqual([]);
    expect(accessors.clanDiscList(null)).toEqual([]);
    expect(cache.getBloodlineMisses()).toEqual([]);
  });
});

describe('BL-2 — clanDiscList, bloodline resolves', () => {
  it('returns the cache list, not the clan list', async () => {
    const { accessors } = await freshModules();
    expect(accessors.clanDiscList({ clan: 'Gangrel', bloodline: 'Hounds of Actaeon' }))
      .toEqual(['Animalism', 'Obfuscate', 'Protean', 'Resilience']);
  });

  it('records no miss', async () => {
    const { cache, accessors } = await freshModules();
    accessors.clanDiscList({ name: 'Ocka Keats', clan: 'Gangrel', bloodline: 'Hounds of Actaeon' });
    expect(cache.getBloodlineMisses()).toEqual([]);
  });
});

describe('BL-2 — clanDiscList, bloodline does NOT resolve', () => {
  it('returns EMPTY, never the clan list', async () => {
    const { accessors } = await freshModules();
    const out = accessors.clanDiscList({ clan: 'Gangrel', bloodline: 'Not A Bloodline' });
    expect(out).toEqual([]);
    // The specific regression: the old code returned CLAN_DISCS.Gangrel here.
    expect(out).not.toEqual(CLAN_DISCS.Gangrel);
  });

  it('registers an unknown-bloodline miss naming the character and the value', async () => {
    const { cache, accessors } = await freshModules();
    accessors.clanDiscList({ name: 'Ocka Keats', clan: 'Gangrel', bloodline: 'Not A Bloodline' });
    expect(cache.getBloodlineMisses()).toEqual([
      { reason: cache.MISS_UNKNOWN, bloodline: 'Not A Bloodline', characters: ['Ocka Keats'] },
    ]);
  });

  it('names the character by moniker and honorific, as the sheet does', async () => {
    const { cache, accessors } = await freshModules();
    accessors.clanDiscList({ name: 'Henry St. John', moniker: 'Keeper', honorific: 'Lord', clan: 'Mekhet', bloodline: 'Nope' });
    expect(cache.getBloodlineMisses()[0].characters).toEqual(['Lord Keeper']);
  });

  it('makes every discipline out-of-clan, which is the wrong-HIGH direction on purpose', async () => {
    const { accessors } = await freshModules();
    const c = { name: 'X', clan: 'Gangrel', bloodline: 'Nope' };
    for (const d of ['Animalism', 'Protean', 'Resilience', 'Auspex']) {
      expect(accessors.isInClanDisc(c, d), `${d} must not be in-clan`).toBe(false);
    }
  });
});

describe('BL-2 — clanDiscList, cache unavailable', () => {
  it('an unloaded cache is a miss for a bloodline character, with the SYSTEM reason', async () => {
    const { cache, accessors } = await freshModules({ load: false });
    expect(accessors.clanDiscList({ name: 'Doc', clan: 'Gangrel', bloodline: 'Kerberos' })).toEqual([]);
    const [miss] = cache.getBloodlineMisses();
    expect(miss.reason).toBe(cache.MISS_NOT_LOADED);
  });

  it('a failed load is the same system reason, not an unknown bloodline', async () => {
    const { cache, accessors } = await freshModules({
      payload: async () => { throw new Error('network down'); },
    });
    expect(accessors.clanDiscList({ name: 'Doc', clan: 'Gangrel', bloodline: 'Kerberos' })).toEqual([]);
    expect(cache.getBloodlineMisses()[0].reason).toBe(cache.MISS_NOT_LOADED);
  });

  it('an unloaded cache does NOT affect characters without a bloodline', async () => {
    // The failure must be scoped to what it actually breaks.
    const { cache, accessors } = await freshModules({ load: false });
    expect(accessors.clanDiscList({ name: 'Plain', clan: 'Ventrue' })).toEqual(CLAN_DISCS.Ventrue);
    expect(cache.getBloodlineMisses()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 8 — behaviour is identical for all 23 seeded bloodlines
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — equivalence with the constants across all 23', () => {
  it('clanDiscList matches BLOODLINE_DISCS for every bloodline', async () => {
    const { accessors } = await freshModules();
    const names = Object.keys(BLOODLINE_DISCS);
    expect(names).toHaveLength(23);
    for (const name of names) {
      expect(accessors.clanDiscList({ bloodline: name }), `mismatch for ${name}`)
        .toEqual(BLOODLINE_DISCS[name]);
    }
  });

  it('isInClanDisc matches the old behaviour for every bloodline and every discipline', async () => {
    const { accessors } = await freshModules();
    const allDiscs = [...new Set(Object.values(BLOODLINE_DISCS).flat())];
    for (const [name, discs] of Object.entries(BLOODLINE_DISCS)) {
      for (const d of allDiscs) {
        expect(accessors.isInClanDisc({ bloodline: name }, d), `${name} / ${d}`)
          .toBe(discs.includes(d));
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 9 — the two-way error the old fallback made on 7 of 23
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 — the two-way regression the old fallback caused', () => {
  it('Malkovians: Animalism is NOT in-clan, Auspex and Obfuscate ARE', async () => {
    // Malkovians is Ventrue, whose clan list is Animalism/Dominate/Resilience,
    // but the bloodline DROPS Animalism and adds Auspex + Obfuscate. Under the
    // old clan fallback an unresolved Malkovians character was charged 3/dot
    // for Animalism (which they do not have) and 4/dot for Auspex and
    // Obfuscate (which they do). Wrong in both directions, on a live PC: Cazz.
    const { accessors } = await freshModules();
    const cazz = { name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' };

    expect(accessors.isInClanDisc(cazz, 'Animalism')).toBe(false);
    expect(CLAN_DISCS.Ventrue).toContain('Animalism');   // ...which the clan list would have granted

    expect(accessors.isInClanDisc(cazz, 'Auspex')).toBe(true);
    expect(CLAN_DISCS.Ventrue).not.toContain('Auspex');  // ...which the clan list would have denied
    expect(accessors.isInClanDisc(cazz, 'Obfuscate')).toBe(true);
  });

  it('every bloodline that drops a clan discipline costs it out-of-clan', async () => {
    const { accessors } = await freshModules();
    const clanOf = {};
    for (const [clan, names] of Object.entries(BLOODLINE_CLANS)) for (const n of names) clanOf[n] = clan;

    const droppers = [];
    for (const [name, discs] of Object.entries(BLOODLINE_DISCS)) {
      const dropped = (CLAN_DISCS[clanOf[name]] || []).filter(d => !discs.includes(d));
      if (dropped.length) droppers.push([name, dropped]);
    }
    // Measured 2026-08-10 during the data-lock. If this count changes, the
    // constants changed and the story's own analysis needs revisiting.
    expect(droppers).toHaveLength(7);

    for (const [name, dropped] of droppers) {
      for (const d of dropped) {
        expect(accessors.isInClanDisc({ bloodline: name }, d), `${name} must not grant ${d}`).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review follow-ups (internal 3-layer review, 2026-08-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-2 review — an unseeded collection reports the operational cause', () => {
  it('an empty collection is MISS_EMPTY_COLLECTION, not 23 unknown bloodlines', async () => {
    // This is the live state today: GET /api/bloodlines returns [] until the
    // seed is applied. Reporting it as "bloodline not found" would point the
    // reader at 23 imaginary data problems instead of one operational one.
    const { cache, accessors } = await freshModules({ payload: [] });
    expect(accessors.clanDiscList({ name: 'Doc', clan: 'Gangrel', bloodline: 'Kerberos' })).toEqual([]);
    const [miss] = cache.getBloodlineMisses();
    expect(miss.reason).toBe(cache.MISS_EMPTY_COLLECTION);
    expect(miss.reason).not.toBe(cache.MISS_UNKNOWN);
  });
});

describe('BL-2 review — the banner self-corrects when the data is fixed', () => {
  it('a resolving render clears that character\'s standing miss', async () => {
    const { cache, accessors } = await freshModules();
    const typo = { name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovain' };
    accessors.clanDiscList(typo);
    expect(cache.getBloodlineMisses()).toHaveLength(1);

    // ST fixes the spelling; the sheet re-renders.
    const fixed = { name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' };
    accessors.clanDiscList(fixed);
    expect(cache.getBloodlineMisses()).toEqual([]);
  });

  it('fixing one character does not clear another still-broken one', async () => {
    const { cache, accessors } = await freshModules();
    accessors.clanDiscList({ name: 'Cazz', clan: 'Ventrue', bloodline: 'Nope' });
    accessors.clanDiscList({ name: 'Ivana Horvat', clan: 'Gangrel', bloodline: 'Nope' });
    accessors.clanDiscList({ name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' });
    const [miss] = cache.getBloodlineMisses();
    expect(miss.characters).toEqual(['Ivana Horvat']);
  });
});

describe('BL-2 review — case and whitespace tolerance end to end', () => {
  it('a differently-cased stored bloodline still costs correctly', async () => {
    // The CSV importer only trims; the old constant lookup was exact-match and
    // degraded silently. Under the new code an exact-match miss would HARD-LOCK
    // the character, so the tolerance matters more than it used to.
    const { cache, accessors } = await freshModules();
    expect(accessors.clanDiscList({ name: 'X', clan: 'Ventrue', bloodline: ' malkovians ' }))
      .toEqual(BLOODLINE_DISCS.Malkovians);
    expect(cache.getBloodlineMisses()).toEqual([]);
  });
});
