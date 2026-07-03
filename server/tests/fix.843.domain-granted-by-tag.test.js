/**
 * Fix #843 — gen-granted-tag on domain merit editor rows.
 *
 * Static-analysis mirror-tests verifying:
 *   1. gen-granted-tag span is present inside the _emitDomRow closure.
 *   2. granted_by is the primary source in the resolution chain (appears before free_carthian).
 *   3. Carthian Pull label is present in the resolution chain.
 *
 * Pattern follows fix.815.harbour-influence-negzero.test.js (REPO_ROOT + fs.readFileSync helper).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const src = read('public/js/editor/sheet.js');

// Extract the _emitDomRow closure up to its call site.
// domM.forEach is the first use of _emitDomRow after the closure definition.
function getClosureSlice() {
  const startIdx = src.indexOf('const _emitDomRow');
  const endIdx   = src.indexOf('domM.forEach', startIdx);
  return src.slice(startIdx, endIdx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — gen-granted-tag reference present inside _emitDomRow
// ─────────────────────────────────────────────────────────────────────────────

describe('#843 — gen-granted-tag present inside _emitDomRow closure', () => {
  it('gen-granted-tag span appears inside the _emitDomRow closure', () => {
    const slice = getClosureSlice();
    expect(slice).toContain('gen-granted-tag');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — source-resolution expression present in the closure
// ─────────────────────────────────────────────────────────────────────────────

describe('#843 — source resolution expression inside _emitDomRow', () => {
  it('granted_by is the primary source in the resolution chain', () => {
    const slice = getClosureSlice();
    // granted_by must appear before free_carthian in the resolution
    expect(slice).toMatch(/granted_by[\s\S]{0,200}free_carthian/);
  });

  it('Carthian Pull label is present in the resolution chain', () => {
    const slice = getClosureSlice();
    expect(slice).toContain('Carthian Pull');
  });
});
