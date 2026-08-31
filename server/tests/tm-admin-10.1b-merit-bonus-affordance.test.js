/**
 * TM Admin Story tm-admin.10.1b — retire the merit-bonus stepper
 * (shAdjMeritBonus), replace with the audited Add-ST-Mod apply affordance.
 *
 * AC2: applyAffordance/markerFor wired into the real per-instance merit view
 * rows (shRenderMeritRow's Influence/General call sites; extended, per this
 * story's own Dev Agent Record finding, to Domain's and Standing's own
 * inline view rows too, since neither actually routes through
 * shRenderMeritRow despite the story's premise that it did).
 * AC3: shAdjMeritBonus is gone — no onclick anywhere, not exported.
 * AC4: meritBdRow's edit-mode Bonus row is now read-only (no stepper), shown
 * only when nonzero (STM-14's own attribute/skill precedent), and the three
 * hideBonus:true call sites (Necropolis-target domain row, MCI, PT) are
 * untouched — still fully suppressed.
 *
 * Behavioural per feedback_render_wiring_placement — render and assert on
 * the returned HTML shape, same discipline as issue-832-domain-merit-expand
 * and n7b-necro-input-suppression.
 */

// Browser shims — sheet.js transitively pulls api.js's `location` reference.
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

let shRenderInfluenceMerits, shRenderGeneralMerits, shRenderDomainMerits, shRenderStandingMerits;
let stateMod;
let loadRulesMod;
let editMod;

const NECRO_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  category: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 },
};

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderInfluenceMerits, shRenderGeneralMerits, shRenderDomainMerits, shRenderStandingMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
  editMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'edit.js')).href);
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
    rule_grant: [], rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
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

describe('AC3 — shAdjMeritBonus is fully retired', () => {
  it('is not exported from editor/edit.js', () => {
    expect(editMod.shAdjMeritBonus).toBeUndefined();
  });

  it('the function definition, onclick call site, and window exposures are gone (a retirement-note comment mentioning the retired name, matching STM-14 precedent, is fine)', () => {
    expect(read('public/js/editor/edit.js')).not.toMatch(/export function shAdjMeritBonus/);
    expect(read('public/js/editor/xp.js')).not.toMatch(/onclick="shAdjMeritBonus/);
    expect(read('public/js/admin.js')).not.toMatch(/shAdjMeritBonus,/);
    expect(read('public/js/app.js')).not.toMatch(/shAdjMeritBonus,/);
  });
});

describe('AC4 — meritBdRow Bonus row is read-only', () => {
  it('General merits edit mode: nonzero bonus renders as plain text, no stepper', () => {
    const c = mkChar('Priya', [
      { name: 'Iron Stamina', category: 'general', cp: 2, xp: 0, bonus: 3 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderGeneralMerits(c, true);
    expect(html).not.toContain('shAdjMeritBonus');
    expect(html).not.toContain('sh-stat-adj');
    expect(html).toMatch(/<span class="bd-lbl">Bonus<\/span><span class="bd-src">\+3<\/span>/);
  });

  it('General merits edit mode: zero bonus renders no Bonus row at all', () => {
    const c = mkChar('Priya', [
      { name: 'Iron Stamina', category: 'general', cp: 2, xp: 0, bonus: 0 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderGeneralMerits(c, true);
    expect(html).not.toContain('<span class="bd-lbl">Bonus</span>');
  });

  it('hideBonus call sites (MCI/PT standing merits) stay fully suppressed', () => {
    const c = mkChar('Priya', [
      { name: 'Mystery Cult Initiation', category: 'standing', cp: 3, xp: 0, bonus: 5, cult_name: 'The Order' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = true;
    const html = shRenderStandingMerits(c, true);
    expect(html).not.toContain('<span class="bd-lbl">Bonus</span>');
  });
});

describe('AC2 — audited apply-bonus affordance wired for real per-instance merit rows', () => {
  it('Influence view-mode row (non-Contacts) gets the apply button targeting merits.N.bonus', () => {
    const c = mkChar('Priya', [
      { name: 'Allies', category: 'influence', area: 'Police', cp: 2, xp: 0 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderInfluenceMerits(c, false);
    const realIdx = c.merits.indexOf(c.merits[0]);
    expect(html).toContain(`data-stm-apply-path="merits.${realIdx}.bonus"`);
    expect(html).toContain(`data-stm-apply-char-id="${c._id}"`);
  });

  it('General merits view-mode row gets the apply button targeting merits.N.bonus', () => {
    const c = mkChar('Priya', [
      { name: 'Iron Stamina', category: 'general', cp: 2, xp: 0 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderGeneralMerits(c, false);
    expect(html).toContain('data-stm-apply-path="merits.0.bonus"');
  });

  it('Contacts aggregate row (spans multiple merit instances) gets NO apply button', () => {
    const c = mkChar('Priya', [
      { name: 'Contacts', category: 'influence', cp: 2, xp: 0, spheres: ['Police'] },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderInfluenceMerits(c, false);
    expect(html).not.toContain('data-stm-apply-path="merits.');
  });

  it('Domain view-mode row (non-compound-target) gets the apply button', () => {
    const c = mkChar('Priya', [
      { name: 'Herd', category: 'domain', cp: 2, xp: 0 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('data-stm-apply-path="merits.0.bonus"');
  });

  it('Domain view-mode Necropolis-target (compound, pool-funded-only) row gets NO apply button', () => {
    vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
      rule_grant: [NECRO_GRANT], rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
      rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
    });
    const c = mkChar('Priya', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderDomainMerits(c, false);
    expect(html).not.toContain('data-stm-apply-path="merits.1.bonus"');
    vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
      rule_grant: [], rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
      rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
    });
  });

  it('Standing view-mode row (plain, non-MCI/PT) gets the apply button', () => {
    const c = mkChar('Priya', [
      { name: 'Oath of the Scapegoat', category: 'standing', cp: 2, xp: 0 },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderStandingMerits(c, false);
    expect(html).toContain('data-stm-apply-path="merits.0.bonus"');
  });

  it('Standing MCI view-mode row gets NO apply button (m.bonus is a documented no-op, N-9)', () => {
    const c = mkChar('Priya', [
      { name: 'Mystery Cult Initiation', category: 'standing', cp: 3, xp: 0, cult_name: 'The Order' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;
    const html = shRenderStandingMerits(c, false);
    expect(html).not.toContain('data-stm-apply-path="merits.');
  });
});
