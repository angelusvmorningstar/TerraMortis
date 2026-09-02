/**
 * Kurtis W bug report (2026-09, deferred-work.md): "Safe Place capped by
 * Safe Place" confusing message, surfaced only as a screenshot artifact,
 * not investigated at the time.
 *
 * Root-caused: the underlying cap logic (Haven/Mandragora Garden capped by
 * an attached anchor) was correct — the VIEW-MODE copy was the problem, on
 * two counts:
 *   1. Neither "needs attached anchor" nor "capped at N" named the merit
 *      the note was describing, so a Haven row's own cap-warning read as a
 *      bare "Safe Place limits effective dots" sitting directly under a
 *      subtitle that ALSO reads "Attached to: Safe Place (...)" — easy to
 *      misread as self-referential even though it's really "Haven, capped
 *      by Safe Place".
 *   2. View-mode hardcoded "Safe Place" even for Mandragora Garden, which
 *      (N-8, issue #761) can anchor to a Necropolis Sepulcher instead —
 *      genuinely WRONG wording in that case, not just unclear. Edit-mode
 *      (sheet.js ~line 1433) already generalised this correctly; view-mode
 *      had not, until this fix.
 */

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
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let shRenderDomainMerits;
let stateMod;

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
});

function mkChar(merits) {
  return {
    _id: 'kurtis-cap-test', name: 'Kurtis Cap Test',
    clan: 'Nosferatu', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

describe('Kurtis W — cap-warning copy names the capped merit, not just "Safe Place"', () => {
  it('Haven with no attached anchor: names Haven, says "Safe Place"', () => {
    const c = mkChar([{ name: 'Haven', category: 'domain', cp: 1, xp: 0 }]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;

    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('Haven needs an attached Safe Place (0 effective dots)');
  });

  it('Mandragora Garden with no attached anchor: names Mandragora Garden, says "Safe Place or Sepulcher" — NOT hardcoded "Safe Place" alone (the real bug)', () => {
    const c = mkChar([{ name: 'Mandragora Garden', category: 'domain', cp: 1, xp: 0 }]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;

    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('Mandragora Garden needs an attached Safe Place or Sepulcher (0 effective dots)');
    // Pre-fix this rendered "Needs an attached Safe Place (0 effective
    // dots)" with no mention of Sepulcher at all — wrong for a Mandragora
    // Garden actually anchored to one.
    expect(html).not.toMatch(/needs an attached Safe Place \(0 effective dots\)/);
  });

  it('Haven over-allocated past its attached Safe Place’s dots: names Haven, says "Safe Place"', () => {
    const c = mkChar([
      { name: 'Safe Place', category: 'domain', cp: 1, xp: 0, qualifier: 'Penthouse' },
      { name: 'Haven', category: 'domain', cp: 3, xp: 0, attached_to: 'Safe Place (Penthouse)' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;

    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('Haven capped at 1 by its attached Safe Place');
  });

  it('Mandragora Garden over-allocated past its attached Sepulcher’s dots: names Mandragora Garden, says "anchor" — NOT "Safe Place" (the real bug: Sepulcher-anchored Mandragora should never say "Safe Place")', () => {
    const c = mkChar([
      { name: 'Necropolis Sepulcher', category: 'general', cp: 1, xp: 0 },
      { name: 'Mandragora Garden', category: 'domain', cp: 3, xp: 0, attached_to: 'Necropolis Sepulcher' },
    ]);
    stateMod.chars = [c]; stateMod.editIdx = 0; stateMod.editMode = false;

    const html = shRenderDomainMerits(c, false);
    expect(html).toContain('Mandragora Garden capped at 1 by its attached anchor');
    expect(html).not.toContain('by its attached Safe Place');
  });
});
