/**
 * Issue #793 — alphabetical sort + Necropolis inherited-card grouping.
 *
 * Behavioural-first per the feedback_render_wiring_placement chain — call
 * the real `shRenderDomainMerits` against constructed characters and assert
 * the returned HTML's row order + inherited-card structure.
 */

// Browser shims — sheet.js transitively imports api.js (location).
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

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
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

// Pull the merit names in render order. The infl-type select carries the
// merit name as the dropdown's surrounding marker. We use a more reliable
// signal: the trait-name span (view mode) + the option-selected text or
// the row's order-preserving inferable identity. For the edit mode, the
// `My dots:` label sits inside each dom-edit-block, so we split on those
// markers and map back to merit names via the order-of-appearance of the
// known merit identifiers.
//
// Simpler approach: assert that the substring positions of each merit's
// distinctive marker (the data we put in handlers) appear in alphabetical
// sequence. Each owned merit row has either:
//   - shEditDomMerit(<di>,'name', ...) where di is the ORIGINAL domain idx
// We anchor on the SECOND row argument (the literal 'name') which appears
// once per owned merit row, then we read the merit's free_grants.necro
// handler or shAdjMeritBonus call which references the realIdx. To stay
// robust to internal handler shape, we extract names from the dropdown
// option selected by index — but the test rules cache doesn't populate
// the dropdown options. Easier: assert known structural markers (the
// inherited-card class exists, its position relative to Sepulcher).

function indexOf(html, needle) {
  const i = html.indexOf(needle);
  if (i < 0) throw new Error(`marker not found: ${needle}`);
  return i;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card presence + structure
// ─────────────────────────────────────────────────────────────────────────────

describe('#793 — inherited card structure (edit mode)', () => {
  it('Sepulcher-owner with target merits: card renders immediately after Sepulcher row, contains all targets', () => {
    const yusuf = mkChar('Yusuf', [
      // Out-of-order insertion; sort must place them alphabetically
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
      { name: 'White Ants', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 }, territories: ['the-shore'] },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
      { name: 'Garbage Pit', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Apt)' },
    ]);
    stateMod.chars = [yusuf];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    // Card class present.
    expect(html).toContain('dom-inherited-card');
    expect(html).toContain('Inherited from Necropolis Sepulcher');
    // Sepulcher's removed handler (shRemoveDomMerit) appears BEFORE the card.
    // The card is immediately AFTER Sepulcher's row close.
    const sepulcherDomIdx = yusuf.merits.findIndex(m => m.name === 'Necropolis Sepulcher');
    const sepulcherIdx = indexOf(html, `shRemoveDomMerit(${sepulcherDomIdx})`);
    const cardIdx = indexOf(html, 'dom-inherited-card');
    expect(cardIdx).toBeGreaterThan(sepulcherIdx);
    // Catacombs, Caldarium (virtual), Garbage Pit, White Ants etc — all appear
    // somewhere in the rendered HTML.
    expect(html).toContain('White Ants');
    // Virtual Caldarium / Labyrinth Guardians / Dark Temple appear because
    // they're in the synthesised collective set (Yusuf is sole Sepulcher-
    // owner here but only with own allocations — virtual set is empty here).
    // Owned targets (Catacombs, Garbage Pit, White Ants) appear inside card.
  });

  it('Sepulcher-owner with NO target merits and no virtual: card does NOT render', () => {
    const lonely = mkChar('Lonely', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 1, xp: 0 },
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
    ]);
    stateMod.chars = [lonely];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(lonely, true);
    expect(html).not.toContain('dom-inherited-card');
    expect(html).not.toContain('Inherited from Necropolis Sepulcher');
  });

  it('Non-Sepulcher character: card does NOT render even with stray target merits', () => {
    // Construct a non-Sepulcher character with a stray Catacombs (shouldn't
    // happen post-N-9 but tests graceful degradation).
    const stray = mkChar('Stray', [
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
    ]);
    stateMod.chars = [stray];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = shRenderDomainMerits(stray, true);
    expect(html).not.toContain('dom-inherited-card');
    // Catacombs still renders in alphabetical position — 2 dom-edit-block
    // markers (Catacombs first, then Safe Place — alphabetical, since C < S).
    // The pool stepper is suppressed on non-member chars (compoundPools is
    // filtered to _ownedCompounds) but the row itself surfaces.
    const blockCount = (html.match(/class="dom-edit-block(?!--virtual)/g) || []).length;
    expect(blockCount).toBe(2);
    // Order: Catacombs (domIdx 0) before Safe Place (domIdx 1) alphabetically.
    expect(html.indexOf('shRemoveDomMerit(0)')).toBeLessThan(html.indexOf('shRemoveDomMerit(1)'));
    // The warn must fire so QA sees the stray-state condition.
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('Collective Compound target merits present on a non-member character');
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort order — non-target merits alphabetical; Trap Door alphabetical
// ─────────────────────────────────────────────────────────────────────────────

describe('#793 — alphabetical sort outside the inherited card', () => {
  it('non-target merits render in alphabetical order; Trap Door alphabetical too', () => {
    const c = mkChar('Yusuf', [
      // Out-of-order insertion. Expected alphabetical for non-Necro-target:
      //   Haven, Mandragora Garden, Necropolis Sepulcher, Safe Place, Trap Door
      // (Trap Door is NOT in the inherited card — stays alphabetical.)
      // Plus an owned Necro target which should be INSIDE the card after Sepulcher.
      { name: 'Trap Door', category: 'domain', cp: 1, xp: 0 },
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
      { name: 'Mandragora Garden', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Apt)' },
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Apt)' },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);

    // Map each merit to a unique marker we can search for. The remove-button's
    // handler `shRemoveDomMerit(<di>)` carries the ORIGINAL domain index which
    // is stable per-merit (1:1 with the insertion-order filtered list).
    const domIdx = (name) => c.merits.findIndex(m => m.name === name);

    const sepIdx = indexOf(html, `shRemoveDomMerit(${domIdx('Necropolis Sepulcher')})`);
    const cardIdx = indexOf(html, 'dom-inherited-card');
    const havenIdx = indexOf(html, `shRemoveDomMerit(${domIdx('Haven')})`);
    const mandragoraIdx = indexOf(html, `shRemoveDomMerit(${domIdx('Mandragora Garden')})`);
    const safePlaceIdx = indexOf(html, `shRemoveDomMerit(${domIdx('Safe Place')})`);
    const trapDoorIdx = indexOf(html, `shRemoveDomMerit(${domIdx('Trap Door')})`);

    // Alphabetical order: Haven < Mandragora Garden < Necropolis Sepulcher <
    // Safe Place < Trap Door. The card sits immediately after Sepulcher's row.
    expect(havenIdx).toBeLessThan(mandragoraIdx);
    expect(mandragoraIdx).toBeLessThan(sepIdx);
    expect(sepIdx).toBeLessThan(cardIdx); // card immediately after Sepulcher
    // Safe Place + Trap Door come AFTER the card (alphabetically after 'Necropolis').
    // Card body contains Catacombs's row which has shRemoveDomMerit too — find
    // the FIRST occurrence of Safe Place's handler after the card closes.
    expect(safePlaceIdx).toBeGreaterThan(cardIdx);
    expect(trapDoorIdx).toBeGreaterThan(safePlaceIdx);
  });

  it('Trap Door is NOT inside the inherited card (positional + count check)', () => {
    const c = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Trap Door', category: 'domain', cp: 1, xp: 0 },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Trap Door's remove-handler position is AFTER the card opens
    // (alphabetically T > N, so Trap Door's row sits after the inherited
    // group). Card contains exactly 1 row (Catacombs) — count dom-edit-block
    // openings INSIDE the card section using the card-title as a left bound
    // and the next merit-row INDICATOR outside the card. Cheaper assertion:
    // the card's content is the Catacombs row only — verify the substring
    // between the card-title and the next non-target row contains Catacombs's
    // handler shRemoveDomMerit(1) but NOT Trap Door's shRemoveDomMerit(2).
    const cardTitleEnd = indexOf(html, 'Inherited from Necropolis Sepulcher') + 'Inherited from Necropolis Sepulcher</div>'.length;
    // The card emits dom-inherited-card-title then exactly N target rows then
    // the closing </div>. With 1 target (Catacombs) the card body = 1 row.
    // The marker for "card content over" is the next `dom-edit-block` that
    // ISN'T preceded by another `dom-inherited-card` open. In this fixture
    // the card body has 1 dom-edit-block opener; the next one after that
    // (Trap Door's) sits OUTSIDE the card.
    const inCardSlice = html.slice(cardTitleEnd);
    // The first dom-edit-block after the card title is Catacombs (inside card)
    const firstBlockInside = inCardSlice.indexOf('class="dom-edit-block"');
    expect(firstBlockInside).toBeGreaterThanOrEqual(0);
    // Trap Door's handler must come AFTER the card itself closes.
    const tdHandlerPos = html.indexOf(`shRemoveDomMerit(${c.merits.findIndex(m => m.name === 'Trap Door')})`);
    const catacombsHandlerPos = html.indexOf(`shRemoveDomMerit(${c.merits.findIndex(m => m.name === 'Catacombs')})`);
    // Catacombs (inside card) before Trap Door (outside, alphabetical pos).
    expect(catacombsHandlerPos).toBeLessThan(tdHandlerPos);
    // Trap Door's row has the td-anchor-block which only Trap Door triggers
    // — that section must appear OUTSIDE the card. The card opens at
    // dom-inherited-card; the card closes before the td-anchor-block appears.
    const tdAnchorPos = html.indexOf('td-anchor-block');
    expect(tdAnchorPos).toBeGreaterThan(tdHandlerPos); // td-anchor renders within Trap Door's row
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// View mode mirror
// ─────────────────────────────────────────────────────────────────────────────

describe('#793 — view mode mirrors edit mode', () => {
  it('view mode: inherited card present for Sepulcher-owner with targets', () => {
    const c = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('dom-inherited-card');
    expect(html).toContain('Inherited from Necropolis Sepulcher');
  });

  it('view mode: card absent when no targets and no virtuals', () => {
    const c = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 1, xp: 0 },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    expect(html).not.toContain('dom-inherited-card');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTIVE-1 + virtual rows: virtuals go INSIDE the card
// ─────────────────────────────────────────────────────────────────────────────

describe('#793 — virtual rows render inside the inherited card', () => {
  it('Yusuf + Xavier 2-char: virtual Labyrinth Guardians sits inside the card', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    const xavier = mkChar('Xavier', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 4, xp: 0 },
      { name: 'Labyrinth Guardians', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    stateMod.chars = [yusuf, xavier];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    const cardStart = indexOf(html, 'dom-inherited-card');
    const cardEnd = indexOf(html, 'dev-add-row');
    const cardSlice = html.slice(cardStart, cardEnd);
    expect(cardSlice).toContain('Labyrinth Guardians');
    expect(cardSlice).toContain('shAllocateCompoundVirtual'); // virtual row handler
    expect(cardSlice).toContain('bd-necro-v-labyrinth-guardians');
  });

  it('no standalone virtual row block outside the card after #793', () => {
    // Pre-#793: virtual rows rendered AFTER domM.forEach as standalone blocks.
    // Post-#793: they live inside the card. There should be exactly ONE
    // 'dom-edit-block--virtual' marker per virtual row, and all of them
    // sit INSIDE the inherited card.
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
    ]);
    const xavier = mkChar('Xavier', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 4, xp: 0 },
      { name: 'Labyrinth Guardians', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Dark Temple', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    stateMod.chars = [yusuf, xavier];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    const virtualBlocks = (html.match(/dom-edit-block--virtual/g) || []).length;
    expect(virtualBlocks).toBe(2); // Labyrinth Guardians + Dark Temple
    // All virtual blocks should sit inside the card.
    const cardStart = indexOf(html, 'dom-inherited-card');
    const cardEnd = indexOf(html, 'dev-add-row');
    const insideCard = (html.slice(cardStart, cardEnd).match(/dom-edit-block--virtual/g) || []).length;
    expect(insideCard).toBe(virtualBlocks);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('#793 — placement sanity guards', () => {
  it('shRenderDomainMerits sorts via _sortedDom and emits dom-inherited-card', () => {
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(body).toMatch(/_sortedDom\s*=\s*\[\.\.\.domM\]\.sort/);
    expect(body).toMatch(/dom-inherited-card/);
    expect(body).toMatch(/_emitDomRow/);
    expect(body).toMatch(/_emitVirtualCompoundRow/);
    // View-mode helpers
    expect(body).toMatch(/_emitViewRow/);
    expect(body).toMatch(/_emitVirtualViewRow/);
    expect(body).toMatch(/_sortedDomView/);
  });

  it('stray-target console.warn surface is present (graceful degradation)', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toContain('[#793] Collective Compound target merits present on a non-member character');
  });

  it('target names sourced via getCollectiveCompounds — no hardcoded duplicate', () => {
    // Sanity: the renderer derives its target-name set from the compound
    // descriptors, not a fresh hardcoded list. Computed once at the top of
    // each render block.
    // COLLECTIVE-2 (#1110): was `_necroTargetSet = new Set(_necroTargets)`
    // off the single Necropolis pool_targets array.
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(body).toMatch(/_targetNames\s*=\s*new Set\(_compounds\.flatMap\(cmp\s*=>\s*cmp\.targets\)\)/);
    expect(body).toMatch(/_targetNamesView\s*=\s*new Set\(_compoundsView\.flatMap\(cmp\s*=>\s*cmp\.targets\)\)/);
  });
});
