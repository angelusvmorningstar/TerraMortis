/**
 * Static-analysis tests for the EQ-1..EQ-4 client follow-ups #751 + #752.
 *
 * The relevant code paths (admin app boot loaders in city-views.js +
 * downtime-views.js; the suite roll.js equipment-chip + weapon-ref
 * predicates) all live behind browser-only module boundaries (apiGet
 * fetches at module-load, DOM globals, state-machine singletons) that make
 * direct unit-import expensive.
 *
 * Mirrors the precedent of `feature.691.hos-city-status-power.test.js` —
 * read the source file as text and assert the load-bearing string is
 * present where it must be. Cheap, fast, catches regressions where a
 * future refactor removes the wiring or reverts the predicate change.
 *
 * Path resolution: uses `import.meta.url` + `path.resolve` so the test
 * works regardless of the cwd vitest was invoked from (the existing
 * #706-tracked PR #700 test uses a brittle relative path that fails when
 * cwd is `server/`; this file deliberately avoids that trap).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// #751 — state.activeCycleNum wired at both admin loader sites
// ─────────────────────────────────────────────────────────────────────────────

describe('#751 — state.activeCycleNum wiring', () => {
  it('city-views.js writes state.activeCycleNum from the resolved active cycle', () => {
    const src = read('public/js/admin/city-views.js');
    // Source must import the state module + write the cycle_number near
    // the _activeCycle resolution. Two complementary checks so a future
    // rename of either side still trips the test.
    expect(src).toMatch(/import\s+state\s+from\s+['"]\.\.\/data\/state\.js['"]/);
    expect(src).toMatch(/state\.activeCycleNum\s*=\s*\(?\s*_activeCycle\s*&&\s*_activeCycle\.cycle_number/);
  });

  it('downtime-views.js writes state.activeCycleNum from the resolved active cycle', () => {
    const src = read('public/js/admin/downtime-views.js');
    expect(src).toMatch(/import\s+state\s+from\s+['"]\.\.\/data\/state\.js['"]/);
    expect(src).toMatch(/state\.activeCycleNum\s*=\s*\(?\s*activeCycle\s*&&\s*activeCycle\.cycle_number/);
  });

  it("state.js still ships activeCycleNum so the editor's read sites stay aligned", () => {
    const src = read('public/js/data/state.js');
    expect(src).toMatch(/activeCycleNum/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #752 — 'active' included in roll.js predicates (option a per Khepri)
// ─────────────────────────────────────────────────────────────────────────────

describe('#752 — roll.js predicates include the active state', () => {
  it('equipment-chip filter accepts state === active', () => {
    const src = read('public/js/suite/roll.js');
    // The predicate block: any line with `item.state === 'active'` near a
    // `bucket === 'skill_gear'` filter clause counts. We confirm BOTH the
    // skill_gear filter and the 'active' check coexist within a small
    // window so a future predicate rewrite doesn't silently drop 'active'.
    // EQC-1 (#1152): the old 'equipment' bucket is now 'skill_gear'.
    expect(src).toMatch(/bucket === 'skill_gear'[\s\S]{0,400}item\.state === 'active'/);
  });

  it('weapon-reference filter accepts state === active', () => {
    const src = read('public/js/suite/roll.js');
    // EQC-1 (#1152): the old 'weapon' bucket merged into 'combat_gear'.
    // Review patch: weapon-shaped items are distinguished via the shared
    // isCombatGearWeaponShaped predicate (OR across weapon_type/damage_mod/
    // damage_type), not a single-field inline check.
    expect(src).toMatch(/bucket === 'combat_gear' && isCombatGearWeaponShaped\(entry\)[\s\S]{0,400}item\.state === 'active'/);
  });

  it('the legacy carried + worn states still appear in the same predicates (no accidental swap)', () => {
    const src = read('public/js/suite/roll.js');
    // Sanity guard: 'active' is an addition, not a replacement.
    expect(src).toMatch(/'carried'\s*\|\|\s*item\.state === 'worn'/);
  });
});
