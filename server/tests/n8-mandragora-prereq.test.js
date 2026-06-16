/**
 * N-8 (issue #761) — Mandragora Garden prereq amendment + Necropolis attached_to
 * option.
 *
 * The prereq DSL is the load-bearing surface — verified directly against
 * `meetsPrereq` (`public/js/data/prereq.js`) without spinning up the route or
 * the editor. The seeder script's idempotency and the picker-filter behaviour
 * are covered by adjacent static-analysis cases (mirroring the precedent set
 * by equipment-client-fixes from PR #758).
 */

// Browser shims (must run before the prereq import — prereq.js transitively
// pulls in api.js which references `location` at module top).
// Pattern mirrored from compile-push-outcome-joint.test.js: shim at file-top,
// dynamic-import the browser-only module inside beforeAll so the shim is in
// scope when the import chain evaluates. Static `import` statements would
// hoist past the shim and fail at module-link time.
globalThis.location = {
  origin: 'http://localhost:8080',
  hostname: 'localhost',
  href: 'http://localhost:8080/admin',
};

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MANDRAGORA_PREREQ } from '../scripts/update-mandragora-prereq.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// Dynamically imported in beforeAll so the browser shim is in place when
// prereq.js → accessors.js → api.js evaluates.
let meetsPrereq;
beforeAll(async () => {
  const url = pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'data', 'prereq.js')).href;
  ({ meetsPrereq } = await import(url));
});

// ─────────────────────────────────────────────────────────────────────────────
// Prereq DSL — meetsPrereq against the new block
// ─────────────────────────────────────────────────────────────────────────────

describe('N-8 — Mandragora Garden prereq', () => {
  // `domTotal` is the callback that resolves a shared-domain merit's total
  // across a character (mirrors what the editor passes). For the prereq tests
  // we just need it to return cp+xp on the named merit when the leaf names a
  // domain-class merit; the "same level" semantic in meetsPrereq pivots on
  // the dots floor against rating, not on the domTotal callback for non-
  // domain merits. Returning 0 is a safe identity for these tests since we
  // verify against `m.rating` directly via meetsPrereq's merit-leaf path.
  const opts = { domTotal: () => 0 };

  // Helpers to build a minimal character shape. meetsPrereq reads only
  // .merits[], .disciplines, .clan, .status, .humanity for these branches.
  const mkChar = (overrides = {}) => ({
    clan: 'Mekhet',
    merits: [],
    disciplines: {},
    status: { city: 0, clan: 0, covenant: {} },
    humanity: 7,
    ...overrides,
  });

  it('passes for Safe Place + Crúac (existing path — regression)', () => {
    const c = mkChar({
      merits: [{ name: 'Safe Place', rating: 2, cp: 2, xp: 0, qualifier: 'Penthouse', category: 'domain' }],
      disciplines: { 'Crúac': { dots: 1 } },
    });
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(true);
  });

  it('passes for Necropolis Sepulcher + Crúac (new Sepulcher branch)', () => {
    const c = mkChar({
      clan: 'Nosferatu',
      merits: [{ name: 'Necropolis Sepulcher', rating: 2, cp: 2, xp: 0 }],
      disciplines: { 'Crúac': { dots: 1 } },
    });
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(true);
  });

  it('passes for Safe Place + Fucking Thief (permissive FT, Khepri decision D)', () => {
    const c = mkChar({
      merits: [
        { name: 'Safe Place', rating: 1, cp: 1, xp: 0, qualifier: 'Brothels', category: 'domain' },
        { name: 'Fucking Thief', rating: 3, cp: 3, xp: 0 },
      ],
    });
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(true);
  });

  it('passes for Necropolis Sepulcher + Fucking Thief (both new branches at once)', () => {
    const c = mkChar({
      clan: 'Nosferatu',
      merits: [
        { name: 'Necropolis Sepulcher', rating: 1, cp: 1, xp: 0 },
        { name: 'Fucking Thief', rating: 2, cp: 2, xp: 0 },
      ],
    });
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(true);
  });

  it('fails when first AND-branch is missing (no Safe Place, no Sepulcher)', () => {
    const c = mkChar({
      disciplines: { 'Crúac': { dots: 2 } },
    });
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(false);
  });

  it('fails when second AND-branch is missing (no Crúac, no Fucking Thief)', () => {
    const c = mkChar({
      merits: [{ name: 'Safe Place', rating: 2, cp: 2, xp: 0, qualifier: 'X', category: 'domain' }],
    });
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(false);
  });

  it('fails with neither AND-branch satisfied', () => {
    const c = mkChar();
    expect(meetsPrereq(c, MANDRAGORA_PREREQ, opts)).toBe(false);
  });

  it('"same level" sentinel matches at the merit\'s rating floor (Sepulcher branch)', () => {
    // The "same level" sentinel in meetsPrereq compares the prereq merit's
    // rating against the dots floor (1 in this prereq block). A rating-0
    // Sepulcher should NOT satisfy; rating-1+ should.
    const c0 = mkChar({
      clan: 'Nosferatu',
      merits: [{ name: 'Necropolis Sepulcher', rating: 0, cp: 0, xp: 0 }],
      disciplines: { 'Crúac': { dots: 1 } },
    });
    expect(meetsPrereq(c0, MANDRAGORA_PREREQ, opts)).toBe(false);

    const c1 = mkChar({
      clan: 'Nosferatu',
      merits: [{ name: 'Necropolis Sepulcher', rating: 1, cp: 1, xp: 0 }],
      disciplines: { 'Crúac': { dots: 1 } },
    });
    expect(meetsPrereq(c1, MANDRAGORA_PREREQ, opts)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Picker filter — Mandragora gains Sepulcher as a destination option
// (Static analysis; the actual picker is a sheet.js inline-onchange surface
// that's expensive to import in isolation.)
// ─────────────────────────────────────────────────────────────────────────────

describe('N-8 — sheet.js Mandragora picker filter', () => {
  it('Mandragora adds Necropolis Sepulcher to the attached_to option set', () => {
    const src = read('public/js/editor/sheet.js');
    // The expanded filter must include a Sepulcher branch gated on the
    // Mandragora-only flag. Catches future "simplifications" that revert
    // the filter to Safe-Place-only.
    expect(src).toMatch(/_isMandragora.*=.*m\.name === 'Mandragora Garden'/);
    expect(src).toMatch(/sp\.name === 'Necropolis Sepulcher'/);
    expect(src).toMatch(/_isMandragora && sp\.name === 'Necropolis Sepulcher'/);
  });

  it('Haven path is NOT broadened — sticks to Safe Place only', () => {
    // Sanity guard: the filter expansion is gated on _isMandragora, so a
    // non-Mandragora capped merit (Haven) only sees Safe Place options.
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/sp\.category === 'domain' && sp\.name === 'Safe Place'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _havenCap — looks up Sepulcher when Mandragora is anchored to one
// ─────────────────────────────────────────────────────────────────────────────

describe('N-8 — _havenCap looks up Sepulcher anchor on Mandragora', () => {
  it('domain.js _havenCap has a Mandragora-scoped Sepulcher branch', () => {
    const src = read('public/js/editor/domain.js');
    expect(src).toMatch(/isMandragora.*=.*m\.name === 'Mandragora Garden'/);
    expect(src).toMatch(/isMandragora && sp2\.name === 'Necropolis Sepulcher'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Seeder shape sanity
// ─────────────────────────────────────────────────────────────────────────────

describe('N-8 — MANDRAGORA_PREREQ block structure', () => {
  it('top-level all has exactly two any-of branches', () => {
    expect(MANDRAGORA_PREREQ.all).toHaveLength(2);
    expect(MANDRAGORA_PREREQ.all[0].any).toBeDefined();
    expect(MANDRAGORA_PREREQ.all[1].any).toBeDefined();
  });

  it('first branch carries the "same level" qualifier on BOTH Safe Place and Sepulcher leaves', () => {
    const [anchorBranch] = MANDRAGORA_PREREQ.all;
    for (const leaf of anchorBranch.any) {
      expect(leaf.qualifier).toBe('same level');
    }
  });

  it('second branch is Crúac-OR-Fucking-Thief (permissive FT — no qualifier)', () => {
    const [, disciplineBranch] = MANDRAGORA_PREREQ.all;
    expect(disciplineBranch.any).toEqual([
      { type: 'discipline', name: 'Crúac', dots: 1 },
      { type: 'merit', name: 'Fucking Thief' },
    ]);
  });
});
