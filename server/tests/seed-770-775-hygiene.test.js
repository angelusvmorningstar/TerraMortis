/**
 * Issue #770 + #775 — seed sub_category preservation + pool-evaluator
 * source_slug bridge.
 *
 * #770: `seed-rules-necropolis.js` `_baseDoc()` defaults `sub_category: null`
 * and pre-fix none of the 9 merit overrides set it. Every `--apply` run
 * silently stripped `sub_category: 'domain'` from prod docs (had to be
 * restored twice on 2026-06-16). The fix sets sub_category explicitly on
 * each merit override; this test asserts the source-of-truth so the
 * regression cannot recur.
 *
 * #775: `pool-evaluator.js:33` pushed `category: rule.category` directly.
 * A rule_grant doc using only `source_slug` (N-1 convention) would push
 * `category: undefined`, breaking downstream filters. The fix bridges
 * via `rule.category ?? rule.source_slug`. The seed now also writes both
 * fields explicitly (belt-and-braces).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// #770 — seed preserves sub_category on every merit
// ─────────────────────────────────────────────────────────────────────────────

// Decisions baked in per Peter 2026-06-16:
//   - 8 merits get 'domain': sepulcher / catacombs / caldarium / garbage pit /
//     labyrinth guardians / dark temple / white ants / trap door
//   - True Worm gets 'general' (per-character drawback, no sharing, no
//     Sepulcher prereq)
const EXPECTED_SUB_CATEGORY = {
  'necropolis-sepulcher': 'domain',
  'catacombs': 'domain',
  'caldarium': 'domain',
  'garbage-pit': 'domain',
  'labyrinth-guardians': 'domain',
  'dark-temple': 'domain',
  'white-ants': 'domain',
  'trap-door': 'domain',
  'true-worm': 'general',
};

describe('#770 — seed-rules-necropolis.js preserves sub_category on every merit', () => {
  it('every merit override in MERITS sets sub_category explicitly', () => {
    const src = read('server/scripts/seed-rules-necropolis.js');

    // Extract the MERITS = [ ... ]; block. Match from `const MERITS = [` to
    // the matching closing `];` at column-0 (the seed file uses a single
    // top-level array, so a balanced-bracket parser isn't required).
    const start = src.indexOf('const MERITS = [');
    expect(start, 'MERITS array must exist in seed').toBeGreaterThan(0);
    const end = src.indexOf('\n];', start);
    expect(end, 'MERITS array must close with `\\n];`').toBeGreaterThan(start);
    const block = src.slice(start, end);

    // For each expected key, find its _baseDoc({...}) call and assert the
    // sub_category line is present with the expected value. Order-of-fields
    // within the call is not constrained by the test.
    for (const [key, expectedSub] of Object.entries(EXPECTED_SUB_CATEGORY)) {
      const keyIdx = block.indexOf(`key: '${key}'`);
      expect(keyIdx, `merit '${key}' must appear in MERITS`).toBeGreaterThan(0);

      // Slice the surrounding _baseDoc call body — from the preceding
      // `_baseDoc({` to the matching `})`. Cheap-and-cheerful: take the
      // next ~30 lines after the key match (largest merit description is
      // well under that). Sufficient for assertion granularity.
      const sliceEnd = block.indexOf('}),', keyIdx);
      const body = block.slice(keyIdx, sliceEnd > keyIdx ? sliceEnd : keyIdx + 2000);

      const subCatMatch = body.match(/sub_category:\s*'([^']+)'/);
      expect(subCatMatch, `merit '${key}' must set sub_category explicitly (pre-#770 bug: _baseDoc default null silently stripped prod state)`).not.toBeNull();
      expect(subCatMatch[1]).toBe(expectedSub);
    }
  });

  it('_baseDoc default of sub_category: null is preserved as a safety net (NOT removed)', () => {
    // We keep the default at null intentionally — it means an over-ride
    // forgetting sub_category will write null and the per-merit assertion
    // above will fail, catching the omission. Removing the default and
    // requiring an explicit field would also work but is more invasive.
    const src = read('server/scripts/seed-rules-necropolis.js');
    expect(src).toMatch(/sub_category:\s*null,?\s*\n\s*cult:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #775 — pool-evaluator bridges category from source_slug when absent
// ─────────────────────────────────────────────────────────────────────────────

describe('#775 — pool-evaluator.js bridges category ?? source_slug', () => {
  it('pushes category from source_slug when category is undefined', async () => {
    // Mock minimal character + rule shape — only `category` is omitted on the
    // rule (source_slug provides the slug). The evaluator must fall back.
    const { applyPoolRulesFromDb } = await import('../../public/js/editor/rule_engine/pool-evaluator.js');
    const c = {
      _grant_pools: [],
      merits: [{ name: 'Test Source', cp: 3, xp: 0 }],
    };
    applyPoolRulesFromDb(c, {
      grants: [{
        source: 'Test Source',
        source_slug: 'test_slug',
        grant_type: 'pool',
        condition: 'merit_present',
        amount_basis: 'rating_of_source',
        pool_targets: ['Target A', 'Target B'],
        // NOTE: category intentionally omitted — the bridge must fall back to source_slug.
      }],
    });
    expect(c._grant_pools).toHaveLength(1);
    expect(c._grant_pools[0].category).toBe('test_slug');
    expect(c._grant_pools[0].source).toBe('Test Source');
    expect(c._grant_pools[0].amount).toBe(3);
  });

  it('prefers explicit category over source_slug when both are present', async () => {
    const { applyPoolRulesFromDb } = await import('../../public/js/editor/rule_engine/pool-evaluator.js');
    const c = {
      _grant_pools: [],
      merits: [{ name: 'Test Source', cp: 3, xp: 0 }],
    };
    applyPoolRulesFromDb(c, {
      grants: [{
        source: 'Test Source',
        source_slug: 'should_be_ignored',
        category: 'explicit_category',
        grant_type: 'pool',
        condition: 'merit_present',
        amount_basis: 'rating_of_source',
        pool_targets: ['Target'],
      }],
    });
    expect(c._grant_pools[0].category).toBe('explicit_category');
  });

  it('seed-rules-necropolis.js NECRO_RULE_GRANT writes both category and source_slug (belt-and-braces)', () => {
    const src = read('server/scripts/seed-rules-necropolis.js');
    const start = src.indexOf('const NECRO_RULE_GRANT = {');
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf('};', start);
    const block = src.slice(start, end);
    expect(block).toMatch(/source_slug:\s*'necro'/);
    expect(block).toMatch(/category:\s*'necro'/);
  });

  it('pool-evaluator source confirms the bridge expression', () => {
    const src = read('public/js/editor/rule_engine/pool-evaluator.js');
    expect(src).toMatch(/category:\s*rule\.category\s*\?\?\s*rule\.source_slug/);
  });
});
