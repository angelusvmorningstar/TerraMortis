/**
 * fix.791 — DT Processing: dice roller formula label excludes spec bonuses.
 *
 * Root cause: both the project roll handler (.proc-proj-roll-btn) and feeding
 * roll handler (.proc-feed-roll-btn) passed the raw pool_validated string as
 * the `expression` argument to showRollModal, omitting active spec chip
 * annotations. _augmentPoolWithSpecs already existed but was only called in
 * the pool-total display path.
 *
 * Fix:
 *   - proj handler: const augExpr = _augmentPoolWithSpecs(poolValidated,
 *     review?.active_feed_specs || [], _specChar), then expression: augExpr || poolValidated
 *   - feed handler: const _feedChar = _charForSub(sub) + const _feedAugBase =
 *     _augmentPoolWithSpecs(...), then expression: `Feeding: ${_feedAugBase || poolValidated}`
 *
 * AC1-proj — _augmentPoolWithSpecs called before proj showRollModal with correct args
 * AC2-proj — proj handler passes augExpr || poolValidated as expression
 * AC3-feed — _feedChar resolved via _charForSub(sub) before feed showRollModal
 * AC4-feed — feed handler uses augmented base in expression template
 * AC5      — merit roll handler (btn.dataset.pool) is untouched
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');
const src  = readFileSync(resolve(root, 'public/js/admin/downtime-views.js'), 'utf8');

// ── AC1: proj handler calls _augmentPoolWithSpecs ─────────────────────────────

describe('AC1 — proj handler calls _augmentPoolWithSpecs', () => {
  it('_augmentPoolWithSpecs is called with poolValidated and active_feed_specs in proj handler', () => {
    expect(src).toContain(
      '_augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _specChar)'
    );
  });

  it('augExpr is declared as a const before showRollModal in proj handler', () => {
    expect(src).toContain('const augExpr = _augmentPoolWithSpecs(');
  });
});

// ── AC2: proj handler passes augExpr || poolValidated ─────────────────────────

describe('AC2 — proj handler passes augmented expression to showRollModal', () => {
  it('expression field uses augExpr || poolValidated', () => {
    expect(src).toContain('expression: augExpr || poolValidated');
  });

  it('augExpr || poolValidated appears as the expression argument (not just bare poolValidated)', () => {
    // The save-callback pool object still writes `expression: poolValidated` (intentional --
    // we store the base expression, not augmented). We confirm the showRollModal argument
    // uses the augmented form by verifying augExpr || poolValidated is present (above).
    // This test is a belt-and-braces: ensure expression: augExpr appears before showRollModal.
    const rollerIdx  = src.indexOf('augExpr || poolValidated');
    const modalIdx   = src.indexOf('showRollModal({', rollerIdx - 200);
    expect(rollerIdx).toBeGreaterThan(-1);
    expect(modalIdx).toBeGreaterThan(-1);
  });
});

// ── AC3: feed handler resolves _feedChar ──────────────────────────────────────

describe('AC3 — feed handler resolves _feedChar via id-then-name fallback', () => {
  it('_feedChar uses the id-then-name fallback (not id-only _charForSub) — review finding fix.791-1: _charForSub is id-only and silently under-augments the label vs. the actual roll whenever character_id is stale but character_name still resolves via charMap, exactly mirroring how pool_mod_spec itself is computed', () => {
    expect(src).toContain('const _feedChar = sub');
    expect(src).toContain("charMap.get((sub.character_name || '').toLowerCase().trim())");
    expect(src).not.toContain('const _feedChar = _charForSub(sub)');
  });

  it('_feedAugBase is declared using _augmentPoolWithSpecs with _feedChar', () => {
    expect(src).toContain(
      '_augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _feedChar)'
    );
  });
});

// ── AC4: feed handler uses augmented base in expression ───────────────────────

describe('AC4 — feed handler uses augmented expression in showRollModal', () => {
  it('feed showRollModal expression uses _feedAugBase || poolValidated', () => {
    expect(src).toContain('`Feeding: ${_feedAugBase || poolValidated}`');
  });

  it('bare Feeding: ${poolValidated} template no longer exists', () => {
    expect(src).not.toContain('`Feeding: ${poolValidated}`');
  });
});

// ── AC5: merit handler untouched ─────────────────────────────────────────────

describe('AC5 — merit roll handler is untouched', () => {
  it('merit handler still reads pool from btn.dataset.pool (integer, not expression)', () => {
    expect(src).toContain('const diceCount = parseInt(btn.dataset.pool, 10) || 0');
  });
});

// ── AC6: both handlers patched, not just one ──────────────────────────────────

describe('AC6 — both roll handlers carry the augmentation fix', () => {
  it('exactly two _augmentPoolWithSpecs calls reference active_feed_specs (one per handler)', () => {
    const matches = src.match(/_augmentPoolWithSpecs\(poolValidated, review\?\.active_feed_specs \|\| \[\]/g) || [];
    expect(matches.length).toBe(2);
  });

  it('proj call uses _specChar; feed call uses _feedChar (args differ per handler)', () => {
    expect(src).toContain('_augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _specChar)');
    expect(src).toContain('_augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _feedChar)');
  });
});

// ── AC7: save-callback guardrail — pool.expression stays as base value ────────

describe('AC7 — save callback stores base poolValidated, not augmented form', () => {
  it('pool object in save callback still writes expression: poolValidated (not augExpr)', () => {
    // The save callback persists the roll result alongside the raw pool expression.
    // Storing the augmented form would change the historical record unexpectedly —
    // this is explicitly out of scope per the story guardrail.
    expect(src).toContain("pool: { expression: poolValidated, total: diceCount }");
  });
});

// ── AC8: roller.js escapes the (now potentially freeform) expression string ───

describe('AC8 — roller.js escapes pool.expression before rendering (review finding fix.791-2)', () => {
  const rollerSrc = readFileSync(resolve(root, 'public/js/downtime/roller.js'), 'utf8');

  it('imports esc from the shared (DOM-free) helpers module', () => {
    expect(rollerSrc).toContain("import { esc } from '../data/helpers.js';");
  });

  it('wraps pool.expression in esc() before interpolating into innerHTML', () => {
    // Before this diff, showRollModal's `expression` was always machine-generated
    // (dropdown-derived pool text). This diff is the first thing to route freeform,
    // player-authored specialty names (via _augmentPoolWithSpecs) into it — roller.js's
    // own template interpolates `pool.expression` directly into innerHTML with no
    // escaping, which was harmless for machine-generated text but is a real gap now
    // that real player text can reach the same sink.
    expect(rollerSrc).toContain("pool.expression ? esc(pool.expression) : pool.size + ' dice'");
    expect(rollerSrc).not.toContain('${pool.expression || pool.size');
  });
});
