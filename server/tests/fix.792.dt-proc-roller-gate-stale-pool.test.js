/**
 * fix.792 — DT Processing: dice roller fires from stale pool_validated.
 *
 * Root cause: proc-proj-roll-btn read btn.dataset.poolValidated (render-time
 * snapshot of stale review.pool_validated) as its primary pool source.
 * proc-feed-roll-btn read review.pool_validated as its primary source.
 * Both used _readBuilderExpr only as a fallback when pool_validated was empty.
 * This let a stale pool from a prior session fire the roll without any mode
 * button being clicked in the current render.
 *
 * Fix: make _readBuilderExpr the UNCONDITIONAL primary source for both live
 * handlers. If the builder has no valid attr/skill selection, the roll is
 * blocked. proc-action-roll-btn (dead code) gets a builder DOM lookup as a
 * no-op improvement for future-proofing.
 *
 * AC1-proj  — proj handler calls _readBuilderExpr unconditionally
 * AC2-proj  — proj handler no longer reads btn.dataset.poolValidated as primary
 * AC3-proj  — proj handler saves fresh builtExpr unconditionally before poolValidated
 * AC4-feed  — feed handler calls _readBuilderExpr unconditionally
 * AC5-feed  — feed handler no longer uses review?.pool_validated as primary let
 * AC6-action — action handler has builder DOM lookup before poolValidated
 * AC7-merit  — proc-merit-roll-btn handler untouched
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');
const src  = readFileSync(resolve(root, 'public/js/admin/downtime-views.js'), 'utf8');

// ── AC1: proj handler unconditionally reads from builder ──────────────────────

describe('AC1 — proj handler calls _readBuilderExpr unconditionally', () => {
  it('proj handler declares builtExpr from builder before any pool use', () => {
    // The builder lookup must come BEFORE the poolValidated assignment.
    // We verify the new pattern exists (builder-first block).
    const projRollIdx = src.indexOf('.proc-proj-roll-btn');
    const builtExprIdx = src.indexOf(
      'const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null',
      projRollIdx
    );
    expect(builtExprIdx).toBeGreaterThan(projRollIdx);
  });

  it('proj handler returns early when builtExpr is null', () => {
    const projRollIdx = src.indexOf('.proc-proj-roll-btn');
    const earlyReturnIdx = src.indexOf('if (!builtExpr) return', projRollIdx);
    expect(earlyReturnIdx).toBeGreaterThan(projRollIdx);
  });
});

// ── AC2: proj handler no longer reads stale btn.dataset.poolValidated first ──

describe('AC2 — proj handler drops stale btn.dataset.poolValidated as primary', () => {
  it('btn.dataset.poolValidated is not used as a primary pool source', () => {
    // The old pattern: `btn.dataset.poolValidated || review?.pool_validated`
    expect(src).not.toContain('btn.dataset.poolValidated || review?.pool_validated');
  });

  it('proj handler assigns poolValidated from builtExpr (not stale data attr)', () => {
    const projRollIdx = src.indexOf('.proc-proj-roll-btn');
    const letPoolIdx  = src.indexOf('let poolValidated = builtExpr', projRollIdx);
    expect(letPoolIdx).toBeGreaterThan(projRollIdx);
  });
});

// ── AC3: proj handler saves fresh expr unconditionally ────────────────────────

describe('AC3 — proj handler saves fresh builtExpr to pool_validated unconditionally', () => {
  it('saveEntryReview with pool_validated: builtExpr appears in proj handler', () => {
    const projRollIdx = src.indexOf('.proc-proj-roll-btn');
    // The save must come before let poolValidated = builtExpr
    const saveIdx   = src.indexOf('pool_validated: builtExpr', projRollIdx);
    const letPoolIdx = src.indexOf('let poolValidated = builtExpr', projRollIdx);
    expect(saveIdx).toBeGreaterThan(projRollIdx);
    expect(letPoolIdx).toBeGreaterThan(saveIdx);
  });
});

// ── AC4: feed handler unconditionally reads from builder ─────────────────────

describe('AC4 — feed handler calls _readBuilderExpr unconditionally', () => {
  it('feed handler declares builtExpr from builder before any pool use', () => {
    const feedRollIdx = src.indexOf('.proc-feed-roll-btn');
    const builtExprIdx = src.indexOf(
      'const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null',
      feedRollIdx
    );
    expect(builtExprIdx).toBeGreaterThan(feedRollIdx);
  });

  it('feed handler returns early when builtExpr is null', () => {
    const feedRollIdx = src.indexOf('.proc-feed-roll-btn');
    const earlyReturnIdx = src.indexOf('if (!builtExpr) return', feedRollIdx);
    expect(earlyReturnIdx).toBeGreaterThan(feedRollIdx);
  });

  it('feed handler assigns poolValidated from builtExpr', () => {
    const feedRollIdx = src.indexOf('.proc-feed-roll-btn');
    const letPoolIdx  = src.indexOf('let poolValidated = builtExpr', feedRollIdx);
    expect(letPoolIdx).toBeGreaterThan(feedRollIdx);
  });
});

// ── AC5: feed handler drops stale review.pool_validated as primary ─────────

describe('AC5 — feed handler drops review.pool_validated as primary let assignment', () => {
  it('let poolValidated = review?.pool_validated no longer exists anywhere', () => {
    expect(src).not.toContain('let poolValidated = review?.pool_validated');
  });
});

// ── AC6: action handler gains builder DOM lookup ──────────────────────────────

describe('AC6 — action handler has builder DOM lookup (dead code path)', () => {
  it('action handler looks up builderEl before assigning poolValidated', () => {
    const actionRollIdx = src.indexOf('.proc-action-roll-btn');
    const builderLookupIdx = src.indexOf(
      'const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`)',
      actionRollIdx
    );
    expect(builderLookupIdx).toBeGreaterThan(actionRollIdx);
  });

  it('action handler uses builtExpr || review?.pool_validated as fallback chain', () => {
    const actionRollIdx = src.indexOf('.proc-action-roll-btn');
    const fallbackIdx = src.indexOf(
      'const poolValidated = builtExpr || review?.pool_validated',
      actionRollIdx
    );
    expect(fallbackIdx).toBeGreaterThan(actionRollIdx);
  });
});

// ── AC7: merit handler untouched ─────────────────────────────────────────────

describe('AC7 — proc-merit-roll-btn handler is untouched', () => {
  it('merit handler still reads pool from btn.dataset.pool', () => {
    expect(src).toContain('const diceCount = parseInt(btn.dataset.pool, 10) || 0');
  });
});
