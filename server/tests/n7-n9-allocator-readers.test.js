/**
 * N-7 (#760) + N-9 (#762) — Necropolis allocator + edit-view bug triage.
 *
 * Two adjacent surfaces share `meritBdRow` extension (compoundPools + hideBonus),
 * `shEditMeritPt`'s map write path (free_grants.<slug>), and the post-N-1
 * read-side helpers (freeOf / meritFreeSum / poolAvailableFor). Bundled into
 * one PR so the heterogeneous write-path codified in the ADR-005 amendment
 * lands atomically with the MCI read-side fix that depends on it.
 *
 * Test layout:
 *   - N-7 pure-function: hasNecropolisSepulcher, getCompoundTargets,
 *     poolAvailableFor.
 *   - N-9 pure-function: getMCIPoolUsed + getOTSPoolUsed union-read; getPoolUsed
 *     map+legacy coverage.
 *   - N-7+N-9 static-analysis on the meritBdRow + shEditMeritPt + sheet.js
 *     wiring (covers picker UX paths that are expensive to import directly).
 *   - N-9 meritPrereqOK: dropdown filter strict vs current-row passthrough.
 *   - ADR-005 amendment text presence (catches future reverts).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hasNecropolisSepulcher,
  getCompoundTargets,
  poolAvailableFor,
  freeOf,
  meritFreeSum,
} from '../../public/js/data/rules-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// N-7 helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7 — hasNecropolisSepulcher', () => {
  it('true when Sepulcher with cp+xp >= 1 is present', () => {
    expect(hasNecropolisSepulcher({
      merits: [{ name: 'Necropolis Sepulcher', cp: 2, xp: 0 }],
    })).toBe(true);
    expect(hasNecropolisSepulcher({
      merits: [{ name: 'Necropolis Sepulcher', cp: 0, xp: 1 }],
    })).toBe(true);
  });

  it('false when Sepulcher has 0 purchased dots (grants don\'t count toward membership)', () => {
    expect(hasNecropolisSepulcher({
      merits: [{ name: 'Necropolis Sepulcher', cp: 0, xp: 0, free_grants: { necro: 5 } }],
    })).toBe(false);
  });

  it('false / defensive on missing input', () => {
    expect(hasNecropolisSepulcher(null)).toBe(false);
    expect(hasNecropolisSepulcher({})).toBe(false);
    expect(hasNecropolisSepulcher({ merits: [] })).toBe(false);
    expect(hasNecropolisSepulcher({ merits: [{ name: 'Other', cp: 5 }] })).toBe(false);
  });
});

describe('N-7 — getCompoundTargets', () => {
  it('reads pool_targets from the named compound rule_grant', () => {
    const ruleCache = {
      rule_grant: [
        { source: 'Necropolis Sepulcher', grant_type: 'pool', pool_targets: ['Catacombs', 'Caldarium'] },
        { source: 'Lorekeeper', grant_type: 'pool', pool_targets: ['Herd'] },
      ],
    };
    expect(getCompoundTargets(ruleCache, 'Necropolis Sepulcher')).toEqual(['Catacombs', 'Caldarium']);
    // COLLECTIVE-2 (#1110): source is a parameter now — the same cache
    // resolves a different compound's targets.
    expect(getCompoundTargets(ruleCache, 'Lorekeeper')).toEqual(['Herd']);
  });

  it('empty list when cache missing or rule not seeded', () => {
    expect(getCompoundTargets(null, 'Necropolis Sepulcher')).toEqual([]);
    expect(getCompoundTargets({}, 'Necropolis Sepulcher')).toEqual([]);
    expect(getCompoundTargets({ rule_grant: [] }, 'Necropolis Sepulcher')).toEqual([]);
    expect(getCompoundTargets({ rule_grant: [{ source: 'Other' }] }, 'Necropolis Sepulcher')).toEqual([]);
    expect(getCompoundTargets({ rule_grant: [{ source: 'Other', grant_type: 'pool', pool_targets: ['X'] }] })).toEqual([]);
  });
});

describe('N-7 — poolAvailableFor', () => {
  it('capacity minus used across all merits (union-read map + legacy)', () => {
    const c = {
      _grant_pools: [{ source: 'Necropolis Sepulcher', category: 'necro', amount: 3 }],
      merits: [
        { name: 'Catacombs', free_grants: { necro: 1 } },
        { name: 'Dark Temple', free_grants: { necro: 1 } },
      ],
    };
    expect(poolAvailableFor(c, 'necro')).toBe(1); // 3 cap − 2 used = 1
  });

  it('zero when capacity is zero or used >= capacity', () => {
    expect(poolAvailableFor({ _grant_pools: [], merits: [] }, 'necro')).toBe(0);
    const over = {
      _grant_pools: [{ category: 'necro', amount: 2 }],
      merits: [{ free_grants: { necro: 5 } }],
    };
    expect(poolAvailableFor(over, 'necro')).toBe(0);
  });

  it('union-reads legacy fields too (matches the channel-asymmetry transition)', () => {
    // Mid-transition: capacity is 4, one merit holds 2 via legacy free_mci,
    // another holds 1 via the map. Available = 4 − 3 = 1.
    const c = {
      _grant_pools: [{ category: 'mci', amount: 4 }],
      merits: [
        { name: 'Allies', free_mci: 2 },
        { name: 'Herd', free_grants: { mci: 1 } },
      ],
    };
    expect(poolAvailableFor(c, 'mci')).toBe(1);
  });

  it('defensive on missing input', () => {
    expect(poolAvailableFor(null, 'necro')).toBe(0);
    expect(poolAvailableFor({}, '')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-9 reader migrations — freeOf union-read coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('N-9 — freeOf / meritFreeSum cover both map AND legacy', () => {
  it('freeOf returns the map value when present; legacy when not', () => {
    expect(freeOf({ free_grants: { mci: 3 } }, 'mci')).toBe(3);
    expect(freeOf({ free_mci: 2 }, 'mci')).toBe(2);
    expect(freeOf({ free_grants: { mci: 5 }, free_mci: 2 }, 'mci')).toBe(5);
    expect(freeOf({}, 'mci')).toBe(0);
  });

  it('meritFreeSum unions map + legacy across all 14 channels', () => {
    const m = { free_lk: 2, free_grants: { mci: 3, necro: 1 } };
    // sum: 2 (legacy lk) + 3 (map mci) + 1 (map necro) = 6
    expect(meritFreeSum(m)).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis: wiring that's expensive to unit-test via browser-import
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7 — meritBdRow compound stepper + free_grants.<slug> write path', () => {
  it('meritBdRow emits one stepper per opts.compoundPools entry, writing that pool slug', () => {
    const src = read('public/js/editor/xp.js');
    // COLLECTIVE-2 (#1110): was a single opts.showNECRO flag hardwired to
    // free_grants.necro. The slug is now data — see the behavioural
    // assertions in collective-2-compound-generalisation.test.js.
    expect(src).toMatch(/opts\.compoundPools/);
    expect(src).toMatch(/free_grants\.' \+ _cmp\.slug/);
  });

  it('shEditMeritPt routes free_grants.<slug> writes to the map with cap', () => {
    const src = read('public/js/editor/edit.js');
    expect(src).toMatch(/field\.startsWith\(['"]free_grants\.['"]\)/);
    expect(src).toMatch(/poolAvailableFor\(c,\s*slug\)/);
    expect(src).toMatch(/m\.free_grants\s*=\s*m\.free_grants\s*\|\|\s*\{\}/);
  });

  it('sheet.js wires the compound allocator at both general-merit call sites', () => {
    const src = read('public/js/editor/sheet.js');
    // COLLECTIVE-2 (#1110): the Necropolis-named gate is gone — membership
    // is per-compound via ownsCompound, and the stepper list per merit comes
    // from _genPoolsFor.
    expect(src).toMatch(/_genOwnedCompounds\s*=\s*_genCompounds\.filter\(cmp\s*=>\s*ownsCompound\(c,\s*cmp\)\)/);
    expect(src).toMatch(/_genPoolsFor\s*=\s*\(name\)\s*=>/);
    // Both call sites (granted_by branch + main branch) pass compoundPools.
    const matches = src.match(/compoundPools:\s*_genPoolsFor\(m\.name\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('_renderPoolCounters surfaces the necro pool in the domain section (N-7a corrected the section gate)', () => {
    const src = read('public/js/editor/sheet.js');
    // N-7a (issue #766) corrected the section gate: necro targets are
    // sub_category='domain', so the pool counter lives in the domain section
    // (alongside lk/inv), not general. Pre-N-7a this checked 'general' —
    // assertion updated to match the corrected gate.
    // COLLECTIVE-2 (#1110): `necroPools` became `compoundPools` and the
    // hardcoded `p.category === 'necro'` became a membership test against the
    // discovered compound slugs. The section gate ('domain', not 'general')
    // is what this assertion protects and it is unchanged.
    expect(src).toMatch(/compoundPools\s*=\s*category === 'domain'/);
    expect(src).toMatch(/_poolCompoundSlugs\.has\(p\.category\)/);
  });
});

describe('N-9 — readers consume freeOf / map writes / hideBonus', () => {
  it('getMCIPoolUsed reads via freeOf (union map + legacy)', () => {
    const src = read('public/js/editor/mci.js');
    expect(src).toMatch(/total \+= freeOf\(m, ['"]mci['"]\)/);
    expect(src).toMatch(/total \+= freeOf\(fs, ['"]mci['"]\)/);
  });

  it('getOTSPoolUsed reads via freeOf', () => {
    const src = read('public/js/editor/mci.js');
    expect(src).toMatch(/freeOf\(fs, ['"]ots['"]\)/);
  });

  it('getPoolUsed enumerates matched-pool slugs via freeOf (covers map)', () => {
    const src = read('public/js/editor/mci.js');
    // The fix introduces a slugs Set populated from matched pools and a
    // per-slug freeOf sum.
    expect(src).toMatch(/const slugs = new Set/);
    expect(src).toMatch(/for \(const slug of slugs\) total \+= freeOf\(m, slug\)/);
  });

  it("meritBdRow's MCI input writes free_grants.mci (post-N-1 map shape)", () => {
    const src = read('public/js/editor/xp.js');
    // Catches the regression where the MCI input reverts to writing free_mci.
    // (Onchange string is backslash-escaped inside a JS literal; just match
    // the slug fragment within a small window of `showMCI`.)
    expect(src).toMatch(/showMCI[\s\S]{0,400}free_grants\.mci/);
  });

  it('meritBdRow honours opts.hideBonus to suppress the Bonus row', () => {
    const src = read('public/js/editor/xp.js');
    expect(src).toMatch(/if \(!opts\.hideBonus\)/);
  });

  it('sheet.js standing-merit call sites pass hideBonus: true', () => {
    const src = read('public/js/editor/sheet.js');
    // MCI standing path
    expect(src).toMatch(/meritBdRow\(rIdx, m, meritFixedRating\(m\.name\), \{ hideBonus: true \}\)/);
    // PT standing path (with showMCI + hideBonus)
    expect(src).toMatch(/meritBdRow\(rIdx, m, meritFixedRating\(m\.name\), \{ showMCI: mciPool > 0, hideBonus: true \}\)/);
  });
});

describe('N-9 — meritPrereqOK dropdown filter + current-row passthrough warn', () => {
  it('merits.js exports meritPrereqOK', () => {
    const src = read('public/js/editor/merits.js');
    expect(src).toMatch(/export function meritPrereqOK\(c, rule\)/);
  });

  it('all three dropdown builders consume meritPrereqOK (not _meetsPrereq directly)', () => {
    const src = read('public/js/editor/merits.js');
    // buildMeritOptions
    expect(src).toMatch(/buildMeritOptions[\s\S]{0,600}meritPrereqOK\(c, rule\)/);
    // buildSubCategoryMeritOptions
    expect(src).toMatch(/buildSubCategoryMeritOptions[\s\S]{0,800}meritPrereqOK\(c, rule\)/);
    // buildMCIGrantOptions
    expect(src).toMatch(/buildMCIGrantOptions[\s\S]{0,600}meritPrereqOK\(c, rule\)/);
  });

  it('buildSubCategoryMeritOptions warns on failing-prereq current-row passthrough', () => {
    const src = read('public/js/editor/merits.js');
    expect(src).toMatch(/console\.warn\([\s\S]*meritPrereqOK[\s\S]*current selection/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-005 inline amendment presence
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7 — ADR-005 amendment text presence', () => {
  it('D6 amendment names the allocator write path + heterogeneous-by-source state', () => {
    const src = read('specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md');
    expect(src).toMatch(/D6 amendment[\s\S]*Allocator write path/i);
    expect(src).toMatch(/heterogeneous by source/i);
    // Targets explicitly named.
    expect(src).toMatch(/m\.free_grants\.necro/);
    expect(src).toMatch(/m\.free_grants\.mci/);
  });
});
