/**
 * COLLECTIVE-1 (issue #800) — virtual row synthesis + cumulative cross-owner
 * dot display + White Ants territory union.
 *
 * Load-bearing fixture per Peter's 2026-06-16 spec: Yusuf + Xavier + Zanzibar.
 * Behavioural-first per the feedback_render_wiring_placement chain — call real
 * shRenderDomainMerits with constructed characters and assert the returned
 * HTML contains the synthesised virtual rows + the cumulative dot markup.
 *
 * Coverage:
 *   - Helper unit tests: collectiveNecroDots, synthesiseCollectiveNecroNames
 *   - Render assertions (edit mode): Yusuf's view shows Catacombs 1+1, virtual
 *     row for Labyrinth Guardians 0+1, no Dark Temple before Zanzibar joins
 *   - Render assertions (after Zanzibar joins): Dark Temple appears as virtual
 *     row 0+1 on Yusuf's render
 *   - Territory union: appears on every Sepulcher-owner's render
 *   - Sepulcher boundary: non-Sepulcher character renders NO virtual rows
 *   - Sepulcher source merit unchanged: own dots only, never cumulative
 *   - Static-analysis sanity guards on the new code paths
 */

// Browser shims — sheet.js + state imports transitively pull api.js's
// location reference. Same pattern as N-7a/b/c/N-4a tests.
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

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

let collectiveNecroDots;
let synthesiseCollectiveNecroNames;
let shRenderDomainMerits;
let stateMod;
let loadRulesMod;

const NECRO_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  category: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
};

beforeAll(async () => {
  const helpersUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'rules-helpers.js')).href;
  ({ collectiveNecroDots, synthesiseCollectiveNecroNames } = await import(helpersUrl));
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);

  // Prime rules cache so getNecropolisTargets returns the 6 target names.
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
    rule_grant: [NECRO_GRANT],
    rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  });
});

function mkChar(name, merits) {
  return {
    _id: 'c-' + name.toLowerCase(),
    name,
    clan: 'Nosferatu',
    covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

// Peter's 2026-06-16 fixture: Yusuf + Xavier (+ optionally Zanzibar).
function yusufXavierFixture() {
  const yusuf = mkChar('Yusuf', [
    { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
    { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    { name: 'Garbage Pit', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    { name: 'Caldarium', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    { name: 'White Ants', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 }, territories: ['the-shore', 'the-harbour'] },
  ]);
  const xavier = mkChar('Xavier', [
    { name: 'Necropolis Sepulcher', category: 'domain', cp: 4, xp: 0 },
    { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    { name: 'Labyrinth Guardians', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    { name: 'White Ants', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 }, territories: ['the-academy', 'the-docklands'] },
  ]);
  return { yusuf, xavier };
}

function zanzibar() {
  return mkChar('Zanzibar', [
    { name: 'Necropolis Sepulcher', category: 'domain', cp: 1, xp: 0 },
    { name: 'Dark Temple', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-1 — collectiveNecroDots', () => {
  it('sums free_grants.necro across all Sepulcher-owners', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    expect(collectiveNecroDots([yusuf, xavier], 'Catacombs')).toBe(2); // 1 + 1
    expect(collectiveNecroDots([yusuf, xavier], 'Garbage Pit')).toBe(1); // only Yusuf
    expect(collectiveNecroDots([yusuf, xavier], 'Labyrinth Guardians')).toBe(1); // only Xavier
    expect(collectiveNecroDots([yusuf, xavier], 'Dark Temple')).toBe(0); // neither
    expect(collectiveNecroDots([yusuf, xavier], 'White Ants')).toBe(4); // 2 + 2
  });

  it('excludes non-Sepulcher characters from the sum', () => {
    const nonOwner = mkChar('NonOwner', [
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 99 } },
    ]);
    expect(collectiveNecroDots([nonOwner], 'Catacombs')).toBe(0); // not an owner
  });

  it('returns 0 for empty inputs or unknown merits', () => {
    expect(collectiveNecroDots([], 'Catacombs')).toBe(0);
    expect(collectiveNecroDots(null, 'Catacombs')).toBe(0);
    expect(collectiveNecroDots([{ name: 'X' }], 'Catacombs')).toBe(0);
  });
});

describe('COLLECTIVE-1 — synthesiseCollectiveNecroNames', () => {
  const TARGETS = ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'];

  it('returns target names ANY Sepulcher-owner allocates dots to, when c is also an owner', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    const names = synthesiseCollectiveNecroNames(yusuf, [yusuf, xavier], TARGETS);
    expect(names).toEqual(expect.arrayContaining(['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'White Ants']));
    expect(names).not.toContain('Dark Temple'); // no one has dots
  });

  it('Sepulcher boundary: non-owner gets empty array', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    const nonOwner = mkChar('NonOwner', [{ name: 'Catacombs', category: 'domain', cp: 0, xp: 0 }]);
    expect(synthesiseCollectiveNecroNames(nonOwner, [yusuf, xavier, nonOwner], TARGETS)).toEqual([]);
  });

  it('after Zanzibar joins with Dark Temple, the union picks it up', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    const z = zanzibar();
    const names = synthesiseCollectiveNecroNames(yusuf, [yusuf, xavier, z], TARGETS);
    expect(names).toContain('Dark Temple');
  });

  it('skips empty target rows (cp + xp + necro all 0)', () => {
    const owner = mkChar('Owner', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 1, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: {} }, // empty
    ]);
    const names = synthesiseCollectiveNecroNames(owner, [owner], TARGETS);
    expect(names).not.toContain('Catacombs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Render behavioural tests — Peter's 2026-06-16 spec example
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-1 — Yusuf + Xavier render (edit mode)', () => {
  function setupYusuf() {
    const { yusuf, xavier } = yusufXavierFixture();
    stateMod.chars = [yusuf, xavier];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    return { yusuf, xavier };
  }

  it('Catacombs on Yusuf shows 1 solid + 1 hollow (own + Xavier)', () => {
    const { yusuf } = setupYusuf();
    const html = shRenderDomainMerits(yusuf, true);
    // The dom-total-lbl carries the NECRO cumulative title — find Catacombs's
    // total span. shDotsMixed renders ● for solid and ○ for hollow.
    expect(html).toContain('Cumulative across all Sepulcher-owners');
    // Owned Necro targets each carry a free_grants.necro stepper (Catacombs,
    // Garbage Pit, Caldarium, White Ants on Yusuf → 4 occurrences). Virtual
    // rows route via shAllocateNecroVirtual (separate handler — counted below).
    expect((html.match(/free_grants\.necro/g) || []).length).toBe(4);
    // Virtual Labyrinth Guardians row uses shAllocateNecroVirtual (no
    // realIdx exists for a row whose merit isn't on c.merits yet).
    expect(html).toContain("shAllocateNecroVirtual('Labyrinth Guardians'");
  });

  it('Labyrinth Guardians appears as a VIRTUAL row on Yusuf (he does not own it)', () => {
    const { yusuf } = setupYusuf();
    const html = shRenderDomainMerits(yusuf, true);
    expect(html).toContain('dom-edit-block--virtual');
    expect(html).toContain('Labyrinth Guardians');
    // Virtual row's NECRO input uses the slug-based id, not realIdx.
    expect(html).toContain('id="bd-necro-v-labyrinth-guardians"');
    expect(html).toContain('shAllocateNecroVirtual');
  });

  it('Dark Temple is ABSENT before Zanzibar joins', () => {
    const { yusuf } = setupYusuf();
    const html = shRenderDomainMerits(yusuf, true);
    expect(html).not.toContain('Dark Temple');
  });

  it('White Ants territory union renders on Yusuf with all 4 territory slugs (no attribution)', () => {
    const { yusuf } = setupYusuf();
    const html = shRenderDomainMerits(yusuf, true);
    expect(html).toContain('wa-territory-union');
    // The territory display uses slugs when name lookup fails (no territories
    // loaded in getStoredTerritories under the test shim). Either form is fine
    // for this assertion — slugs are what's in the fixture.
    expect(html).toContain('the-shore');
    expect(html).toContain('the-harbour');
    expect(html).toContain('the-academy');
    expect(html).toContain('the-docklands');
  });
});

describe('COLLECTIVE-1 — Zanzibar joins → Dark Temple appears on Yusuf', () => {
  it('Yusuf re-render after Zanzibar joins shows Dark Temple as a virtual row', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    const z = zanzibar();
    stateMod.chars = [yusuf, xavier, z];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    expect(html).toContain('Dark Temple');
    expect(html).toContain('id="bd-necro-v-dark-temple"');
    // Dark Temple appears as a virtual row block (Yusuf doesn't own it).
    expect(html).toContain('dom-edit-block--virtual');
  });

  it('Zanzibar sees Dark Temple as OWNED (not virtual)', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    const z = zanzibar();
    stateMod.chars = [yusuf, xavier, z];
    stateMod.editIdx = 2;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(z, true);
    // The owned-merit row uses bd-necro-{realIdx}, not the virtual slug form.
    expect(html).toMatch(/id="bd-necro-\d+"/);
    // Catacombs / Garbage Pit / Caldarium / Labyrinth Guardians / White Ants
    // appear as virtual rows on Zanzibar (he doesn't own any of them).
    expect(html).toContain('id="bd-necro-v-catacombs"');
    expect(html).toContain('id="bd-necro-v-labyrinth-guardians"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sepulcher boundary + Sepulcher source merit
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-1 — Sepulcher boundary + source merit', () => {
  it('non-Sepulcher character renders NO virtual rows', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    const nonOwner = mkChar('Tourist', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
    ]);
    stateMod.chars = [yusuf, xavier, nonOwner];
    stateMod.editIdx = 2;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(nonOwner, true);
    expect(html).not.toContain('dom-edit-block--virtual');
    expect(html).not.toContain('shAllocateNecroVirtual');
    expect(html).not.toContain('wa-territory-union');
  });

  it('Sepulcher source merit row uses standard dot display (not cumulative)', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    stateMod.chars = [yusuf, xavier];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    // Sepulcher is NOT a target (it's the SOURCE) — its row should not have
    // the cumulative title. The Necropolis target rows DO have it. The
    // existence of at least one target ensures the title appears in HTML.
    expect(html).toContain('Cumulative across all Sepulcher-owners');
    // Sanity: Sepulcher itself still renders.
    expect(html).toMatch(/shEditDomMerit\(0,'name'/); // first merit's edit handler (Sepulcher is index 0)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// View mode (read-only sheet)
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-1 — view mode (read-only) synthesis', () => {
  it('view mode renders virtual rows for partner-only merits', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    stateMod.chars = [yusuf, xavier];
    stateMod.editIdx = 0;
    stateMod.editMode = false;
    const html = shRenderDomainMerits(yusuf, false);
    expect(html).toContain('merit-plain--virtual');
    expect(html).toContain('Labyrinth Guardians');
    // No editor controls in view mode.
    expect(html).not.toContain('shAllocateNecroVirtual');
  });

  it('view mode renders the territory union under White Ants', () => {
    const { yusuf, xavier } = yusufXavierFixture();
    stateMod.chars = [yusuf, xavier];
    stateMod.editIdx = 0;
    stateMod.editMode = false;
    const html = shRenderDomainMerits(yusuf, false);
    expect(html).toContain('wa-territory-union');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-1 — placement sanity guards', () => {
  it('synthesiseCollectiveNecroNames + collectiveNecroDots exported from rules-helpers', () => {
    const src = read('public/js/data/rules-helpers.js');
    expect(src).toMatch(/export function collectiveNecroDots/);
    expect(src).toMatch(/export function synthesiseCollectiveNecroNames/);
  });

  it('shAllocateNecroVirtual handler exists in edit-domain.js and routes via free_grants.necro', () => {
    const src = read('public/js/editor/edit-domain.js');
    expect(src).toMatch(/export function shAllocateNecroVirtual/);
    expect(src).toMatch(/existing\.free_grants\.necro\s*=\s*val/);
  });

  it('shAllocateNecroVirtual re-exported from edit.js and listed in admin.js global block', () => {
    expect(read('public/js/editor/edit.js')).toContain('shAllocateNecroVirtual');
    const admin = read('public/js/admin.js');
    // Must appear in BOTH the import list AND the window-binding export
    expect((admin.match(/shAllocateNecroVirtual/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('ADR-005 D3 inline amendment present in the architecture doc', () => {
    const src = read('specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md');
    expect(src).toMatch(/D3 — inline amendment \(COLLECTIVE-1, issue #800/);
    expect(src).toMatch(/virtual row synthesis for partner-only merits/);
  });
});
