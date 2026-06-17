/**
 * Issue #790 + #774 — meritFreeSum categorical exclusion + stepper a11y.
 *
 * #790 (URGENT): meritFreeSum now categorically returns ONLY
 * m.free_grants.necro for Necropolis target merit names. Pre-fix any stray
 * write to m.free or any legacy m.free_<slug> on a target row would silently
 * double-count on top of the pool allocation. Yusuf hit this 2026-06-16
 * (4 merits with m.free=1 contamination, origin untraceable in current main).
 *
 * #774: 5 sibling steppers (MCI/VM/LK/OHM/INV) get id + name + aria-label
 * matching the NECRO precedent from N-7c #771.
 *
 * Behavioural-first per the feedback_render_wiring_placement chain:
 * - #790 calls real meritFreeSum + meritEffectiveRating + syncMeritRating
 *   on constructed characters with multi-channel contamination; assertions
 *   compare the returned numbers, not the source.
 * - #774 calls real meritBdRow with each opts.show* and asserts the
 *   rendered HTML carries the a11y attributes.
 */

// Browser shims — domain.js transitively imports api.js's `location` reference.
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

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

let meritFreeSum, meritEffectiveRating, syncMeritRating, meritBdRow;

beforeAll(async () => {
  const domainUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'domain.js')).href;
  ({ meritFreeSum, meritEffectiveRating, syncMeritRating } = await import(domainUrl));
  const xpUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'xp.js')).href;
  ({ meritBdRow } = await import(xpUrl));
});

// ─────────────────────────────────────────────────────────────────────────────
// #790 — meritFreeSum returns only m.free_grants.necro on Necropolis targets
// ─────────────────────────────────────────────────────────────────────────────

describe('#790 — meritFreeSum categorical exclusion on Necropolis targets', () => {
  const NECRO_TARGETS = ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'];

  it.each(NECRO_TARGETS)('%s: meritFreeSum returns ONLY free_grants.necro despite contamination on other channels', (name) => {
    const m = {
      name,
      category: 'domain',
      cp: 0,
      xp: 0,
      free: 5,              // legacy contamination (Yusuf's exact symptom)
      free_mci: 3,          // any other channel write
      free_vm: 2,           // any other channel write
      free_lk: 4,           // any other channel write
      free_grants: { necro: 2, mci: 7 }, // necro is the only one that counts; map.mci is ignored too
    };
    // Pre-#790: 5 (m.free) + 3 (free_mci) + 2 (free_vm) + 4 (free_lk) + 2 (map.necro) + 7 (map.mci) = 23
    // Post-#790: 2 (map.necro only)
    expect(meritFreeSum(m)).toBe(2);
  });

  it('returns 0 when free_grants.necro is unset and other channels are contaminated', () => {
    const m = {
      name: 'Catacombs',
      category: 'domain',
      cp: 0, xp: 0,
      free: 1,
      free_mci: 2,
      free_grants: {},
    };
    expect(meritFreeSum(m)).toBe(0);
  });

  it('non-Necropolis domain merit: meritFreeSum sums non-deprecated channels normally (regression sentinel)', () => {
    // Post-#834: m.free is deprecated and NOT included in meritFreeSum.
    // Pre-#834 this expected 11 (including m.free=5); post-#834 it's 6.
    const m = {
      name: 'Safe Place',
      category: 'domain',
      cp: 0, xp: 0,
      free: 5,           // deprecated — ignored
      free_mci: 3,
      free_vm: 2,
      free_grants: { lk: 1 },
    };
    // 3 (free_mci) + 2 (free_vm) + 1 (map.lk) = 6   (m.free=5 ignored per #834)
    expect(meritFreeSum(m)).toBe(6);
  });

  it('Necropolis Sepulcher (the SOURCE merit, not a target): sums normally — m.free deprecated', () => {
    // Post-#834: m.free=1 contamination is ignored; with no other channels
    // the sum is 0 (was 1 pre-#834).
    const m = {
      name: 'Necropolis Sepulcher',
      category: 'domain',
      cp: 3, xp: 0,
      free: 1, // deprecated channel — ignored by meritFreeSum
      free_grants: {},
    };
    // Sepulcher is the source, not a target — Necro gate doesn't apply.
    // Post-#834 sum = 0 (m.free=1 dropped).
    expect(meritFreeSum(m)).toBe(0);
  });

  it('Trap Door (per-character bridge, NOT a Necropolis target): sums non-deprecated channels normally', () => {
    const m = {
      name: 'Trap Door',
      category: 'domain',
      cp: 1, xp: 0,
      free: 2,            // deprecated — ignored
      free_grants: { mci: 1 },
    };
    // Post-#834: 1 (map.mci) — m.free=2 ignored.
    expect(meritFreeSum(m)).toBe(1);
  });

  it('syncMeritRating inherits the Necropolis exclusion (consumes meritFreeSum)', () => {
    const m = {
      name: 'Catacombs',
      category: 'domain',
      cp: 0, xp: 0,
      free: 5, // contamination
      free_grants: { necro: 2 },
    };
    // Pre-#790: 0 + 0 + 5 + ... = inflated
    // Post-#790: cp(0) + xp(0) + meritFreeSum(m)=2  →  2
    expect(syncMeritRating(m)).toBe(2);
  });

  it('meritEffectiveRating inherits the Necropolis exclusion (refactored to use meritFreeSum)', () => {
    const c = {
      _id: 'n7d-test',
      merits: [{
        name: 'Catacombs',
        category: 'domain',
        cp: 0, xp: 0,
        free: 5, // contamination
        free_grants: { necro: 2 },
      }],
    };
    // Pre-#790: line 299 inline sum would include m.free + every flat channel
    // Post-#790: routes through meritFreeSum → exclusion applies
    expect(meritEffectiveRating(c, c.merits[0])).toBe(2);
  });

  it('class-of-bug regression sentinel: Yusuf-shape (free=1, no other channels)', () => {
    // The exact contamination shape Peter hit on 2026-06-16.
    for (const name of NECRO_TARGETS) {
      const m = { name, category: 'domain', cp: 0, xp: 0, free: 1, free_grants: { necro: 1 } };
      // Pre-#790: 1 (m.free) + 1 (map.necro) = 2 → +1 dot too high
      // Post-#790: 1 (map.necro only)
      expect(meritFreeSum(m), `${name}: m.free=1 contamination must not double-count`).toBe(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #774 — sibling steppers carry id + name + aria-label
// ─────────────────────────────────────────────────────────────────────────────

describe('#774 — sibling stepper a11y (id + name + aria-label)', () => {
  // Construct a merit instance that surfaces every stepper when opts are set.
  // realIdx is arbitrary (used in the id/name suffix).
  const fixture = (overrides = {}) => ({
    name: 'Mentor', category: 'general', cp: 0, xp: 0, free_grants: {},
    ...overrides,
  });

  it('MCI stepper carries id, name, and aria-label', () => {
    const html = meritBdRow(7, fixture(), null, { showMCI: true });
    expect(html).toContain('id="bd-mci-7"');
    expect(html).toContain('name="bd-mci-7"');
    expect(html).toContain('aria-label="Mystery Cult Initiation pool allocation"');
  });

  it('VM stepper carries id, name, and aria-label', () => {
    const html = meritBdRow(3, fixture(), null, { showVM: true });
    expect(html).toContain('id="bd-vm-3"');
    expect(html).toContain('name="bd-vm-3"');
    expect(html).toContain('aria-label="Viral Mythology pool allocation"');
  });

  it('LK stepper carries id, name, and aria-label', () => {
    const html = meritBdRow(5, fixture(), null, { showLK: true });
    expect(html).toContain('id="bd-lk-5"');
    expect(html).toContain('name="bd-lk-5"');
    expect(html).toContain('aria-label="Lorekeeper pool allocation"');
  });

  it('OHM stepper carries id, name, and aria-label', () => {
    const html = meritBdRow(2, fixture(), null, { showOHM: true });
    expect(html).toContain('id="bd-ohm-2"');
    expect(html).toContain('name="bd-ohm-2"');
    expect(html).toContain('aria-label="Oath of the Hard Motherfucker pool allocation"');
  });

  it('INV stepper carries id, name, and aria-label', () => {
    const html = meritBdRow(9, fixture(), null, { showINV: true });
    expect(html).toContain('id="bd-inv-9"');
    expect(html).toContain('name="bd-inv-9"');
    expect(html).toContain('aria-label="Invested pool allocation"');
  });

  it('NECRO stepper a11y preserved from N-7c', () => {
    // Regression sentinel — N-7c's a11y wiring must remain intact across the
    // #774 sibling pass.
    const html = meritBdRow(1, fixture({ free_grants: {} }), null, { showNECRO: true });
    expect(html).toContain('id="bd-necro-1"');
    expect(html).toContain('aria-label="Necropolis pool allocation"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('#790 + #774 — placement sanity guards', () => {
  it('NECRO_TARGETS_FOR_SUM gate present in domain.js meritFreeSum', () => {
    const src = read('public/js/editor/domain.js');
    expect(src).toMatch(/NECRO_TARGETS_FOR_SUM = new Set\(/);
    expect(src).toMatch(/NECRO_TARGETS_FOR_SUM\.has\(m\.name\)/);
    expect(src).toMatch(/m\.free_grants && m\.free_grants\.necro/);
  });

  it('meritEffectiveRating routes through meritFreeSum (inherits exclusion)', () => {
    const src = read('public/js/editor/domain.js');
    const fnStart = src.indexOf('export function meritEffectiveRating');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    // Must call meritFreeSum directly (not the helper) so the gate applies.
    expect(body).toMatch(/\+\s*meritFreeSum\(m\)/);
    // Sanity: the pre-#790 inline pattern is gone from this function.
    expect(body).not.toMatch(/\(m\.free \|\| 0\)\s*\+\s*_meritFreeSumHelper\(m\)/);
  });

  it('all 5 sibling stepper labels carry their aria-label', () => {
    const src = read('public/js/editor/xp.js');
    expect(src).toContain('aria-label="Mystery Cult Initiation pool allocation"');
    expect(src).toContain('aria-label="Viral Mythology pool allocation"');
    expect(src).toContain('aria-label="Lorekeeper pool allocation"');
    expect(src).toContain('aria-label="Oath of the Hard Motherfucker pool allocation"');
    expect(src).toContain('aria-label="Invested pool allocation"');
    expect(src).toContain('aria-label="Necropolis pool allocation"');
  });
});
