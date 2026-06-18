/**
 * Issue #838 — guard against re-introducing the dead xpLeft() in accessors.js.
 *
 * The canonical xpLeft lives at public/js/editor/xp.js and derives from
 * xpEarned() - xpSpent() at render time. The accessors.js variant read the
 * stored xp_total / xp_spent fields (deprecated, see #837 / Option A) and
 * had zero importers when removed. If anyone re-adds it, this test fails
 * before the regression can spread.
 *
 * Source-level check — accessors.js depends on the browser `location` global
 * via api.js, so it can't be import()ed under vitest's node env.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACCESSORS_PATH = resolve(__dirname, '../../public/js/data/accessors.js');

describe('#838 accessors.js must not export xpLeft', () => {
  const src = readFileSync(ACCESSORS_PATH, 'utf8');

  it('has no `export function xpLeft` declaration', () => {
    expect(/export\s+function\s+xpLeft\b/.test(src)).toBe(false);
  });

  it('has no named-export of xpLeft via export {} block', () => {
    const blockExportRe = /export\s*\{[^}]*\bxpLeft\b[^}]*\}/;
    expect(blockExportRe.test(src)).toBe(false);
  });

  it('has no `export const xpLeft` / `export let xpLeft` form', () => {
    expect(/export\s+(?:const|let|var)\s+xpLeft\b/.test(src)).toBe(false);
  });
});
