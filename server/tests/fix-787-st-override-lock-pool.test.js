/**
 * fix #787 — DT proc: ST Override locks builder selection into pool_validated
 *
 * downtime-views.js is a browser module; can't be imported into vitest.
 * Tests assert source patterns in the roll-mode click handler.
 *
 * ACs covered:
 *   AC-1/2: ST Override saves pool_validated from _readBuilderExpr
 *   AC-3:   Player Pool clears pool_validated
 *   AC-4:   No Roll Needed block has no pool_validated reference
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(
  resolve(process.cwd(), '../public/js/admin/downtime-views.js'),
  'utf8'
);
const lines = src.split('\n');

/** Return 0-indexed line numbers where pattern matches. */
function matchLines(pattern) {
  return lines.map((l, i) => i).filter(i => pattern.test(lines[i]));
}

/** Extract a block of lines starting at lineIdx, up to length n. */
function block(lineIdx, n = 20) {
  return lines.slice(lineIdx, lineIdx + n).join('\n');
}

describe('fix-787 — ST Override pool_validated source assertions', () => {

  // Locate the roll-mode handler — anchor on the shared .proc-roll-mode-btn listener
  const handlerLineIdx = lines.findIndex(l => /querySelectorAll\('\.proc-roll-mode-btn'\)/.test(l));

  it('roll-mode handler exists', () => {
    expect(handlerLineIdx).toBeGreaterThan(0);
  });

  // The handler spans ~35 lines from the querySelectorAll call
  const handlerBlock = block(handlerLineIdx, 40);

  // ── AC-1/2: ST Override writes pool_validated ────────────────────────────

  describe('AC-1/2: ST Override saves pool_validated via _readBuilderExpr', () => {
    it('handler contains mode === st_override branch', () => {
      expect(handlerBlock).toMatch(/mode\s*===\s*['"]st_override['"]/);
    });

    it('st_override branch calls _readBuilderExpr', () => {
      expect(handlerBlock).toMatch(/_readBuilderExpr\(builderEl\)/);
    });

    it('st_override branch assigns pool_validated on patch', () => {
      expect(handlerBlock).toMatch(/patch\.pool_validated\s*=\s*expr/);
    });

    it('_readBuilderExpr result is guarded before assigning (if expr)', () => {
      expect(handlerBlock).toMatch(/if\s*\(expr\)\s*patch\.pool_validated/);
    });

    it('st_override branch queries proc-pool-builder with data-proc-key', () => {
      expect(handlerBlock).toMatch(/proc-pool-builder\[data-proc-key/);
    });
  });

  // ── AC-3: Player Pool clears pool_validated ──────────────────────────────

  describe('AC-3: Player Pool clears pool_validated', () => {
    it('player branch sets pool_validated to empty string', () => {
      expect(handlerBlock).toMatch(/mode\s*===\s*['"]player['"]/);
      expect(handlerBlock).toMatch(/patch\.pool_validated\s*=\s*['"]{2}/);
    });

    it('player branch is else-if from the st_override branch (same conditional chain)', () => {
      // The else-if ensures exactly one of st_override / player writes pool_validated
      expect(handlerBlock).toMatch(/\}\s*else\s*if\s*\(mode\s*===\s*['"]player['"]\)/);
    });
  });

  // ── AC-4: No Roll Needed does not touch pool_validated ───────────────────

  describe('AC-4: No Roll Needed leaves pool_validated untouched', () => {
    it('no_roll branch only sets pool_status, not pool_validated', () => {
      // Find the no_roll branch within the handler
      const noRollMatch = handlerBlock.match(/if\s*\(mode\s*===\s*['"]no_roll['"]\)\s*\{([^}]+)\}/);
      expect(noRollMatch).not.toBeNull();
      // The no_roll branch body must NOT reference pool_validated
      expect(noRollMatch[1]).not.toMatch(/pool_validated/);
    });
  });

  // ── Structural: order of operations ─────────────────────────────────────

  describe('Structural: pool_validated logic runs before saveEntryReview', () => {
    it('saveEntryReview is called after the st_override/player block', () => {
      const overrideIdx = handlerBlock.indexOf("mode === 'st_override'");
      const saveIdx = handlerBlock.indexOf('saveEntryReview(entry, patch)');
      expect(overrideIdx).toBeGreaterThan(-1);
      expect(saveIdx).toBeGreaterThan(overrideIdx);
    });
  });
});
