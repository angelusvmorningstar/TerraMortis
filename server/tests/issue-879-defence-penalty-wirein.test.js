/**
 * Issue #879 — defence_penalty wire-in (ADR-006).
 *
 * Three slices anchored on the SM brief's verbatim N-1 acceptance gates:
 *
 *   1. **Concern #4 (regression):** STM mod on derived.defence is visibly
 *      reflected in the displayed value, not just the marker. The
 *      pre-ADR-006 bug at sheet.js:441 + ADR-004 D5 — overlay populated
 *      `c._st_mod_overlay['derived.defence']` but the sheet read raw
 *      `calcDefence(c)` so the modded value never reached the DOM.
 *
 *   2. **Concern #8 (editor hint wording):** when >1 armour item is in
 *      state==='worn', editor/sheet.js surfaces the verbatim string
 *      _"Only one armour applies; highest defence_penalty wins."_ Wording
 *      must not drift; static-text assertion guards against rewording.
 *
 *   3. **Concern #9 (single-floor invariant):** the floor at 0 lives in
 *      exactly one place — the helper composition in equipment-derivation.js.
 *      No redundant `Math.max(0, ...)` clamps in the sheet renderer or in
 *      `applyStMods`. STM overlay can legitimately push the rendered value
 *      below 0 per ADR-004's no-bounds contract.
 *
 * Plus pure-helper tests for armourDefencePenalty, wornArmourCount,
 * materialiseDerivedDefence, defenceForDisplay, defenceMechanicalBase —
 * the behaviour contract from ADR-006 D1 / D2 / D2-FLOOR / D3 / D4 / D5.
 *
 * The behavioural slice imports equipment-derivation.js via dynamic import
 * with a browser-globals stub (the module reaches the cache module → api.js
 * which uses `location`). Same pattern ECM-1 / ECM-5 use.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }

// Convenience: deterministic test characters (no rules cache; minimal shape).
function mkChar(overrides = {}) {
  return {
    name: 'Fixture',
    attributes: {
      Dexterity: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 },
      Composure: { dots: 2, bonus: 0 }, Intelligence: { dots: 2, bonus: 0 },
      Resolve: { dots: 2, bonus: 0 },
    },
    skills: { Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false } },
    disciplines: {}, merits: [], equipment: [],
    ...overrides,
  };
}

// Synthetic catalogue lookup — tests inject this rather than reaching the cache.
function mkLookup(items) {
  const byId = new Map(items.map(it => [String(it._id), it]));
  return (id) => byId.get(String(id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis — file existence, exports, no redundant clamps
// ─────────────────────────────────────────────────────────────────────────────

describe('#879 — equipment-derivation.js module shape', () => {
  it('the helper module exists', () => {
    expect(exists('public/js/data/equipment-derivation.js')).toBe(true);
  });

  const src = read('public/js/data/equipment-derivation.js');

  it('exports armourDefencePenalty, materialiseDerivedDefence, defenceForDisplay, defenceMechanicalBase, wornArmourCount (D1 + D2 + D2-FLOOR + D3 + D4 + D5)', () => {
    expect(src).toMatch(/export\s+function\s+armourDefencePenalty\b/);
    expect(src).toMatch(/export\s+function\s+materialiseDerivedDefence\b/);
    expect(src).toMatch(/export\s+function\s+defenceForDisplay\b/);
    expect(src).toMatch(/export\s+function\s+defenceMechanicalBase\b/);
    expect(src).toMatch(/export\s+function\s+wornArmourCount\b/);
  });

  it('helper signature accepts an injectable catalogue lookup (default = ECM-5 cache reader)', () => {
    // armourDefencePenalty(c, catalogueLookup = getCatalogueEntry)
    expect(src).toMatch(/armourDefencePenalty\s*\(\s*c\s*,\s*catalogueLookup\s*=\s*getCatalogueEntry\s*\)/);
  });

  it('filters by state === \'worn\' (positive predicate, not !==)', () => {
    // EQC-2 review patch (#1153): scoped to armourDefencePenalty's OWN
    // function body, not the whole module source. The original whole-file
    // regex assumed no code anywhere in this module would ever check
    // `state === 'stashed'` literally - an assumption EQC-2's new
    // equipmentLocationLabel (a different function, checking a DIFFERENT
    // predicate for a DIFFERENT purpose) correctly breaks. The test's real
    // intent - armourDefencePenalty itself uses a positive `worn` check, not
    // a negative `stashed` exclusion - is preserved by scoping to it.
    const fnStart = src.indexOf('export function armourDefencePenalty');
    const fnEnd = src.indexOf('\nexport function', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);
    expect(fnBody).toMatch(/item\.state\s*!==\s*['"]worn['"]/);
    expect(fnBody).not.toMatch(/item\.state\s*===\s*['"]stashed['"]/);
  });

  it('filters by bucket === \'combat_gear\' AND isCombatGearArmourShaped(entry) (EQC-1 #1152: armour merged into combat_gear, distinguished by populated stat fields; review patch broadened the single-field check to an OR-of-fields shared predicate)', () => {
    expect(src).toMatch(/entry\.bucket\s*!==\s*['"]combat_gear['"]/);
    expect(src).toMatch(/isCombatGearArmourShaped\(entry\)/);
  });

  it('isCombatGearArmourShaped/isCombatGearWeaponShaped are exported and OR across their respective fields, not a single-field check', () => {
    expect(src).toMatch(/export\s+function\s+isCombatGearArmourShaped\b/);
    expect(src).toMatch(/export\s+function\s+isCombatGearWeaponShaped\b/);
    expect(src).toMatch(/armour_value\s*!=\s*null\s*\|\|\s*entry\.defence_penalty\s*!=\s*null/);
    expect(src).toMatch(/weapon_type\s*!=\s*null\s*\|\|\s*entry\.damage_mod\s*!=\s*null\s*\|\|\s*entry\.damage_type\s*!=\s*null/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern #9 (single-floor invariant) — static-analysis
// ─────────────────────────────────────────────────────────────────────────────

describe('#879 — Concern #9 (single-floor invariant)', () => {
  it('the floor lives in equipment-derivation.js (Math.max(0, ...) on calcDefence)', () => {
    const src = read('public/js/data/equipment-derivation.js');
    // Both materialiseDerivedDefence and defenceMechanicalBase contain the clamp.
    const matches = src.match(/Math\.max\(\s*0\s*,\s*calcDefence\(c\)\s*-\s*armourDefencePenalty/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('public/js/data/st-mods.js adds NO defence-specific floor clamp', () => {
    const src = read('public/js/data/st-mods.js');
    // applyStMods's mechanical core only does base + delta; no defence-specific clamp.
    expect(src).not.toMatch(/Math\.max\(\s*0\s*,\s*[^)]*derived\.defence/);
  });

  it('public/js/editor/sheet.js adds NO defence-specific floor clamp at the render site', () => {
    const src = read('public/js/editor/sheet.js');
    // The defDisplay render line should not wrap the value in Math.max(0, ...).
    // It reads defenceForDisplay(c) verbatim.
    expect(src).toMatch(/defenceForDisplay\(c\)\}\$\{markerFor\(c,\s*['"]derived\.defence['"]/);
    expect(src).not.toMatch(/defDisplay\s*=\s*`\$\{Math\.max\(0/);
  });

  it('public/js/suite/sheet.js adds NO defence-specific floor clamp at the render site', () => {
    const src = read('public/js/suite/sheet.js');
    expect(src).toMatch(/defenceForDisplay\(c\)/);
    expect(src).not.toMatch(/\$\{Math\.max\(0,\s*defenceForDisplay/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern #8 (editor hint wording verbatim)
// ─────────────────────────────────────────────────────────────────────────────

describe('#879 — Concern #8 (editor hint wording verbatim)', () => {
  const src = read('public/js/editor/sheet.js');

  it('renders the soft hint exactly as: "Only one armour applies; highest defence_penalty wins."', () => {
    // Verbatim match — drift in the hint wording is a failed AC.
    expect(src).toContain('Only one armour applies; highest defence_penalty wins.');
  });

  it('gates the hint on wornArmourCount(c) > 1 (not on byBucket.armour.length > 1, which would also count carried/stashed)', () => {
    expect(src).toMatch(/wornArmourCount\(c\)\s*>\s*1/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Render-path orchestrator — materialisation runs BEFORE applyStMods
// (Concern #4 / pre-existing ADR-004 D5 display bug fix)
// ─────────────────────────────────────────────────────────────────────────────

describe('#879 — Concern #4 (render-path orchestrator wires materialisation before applyStMods)', () => {
  it('admin.js renderSheetWithOverlay calls materialiseDerivedDefence before applyStMods', () => {
    const src = read('public/js/admin.js');
    const fnStart = src.indexOf('async function renderSheetWithOverlay');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, fnStart + 1800);
    const idxMaterialise = fnBody.indexOf('materialiseDerivedDefence');
    const idxApply       = fnBody.indexOf('applyStMods(');
    expect(idxMaterialise).toBeGreaterThan(-1);
    expect(idxApply).toBeGreaterThan(-1);
    expect(idxMaterialise).toBeLessThan(idxApply);
  });

  it('admin.js boot pre-loops materialiseDerivedDefence BEFORE applyOverlayToAll', () => {
    const src = read('public/js/admin.js');
    // The bulk path: `for (const c of chars) materialiseDerivedDefence(c); await applyOverlayToAll(...)`.
    expect(src).toMatch(/for\s*\(\s*const\s+c\s+of\s+chars\s*\)\s*materialiseDerivedDefence\(c\)/);
  });

  it('app.js (player portal) pre-loops materialiseDerivedDefence BEFORE applyOverlayToAll at boot', () => {
    const src = read('public/js/app.js');
    expect(src).toMatch(/for\s*\(\s*const\s+c\s+of\s+\(suiteState\.chars\s*\|\|\s*\[\]\)\s*\)\s*materialiseDerivedDefence\(c\)/);
  });

  it('admin.js + app.js onStModUpdate paths re-materialise before re-applying', () => {
    const adminSrc = read('public/js/admin.js');
    const appSrc   = read('public/js/app.js');
    // Both should call materialiseDerivedDefence(target) before the
    // applyOverlayToAll([target], ...) call in their onStModUpdate handlers.
    expect(adminSrc).toMatch(/materialiseDerivedDefence\(target\);\s*await\s+applyOverlayToAll\(\[target\]/);
    expect(appSrc).toMatch(/materialiseDerivedDefence\(target\);\s*await\s+applyOverlayToAll\(\[target\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Read-site sweep (sheet, suite/sheet, roll calc, combat-tab, exports)
// ─────────────────────────────────────────────────────────────────────────────

describe('#879 — read-site sweep migrates to defenceForDisplay / defenceMechanicalBase', () => {
  it('editor/sheet.js defDisplay reads defenceForDisplay (overlay-aware)', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/const\s+defDisplay\s*=\s*`\$\{defenceForDisplay\(c\)\}\$\{markerFor\(c,\s*['"]derived\.defence['"]\)/);
  });

  it('editor/sheet.js per-item armour annotation STILL calls raw calcDefence(c) per ADR-006 Concern #2', () => {
    const src = read('public/js/editor/sheet.js');
    // The pre-armour, pre-overlay hypothetical baseline: "if you wore only this item, defence would be X".
    expect(src).toMatch(/const\s+baseDefence\s*=\s*calcDefence\(c\)/);
  });

  it('suite/sheet.js defence cell reads defenceForDisplay', () => {
    const src = read('public/js/suite/sheet.js');
    expect(src).toMatch(/\$\{defenceForDisplay\(c\)\}\$\{markerFor\(c,\s*['"]derived\.defence['"]\)/);
  });

  it('game/char-pools.js (roll calculator) reads defenceForDisplay', () => {
    const src = read('public/js/game/char-pools.js');
    expect(src).toMatch(/const\s+defence\s*=\s*defenceForDisplay\(char\)/);
  });

  it('game/combat-tab.js (combat scene snapshot) reads defenceForDisplay', () => {
    const src = read('public/js/game/combat-tab.js');
    expect(src).toMatch(/defence:\s*defenceForDisplay\(c\)/);
  });

  it('editor/export-character.js JSON export uses defenceMechanicalBase (no overlay)', () => {
    const src = read('public/js/editor/export-character.js');
    expect(src).toMatch(/defence:\s*defenceMechanicalBase\(c\)/);
  });

  it('editor/csv-format.js CSV export uses defenceMechanicalBase (no overlay)', () => {
    const src = read('public/js/editor/csv-format.js');
    expect(src).toMatch(/row\.push\(\s*defenceMechanicalBase\(c\)\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavioural — dynamic import the helper module under the location stub.
// ─────────────────────────────────────────────────────────────────────────────

describe('#879 — armourDefencePenalty behaviour (D1 + D2)', () => {
  it('returns 0 when no worn armour is present', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const c = mkChar({ equipment: [] });
    expect(mod.armourDefencePenalty(c)).toBe(0);
  });

  it('returns 0 for armour items in non-worn states', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [
      { _id: 'aaa1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 2 },
      { _id: 'aaa2', bucket: 'combat_gear', armour_value: 1, defence_penalty: 3 },
    ];
    const c = mkChar({ equipment: [
      { catalogue_id: 'aaa1', state: 'carried' },
      { catalogue_id: 'aaa2', state: 'stashed' },
    ]});
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(0);
  });

  it('D1: filters by bucket === \'combat_gear\' with isCombatGearArmourShaped(entry) — ignores worn non-combat_gear-shaped items', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [
      // A weapon-shaped item with NO armour fields populated at all (the
      // realistic "genuinely not armour" case - a real weapon never carries
      // a defence_penalty). Combining weapon_type AND defence_penalty on one
      // fixture, as an earlier version of this test did, is not a realistic
      // data shape and is no longer how this predicate is proven correct.
      { _id: 'wep1', bucket: 'combat_gear', weapon_type: 'melee', damage_mod: 2, armour_value: null, defence_penalty: null },
      { _id: 'arm1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 2 },
    ];
    const c = mkChar({ equipment: [
      { catalogue_id: 'wep1', state: 'worn' },
      { catalogue_id: 'arm1', state: 'worn' },
    ]});
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(2);
  });

  it('EQC-1 review patch (#1152, Codex external review HIGH finding): a legacy-migrated armour item with armour_value: null but defence_penalty populated still counts (single-field check was wrong)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    // Under the OLD (pre-EQC-1) schema, bucket-specific fields were
    // independently nullable - a real legacy armour item could have set only
    // defence_penalty and left armour_value unset. After migration to
    // combat_gear, this item must STILL be recognised as armour-shaped.
    const items = [{ _id: 'legacy-arm', bucket: 'combat_gear', armour_value: null, defence_penalty: 2 }];
    const c = mkChar({ equipment: [{ catalogue_id: 'legacy-arm', state: 'worn' }] });
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(2);
  });

  it('EQC-1 review patch (#1152): a legacy-migrated weapon with weapon_type: null but damage_mod populated is still weapon-shaped (isCombatGearWeaponShaped)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.isCombatGearWeaponShaped({ bucket: 'combat_gear', weapon_type: null, damage_mod: 2 })).toBe(true);
    expect(mod.isCombatGearWeaponShaped({ bucket: 'combat_gear', weapon_type: null, damage_type: 'lethal' })).toBe(true);
    expect(mod.isCombatGearWeaponShaped({ bucket: 'combat_gear', weapon_type: null, damage_mod: null, damage_type: null })).toBe(false);
    expect(mod.isCombatGearWeaponShaped(null)).toBe(false);
  });

  it('EQC-1 review patch (#1152): isCombatGearArmourShaped mirrors the same OR-of-fields shape', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.isCombatGearArmourShaped({ armour_value: null, defence_penalty: 1 })).toBe(true);
    expect(mod.isCombatGearArmourShaped({ armour_value: 1, defence_penalty: null })).toBe(true);
    expect(mod.isCombatGearArmourShaped({ armour_value: null, defence_penalty: null })).toBe(false);
    expect(mod.isCombatGearArmourShaped(null)).toBe(false);
  });

  it('EQC-1 (#1152): a non-combat_gear bucket is ignored even with armour_value populated', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [
      { _id: 'x1', bucket: 'narrative', armour_value: 3, defence_penalty: 9 },
    ];
    const c = mkChar({ equipment: [{ catalogue_id: 'x1', state: 'worn' }] });
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(0);
  });

  it('D2: returns the MAX defence_penalty across multiple worn armour items (worst-case stacking)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [
      { _id: 'arm1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 1 },
      { _id: 'arm2', bucket: 'combat_gear', armour_value: 1, defence_penalty: 3 },
      { _id: 'arm3', bucket: 'combat_gear', armour_value: 1, defence_penalty: 2 },
    ];
    const c = mkChar({ equipment: [
      { catalogue_id: 'arm1', state: 'worn' },
      { catalogue_id: 'arm2', state: 'worn' },
      { catalogue_id: 'arm3', state: 'worn' },
    ]});
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(3);
  });

  it('treats null/undefined/non-integer defence_penalty as 0', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [
      { _id: 'a1', bucket: 'combat_gear', armour_value: 1, defence_penalty: null },
      { _id: 'a2', bucket: 'combat_gear', armour_value: 1, defence_penalty: undefined },
      { _id: 'a3', bucket: 'combat_gear', armour_value: 1, defence_penalty: 'bad' },
    ];
    const c = mkChar({ equipment: items.map(it => ({ catalogue_id: it._id, state: 'worn' })) });
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(0);
  });

  it('ignores items with no catalogue match (fail-soft per Concern #5)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const c = mkChar({ equipment: [{ catalogue_id: 'ghost', state: 'worn' }] });
    expect(mod.armourDefencePenalty(c, () => undefined)).toBe(0);
  });
});

describe('#879 — wornArmourCount (drives the editor hint)', () => {
  it('counts only worn-state armour items', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [
      { _id: 'a1', bucket: 'combat_gear', armour_value: 1 }, { _id: 'a2', bucket: 'combat_gear', armour_value: 1 },
      { _id: 'a3', bucket: 'combat_gear', armour_value: 1 }, { _id: 'w1', bucket: 'combat_gear', weapon_type: 'melee', armour_value: null },
    ];
    const c = mkChar({ equipment: [
      { catalogue_id: 'a1', state: 'worn' },
      { catalogue_id: 'a2', state: 'worn' },
      { catalogue_id: 'a3', state: 'carried' },
      { catalogue_id: 'w1', state: 'worn' },
    ]});
    expect(mod.wornArmourCount(c, mkLookup(items))).toBe(2);
  });
});

describe('#879 — materialiseDerivedDefence (D3 + D4)', () => {
  it('writes c.derived.defence = max(0, calcDefence - armourDefencePenalty), floors at 0', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const accessors = await import('../../public/js/data/accessors.js');
    // calcDefence on the mkChar fixture: min(Dex=3, Wits=3) + Athletics=2 + discBonus=0 = 5.
    const c = mkChar({ equipment: [{ catalogue_id: 'arm1', state: 'worn' }] });
    const items = [{ _id: 'arm1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 2 }];
    const result = mod.materialiseDerivedDefence(c, mkLookup(items));
    expect(result).toBe(accessors.calcDefence(c) - 2);
    expect(c.derived.defence).toBe(result);
  });

  it('D2-FLOOR: clamps to 0 when armourPenalty exceeds base defence', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    // Tiny char: Dex=1, Wits=1, Athletics=0 → calcDefence = 1.
    const tinyChar = mkChar({
      attributes: { ...mkChar().attributes, Dexterity: { dots: 1, bonus: 0 }, Wits: { dots: 1, bonus: 0 } },
      skills: {},
      equipment: [{ catalogue_id: 'arm1', state: 'worn' }],
    });
    const items = [{ _id: 'arm1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 5 }];
    expect(mod.materialiseDerivedDefence(tinyChar, mkLookup(items))).toBe(0);
  });
});

describe('#879 — defenceForDisplay (read-site helper)', () => {
  it('returns materialised c.derived.defence when present', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const c = mkChar({ derived: { defence: 42 } });
    expect(mod.defenceForDisplay(c)).toBe(42);
  });

  it('Concern #4 verbatim: STM mod on derived.defence is visibly reflected (modded > base)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const accessors = await import('../../public/js/data/accessors.js');
    // Materialise then simulate applyStMods writing the modded value to c.derived.defence.
    const c = mkChar({ equipment: [] });
    mod.materialiseDerivedDefence(c);
    const base = accessors.calcDefence(c);
    expect(c.derived.defence).toBe(base);
    // Simulate STM mod: +3
    c.derived.defence = base + 3;
    expect(mod.defenceForDisplay(c)).toBe(base + 3);
  });

  it('Concern #4 verbatim: STM mod can push displayed defence below 0 per ADR-004 no-bounds (single-floor invariant Concern #9)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    // Pre-condition: c.derived.defence = 1 (post-materialisation, no overlay).
    // STM mod = -5 → c.derived.defence = -4.
    const c = mkChar({ derived: { defence: -4 } });
    // defenceForDisplay reads the materialised value verbatim — no defensive
    // clamp. The renderer displays -4. (Concern #9: floor lives only at
    // materialiseDerivedDefence, NOT here.)
    expect(mod.defenceForDisplay(c)).toBe(-4);
  });
});

describe('#879 — defenceMechanicalBase (export-site helper)', () => {
  it('always computes fresh — ignores c.derived.defence (which may carry overlay)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const accessors = await import('../../public/js/data/accessors.js');
    // Even if c.derived.defence is overlay-modded to some weird value,
    // defenceMechanicalBase returns the canonical mechanical baseline.
    const c = mkChar({
      equipment: [{ catalogue_id: 'arm1', state: 'worn' }],
      derived: { defence: 99 },   // overlay-modded; should be ignored
    });
    const items = [{ _id: 'arm1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 2 }];
    const result = mod.defenceMechanicalBase(c, mkLookup(items));
    expect(result).toBe(Math.max(0, accessors.calcDefence(c) - 2));
    expect(result).not.toBe(99);
  });
});

describe('#1153 EQC-2 — isEquipmentOnMe (on-me vs owned-elsewhere)', () => {
  it('true for carried, worn, active', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.isEquipmentOnMe({ state: 'carried' })).toBe(true);
    expect(mod.isEquipmentOnMe({ state: 'worn' })).toBe(true);
    expect(mod.isEquipmentOnMe({ state: 'active' })).toBe(true);
  });

  it('false for stashed and lost', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.isEquipmentOnMe({ state: 'stashed' })).toBe(false);
    expect(mod.isEquipmentOnMe({ state: 'lost' })).toBe(false);
  });

  it('false for a null/undefined item, never throws', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.isEquipmentOnMe(null)).toBe(false);
    expect(mod.isEquipmentOnMe(undefined)).toBe(false);
  });

  it('AC #4: "on me" (carried) is independent of "bonus currently active" (worn) for armour — a carried-but-unworn item is on you but grants no AR', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const items = [{ _id: 'arm1', bucket: 'combat_gear', armour_value: 1, defence_penalty: 3 }];
    const c = mkChar({ equipment: [{ catalogue_id: 'arm1', state: 'carried' }] });
    // On you (carried counts for isEquipmentOnMe)...
    expect(mod.isEquipmentOnMe(c.equipment[0])).toBe(true);
    // ...but armourDefencePenalty's own worn-only gating is completely
    // unaffected by this story — a carried-not-worn breastplate grants 0 AR.
    expect(mod.armourDefencePenalty(c, mkLookup(items))).toBe(0);
  });
});

describe('#1153 EQC-2 review patch — equipmentLocationLabel (Codex external review Low finding)', () => {
  it("returns 'On you' for carried/worn/active", async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentLocationLabel({ state: 'carried' })).toBe('On you');
    expect(mod.equipmentLocationLabel({ state: 'worn' })).toBe('On you');
    expect(mod.equipmentLocationLabel({ state: 'active' })).toBe('On you');
  });

  it("returns 'Stored elsewhere' for the ONE known elsewhere state, stashed", async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentLocationLabel({ state: 'stashed' })).toBe('Stored elsewhere');
  });

  it('returns null (no label) for lost — the item is gone, not "elsewhere"', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentLocationLabel({ state: 'lost' })).toBeNull();
  });

  it('returns null (fails safe, no unsupported claim) for a missing or unrecognised state — the exact bug the review found', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentLocationLabel({ state: 'teleported' })).toBeNull();
    expect(mod.equipmentLocationLabel({})).toBeNull();
    expect(mod.equipmentLocationLabel(null)).toBeNull();
  });
});

describe('#1154 EQC-3 — equipmentContainerLabel', () => {
  it('returns null for an item with no container_id', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentContainerLabel({ container_id: null }, [])).toBeNull();
    expect(mod.equipmentContainerLabel({}, [])).toBeNull();
    expect(mod.equipmentContainerLabel(null, [])).toBeNull();
  });

  it('resolves "in: <name>" when the character still owns the referenced container', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const haven = { _id: 'haven1', bucket: 'container', name: 'Test Haven' };
    const item = { catalogue_id: 'knife1', container_id: 'haven1' };
    const allEquipment = [item, { catalogue_id: 'haven1', state: 'active' }];
    const lookup = id => (id === 'haven1' ? haven : undefined);
    expect(mod.equipmentContainerLabel(item, allEquipment, lookup)).toBe('(in: Test Haven)');
  });

  it('AC #4: returns null (renders as loose) when the referenced container is no longer owned — a dangling container_id after the container row was removed', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const haven = { _id: 'haven1', bucket: 'container', name: 'Test Haven' };
    const item = { catalogue_id: 'knife1', container_id: 'haven1' };
    // The character's equipment array no longer contains a haven1 row (it
    // was removed) — only the contained item itself remains.
    const allEquipment = [item];
    const lookup = id => (id === 'haven1' ? haven : undefined);
    expect(mod.equipmentContainerLabel(item, allEquipment, lookup)).toBeNull();
  });

  it('returns null when the container_id is genuinely unresolvable in the catalogue too (belt-and-braces)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const item = { catalogue_id: 'knife1', container_id: 'ghost1' };
    const allEquipment = [item, { catalogue_id: 'ghost1', state: 'active' }];
    const lookup = () => undefined;
    expect(mod.equipmentContainerLabel(item, allEquipment, lookup)).toBeNull();
  });

  it('does not match against itself — an item is never its own container', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const item = { catalogue_id: 'x1', container_id: 'x1' };
    const lookup = () => ({ name: 'Should not resolve' });
    expect(mod.equipmentContainerLabel(item, [item], lookup)).toBeNull();
  });

  it('returns the parenthesised "(in: X)" form per AC #4\'s literal text', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const haven = { name: 'Test Haven' };
    const item = { catalogue_id: 'knife1', container_id: 'haven1' };
    const allEquipment = [item, { catalogue_id: 'haven1' }];
    expect(mod.equipmentContainerLabel(item, allEquipment, () => haven)).toBe('(in: Test Haven)');
  });
});

describe('#1154 EQC-3 review patch — containedLabel wired into the Containers section too', () => {
  it('editor/sheet.js\'s Containers render block calls containedLabel(item) — a container-bucket item can itself be contained (Codex external review Medium finding: this was the only one of seven sections missing it)', () => {
    const src = read('public/js/editor/sheet.js');
    const sectionStart = src.indexOf('Containers (old "Assets" bucket');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = src.indexOf('Edit-mode add form', sectionStart);
    const sectionBody = src.slice(sectionStart, sectionEnd > -1 ? sectionEnd : sectionStart + 2000);
    expect(sectionBody).toMatch(/containedLabel\(item\)/);
  });
});

describe('#1155 EQC-4 — equipmentTweakableField', () => {
  it('returns null for a falsy entry', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField(null)).toBeNull();
    expect(mod.equipmentTweakableField(undefined)).toBeNull();
  });

  it('returns "damage_mod" for a weapon-shaped combat_gear entry', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'combat_gear', weapon_type: 'melee', damage_mod: 1 })).toBe('damage_mod');
    // Legacy-shaped: only damage_mod populated, same OR-of-fields discriminator EQC-1 established.
    expect(mod.equipmentTweakableField({ bucket: 'combat_gear', damage_mod: 1 })).toBe('damage_mod');
  });

  it('returns "armour_value" for an armour-shaped combat_gear entry', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'combat_gear', armour_value: 2 })).toBe('armour_value');
    expect(mod.equipmentTweakableField({ bucket: 'combat_gear', defence_penalty: 1 })).toBe('armour_value');
  });

  it('returns null for a combat_gear entry that is neither weapon- nor armour-shaped', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'combat_gear' })).toBeNull();
  });

  it('returns "bonus_dice" for a skill_gear entry with bonus_dice populated', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'skill_gear', bonus_dice: 1 })).toBe('bonus_dice');
  });

  it('review patch (#1155): returns null for a skill_gear entry with NO bonus_dice — mirrors the combat_gear branch\'s populated-field guard, matches this function\'s own docstring ("no tweakable numeric bonus at all")', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'skill_gear' })).toBeNull();
    expect(mod.equipmentTweakableField({ bucket: 'skill_gear', skill_domain: 'Athletics' })).toBeNull();
  });

  it('review patch (#1155): a dual-shaped combat_gear entry (both weapon AND armour fields populated — reachable via the catalogue-admin form, which exposes both field sets on one combat_gear item) deterministically prefers the weapon tweak, documented as a deliberate tie-break', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'combat_gear', damage_mod: 1, armour_value: 2 })).toBe('damage_mod');
  });

  it('returns null for tool_utility, narrative, and container entries — no primary numeric bonus field to tweak', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.equipmentTweakableField({ bucket: 'tool_utility' })).toBeNull();
    expect(mod.equipmentTweakableField({ bucket: 'narrative' })).toBeNull();
    expect(mod.equipmentTweakableField({ bucket: 'container' })).toBeNull();
  });
});

describe('#1155 EQC-4 — tweakedAvailability', () => {
  it('returns null when the entry is not tweakable', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.tweakedAvailability({ bucket: 'tool_utility', availability: 2 })).toBeNull();
    expect(mod.tweakedAvailability(null)).toBeNull();
  });

  it('returns base availability + 1 (one dot of availability per shift, epic #1038 item 5) when tweakable', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.tweakedAvailability({ bucket: 'combat_gear', weapon_type: 'melee', availability: 2 })).toBe(3);
    expect(mod.tweakedAvailability({ bucket: 'skill_gear', bonus_dice: 1, availability: 0 })).toBe(1);
  });

  it('treats a missing/non-integer availability as 0 before adding the shift', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.tweakedAvailability({ bucket: 'skill_gear', bonus_dice: 1 })).toBe(1);
  });
});
