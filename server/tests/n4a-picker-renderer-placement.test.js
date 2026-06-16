/**
 * N-4a (issue #781) + #782 — picker-placement + shared_with-suppression
 * behavioural tests.
 *
 * N-4a fix: `_whiteAntsTerritoriesBlock` and `_trapDoorAnchorBlock` were
 * wired inside `shRenderGeneralMerits` (sheet.js:1381, :1383 pre-fix) but
 * both target merits are sub_category='domain'. The pickers never rendered
 * during a real edit, save failed server-side with 400. Third instance of
 * the wiring-placement blind spot from `feedback_render_wiring_placement`
 * (after N-7a stepper + N-7c orchestrator). Behavioural render-and-assert
 * tests are the only mechanism that catches placement bugs — regex tests
 * confirm the wiring exists in the file, not its execution path.
 *
 * #782 fix: shared_with partner_explicit picker suppression. Inverted the
 * `_noShare` exclusion list to a positive `_canShare = ['Safe Place',
 * 'Haven']` include list per Peter's 2026-06-16 decision (a). Reverses
 * #160 (Mandragora shareable). Necropolis family auto-shares via
 * `_collective_shared_with` synthesis — orthogonal to this picker UI.
 */

// Browser shims — sheet.js transitively imports api.js's `location` reference.
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
let shRenderGeneralMerits;
let stateMod;
let loadRulesMod;

const NECRO_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  category: 'necro',
  pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
};

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits, shRenderGeneralMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);

  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
    rule_grant: [NECRO_GRANT],
    rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  });
});

function mkChar(merits) {
  return {
    _id: 'n4a-test', name: 'N4a Test',
    clan: 'Nosferatu', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// N-4a — picker placement in the domain renderer (production bug)
// ─────────────────────────────────────────────────────────────────────────────

describe('N-4a — White Ants Territory picker renders in shRenderDomainMerits', () => {
  it('renders the White Ants picker block when a Sepulcher owner has White Ants', () => {
    const c = mkChar([
      { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
      { name: 'White Ants', category: 'domain', cp: 2, xp: 0, territories: [] },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);
    // wa-picker-block is the class marker the White Ants block always emits
    // (with a "Loading territories…" placeholder when getStoredTerritories
    // returns empty — that's the render-time fallback). Production bug
    // pre-N-4a: this marker was missing from the domain HTML entirely.
    expect(html).toContain('wa-picker-block');
    expect(html).toContain('White Ants');
  });

  it('does NOT render the White Ants picker block in shRenderGeneralMerits', () => {
    // Regression sentinel — White Ants is sub_category='domain' so the
    // general renderer must NEVER render the picker. Pre-N-4a the picker
    // was wired here and was inert; we've removed the call entirely.
    const c = mkChar([
      { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
      { name: 'White Ants', category: 'general', cp: 2, xp: 0 }, // contrived: even if mis-categorised, picker should not appear
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;

    const html = shRenderGeneralMerits(c, true);
    expect(html).not.toContain('wa-picker-block');
  });
});

describe('N-4a — Trap Door anchor picker renders in shRenderDomainMerits', () => {
  it('renders the Trap Door anchor block when a Sepulcher owner has Trap Door', () => {
    const c = mkChar([
      { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Trap Door', category: 'domain', cp: 1, xp: 0 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);
    expect(html).toContain('td-anchor-block');
  });

  it('does NOT render the Trap Door anchor block in shRenderGeneralMerits', () => {
    const c = mkChar([
      { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
      { name: 'Trap Door', category: 'general', cp: 1, xp: 0 }, // contrived
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;

    const html = shRenderGeneralMerits(c, true);
    expect(html).not.toContain('td-anchor-block');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #782 — shared_with picker suppression (only Safe Place + Haven)
// ─────────────────────────────────────────────────────────────────────────────

describe('#782 — shared_with picker include-list (Safe Place + Haven only)', () => {
  it('Safe Place renders the partner picker (with candidate partner in state.chars)', () => {
    // dom-add-partner-row only emits when avP.length > 0 (i.e. there's at
    // least one other character to share with). Seed a partner.
    const c = mkChar([{ name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' }]);
    const partner = { _id: 'partner', name: 'Partner Char', merits: [{ name: 'Safe Place', category: 'domain', cp: 1, xp: 0 }] };
    stateMod.chars = [c, partner]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    expect(html).toContain('dom-add-partner-row');
  });

  it('Haven renders the partner picker (with candidate partner in state.chars)', () => {
    const c = mkChar([
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    const partner = { _id: 'partner', name: 'Partner Char', merits: [{ name: 'Haven', category: 'domain', cp: 1, xp: 0 }] };
    stateMod.chars = [c, partner]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Expect TWO picker rows: one for Safe Place, one for Haven. The
    // suppression sentinel tests below assert non-shareable merits would
    // give only one (or zero) picker.
    const pickerCount = (html.match(/dom-add-partner-row/g) || []).length;
    expect(pickerCount).toBe(2);
  });

  it('Necropolis Sepulcher does NOT render the partner picker', () => {
    const c = mkChar([{ name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 }]);
    stateMod.chars = [c, { _id: 'other', name: 'Other Char', merits: [{ name: 'Necropolis Sepulcher', category: 'domain', cp: 2, xp: 0 }] }];
    stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Even with a candidate partner in state.chars, Necropolis Sepulcher must
    // NOT surface the add-partner picker — auto-sharing is via
    // _collective_shared_with (ADR-005 D3), not partner_explicit.
    expect(html).not.toContain('dom-add-partner-row');
  });

  it('Necropolis targets (Catacombs/etc) do NOT render the partner picker', () => {
    const targets = ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'];
    for (const name of targets) {
      const c = mkChar([
        { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
        { name, category: 'domain', cp: 0, xp: 0 },
      ]);
      stateMod.chars = [c, { _id: 'other', name: 'Other Char', merits: [{ name, category: 'domain', cp: 1, xp: 0 }] }];
      stateMod.editIdx = 0; stateMod.editMode = true;
      const html = shRenderDomainMerits(c, true);
      expect(html, `${name} should not render partner picker`).not.toContain('dom-add-partner-row');
    }
  });

  it('Mandragora Garden does NOT render the partner picker (reverses #160 per Peter 2026-06-16 decision (a))', () => {
    const c = mkChar([
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Mandragora Garden', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    stateMod.chars = [c, { _id: 'other', name: 'Other Char', merits: [{ name: 'Mandragora Garden', category: 'domain', cp: 1, xp: 0 }] }];
    stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Mandragora row must not surface the picker. Safe Place does — assert
    // overall picker count is one (only Safe Place's), not two.
    const pickerCount = (html.match(/dom-add-partner-row/g) || []).length;
    expect(pickerCount).toBe(1);
  });

  it('Trap Door does NOT render the partner picker', () => {
    const c = mkChar([
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Penthouse' },
      { name: 'Trap Door', category: 'domain', cp: 1, xp: 0 },
    ]);
    stateMod.chars = [c, { _id: 'other', name: 'Other Char', merits: [{ name: 'Trap Door', category: 'domain', cp: 1, xp: 0 }] }];
    stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderDomainMerits(c, true);
    // Safe Place gets one picker; Trap Door must not add a second.
    const pickerCount = (html.match(/dom-add-partner-row/g) || []).length;
    expect(pickerCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('N-4a + #782 — placement sanity guards', () => {
  it('White Ants + Trap Door blocks called inside shRenderDomainMerits', () => {
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(body).toMatch(/_whiteAntsTerritoriesBlock\(m,\s*rIdx\)/);
    expect(body).toMatch(/_trapDoorAnchorBlock\(c,\s*m,\s*rIdx\)/);
  });

  it('White Ants + Trap Door blocks NOT called inside shRenderGeneralMerits', () => {
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderGeneralMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(body).not.toMatch(/_whiteAntsTerritoriesBlock\(/);
    expect(body).not.toMatch(/_trapDoorAnchorBlock\(/);
  });

  it('shared_with gate inverted to positive _canShare include list', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/const _canShare = \['Safe Place', 'Haven'\]/);
    expect(src).toMatch(/const _canShareView = \['Safe Place', 'Haven'\]/);
    // No remaining executable `_noShare` reference (mention in audit comment is fine)
    const codeOnly = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly).not.toMatch(/_noShare\.includes/);
    expect(codeOnly).not.toMatch(/const _noShare =/);
  });
});
