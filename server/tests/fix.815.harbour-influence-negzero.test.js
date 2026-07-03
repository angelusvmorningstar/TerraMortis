/**
 * Fix #815 — Harbour influence "-0" display bug and diagnostic logging.
 *
 * Static-analysis mirror-tests verifying:
 *   1. The naked `-${r.inf_neg}` / `-${r.proj_neg}` / `-${r.allies_neg}` patterns inside
 *      proc-amb-neg spans are absent (the "-0" bug is fixed).
 *   2. Conditional guards (inf_neg > 0, proj_neg > 0, allies_neg > 0) are present in the
 *      display-line neighbourhood.
 *   3. _gatherInfluence emits a console.debug diagnostic with the [ambience:influence] prefix.
 *
 * Pattern follows fix.943.retireStripDerived.test.js (REPO_ROOT + read helper).
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
// Suite 1: naked "-0" patterns are absent
// ─────────────────────────────────────────────────────────────────────────────

// The OLD buggy pattern: a full <span class="proc-amb-neg">-${r.xxx_neg}</span> embedded
// DIRECTLY in the *Display template literal (no conditional guard wrapping it).
// The fix moves the span into a *NegStr ternary variable; the *Display literal now only
// references ${xxxNegStr}. We detect the old pattern by checking that the *Display
// template literal itself does NOT contain the span inline.
//
// Regex strategy: match `xxxDisplay = \`...<span class="proc-amb-neg">-${r.xxx_neg}</span>...`
// on a single template expression (no newline crossing into a separate variable assignment).
describe('#815 — naked -${r.*_neg} patterns absent from proc-amb-neg spans', () => {
  it('infDisplay template literal does NOT embed proc-amb-neg span for inf_neg directly', () => {
    // Must not see infDisplay = `...proc-amb-neg">-${r.inf_neg}...` on the same template line
    expect(src).not.toMatch(/infDisplay\s*=\s*`[^`]*proc-amb-neg">\-\$\{r\.inf_neg\}/);
  });

  it('projDisplay template literal does NOT embed proc-amb-neg span for proj_neg directly', () => {
    expect(src).not.toMatch(/projDisplay\s*=\s*`[^`]*proc-amb-neg">\-\$\{r\.proj_neg\}/);
  });

  it('alliesDisplay template literal does NOT embed proc-amb-neg span for allies_neg directly', () => {
    expect(src).not.toMatch(/alliesDisplay\s*=\s*`[^`]*proc-amb-neg">\-\$\{r\.allies_neg\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: conditional guards are present
// ─────────────────────────────────────────────────────────────────────────────

describe('#815 — conditional guards present for each negative column', () => {
  it('inf_neg conditional guard (> 0 or !== 0) is present', () => {
    expect(src).toMatch(/inf_neg(?:\s*!==\s*0|\s*>\s*0)/);
  });

  it('proj_neg conditional guard (> 0 or !== 0) is present', () => {
    expect(src).toMatch(/proj_neg(?:\s*!==\s*0|\s*>\s*0)/);
  });

  it('allies_neg conditional guard (> 0 or !== 0) is present', () => {
    expect(src).toMatch(/allies_neg(?:\s*!==\s*0|\s*>\s*0)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: console.debug diagnostic present in _gatherInfluence
// ─────────────────────────────────────────────────────────────────────────────

describe('#815 — console.debug diagnostic present in _gatherInfluence', () => {
  it('_gatherInfluence source contains console.debug with [ambience:influence] prefix', () => {
    expect(src).toMatch(/console\.debug\(\s*'\[ambience:influence\]/);
  });
});
