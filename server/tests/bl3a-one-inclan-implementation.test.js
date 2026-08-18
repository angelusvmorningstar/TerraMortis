/**
 * BL-3a (issue #1008) — exactly one implementation of in-clan.
 *
 * After BL-2 there were two: `clanDiscList` reading the collection, and the DT
 * form's private `isClanDisc` reading the constant and falling through to the
 * clan list. The second decides what a PLAYER is charged when they buy a
 * discipline (`getXpCost` → `isClanDisc(item) ? 3 : 4`), so until it is
 * rewired the epic delivers on one costing surface only.
 *
 * Note on method. `getXpCost`, `isClanDisc` and `currentChar` are all module-
 * private in a 4000-line DOM module whose character is set from a render path
 * that needs a browser. Exporting internals purely to test them would be worse
 * than the check it bought, so the split here is deliberate:
 *
 *   - the BEHAVIOUR of the cost decision is `isInClanDisc`, exhaustively
 *     covered by BL-2's suite (all 23 bloodlines, the Malkovians two-way case,
 *     the unresolved-means-everything-out-of-clan case);
 *   - what remains BL-3a's risk is WIRING, and that is what this file asserts,
 *     including a grep-proof that no live path can reach the constant.
 *
 * This is recorded as an AC-9 deviation in the story's Dev Agent Record rather
 * than quietly narrowed.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAN_DISCS } from '../../public/js/data/constants.js';
import {
  bloodlineFixtures,
  fixtureDiscsByName,
  fixtureNamesByClan,
} from './helpers/bloodline-fixtures.js';
import { stripComments } from './helpers/strip-comments.js';

/**
 * The 23 as MIGRATED, in the two shapes the deleted constants had. BL-3b
 * deleted `BLOODLINE_DISCS`/`BLOODLINE_CLANS` and retired the seed builder to
 * `scripts/archive/`; the fixture was captured from that builder immediately
 * before the deletion, so these assertions still compare the cache against the
 * data that was actually migrated.
 */
const MIGRATED_DISCS = fixtureDiscsByName();
const MIGRATED_CLANS = fixtureNamesByClan();

const api = vi.hoisted(() => ({ get: null }));
vi.mock('../../public/js/data/api.js', () => ({ apiGet: async (...a) => api.get(...a) }));

globalThis.location ??= { hostname: 'localhost', pathname: '/index.html' };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
/**
 * Source with comments stripped — a wiring grep must not pass on prose.
 *
 * Was a pair of regular expressions here. BL-3b's review replaced them with the
 * quote-aware scanner in `helpers/strip-comments.js`: a regex cannot tell a
 * comment from the same characters inside a string, so a `//` or a block-comment
 * opener in a literal erased executable text and could have hidden a real
 * offender from the empty allow-list below. Same reason as `bl3b`, same helper,
 * and that helper is self-tested in `bl3b-constants-deleted.test.js`.
 */
const code = rel => stripComments(read(rel));

// ─────────────────────────────────────────────────────────────────────────────
// AC 1 — no live reader of the constants remains
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Files allowed to mention the bloodline constants IN CODE. Empty, and it must
 * stay empty.
 *
 * BL-3a left five entries here — the definition itself, two comment-only
 * mentions, `dev-fixtures.js` (which derived its fixture from the constants)
 * and dead `wizard.js`. BL-3b deleted the definitions, froze the fixture into a
 * `var BLOODLINES=` blob and rewired `wizard.js` to the cache, so every
 * exception is gone. This also discharges the AC1-vs-AC7 contradiction BL-3a's
 * review registered in `deferred-work.md`: with nothing to carve out, there is
 * no contradiction left to inherit.
 *
 * Note `code()` above strips comments before matching, so the migration-history
 * comments in `data/bloodlines-cache.js`, `data/accessors.js`,
 * `tabs/downtime-form.js` and now `data/constants.js` itself are fine and are
 * meant to stay: they are what tells the next reader where bloodlines went.
 * Anything that needs to be ADDED to this set is a regression.
 */
const ALLOWED = new Set([]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

describe('BL-3a — AC 1: exactly one implementation of in-clan', () => {
  it('no unexpected file reads BLOODLINE_DISCS, BLOODLINE_CLANS or APPROVED_BLOODLINES', () => {
    const offenders = [];
    for (const file of walk(path.join(REPO_ROOT, 'public/js'))) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      const src = code(rel);
      if (/BLOODLINE_DISCS|BLOODLINE_CLANS|APPROVED_BLOODLINES/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'these still compute from the constant instead of the cache').toEqual([]);
  });

  it('the DT form no longer imports the bloodline constants at all', () => {
    const src = code('public/js/tabs/downtime-form.js');
    expect(src).not.toMatch(/BLOODLINE_DISCS/);
  });

  it('the DT form has no private in-clan implementation left, and nothing still CALLS it', () => {
    // The first cut of this test asserted only `not.toMatch(/function isClanDisc/)`.
    // That passed while two live calls to the deleted function survived at
    // downtime-form.js:4188-4189 — a ReferenceError on the player-facing XP
    // spend picker, invisible to a parse check because ES modules resolve free
    // identifiers at RUNTIME. Assert the calls are gone, not just the
    // declaration; the declaration was never the risk.
    const src = code('public/js/tabs/downtime-form.js');
    expect(src).not.toMatch(/function isClanDisc/);
    expect(src, 'a call to the deleted isClanDisc survives').not.toMatch(/(^|[^n.\w])isClanDisc\s*\(/);
  });

  it('no module calls a bare isClanDisc anywhere in the client', () => {
    const offenders = [];
    for (const file of walk(path.join(REPO_ROOT, 'public/js'))) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (/(^|[^n.\w])isClanDisc\s*\(/.test(code(rel))) offenders.push(rel);
    }
    expect(offenders, 'isClanDisc is deleted; these would ReferenceError at runtime').toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 2 — the DT form routes through the shared accessor
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3a — AC 2: the DT form asks the accessor', () => {
  const src = code('public/js/tabs/downtime-form.js');

  it('imports isInClanDisc and clanDiscList from data/accessors.js', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bisInClanDisc\b[^}]*\}\s*from\s*['"]\.\.\/data\/accessors\.js['"]/s);
    expect(src).toMatch(/import\s*\{[^}]*\bclanDiscList\b[^}]*\}\s*from\s*['"]\.\.\/data\/accessors\.js['"]/s);
  });

  it('the discipline XP cost branch calls isInClanDisc against the current character', () => {
    expect(src).toMatch(/case 'discipline':\s*return isInClanDisc\(currentChar, item\) \? 3 : 4;/);
  });

  it('the discipline picker builds its list from clanDiscList', () => {
    expect(src).toMatch(/const clanDiscs = clanDiscList\(c\)/);
    expect(src).toMatch(/const bloodlineDiscs = c\.bloodline \? clanDiscList\(c\) : \[\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 4, 5 — the dropdowns read the cache
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3a — AC 4: both bloodline dropdowns read the cache', () => {
  it('identity.js builds its options from approvedBloodlines()', () => {
    const src = code('public/js/editor/identity.js');
    expect(src).toMatch(/approvedBloodlines\(\)/);
    expect(src).not.toMatch(/APPROVED_BLOODLINES/);
  });

  it('sheet.js builds its options from bloodlinesByClan()', () => {
    const src = code('public/js/editor/sheet.js');
    expect(src).toMatch(/bloodlinesByClan\(\)/);
    expect(src).not.toMatch(/BLOODLINE_CLANS/);
  });

  it('edit.js no longer validates the clan-change at all — BL-5 deleted the branch', () => {
    // BL-3a rewired this off the constant and onto the cache, explicitly on the
    // reasoning that DELETING it was BL-5's job and BL-3b must not have to wait
    // on BL-5. BL-5 collected that debt: clan is write-once and now enforced on
    // both editing surfaces and at the API, so a clan can never change after
    // its first set and "clear the bloodline when the clan changes" can never
    // fire. The assertion inverts rather than being dropped, so the deletion
    // stays proved from this side too.
    const src = code('public/js/editor/edit.js');
    expect(src).not.toMatch(/BLOODLINE_CLANS/);
    expect(src).not.toMatch(/bloodlinesByClan\(\)/);
    expect(src).toMatch(/refuseLineageWrite\(/);
  });

  it('sheet.js no longer carries an inline style on the bloodline select', () => {
    // Trap noted in the story: the line being edited anyway violates the
    // normalised-CSS rule.
    const src = read('public/js/editor/sheet.js');
    const line = src.split('\n').find(l => l.includes('shEdit(\\\'bloodline\\\'') || l.includes("shEdit('bloodline'"));
    expect(line, 'bloodline select line not found').toBeTruthy();
    expect(line).not.toMatch(/style="/);
  });
});

describe('BL-3a — AC 5: a Mongo-only bloodline is selectable', () => {
  it('the cache surfaces a name that was never migrated', async () => {
    // The epic's actual promise, observable for the first time here.
    vi.resetModules();
    const invented = {
      _id: 'x', name: 'Zzz Invented Line', slug: 'zzz-invented-line',
      clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
    };
    api.get = async () => [...bloodlineFixtures(), invented];
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    await cache.loadBloodlines();

    expect(MIGRATED_DISCS['Zzz Invented Line']).toBeUndefined();
    expect(cache.approvedBloodlines()).toContain('Zzz Invented Line');
    expect(cache.bloodlinesByClan().Mekhet).toContain('Zzz Invented Line');

    const accessors = await import('../../public/js/data/accessors.js');
    expect(accessors.isInClanDisc({ clan: 'Mekhet', bloodline: 'Zzz Invented Line' }, 'Vigour')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 8 — unchanged for all 23 as migrated
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3a — AC 8: identical behaviour for the 23 seeded bloodlines', () => {
  it('both derived dropdown sources match the migrated set exactly', async () => {
    vi.resetModules();
    api.get = async () => bloodlineFixtures();
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    await cache.loadBloodlines();

    expect(cache.approvedBloodlines()).toEqual(Object.keys(MIGRATED_DISCS).sort((a, b) => a.localeCompare(b)));

    const byClan = cache.bloodlinesByClan();
    for (const [clan, names] of Object.entries(MIGRATED_CLANS)) {
      expect(byClan[clan], `clan ${clan}`).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it('the DT form discipline picker composes the same set as the old expression', async () => {
    // Old: (bloodline && BLOODLINE_DISCS[bl]) || (clan && CLAN_DISCS[clan]) || []
    // New: clanDiscList(c) — which is the same thing while the two agree.
    vi.resetModules();
    api.get = async () => bloodlineFixtures();
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    await cache.loadBloodlines();
    const { clanDiscList } = await import('../../public/js/data/accessors.js');

    const clanOf = {};
    for (const [clan, names] of Object.entries(MIGRATED_CLANS)) for (const n of names) clanOf[n] = clan;

    for (const name of Object.keys(MIGRATED_DISCS)) {
      const c = { clan: clanOf[name], bloodline: name };
      const old = (c.bloodline && MIGRATED_DISCS[c.bloodline]) || (c.clan && CLAN_DISCS[c.clan]) || [];
      expect(clanDiscList(c), `picker set for ${name}`).toEqual(old);
    }

    // And for a character with no bloodline, which must still be the clan list.
    for (const clan of Object.keys(CLAN_DISCS)) {
      expect(clanDiscList({ clan })).toEqual(CLAN_DISCS[clan]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review follow-ups (internal 3-layer review, 2026-08-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3a review — the clan-change clear never fires on a cache it cannot trust', () => {
  async function editorWith(payload) {
    vi.resetModules();
    api.get = async () => payload;
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    const state = (await import('../../public/js/data/state.js')).default;
    const edit = await import('../../public/js/editor/edit.js');
    edit.registerCallbacks(() => {}, () => {});
    await cache.loadBloodlines();
    return { cache, state, edit };
  }
  const seeded = () => bloodlineFixtures();

  it('does NOT null a bloodline when the collection is empty (today\'s live state)', async () => {
    // The whole rewiring's one destructive write. An empty map made every
    // bloodline read as invalid, so any clan change wiped a good value.
    const { state, edit } = await editorWith([]);
    state.chars = [{ name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' }];
    state.editIdx = 0;
    edit.shEdit('clan', 'Mekhet');
    expect(state.chars[0].bloodline).toBe('Malkovians');
  });

  it('does NOT null a bloodline when the load failed', async () => {
    vi.resetModules();
    api.get = async () => { throw new Error('network down'); };
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    const state = (await import('../../public/js/data/state.js')).default;
    const edit = await import('../../public/js/editor/edit.js');
    edit.registerCallbacks(() => {}, () => {});
    await cache.loadBloodlines();
    state.chars = [{ name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' }];
    state.editIdx = 0;
    edit.shEdit('clan', 'Mekhet');
    expect(state.chars[0].bloodline).toBe('Malkovians');
  });

  it('BL-5: no longer nulls a mismatched bloodline either, because the clan write is refused', async () => {
    // This assertion USED to be "DOES null a genuinely mismatched bloodline
    // when the cache can answer", and it was right for BL-3a: the clear was
    // live, and the guard around it had to not become a blanket disable.
    //
    // BL-5 made clan write-once. The clan change is now refused before
    // anything downstream of it runs, the clear is deleted, and a character's
    // bloodline is never destroyed as a side effect of a clan edit by any path
    // at all. That is a stronger guarantee than the old one, so the test
    // asserts the stronger thing rather than being deleted.
    const { state, edit } = await editorWith(seeded());
    state.chars = [{ name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' }];
    state.editIdx = 0;
    edit.shEdit('clan', 'Mekhet');
    expect(state.chars[0].clan).toBe('Ventrue');
    expect(state.chars[0].bloodline).toBe('Malkovians');
  });

  it('keeps a bloodline that IS valid for the new clan', async () => {
    const { state, edit } = await editorWith(seeded());
    state.chars = [{ name: 'X', clan: 'Ventrue', bloodline: 'Khaibit' }];
    state.editIdx = 0;
    edit.shEdit('clan', 'Mekhet');
    expect(state.chars[0].bloodline).toBe('Khaibit');
  });

  it('does not delete a value that differs only by case or whitespace', async () => {
    // It costs correctly (the cache normalises), so deleting it here would be
    // the two surfaces disagreeing about the same character.
    const { state, edit } = await editorWith(seeded());
    state.chars = [{ name: 'X', clan: 'Ventrue', bloodline: ' khaibit ' }];
    state.editIdx = 0;
    edit.shEdit('clan', 'Mekhet');
    expect(state.chars[0].bloodline).toBe(' khaibit ');
  });
});

describe('BL-3a review — the dropdowns cannot hide or corrupt a stored bloodline', () => {
  const src = read('public/js/editor/identity.js');
  const sheetSrc = read('public/js/editor/sheet.js');

  it('both escape the DB-sourced name', () => {
    // Public unauthenticated read endpoint, and BL-4 lets an ST write names.
    expect(src).toMatch(/esc\(b\)/);
    expect(sheetSrc).toMatch(/esc\(b\)/);
  });

  it('both union in the character\'s own value so it is always selectable', () => {
    expect(src).toMatch(/_blNames\.push\(c\.bloodline\)/);
    expect(sheetSrc).toMatch(/names\.push\(c\.bloodline\)/);
  });

  it('both match the selected option case-insensitively', () => {
    expect(src).toMatch(/_blKey\(c\.bloodline\) === _blKey\(b\)/);
    expect(sheetSrc).toMatch(/_blKey\(c\.bloodline\) === _blKey\(b\)/);
  });
});

describe('BL-3a review — the sub-select keeps the size the inline style guaranteed', () => {
  const css = read('public/css/components.css');

  it('has a desktop rule that can beat .sh-desktop .sh-edit-select', () => {
    // The inline style had specificity 1,0,0,0 and beat everything; a bare
    // class (0,1,0) loses to `.sh-desktop .sh-edit-select` (0,2,0) at :921,
    // which would have rendered the sub-select at 13px on the one surface it
    // exists for.
    expect(css).toMatch(/\.sh-desktop \.sh-edit-select-sub\{[^}]*font-size:10px/);
    const plain = css.indexOf('.sh-desktop .sh-edit-select{');
    const sub = css.indexOf('.sh-desktop .sh-edit-select-sub{');
    expect(sub).toBeGreaterThan(-1);
    expect(plain).toBeGreaterThan(-1);
  });
});
