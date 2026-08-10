/**
 * Issue #832 — domain merit expand-on-click.
 *
 * Pre-#832: domain merit rows didn't expand to show description; general +
 * influence merits did (via shRenderMeritRow's exp-row/exp-body shell).
 *
 * Post-#832: domain merit rows get the same exp-row/exp-body shell.
 * Click on the infl-edit-row (edit mode) or the wrapping row (view mode)
 * toggles the description visible. Internal interactive controls
 * (name select, dot stepper, remove button, NECRO stepper on virtual rows)
 * get event.stopPropagation() so editing doesn't accidentally toggle.
 *
 * Behavioural per feedback_render_wiring_placement — render and assert on
 * the returned HTML shape.
 */

// Browser shims.
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

let shRenderDomainMerits;
let stateMod;
let loadRulesMod;
let loaderMod;

const NECRO_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  category: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
  // COLLECTIVE-2 (#1110): the discovery predicate is
  // sharing_scope.type === 'collective_owners_of_merit' (ADR-005 Rev 2 D3).
  // Live tm_suite carries this on the Necropolis doc (story Task 0), so the
  // fixture must too or the compound is invisible to the renderer.
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 },
};

// Stub merit-rule docs so meritLookup() returns a desc for the merits in our
// fixtures. meritLookup reads via getRuleByKey from data/loader.js — we mock
// that to return our minimal stub.
const STUB_RULES = {
  'haven': { name: 'Haven', description: 'A defensible Haven for the test character.', rating_range: [1, 5], parent: 'Kindred', sub_category: 'domain' },
  'safe-place': { name: 'Safe Place', description: 'A reliable Safe Place against intrusion.', rating_range: [1, 5], parent: 'Kindred', sub_category: 'domain' },
  'catacombs': { name: 'Catacombs', description: 'Subterranean Catacombs description.', rating_range: [1, 5], parent: 'Kindred', sub_category: 'domain' },
  'labyrinth-guardians': { name: 'Labyrinth Guardians', description: 'Labyrinth Guardians description.', rating_range: [1, 5], parent: 'Kindred', sub_category: 'domain' },
  'necropolis-sepulcher': { name: 'Necropolis Sepulcher', description: 'The Necropolis Sepulcher anchor.', rating_range: [1, 5], parent: 'Kindred', sub_category: 'domain' },
};

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
  loaderMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'loader.js')).href);
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
    rule_grant: [NECRO_GRANT],
    rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  });
  // meritLookup reads via getRuleByKey from data/loader.js — stub it.
  vi.spyOn(loaderMod, 'getRuleByKey').mockImplementation((slug) => STUB_RULES[slug] || null);
});

function mkChar(name, merits) {
  return {
    _id: 'c-' + name.toLowerCase(),
    name,
    clan: 'Nosferatu', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit mode — owned merit rows
// ─────────────────────────────────────────────────────────────────────────────

describe('#832 — edit mode owned merit row gets exp-row/exp-body shell', () => {
  it('Haven row carries exp-row class + id + onclick + exp-body sibling with description', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Apt)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    const havenRealIdx = c.merits.findIndex(m => m.name === 'Haven');
    expect(html).toContain('id="exp-row-dom-' + havenRealIdx + '"');
    expect(html).toContain("onclick=\"toggleExp('dom-" + havenRealIdx + "')\"");
    expect(html).toContain('id="exp-body-dom-' + havenRealIdx + '"');
    expect(html).toContain('A defensible Haven for the test character.');
  });

  it('Interactive controls inside Haven row get event.stopPropagation()', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Apt)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Select dropdown (merit name change) — stopPropagation prepended
    // (semicolon is part of the inline-script prefix shape, see _sp).
    expect(html).toMatch(/<select class="infl-type" onclick="event\.stopPropagation\(\);"/);
    // Remove button — stopPropagation prepended
    expect(html).toMatch(/<button class="dev-rm-btn" onclick="event\.stopPropagation\(\);shRemoveDomMerit/);
  });

  it('exp-arr chevron appears in the row (visual indicator that row is expandable)', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    expect(html).toContain('exp-arr');
  });

  it('Merit without description (no stub rule) falls back to merit-plain — no exp-row/exp-body', () => {
    const c = mkChar('Yusuf', [
      { name: 'Mystery Merit XYZ', category: 'domain', cp: 1, xp: 0 }, // not in STUB_RULES
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    const realIdx = c.merits.findIndex(m => m.name === 'Mystery Merit XYZ');
    expect(html).not.toContain('id="exp-row-dom-' + realIdx + '"');
    expect(html).not.toContain('id="exp-body-dom-' + realIdx + '"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edit mode — virtual (Necropolis) merit rows
// ─────────────────────────────────────────────────────────────────────────────

describe('#832 — edit mode virtual row gets exp-row/exp-body shell', () => {
  it('Virtual Labyrinth Guardians row gets exp-row + exp-body + NECRO stepper has stopPropagation', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
    ]);
    const xavier = mkChar('Xavier', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 4, xp: 0 },
      { name: 'Labyrinth Guardians', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    stateMod.chars = [yusuf, xavier]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    // Virtual row id uses slug.
    expect(html).toContain('id="exp-row-dom-v-labyrinth-guardians"');
    expect(html).toContain('id="exp-body-dom-v-labyrinth-guardians"');
    expect(html).toContain('Labyrinth Guardians description.');
    // NECRO stepper has stopPropagation onclick (clicking input shouldn't toggle).
    expect(html).toMatch(/<input id="bd-necro-v-labyrinth-guardians"[^>]*onclick="event\.stopPropagation\(\);"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// View mode — owned + virtual rows
// ─────────────────────────────────────────────────────────────────────────────

describe('#832 — view mode owned + virtual rows get exp-row/exp-body shell', () => {
  it('View-mode Haven row uses exp-row wrapper + exp-body sibling', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Apt)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    const havenRealIdx = c.merits.findIndex(m => m.name === 'Haven');
    expect(html).toContain('id="exp-row-dom-' + havenRealIdx + '"');
    expect(html).toContain('id="exp-body-dom-' + havenRealIdx + '"');
    expect(html).toContain('A defensible Haven for the test character.');
  });

  it('View-mode virtual row uses exp-row + slug id', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
    ]);
    const xavier = mkChar('Xavier', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 4, xp: 0 },
      { name: 'Labyrinth Guardians', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    stateMod.chars = [yusuf, xavier]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(yusuf, false);
    expect(html).toContain('id="exp-row-dom-v-labyrinth-guardians"');
    expect(html).toContain('id="exp-body-dom-v-labyrinth-guardians"');
  });

  it('View-mode merit without description falls back to merit-plain', () => {
    const c = mkChar('Yusuf', [
      { name: 'Mystery Merit XYZ', category: 'domain', cp: 1, xp: 0 }, // not in STUB_RULES
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('class="merit-plain"');
    const realIdx = c.merits.findIndex(m => m.name === 'Mystery Merit XYZ');
    expect(html).not.toContain('id="exp-row-dom-' + realIdx + '"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prereq label
// ─────────────────────────────────────────────────────────────────────────────

describe('#832 — exp-body contains prereq when present', () => {
  it('Merit with prereq emits "Prerequisite: ..." line inside exp-body', () => {
    // Inject a stub rule with prereq for this test.
    const STUB_WITH_PREREQ = { ...STUB_RULES, 'gated-merit': { name: 'Gated Merit', description: 'Gated description.', prereq: { all: [{ type: 'clan', name: 'Nosferatu' }] }, rating_range: [1, 3], parent: 'Kindred', sub_category: 'domain' } };
    vi.spyOn(loaderMod, 'getRuleByKey').mockImplementation((slug) => STUB_WITH_PREREQ[slug] || null);
    const c = mkChar('Yusuf', [{ name: 'Gated Merit', category: 'domain', cp: 1, xp: 0 }]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    const realIdx = 0;
    expect(html).toContain('id="exp-body-dom-' + realIdx + '"');
    expect(html).toContain('Gated description.');
    expect(html).toMatch(/Prerequisite:.*Nosferatu/);
    // Restore the default stub for subsequent tests.
    vi.spyOn(loaderMod, 'getRuleByKey').mockImplementation((slug) => STUB_RULES[slug] || null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('#832 — placement sanity guards', () => {
  const src = read('public/js/editor/sheet.js');

  it('shRenderDomainMerits emits exp-row id + onclick for owned merits', () => {
    expect(src).toMatch(/_expIdAttr = _hasExpBody \? ' id="exp-row-' \+ _expId/);
    expect(src).toMatch(/_expOnclick = _hasExpBody \? ' onclick="toggleExp\(/);
  });

  it('shRenderDomainMerits stops propagation on select.infl-type + dev-rm-btn', () => {
    expect(src).toMatch(/<select class="infl-type" onclick="' \+ _sp \+ '"/);
    expect(src).toMatch(/<button class="dev-rm-btn" onclick="' \+ _sp \+ 'shRemoveDomMerit/);
  });

  it('Virtual row NECRO stepper stops propagation', () => {
    expect(src).toMatch(/onclick="' \+ _vSp \+ '" onchange="shAllocateCompoundVirtual/);
  });

  it('View-mode emits exp-row when merit has desc, merit-plain when not', () => {
    expect(src).toMatch(/_viewHasExp[\s\S]{0,400}<div class="exp-row" id="exp-row-' \+ _viewExpId/);
    expect(src).toMatch(/<div class="merit-plain">' \+ _viewInner/);
  });

  it('exp-body content includes the description (esc-wrapped)', () => {
    expect(src).toMatch(/<div class="exp-body" id="exp-body-' \+ _expId/);
    expect(src).toMatch(/<div class="exp-body" id="exp-body-' \+ _viewExpId/);
  });
});
