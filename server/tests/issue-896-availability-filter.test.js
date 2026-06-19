/**
 * Issue #896 — equipment availability filter + Fixer errata.
 *
 * Three slices:
 *   1. Pure-helper unit tests for availabilityCap / fixerReduction /
 *      effectiveAvailability / isAffordable. Behaviour contract directly
 *      from the dispatch formula:
 *        effective(item, c) = max(0, item.availability - fixerReduction(c))
 *        affordable(item, c) = effective(item, c) <= availabilityCap(c)
 *   2. Static-analysis on the DT form dropdown — disabled options, tooltip
 *      copy, footnote, option label includes effective availability.
 *   3. Static-analysis on the display sweep + admin editor bypass.
 *
 * Plus a tiny check that the reference JSON Fixer entry now reflects the
 * errata (the small docs nudge per Peter).
 *
 * Behavioural slice imports equipment-derivation.js via dynamic import with
 * a browser-globals stub (the module reaches the cache module → api.js
 * which uses `location`). Same pattern ECM-1 / ECM-5 / ADR-006 use.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// Convenience character builders for the behavioural slice.
function mkChar({ resources = 0, fixer = false } = {}) {
  const merits = [];
  if (resources > 0) merits.push({ name: 'Resources', category: 'general', cp: resources });
  if (fixer)         merits.push({ name: 'Fixer',     category: 'general', cp: 2 });
  return {
    name: 'Fixture', merits,
    attributes: {}, skills: {}, disciplines: {}, equipment: [],
  };
}

function mkItem(availability) {
  return { _id: 'item-' + availability, bucket: 'equipment', name: 'Item ' + availability, availability };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slice 1 — pure helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('#896 — availabilityCap', () => {
  it('returns 0 when the character has no Resources merit', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.availabilityCap(mkChar())).toBe(0);
  });

  it('returns the Resources rating when present', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.availabilityCap(mkChar({ resources: 3 }))).toBe(3);
  });

  it('handles null character defensively', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.availabilityCap(null)).toBe(0);
  });
});

describe('#896 — fixerReduction', () => {
  it('returns 0 when the character has no Fixer merit', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.fixerReduction(mkChar())).toBe(0);
  });

  it('returns 1 when Fixer is present', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.fixerReduction(mkChar({ fixer: true }))).toBe(1);
  });

  it('returns 0 when Fixer entry is present but zeroed (edge case during merit editing)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    const c = mkChar();
    c.merits.push({ name: 'Fixer', category: 'general', cp: 0, xp: 0, free: 0 });
    expect(mod.fixerReduction(c)).toBe(0);
  });
});

describe('#896 — effectiveAvailability', () => {
  it('returns raw item.availability when Fixer is absent', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.effectiveAvailability(mkItem(3), mkChar())).toBe(3);
  });

  it('returns (raw - 1) when Fixer is present', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.effectiveAvailability(mkItem(3), mkChar({ fixer: true }))).toBe(2);
  });

  it('floors at 0 — a level-0 item with Fixer does NOT surface as -1', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.effectiveAvailability(mkItem(0), mkChar({ fixer: true }))).toBe(0);
  });

  it('treats null/undefined/non-integer availability as 0', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.effectiveAvailability({ availability: null }, mkChar())).toBe(0);
    expect(mod.effectiveAvailability({ availability: undefined }, mkChar())).toBe(0);
    expect(mod.effectiveAvailability({ availability: 'bad' }, mkChar())).toBe(0);
    expect(mod.effectiveAvailability(null, mkChar())).toBe(0);
  });
});

describe('#896 — isAffordable', () => {
  it('exactly at cap is affordable (<=, not strict less-than)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    // Resources 2, raw availability 2 → effective = 2, cap = 2 → affordable.
    expect(mod.isAffordable(mkItem(2), mkChar({ resources: 2 }))).toBe(true);
  });

  it('above cap is unaffordable', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    expect(mod.isAffordable(mkItem(3), mkChar({ resources: 2 }))).toBe(false);
  });

  it('Fixer lifts an out-of-reach item into affordability', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    // Resources 2: raw availability 3 → effective = 3, cap = 2 → unaffordable.
    expect(mod.isAffordable(mkItem(3), mkChar({ resources: 2 }))).toBe(false);
    // Resources 2 + Fixer: raw 3 → effective = 2, cap = 2 → affordable.
    expect(mod.isAffordable(mkItem(3), mkChar({ resources: 2, fixer: true }))).toBe(true);
  });

  it('Resources 0 + Fixer still affords availability-1 items (the documented edge case)', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-derivation.js');
    // No Resources, Fixer present: raw 1 → effective = 0, cap = 0 → affordable.
    expect(mod.isAffordable(mkItem(1), mkChar({ fixer: true }))).toBe(true);
    // Same character can't afford raw 2 (effective 1, cap 0 → false).
    expect(mod.isAffordable(mkItem(2), mkChar({ fixer: true }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 2 — DT form dropdown wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('#896 — DT form dropdown wires affordability gate', () => {
  const src = read('public/js/tabs/downtime-form.js');

  it('imports availabilityCap / fixerReduction / effectiveAvailability / isAffordable from the helper module', () => {
    expect(src).toMatch(/import\s+\{\s*availabilityCap,\s*fixerReduction,\s*effectiveAvailability,\s*isAffordable\s*\}\s+from\s+['"]\.\.\/data\/equipment-derivation\.js['"]/);
  });

  it('renders unaffordable options as <option disabled> with the dispatch tooltip copy verbatim', () => {
    // Tooltip wording: 'Above your effective availability (Resources ${cap} + Fixer ${fixer} = max ${rawMax}). Use the item request field below to ask the ST for it.'
    expect(src).toMatch(/Above your effective availability \(Resources \$\{cap\} \+ Fixer \$\{fixer\} = max \$\{rawMax\}\)\. Use the item request field below to ask the ST for it\./);
  });

  it('appends `(avail X)` to each option label using the effective number', () => {
    expect(src).toMatch(/const\s+eff\s*=\s*effectiveAvailability\(it,\s*currentChar\)/);
    expect(src).toMatch(/\(avail \$\{eff\}\)/);
  });

  it('renders the footnote with cap + fixer math', () => {
    expect(src).toMatch(/Showing items you can acquire\. Resources \$\{cap\} \+ Fixer reduction \$\{fixer\} = effective availability cap \$\{rawMax\}\./);
  });

  it('does NOT hide unaffordable items — they remain visible but disabled (per dispatch UX)', () => {
    // The optgroup loop iterates EVERY item, then chooses disabled vs enabled.
    // If items were hidden, the dispatch's "all options visible" guarantee would break.
    const fnStart = src.indexOf('function renderEquipmentRow');
    const fnEnd   = src.indexOf('\n}\n', fnStart);
    const body    = src.slice(fnStart, fnEnd);
    expect(body).not.toMatch(/if\s*\(\s*!aff\s*\)\s*continue/);
  });

  it('exempts the currently-selected option from being disabled (so existing in-flight selections remain visible)', () => {
    // The conditional `(!aff && !sel)` means a currently-selected unaffordable
    // item still renders enabled — silent-leave per the same backcompat
    // discipline as ECM-4's legacy-name fallback.
    expect(src).toMatch(/\(!aff\s*&&\s*!sel\)\s*\?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — display sweep + admin editor bypass
// ─────────────────────────────────────────────────────────────────────────────

describe('#896 — editor/sheet.js held-items display surfaces effective availability', () => {
  const src = read('public/js/editor/sheet.js');

  it('imports effectiveAvailability from the helper module', () => {
    expect(src).toMatch(/import\s+\{[^}]*effectiveAvailability[^}]*\}\s+from\s+['"]\.\.\/data\/equipment-derivation\.js['"]/);
  });

  it('each per-bucket render computes effectiveAvailability(entry, c) and surfaces it in the trait-sub row', () => {
    const matches = src.match(/effectiveAvailability\(entry,\s*c\)/g) || [];
    // One per bucket-render path: weapons, armour, equipment (asset bucket has
    // its own shape and no availability surfacing).
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('label uses the `avail X` substring so display is consistent across surfaces', () => {
    expect(src).toMatch(/`avail \$\{eff\}`/);
  });
});

describe('#896 — editor/edit.js admin add-equipment bypasses gate but shows effective availability', () => {
  const src = read('public/js/editor/edit.js');

  it('imports effectiveAvailability from the helper module', () => {
    expect(src).toMatch(/import\s+\{[^}]*effectiveAvailability[^}]*\}\s+from\s+['"]\.\.\/data\/equipment-derivation\.js['"]/);
  });

  it('shEquipBucketFilter appends `(avail X)` to option labels for the character being edited', () => {
    const fnStart = src.indexOf('export function shEquipBucketFilter');
    const fnEnd   = src.indexOf('\n}\n', fnStart);
    const body    = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/effectiveAvailability\(e,\s*c\)/);
    expect(body).toMatch(/\(avail \$\{eff\}\)/);
  });

  it('does NOT mark any options disabled — ST admin BYPASSES the filter per dispatch', () => {
    const fnStart = src.indexOf('export function shEquipBucketFilter');
    const fnEnd   = src.indexOf('\n}\n', fnStart);
    const body    = src.slice(fnStart, fnEnd);
    // The dispatch said "ST can assign any item". The render emits `<option
    // value="${...}">...</option>` per entry — never with the `disabled`
    // attribute on the body.
    expect(body).not.toMatch(/<option[^>]*disabled[^>]*>\$\{/);
  });
});

describe('#896 — suite/sheet.js inherits the display sweep via shRenderEquipment', () => {
  const src = read('public/js/suite/sheet.js');

  it('delegates equipment rendering to shRenderEquipment from editor/sheet.js (no duplicate render path)', () => {
    expect(src).toMatch(/shRenderEquipment\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 4 — reference JSON nudge
// ─────────────────────────────────────────────────────────────────────────────

describe('#896 — Fixer reference JSON reflects the errata', () => {
  it('TM_rules_merit_2026-04-17.json Fixer description names the availability-cost-by-1 reduction', () => {
    const src = read('data/reference/TM_rules_merit_2026-04-17.json');
    // Find the Fixer entry's description field.
    const fixerIdx = src.indexOf('"key": "fixer"');
    expect(fixerIdx).toBeGreaterThan(-1);
    const block = src.slice(fixerIdx, fixerIdx + 1500);
    expect(block).toMatch(/Reduces the availability cost of all items by 1/);
  });
});
