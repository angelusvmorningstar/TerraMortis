/**
 * DBO.3 — the `standing` merit-picker exclusion has never fired for the
 * right merits.
 *
 * Root cause: Mystery Cult Initiation and Professional Training (the real
 * "gained via IC events, not bought per dot" merits) carry `special:
 * 'standing'` with `sub_category: null`. Confessor and Pledged (ordinary
 * fixed-XP merits gated by a real Lance Status prereq) carry `sub_category:
 * 'standing'` with `special: null`. Every exclusion check in this codebase
 * that reads `rule.sub_category === 'standing'` has therefore been
 * excluding the wrong two merits — this file proves the fix with fixtures
 * matching the EXACT live shapes confirmed against tm_suite on 2026-08-14
 * (see dbo-3-xp-spend-standing-filter-bug.md's own Dev Notes).
 *
 * `public/js/editor/merits.js`'s import chain reaches `location` at module
 * load (api.js's API_BASE), so the minimal browser shim below is required
 * before any dynamic import — same technique established by #1137 and
 * reused throughout this codebase's client-side test suites.
 */

const hadLocation = 'location' in globalThis;
const hadLocalStorage = 'localStorage' in globalThis;
if (!hadLocation) globalThis.location = { hostname: 'test', pathname: '/' };
if (!hadLocalStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// Exact live field shapes, confirmed 2026-08-14 (read-only query, see story
// Dev Notes). Only the fields these functions actually read are included.
const MCI = {
  key: 'mystery-cult-initiation', name: 'Mystery Cult Initiation', category: 'merit',
  parent: 'Social', special: 'standing', sub_category: null, rating_range: null, prereq: null, exclusive: null,
};
const PT = {
  key: 'professional-training', name: 'Professional Training', category: 'merit',
  parent: 'Mental', special: 'standing', sub_category: null, rating_range: null, prereq: null, exclusive: null,
};
const CONFESSOR = {
  key: 'confessor', name: 'Confessor', category: 'merit', parent: 'Kindred',
  special: null, sub_category: 'standing', xp_fixed: 1, rating_range: [1, 1], exclusive: null,
  prereq: { type: 'status', qualifier: 'Lance', dots: 3 },
};
const PLEDGED = {
  key: 'pledged', name: 'Pledged', category: 'merit', parent: 'Kindred',
  special: null, sub_category: 'standing', xp_fixed: 2, rating_range: [2, 2], exclusive: null,
  prereq: { type: 'status', qualifier: 'Lance', dots: 1 },
};
// Ordinary control merit — no special, no sub_category. Must be UNAFFECTED
// by this story's fix at every call site (AC5).
const ORDINARY = {
  key: 'ordinary-merit', name: 'Ordinary Merit', category: 'merit', parent: 'Kindred',
  special: null, sub_category: null, rating_range: [1, 1], prereq: null, exclusive: null,
};
// A domain-sub_category merit — proves buildMeritOptions's EXISTING
// sub_category exclusion still holds unchanged (Task 3's "alongside, not
// replacing" requirement).
const DOMAIN_MERIT = {
  key: 'a-domain-merit', name: 'A Domain Merit', category: 'merit', parent: 'Kindred',
  special: null, sub_category: 'domain', rating_range: [1, 1], prereq: null, exclusive: null,
};

const ALL_FIXTURES = [MCI, PT, CONFESSOR, PLEDGED, ORDINARY, DOMAIN_MERIT];

function seedRulesCache(rules) {
  globalThis.localStorage.setItem('tm_rules_db', JSON.stringify(rules));
}

const LANCE3 = { status: { covenant: { 'Lancea et Sanctum': 3 } }, merits: [] };
const LANCE1 = { status: { covenant: { 'Lancea et Sanctum': 1 } }, merits: [] };
const NO_STATUS = { status: { covenant: {} }, merits: [] };

describe('DBO.3 isMeritEventGranted — the shared predicate (AC1)', () => {
  let isMeritEventGranted;

  beforeAll(async () => {
    ({ isMeritEventGranted } = await import('../../public/js/editor/merits.js'));
  });

  // No shim teardown here — the second describe block below reuses the
  // same globalThis.location/localStorage shim (and the same dynamic
  // import). Tearing it down per-describe-block previously deleted
  // globalThis.localStorage out from under the next block's beforeEach.

  it('returns true for special:"standing" — the real MCI/PT shape', () => {
    expect(isMeritEventGranted(MCI)).toBe(true);
    expect(isMeritEventGranted(PT)).toBe(true);
  });

  it('returns false for special:null — the real Confessor/Pledged shape, even with sub_category:"standing"', () => {
    // This is the core regression case: sub_category:'standing' must NOT
    // trip this predicate, or the fix reintroduces the exact bug it closes.
    expect(isMeritEventGranted(CONFESSOR)).toBe(false);
    expect(isMeritEventGranted(PLEDGED)).toBe(false);
  });

  it('returns false when special is absent entirely', () => {
    expect(isMeritEventGranted({ name: 'X', sub_category: null })).toBe(false);
  });

  it('returns false for a null/undefined rule, rather than throwing', () => {
    expect(() => isMeritEventGranted(null)).not.toThrow();
    expect(isMeritEventGranted(null)).toBe(false);
    expect(isMeritEventGranted(undefined)).toBe(false);
  });
});

describe('DBO.3 the three replaced exclusions + the new fourth check (AC2, AC3, AC4, AC5)', () => {
  let buildMeritOptions, buildMCIGrantOptions, buildFThiefOptions;

  beforeAll(async () => {
    ({ buildMeritOptions, buildMCIGrantOptions, buildFThiefOptions } = await import('../../public/js/editor/merits.js'));
  });

  afterAll(() => {
    if (!hadLocation) delete globalThis.location;
    if (!hadLocalStorage) delete globalThis.localStorage;
  });

  beforeEach(() => {
    seedRulesCache(ALL_FIXTURES);
  });

  describe('buildMeritOptions (merits.js:314) — AC3, the previously-unnamed fourth defect', () => {
    it('never offers Mystery Cult Initiation or Professional Training', () => {
      const html = buildMeritOptions(LANCE3, '');
      expect(html).not.toContain('Mystery Cult Initiation');
      expect(html).not.toContain('Professional Training');
    });

    it('still withholds Confessor/Pledged even with their prereq met — a DIFFERENT, pre-existing, unrelated exclusion, not this story\'s bug', () => {
      // buildMeritOptions's own sub_category check (`sub_category &&
      // sub_category !== 'general'`, unchanged by this story per AC3's own
      // "alongside, not replacing" instruction) ALSO rejects
      // sub_category:'standing' — matching its own doc comment ("Excludes
      // standing, domain, and influence merits, those have dedicated UI").
      // Confessor/Pledged genuinely carry sub_category:'standing', so THIS
      // specific picker keeps excluding them regardless of AC4/isMeritEventGranted
      // — AC4's "becomes selectable" is scoped to AC2's three REPLACED
      // sites only, and this story's own text says so. Discovered by
      // actually running the fixture, not assumed.
      const html = buildMeritOptions(LANCE3, '');
      expect(html).not.toContain('Confessor');
      expect(html).not.toContain('Pledged');
    });

    it('AC5: an ordinary merit with no special/sub_category is unaffected', () => {
      const html = buildMeritOptions(NO_STATUS, '');
      expect(html).toContain('Ordinary Merit');
    });

    it('AC5: the EXISTING sub_category exclusion still holds unchanged (a domain merit stays excluded from this general-only picker)', () => {
      const html = buildMeritOptions(LANCE3, '');
      expect(html).not.toContain('A Domain Merit');
    });

    it('Codex review, AC3: a hand-crafted currentName of "Mystery Cult Initiation" DOES still appear, via the generic current-value passthrough — a known, pre-existing, unreachable-via-real-write-path limitation, not a gap this story leaves open', () => {
      // buildMeritOptions's escape hatch (`if (currentName && !qualified.some(...))`,
      // merits.js:369) shows ANY currentName not in `qualified` as a raw
      // selected option — the SAME behaviour every other structural
      // exclusion in this function (domain, influence, oath, carthian-law)
      // has always had, unchanged by this story. This test documents that
      // the property holds for MCI/PT too, deliberately, rather than
      // leaving it undiscovered. It is NOT reachable through this app's own
      // write paths: buildMeritOptions's only real caller
      // (public/js/editor/sheet.js:2086) sources currentName from `oM`
      // (sheet.js:2005), which is `c.merits` filtered to
      // `category === 'general'` — and MCI/PT are only ever written with
      // `category: 'standing'` (shAddStandMCI/shAddStandPT, their only
      // write path). Only a hand-constructed character object, bypassing
      // every real write path, can reach this.
      const html = buildMeritOptions(NO_STATUS, 'Mystery Cult Initiation');
      expect(html).toContain('Mystery Cult Initiation');
    });
  });

  describe('buildMCIGrantOptions (merits.js:410) — AC2', () => {
    it('never offers Mystery Cult Initiation or Professional Training as a grantable child merit, at any dot level', () => {
      for (let dotLevel = 0; dotLevel < 5; dotLevel++) {
        const html = buildMCIGrantOptions(LANCE3, dotLevel, '');
        expect(html).not.toContain('Mystery Cult Initiation');
        expect(html).not.toContain('Professional Training');
      }
    });

    it('offers Confessor (rating 1, matches dot level 0) once its prereq is met', () => {
      const html = buildMCIGrantOptions(LANCE3, 0, '');
      expect(html).toContain('Confessor');
    });

    it('withholds Confessor when the prereq is not met', () => {
      const html = buildMCIGrantOptions(NO_STATUS, 0, '');
      expect(html).not.toContain('Confessor');
    });
  });

  describe('buildFThiefOptions (merits.js:463) — AC2', () => {
    it('never offers Mystery Cult Initiation or Professional Training', () => {
      const html = buildFThiefOptions('');
      expect(html).not.toContain('Mystery Cult Initiation');
      expect(html).not.toContain('Professional Training');
    });

    it('offers Confessor (a real 1-dot, non-Carthian-locked merit) now that the standing exclusion no longer blocks it', () => {
      // buildFThiefOptions takes no character — it is not prereq-gated by
      // design (see its own doc comment); only rating/Carthian-lock filter.
      const html = buildFThiefOptions('');
      expect(html).toContain('Confessor');
    });

    it('never offers Pledged — its OWN 2-dot rating excludes it here regardless of this story\'s fix (buildFThiefOptions only lists 1-dot merits)', () => {
      const html = buildFThiefOptions('');
      expect(html).not.toContain('Pledged');
    });
  });
});

describe('DBO.3 downtime-form.js:4210 — source-contract test', () => {
  // getItemsForCategory and the module-private `currentChar` it reads are
  // NOT exported by downtime-form.js, and the one exported entry point that
  // sets `currentChar` (renderDowntimeTab) renders the entire Downtime tab's
  // DOM tree — a disproportionate harness to build for proving one filter
  // condition. This mirrors the EXISTING established pattern for this exact
  // file: server/tests/issue-896-availability-filter.test.js already tests
  // a different downtime-form.js internal (`currentChar` itself) by source
  // contract rather than direct invocation, for the same reason.
  it('getItemsForCategory\'s merit branch calls the shared isMeritEventGranted predicate, not the old broken sub_category check', () => {
    const src = read('public/js/tabs/downtime-form.js');
    // downtime-form.js has TWO `case 'merit': {` blocks (a cost-calculation
    // switch elsewhere, and this function) — anchor on the function name
    // first so the slice cannot silently land on the wrong one.
    const fnStart = src.indexOf('function getItemsForCategory(category)');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, src.indexOf('\nfunction ', fnStart + 1));
    const meritBranch = fnBody.slice(fnBody.indexOf("case 'merit': {"), fnBody.indexOf("case 'devotion':"));
    expect(meritBranch).toMatch(/isMeritEventGranted\(rule\)/);
    expect(meritBranch).not.toMatch(/rule\.sub_category === 'standing'/);
  });

  it('imports isMeritEventGranted from editor/merits.js alongside the existing merit-rule predicates', () => {
    const src = read('public/js/tabs/downtime-form.js');
    expect(src).toMatch(/import\s*\{[^}]*isMeritEventGranted[^}]*\}\s*from\s*'\.\.\/editor\/merits\.js'/);
  });
});
