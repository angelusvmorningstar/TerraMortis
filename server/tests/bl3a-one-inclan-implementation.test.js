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
import { BLOODLINE_DISCS, BLOODLINE_CLANS, CLAN_DISCS } from '../../public/js/data/constants.js';
import { buildSeedDocs } from '../scripts/seed-bloodlines.js';

const api = vi.hoisted(() => ({ get: null }));
vi.mock('../../public/js/data/api.js', () => ({ apiGet: async (...a) => api.get(...a) }));

globalThis.location ??= { hostname: 'localhost', pathname: '/index.html' };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
/** Source with comments stripped — a wiring grep must not pass on prose. */
const code = rel => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ─────────────────────────────────────────────────────────────────────────────
// AC 1 — no live reader of the constants remains
// ─────────────────────────────────────────────────────────────────────────────

/** Files allowed to mention the bloodline constants after BL-3a. */
const ALLOWED = new Set([
  'public/js/data/constants.js',        // the definition itself
  'public/js/data/bloodlines-cache.js', // comments only, names the thing it replaces
  'public/js/data/accessors.js',        // comments only, names the old implementation
  'public/js/dev-fixtures.js',          // BL-3b: derives the fixture from the constants
  'public/js/tabs/wizard.js',           // dead, zero importers, belongs to #1095
]);

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

  it('edit.js validates the clan-change against the cache, not the constant', () => {
    const src = code('public/js/editor/edit.js');
    expect(src).toMatch(/bloodlinesByClan\(\)/);
    expect(src).not.toMatch(/BLOODLINE_CLANS/);
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
  it('the cache surfaces a name the constants have never heard of', async () => {
    // The epic's actual promise, observable for the first time here.
    vi.resetModules();
    const invented = {
      _id: 'x', name: 'Zzz Invented Line', slug: 'zzz-invented-line',
      clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
    };
    api.get = async () => [
      ...buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })
        .map(({ notes, ...d }, i) => ({ _id: String(i), ...d })),
      invented,
    ];
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    await cache.loadBloodlines();

    expect(BLOODLINE_DISCS['Zzz Invented Line']).toBeUndefined();
    expect(cache.approvedBloodlines()).toContain('Zzz Invented Line');
    expect(cache.bloodlinesByClan().Mekhet).toContain('Zzz Invented Line');

    const accessors = await import('../../public/js/data/accessors.js');
    expect(accessors.isInClanDisc({ clan: 'Mekhet', bloodline: 'Zzz Invented Line' }, 'Vigour')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 8 — unchanged for all 23 while the collection matches the constants
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3a — AC 8: identical behaviour for the 23 seeded bloodlines', () => {
  it('both derived dropdown sources match the constants exactly', async () => {
    vi.resetModules();
    api.get = async () => buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })
      .map(({ notes, ...d }, i) => ({ _id: String(i), ...d }));
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    await cache.loadBloodlines();

    expect(cache.approvedBloodlines()).toEqual(Object.keys(BLOODLINE_DISCS).sort((a, b) => a.localeCompare(b)));

    const byClan = cache.bloodlinesByClan();
    for (const [clan, names] of Object.entries(BLOODLINE_CLANS)) {
      expect(byClan[clan], `clan ${clan}`).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it('the DT form discipline picker composes the same set as the old expression', async () => {
    // Old: (bloodline && BLOODLINE_DISCS[bl]) || (clan && CLAN_DISCS[clan]) || []
    // New: clanDiscList(c) — which is the same thing while the two agree.
    vi.resetModules();
    api.get = async () => buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })
      .map(({ notes, ...d }, i) => ({ _id: String(i), ...d }));
    const cache = await import('../../public/js/data/bloodlines-cache.js');
    await cache.loadBloodlines();
    const { clanDiscList } = await import('../../public/js/data/accessors.js');

    const clanOf = {};
    for (const [clan, names] of Object.entries(BLOODLINE_CLANS)) for (const n of names) clanOf[n] = clan;

    for (const name of Object.keys(BLOODLINE_DISCS)) {
      const c = { clan: clanOf[name], bloodline: name };
      const old = (c.bloodline && BLOODLINE_DISCS[c.bloodline]) || (c.clan && CLAN_DISCS[c.clan]) || [];
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
  const seeded = () => buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })
    .map(({ notes, ...d }, i) => ({ _id: String(i), ...d }));

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

  it('DOES null a genuinely mismatched bloodline when the cache can answer', async () => {
    // The behaviour must survive the guard, or the guard is just a disable.
    const { state, edit } = await editorWith(seeded());
    state.chars = [{ name: 'Cazz', clan: 'Ventrue', bloodline: 'Malkovians' }];
    state.editIdx = 0;
    edit.shEdit('clan', 'Mekhet');
    expect(state.chars[0].bloodline).toBeNull();
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
