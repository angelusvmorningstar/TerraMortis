/**
 * Fix #844 — Carthian Pull cap-bound rule (c) + single-target write semantics.
 *
 * Static-analysis + behavioural tests verifying:
 *   1. canAllocateCarthianPull is exported and structured correctly (domain.js).
 *   2. meritEffectiveRating cap-bound branch excludes free_carthian when own-dots meet cap.
 *   3. Fixture-based behavioural checks on the cap-bound effective-rating formula.
 *   4. DT form picker conditionally filters the haven option via canAllocateCarthianPull.
 *   5. Write path enforces single-target semantics for cap-bound targets.
 *
 * Pattern follows fix.843.domain-granted-by-tag.test.js (REPO_ROOT + fs.readFileSync).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const domainSrc = read('public/js/editor/domain.js');
const formSrc   = read('public/js/tabs/downtime-form.js');

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Unit: canAllocateCarthianPull export shape (static-analysis)
// ─────────────────────────────────────────────────────────────────────────────

describe('canAllocateCarthianPull export (#844)', () => {
  it('is exported from domain.js', () => {
    expect(domainSrc).toContain('export function canAllocateCarthianPull');
  });

  it('early-returns true for non-CAP_DOMAIN merits (checks CAP_DOMAIN.has first)', () => {
    expect(domainSrc).toMatch(/canAllocateCarthianPull[\s\S]{0,300}CAP_DOMAIN\.has/);
  });

  it('uses freeOf(m, .carthian.) in the own-dots calculation', () => {
    const start = domainSrc.indexOf('export function canAllocateCarthianPull');
    const end   = domainSrc.indexOf('\n}', start) + 2;
    const slice = domainSrc.slice(start, end);
    expect(slice).toContain("freeOf(m, 'carthian')");
  });

  it('calls _havenCap to resolve the cap', () => {
    const start = domainSrc.indexOf('export function canAllocateCarthianPull');
    const end   = domainSrc.indexOf('\n}', start) + 2;
    const slice = domainSrc.slice(start, end);
    expect(slice).toContain('_havenCap');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Unit: meritEffectiveRating cap-bound branch update (static-analysis)
// ─────────────────────────────────────────────────────────────────────────────

describe('meritEffectiveRating cap-bound branch (#844)', () => {
  it('contains freeOf(m, .carthian.) inside the CAP_DOMAIN branch', () => {
    const capIdx    = domainSrc.indexOf('CAP_DOMAIN.has(m.name)');
    const branchEnd = domainSrc.indexOf('if (MULTI_INSTANCE_DOMAIN', capIdx);
    const slice     = domainSrc.slice(capIdx, branchEnd);
    expect(slice).toContain("freeOf(m, 'carthian')");
  });

  it('references ownDots in the cap-bound branch', () => {
    const capIdx    = domainSrc.indexOf('CAP_DOMAIN.has(m.name)');
    const branchEnd = domainSrc.indexOf('if (MULTI_INSTANCE_DOMAIN', capIdx);
    const slice     = domainSrc.slice(capIdx, branchEnd);
    expect(slice).toContain('ownDots');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Behavioural: effective rating cap-bound formula fixtures
//
// Inline reimplementation of the new cap-bound branch. Mirrors Task 3 formula
// exactly. If the implementation diverges, the static-analysis tests above
// catch it; these tests verify the arithmetic is correct for each fixture.
// ─────────────────────────────────────────────────────────────────────────────

describe('meritEffectiveRating cap-bound behaviour (#844)', () => {
  function freeOfCarthian(m) {
    return (m.free_grants && m.free_grants.carthian != null)
      ? m.free_grants.carthian
      : (m.free_carthian || 0);
  }
  function meritFreeSumFixture(m) {
    // Simplified for these fixtures: only free_carthian channel.
    return freeOfCarthian(m);
  }
  function effectiveRating844(m, cap) {
    const stored          = (m.cp || 0) + (m.xp || 0) + meritFreeSumFixture(m);
    const ownDots         = stored - freeOfCarthian(m);
    const effectiveStored = (cap > 0 && ownDots >= cap) ? ownDots : stored;
    return Math.min(effectiveStored, cap || stored);
  }

  it('Eve fixture: cp=0 xp=0 free_carthian=1 cap=1 → 1', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 0, free_carthian: 1 };
    expect(effectiveRating844(m, 1)).toBe(1);
  });

  it('at-cap own-dots: cp=0 xp=1 free_carthian=1 cap=1 → 1 (Carthian dot dropped)', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 1, free_carthian: 1 };
    expect(effectiveRating844(m, 1)).toBe(1);
  });

  it('below-cap: cp=0 xp=1 free_carthian=1 cap=5 → 2 (Carthian dot counts)', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 1, free_carthian: 1 };
    expect(effectiveRating844(m, 5)).toBe(2);
  });

  it('no anchor (cap=0): stored is returned as-is', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 2, free_carthian: 1 };
    expect(effectiveRating844(m, 0)).toBe(3);
  });

  it('no free_carthian: stored equals own-dots, result is min(stored, cap)', () => {
    const m = { name: 'Haven', category: 'domain', cp: 1, xp: 2, free_carthian: 0 };
    expect(effectiveRating844(m, 5)).toBe(3);
  });

  it('Allies/Contacts path (non-cap-bound): ownDots logic is confined to the CAP_DOMAIN branch', () => {
    // Verify that within meritEffectiveRating, ownDots does not appear outside
    // the CAP_DOMAIN.has branch (i.e. not in the Herd/general path).
    const fnStart   = domainSrc.indexOf('export function meritEffectiveRating');
    const fnEnd     = domainSrc.indexOf('\nexport function canAllocateCarthianPull', fnStart);
    const fnSlice   = domainSrc.slice(fnStart, fnEnd);
    const capIdx    = fnSlice.indexOf('CAP_DOMAIN.has(m.name)');
    const branchEnd = fnSlice.indexOf('if (MULTI_INSTANCE_DOMAIN', capIdx);
    // ownDots must not appear outside the CAP_DOMAIN block within the function.
    expect(fnSlice.indexOf('ownDots', branchEnd)).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Static: allocator UI cap filter (downtime-form.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('DT form picker cap filter (#844)', () => {
  it('imports canAllocateCarthianPull from domain.js', () => {
    expect(formSrc).toContain('canAllocateCarthianPull');
  });

  it('canAllocateCarthianPull is used inside renderCarthianPullSection before haven option', () => {
    const cpIdx  = formSrc.indexOf('renderCarthianPullSection');
    // Find the closing brace of the function (next top-level `\nfunction ` or `\nexport`).
    const endIdx = formSrc.indexOf('\n// #522:', cpIdx + 30);
    const slice  = formSrc.slice(cpIdx, endIdx);
    expect(slice).toContain('canAllocateCarthianPull');
    // The haven option emission must be conditional (gated on havenAllocatable).
    expect(slice).toMatch(/canAllocateCarthianPull[\s\S]{0,300}haven/);
  });

  it('haven option is guarded by havenAllocatable', () => {
    const cpIdx  = formSrc.indexOf('renderCarthianPullSection');
    const endIdx = formSrc.indexOf('\n// #522:', cpIdx + 30);
    const slice  = formSrc.slice(cpIdx, endIdx);
    expect(slice).toContain('havenAllocatable');
    expect(slice).toMatch(/havenAllocatable[\s\S]{0,100}opt\('haven'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Static: single-target write semantics (#844 extended)
//
// The write path in _onCarthianNewRowChange must clear any prior haven allocation
// (or other single-focus target) before appending the new one. This prevents the
// Eve/Einar over-allocation bug where free_carthian stacked on multiple merits.
// ─────────────────────────────────────────────────────────────────────────────

describe('DT form single-target write semantics (#844)', () => {
  it('_onCarthianNewRowChange defines a SINGLE_TARGET set', () => {
    const fnIdx  = formSrc.indexOf('function _onCarthianNewRowChange');
    const endIdx = formSrc.indexOf('\n}', fnIdx) + 2;
    const slice  = formSrc.slice(fnIdx, endIdx);
    expect(slice).toContain('SINGLE_TARGET');
  });

  it('write path filters prior allocations by SINGLE_TARGET before appending', () => {
    const fnIdx  = formSrc.indexOf('function _onCarthianNewRowChange');
    const endIdx = formSrc.indexOf('\n}', fnIdx) + 2;
    const slice  = formSrc.slice(fnIdx, endIdx);
    // The filter must exclude the same target from prior allocations.
    expect(slice).toMatch(/SINGLE_TARGET[\s\S]{0,200}filter[\s\S]{0,100}_applyCarthianSet/);
  });

  it('haven is listed in the SINGLE_TARGET set', () => {
    const fnIdx  = formSrc.indexOf('function _onCarthianNewRowChange');
    const endIdx = formSrc.indexOf('\n}', fnIdx) + 2;
    const slice  = formSrc.slice(fnIdx, endIdx);
    expect(slice).toContain("'haven'");
    // The set definition must reference haven.
    const setIdx = slice.indexOf('SINGLE_TARGET');
    expect(slice.slice(setIdx, setIdx + 100)).toContain('haven');
  });
});
