/**
 * 2026-09-01 general audit (display-rendering dimension, verified) — merit
 * dot-runs baked an active st_mod on merits.N.bonus directly into the
 * hollow-dot COUNT with no per-dot distinction, the same "invisible mod"
 * shape issue #408 fixed for attributes/skills/disciplines. Merits render
 * literal Unicode glyph characters as text (`_shDotGlyphs`/`shDotsMixed` in
 * editor/sheet.js), not the empty `.pointed` spans attributes/skills use, so
 * this needed a parallel mechanism (`.merit-modded-dot`, recolours the glyph
 * text colour) rather than reusing `.stm-modded-dot` (background-based,
 * inert behind a text glyph).
 *
 * This suite renders real view-mode General and Domain merit sections
 * against a minimal fixture carrying an active `_st_mod_overlay` entry on
 * `merits.<idx>.bonus`, and asserts the resulting HTML marks the correct
 * sub-range of dots with `merit-modded-dot` + the audit-popover's
 * `data-stm-marker-path` attribute — the same click-to-audit mechanism
 * attributes/skills/disciplines already use.
 */

// Browser shims — sheet.js transitively pulls api.js's `location` reference.
// Same pattern as issue-1128-dot-wrapper.test.js / oath-b-suspension.test.js.
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
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let shRenderGeneralMerits, shRenderDomainMerits;
let stateMod, loadRulesMod;

function ruleCache() {
  return {
    rule_grant: [], rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  };
}

beforeAll(async () => {
  const u = (...p) => pathToFileURL(path.resolve(REPO_ROOT, ...p)).href;
  ({ shRenderGeneralMerits, shRenderDomainMerits } = await import(u('public', 'js', 'editor', 'sheet.js')));
  stateMod = (await import(u('public', 'js', 'data', 'state.js'))).default;
  loadRulesMod = await import(u('public', 'js', 'editor', 'rule_engine', 'load-rules.js'));
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue(ruleCache());
});

function mkChar(merits, overlay) {
  const c = {
    _id: 'c-stm-merit', name: 'Overlaid Oswald', clan: 'Ventrue', covenant: 'Invictus',
    blood_potency: 1, status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [], merits,
  };
  if (overlay) c._st_mod_overlay = overlay;
  return c;
}

function renderView(c, fn) {
  stateMod.chars = [c];
  stateMod.editIdx = 0;
  stateMod.editMode = false;
  return fn(c, false);
}

describe('#audit-2026-09-01 — General merit view row recolours an st-modded bonus dot', () => {
  it('m.bonus fully from an active st_mod: one merit-modded-dot, tagged with the right path', () => {
    const merits = [{ category: 'general', name: 'Iron Stamina', rating: 0, cp: 0, xp: 0, bonus: 1 }];
    const overlay = { 'merits.0.bonus': { base: 0, delta: 1, final: 1 } };
    const c = mkChar(merits, overlay);
    const html = renderView(c, shRenderGeneralMerits);
    expect(html).toContain('class="merit-modded-dot"');
    expect(html).toContain('data-stm-marker-path="merits.0.bonus"');
    // Exactly one glyph marked — the single overlay-granted bonus dot.
    const markedCount = (html.match(/class="merit-modded-dot"/g) || []).length;
    expect(markedCount).toBe(1);
    // Dedup: the old standalone markerFor() pip must NOT also render once
    // the dot itself carries the marker — signalling the same mod twice.
    expect(html).not.toContain('class="stm-marker"');
  });

  it('no overlay: no merit-modded-dot anywhere in the render (no regression)', () => {
    const merits = [{ category: 'general', name: 'Iron Stamina', rating: 0, cp: 0, xp: 0, bonus: 0 }];
    const c = mkChar(merits, null);
    const html = renderView(c, shRenderGeneralMerits);
    expect(html).not.toContain('merit-modded-dot');
  });

  it('bonus partly from a pre-existing free grant, partly from the mod: only the modded sub-range is marked', () => {
    // meritFreeSum contributes 1 (free_mci), the mod contributes the second point —
    // so the marked dot must be the SECOND hollow dot, not the first.
    const merits = [{
      category: 'general', name: 'Indomitable', rating: 0, cp: 0, xp: 0,
      free_mci: 1, bonus: 1,
    }];
    const overlay = { 'merits.0.bonus': { base: 0, delta: 1, final: 1 } };
    const c = mkChar(merits, overlay);
    const html = renderView(c, shRenderGeneralMerits);
    expect(html).toContain('class="merit-modded-dot"');
    const markedCount = (html.match(/class="merit-modded-dot"/g) || []).length;
    expect(markedCount).toBe(1);
    // The unmarked hollow dot (free_mci's own point) must still render plain.
    const plainHollow = (html.match(/(?<!class="merit-modded-dot">)○/g) || []).length;
    expect(plainHollow).toBeGreaterThanOrEqual(1);
  });
});

describe('#audit-2026-09-01 — Domain merit view row recolours an st-modded bonus dot', () => {
  // NOT Haven/Mandragora Garden — those two are `_isCappedView` merits that
  // take a different, separately-scoped render branch (see the file-level
  // note on that branch for why it's deliberately out of scope here).
  it('m.bonus fully from an active st_mod: marked with the right path', () => {
    const merits = [{
      category: 'domain', name: 'Feeding Grounds', rating: 0, cp: 0, xp: 0, bonus: 1,
    }];
    const overlay = { 'merits.0.bonus': { base: 0, delta: 1, final: 1 } };
    const c = mkChar(merits, overlay);
    const html = renderView(c, shRenderDomainMerits);
    expect(html).toContain('class="merit-modded-dot"');
    expect(html).toContain('data-stm-marker-path="merits.0.bonus"');
    // Dedup: no redundant standalone markerFor() pip once the dot itself
    // carries the marker. applyAffordance's own "+" button is unaffected —
    // it's a different control (apply a NEW mod), not a marker.
    expect(html).not.toContain('class="stm-marker"');
    expect(html).toContain('class="stm-mod-btn stm-apply-btn"');
  });

  it('no overlay: no merit-modded-dot in the Domain render', () => {
    const merits = [{ category: 'domain', name: 'Feeding Grounds', rating: 0, cp: 0, xp: 0, bonus: 0 }];
    const c = mkChar(merits, null);
    const html = renderView(c, shRenderDomainMerits);
    expect(html).not.toContain('merit-modded-dot');
  });
});
