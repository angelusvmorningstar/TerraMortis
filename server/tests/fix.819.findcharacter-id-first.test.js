/**
 * Fix #819 — Route DT submission-to-character resolution through _findCharForSub (id-first).
 *
 * Static-analysis tests verifying:
 *   1. findCharacter( appears exactly twice in downtime-views.js (definition + CSV import path).
 *   2. _findCharForSub is present in each formerly-fuzzy call site.
 *   3. findCharacter definition, _wordOverlap, _containsScore, matchSubmission, and
 *      _findCharForSub itself are all untouched.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const src = read('public/js/admin/downtime-views.js');

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: findCharacter( occurrence count
// ─────────────────────────────────────────────────────────────────────────────

describe('#819 — findCharacter( occurrence count', () => {
  it('findCharacter( appears exactly twice (definition + matchSubmission CSV path)', () => {
    const matches = src.match(/findCharacter\(/g) || [];
    expect(matches.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: _findCharForSub present at migrated sites
// ─────────────────────────────────────────────────────────────────────────────

describe('#819 — _findCharForSub present at migrated sites', () => {
  it('resolveSubChar body uses _findCharForSub', () => {
    // resolveSubChar is the only function with this exact return shape
    expect(src).toMatch(/_findCharForSub\(s\)[\s\S]{0,200}return \{ char, charName \}/);
  });

  it('_computeMatrixFeederCounts uses _findCharForSub', () => {
    expect(src).toContain('_computeMatrixFeederCounts');
    const fnStart = src.indexOf('function _computeMatrixFeederCounts');
    const snippet = src.slice(fnStart, fnStart + 1500);
    expect(snippet).toContain('_findCharForSub(s)');
  });

  it('_computeRiteVitaeCost uses _findCharForSub fallback', () => {
    const fnStart = src.indexOf('function _computeRiteVitaeCost');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('_findCharForSub(sub)');
  });

  it('_computeRiteWpCost uses _findCharForSub fallback', () => {
    const fnStart = src.indexOf('function _computeRiteWpCost');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('_findCharForSub(sub)');
  });

  it('handleExportSingle uses _findCharForSub', () => {
    const fnStart = src.indexOf('async function handleExportSingle');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('_findCharForSub(sub)');
  });

  it('handleExportAll parallel-map path and render loop both use _findCharForSub', () => {
    const fnStart = src.indexOf('async function handleExportAll');
    const snippet = src.slice(fnStart, fnStart + 1000);
    const count = (snippet.match(/_findCharForSub\(sub\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('_exportCityOverview uses _findCharForSub', () => {
    const fnStart = src.indexOf('function _exportCityOverview');
    const snippet = src.slice(fnStart, fnStart + 500);
    expect(snippet).toContain('_findCharForSub(s)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: findCharacter definition and CSV path preserved
// ─────────────────────────────────────────────────────────────────────────────

describe('#819 — findCharacter definition and CSV path intact', () => {
  it('findCharacter function is still exported (definition intact)', () => {
    expect(src).toContain('export function findCharacter(');
  });

  it('matchSubmission still calls findCharacter (CSV import path unchanged)', () => {
    const fnStart = src.indexOf('export function matchSubmission');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('findCharacter(');
  });

  it('_wordOverlap helper is still present', () => {
    expect(src).toContain('function _wordOverlap(');
  });

  it('_containsScore helper is still present', () => {
    expect(src).toContain('function _containsScore(');
  });

  it('_findCharForSub definition is still present', () => {
    expect(src).toContain('function _findCharForSub(sub)');
  });
});
