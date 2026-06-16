/**
 * Issue #827 — domain merit subtitle/label must precede dots in DOM order.
 *
 * Three merits are affected:
 *   - Haven (subtitle: "Attached: <Safe Place>")
 *   - Mandragora Garden (subtitle: "Attached: <Safe Place or Sepulcher>")
 *   - White Ants (subtitle: "Territories: <flat union>")
 *
 * Pre-#827: subtitles emitted as sibling sub-rows AFTER the dot row → in
 * DOM order, subtitle followed dots, breaking the consistent rightmost-dots
 * rule.
 *
 * Post-#827: subtitle inline inside the main row (infl-edit-row /
 * trait-main), placed between the merit name and the dot spans → dots
 * remain rightmost in every domain merit row.
 *
 * Behavioural per feedback_render_wiring_placement — call the real renderer
 * and assert position of subtitle vs dots in the returned HTML.
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
    clan: 'Nosferatu', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

// The dots column in the editor's main row is `dom-total-lbl` (Total: ...).
// In view mode it's the `trait-right` div. Both are reliable anchors that
// only appear in one place per row.

describe('#827 — subtitle precedes dots in DOM order (edit mode)', () => {
  it('Haven row: "Attached: X" subtitle appears BEFORE the dots span', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Find Haven's row. Each row's remove-button handler uniquely identifies it.
    const havenDi = c.merits.findIndex(m => m.name === 'Haven');
    const removeMarker = `shRemoveDomMerit(${havenDi})`;
    const removeIdx = html.indexOf(removeMarker);
    expect(removeIdx).toBeGreaterThan(0);
    // Slice Haven's infl-edit-row by anchoring on its remove-button position.
    // The row starts at the previous '<div class="dom-edit-block"' before
    // removeIdx and ends at the next 'dom-edit-block' or 'dev-add-row'.
    const blockStart = html.lastIndexOf('<div class="dom-edit-block"', removeIdx);
    const blockEnd = html.indexOf('<div class="dom-edit-block', blockStart + 1);
    const rowSlice = html.slice(blockStart, blockEnd > 0 ? blockEnd : html.length);
    const subtitleIdx = rowSlice.indexOf('Attached:');
    const totalIdx = rowSlice.indexOf('dom-total-lbl');
    expect(subtitleIdx).toBeGreaterThan(0);
    expect(totalIdx).toBeGreaterThan(0);
    expect(subtitleIdx).toBeLessThan(totalIdx);
  });

  it('Mandragora Garden row: "Attached: X" subtitle appears BEFORE the dots span', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Mandragora Garden', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    const mgDi = c.merits.findIndex(m => m.name === 'Mandragora Garden');
    const removeIdx = html.indexOf(`shRemoveDomMerit(${mgDi})`);
    const blockStart = html.lastIndexOf('<div class="dom-edit-block"', removeIdx);
    const blockEnd = html.indexOf('<div class="dom-edit-block', blockStart + 1);
    const rowSlice = html.slice(blockStart, blockEnd > 0 ? blockEnd : html.length);
    const subtitleIdx = rowSlice.indexOf('Attached:');
    const totalIdx = rowSlice.indexOf('dom-total-lbl');
    expect(subtitleIdx).toBeGreaterThan(0);
    expect(subtitleIdx).toBeLessThan(totalIdx);
  });

  it('White Ants row: "Territories: ..." subtitle appears BEFORE the dots span', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'White Ants', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 }, territories: ['the-shore', 'the-harbour'] },
    ]);
    stateMod.chars = [yusuf]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    const waDi = yusuf.merits.findIndex(m => m.name === 'White Ants');
    const removeIdx = html.indexOf(`shRemoveDomMerit(${waDi})`);
    const blockStart = html.lastIndexOf('<div class="dom-edit-block"', removeIdx);
    const blockEnd = html.indexOf('<div class="dom-edit-block', blockStart + 1);
    const rowSlice = html.slice(blockStart, blockEnd > 0 ? blockEnd : html.length);
    const subtitleIdx = rowSlice.indexOf('Territories:');
    const totalIdx = rowSlice.indexOf('dom-total-lbl');
    expect(subtitleIdx).toBeGreaterThan(0);
    expect(subtitleIdx).toBeLessThan(totalIdx);
  });

  it('Standalone wa-territory-union sub-row is no longer emitted', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'White Ants', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 }, territories: ['the-shore'] },
    ]);
    stateMod.chars = [yusuf]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(yusuf, true);
    // The pre-#827 sub-row class `wa-territory-union` no longer appears.
    expect(html).not.toContain('class="wa-territory-union"');
    // The new inline subtitle class `dom-row-subtitle` does appear, with the text.
    expect(html).toContain('dom-row-subtitle');
    expect(html).toContain('Territories:');
  });

  it('Haven without attached_to: subtitle shows "(not attached)" placeholder, still before dots', () => {
    const c = mkChar('Yusuf', [
      { name: 'Haven', category: 'domain', cp: 1, xp: 0 }, // no attached_to
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    expect(html).toContain('Attached: (not attached)');
    expect(html.indexOf('Attached:')).toBeLessThan(html.indexOf('dom-total-lbl'));
  });
});

describe('#827 — subtitle precedes dots in DOM order (view mode)', () => {
  it('Haven row: "Attached: X" appears BEFORE trait-right (dots container)', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    // View mode sorts alphabetically — Haven < Safe Place. Find Haven via its
    // name text content.
    const havenIdx = html.indexOf('>Haven<');
    expect(havenIdx).toBeGreaterThan(0);
    // Slice Haven's row.
    const blockStart = html.lastIndexOf('<div class="merit-plain', havenIdx);
    const blockEnd = html.indexOf('<div class="merit-plain', blockStart + 1);
    const rowSlice = html.slice(blockStart, blockEnd > 0 ? blockEnd : html.length);
    const subtitleIdx = rowSlice.indexOf('Attached:');
    const traitRightIdx = rowSlice.indexOf('trait-right');
    expect(subtitleIdx).toBeGreaterThan(0);
    expect(traitRightIdx).toBeGreaterThan(0);
    expect(subtitleIdx).toBeLessThan(traitRightIdx);
  });

  it('White Ants row: "Territories: ..." appears BEFORE trait-right', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'White Ants', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 }, territories: ['the-shore'] },
    ]);
    stateMod.chars = [yusuf]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(yusuf, false);
    // White Ants's row contains "Territories:" — find it.
    const territoriesIdx = html.indexOf('Territories:');
    expect(territoriesIdx).toBeGreaterThan(0);
    // The trait-right for the same row appears AFTER the subtitle.
    // Slice the row: lastIndexOf('<div class="merit-plain' before
    // territoriesIdx), nextIndexOf after.
    const blockStart = html.lastIndexOf('<div class="merit-plain', territoriesIdx);
    const blockEnd = html.indexOf('<div class="merit-plain', blockStart + 1);
    const rowSlice = html.slice(blockStart, blockEnd > 0 ? blockEnd : html.length);
    const subtitleIdx = rowSlice.indexOf('Territories:');
    const traitRightIdx = rowSlice.indexOf('trait-right');
    expect(subtitleIdx).toBeLessThan(traitRightIdx);
  });

  it('Standalone trait-sub "Attached: X" sub-row no longer emitted (replaced by inline)', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    // The pre-#827 sub-row had `<div class="trait-sub"><span class="trait-qual">Attached:`
    // — the inline version uses `<span class="trait-qual dom-row-subtitle">Attached:`.
    expect(html).not.toMatch(/<div class="trait-sub"><span class="trait-qual">Attached:/);
    expect(html).toMatch(/<span class="trait-qual dom-row-subtitle">Attached:/);
  });
});

describe('#827 — non-target merits unaffected (regression sentinel)', () => {
  it('Safe Place has no dom-row-subtitle (not in the three named merits)', () => {
    const c = mkChar('Yusuf', [
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    expect(html).not.toContain('dom-row-subtitle');
  });

  it('Feeding Grounds has no dom-row-subtitle (not in the three named merits)', () => {
    const c = mkChar('Yusuf', [
      { name: 'Feeding Grounds', category: 'domain', cp: 2, xp: 0, qualifier: 'Docks' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    expect(html).not.toContain('dom-row-subtitle');
  });
});

describe('#827 — placement sanity guards', () => {
  it('shRenderDomainMerits source emits dom-row-subtitle for the three named merits', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/m\.name === 'Haven' \|\| m\.name === 'Mandragora Garden'/);
    expect(src).toMatch(/m\.name === 'White Ants' && _necroTerritoryUnion/);
    expect(src).toMatch(/dom-row-subtitle/);
  });

  it('wa-territory-union standalone sub-row removed from edit mode emission', () => {
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    // The class attribute `class="wa-territory-union"` no longer appears as an
    // emitted element string. (The audit-trail comment text references it,
    // but only inside JS comments — strip comments and confirm.)
    const codeOnly = body.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly).not.toMatch(/class="wa-territory-union"/);
  });
});
