/**
 * Static-analysis tests for the EQ-1..EQ-4 client follow-ups #751 + #752.
 *
 * The relevant code paths (admin app boot loaders in city-views.js +
 * downtime-views.js; the suite roll-v2.js — roll.js retired by rlv.2,
 * 2026-08-24 — equipment-chip + weapon-ref predicates) all live behind
 * browser-only module boundaries (apiGet
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
// #752 — 'active' included in roll-v2.js predicates (option a per Khepri)
//
// EQC-2 (issue #1153) consolidated the inline `item.state === 'carried' ||
// ... === 'worn' || ... === 'active'` repetition in both filters onto the
// shared isEquipmentOnMe(item) predicate (equipment-derivation.js). The
// literal state values themselves now live in exactly ONE place and are
// covered behaviourally there (server/tests/issue-879-defence-penalty-wirein
// .test.js, "#1153 EQC-2 — isEquipmentOnMe" describe block) rather than by
// source-string matching in this file - these tests now prove the two
// consumers actually CALL the shared predicate, not that a literal 'active'
// string appears nearby.
// ─────────────────────────────────────────────────────────────────────────────

describe('#752 / EQC-2 (#1153) — roll-v2.js predicates use the shared isEquipmentOnMe predicate', () => {
  it('imports isEquipmentOnMe from equipment-derivation.js', () => {
    const src = read('public/js/suite/roll-v2.js');
    expect(src).toMatch(/import\s*\{[^}]*isEquipmentOnMe[^}]*\}\s*from\s*['"]\.\.\/data\/equipment-derivation\.js['"]/);
  });

  it('equipment-chip filter calls isEquipmentOnMe(item), near the skill_gear bucket filter', () => {
    const src = read('public/js/suite/roll-v2.js');
    // EQC-1 (#1152): the old 'equipment' bucket is now 'skill_gear'.
    expect(src).toMatch(/bucket === 'skill_gear'[\s\S]{0,400}isEquipmentOnMe\(item\)/);
  });

  it('weapon-reference filter calls isEquipmentOnMe(item), near the combat_gear/weapon-shaped filter', () => {
    const src = read('public/js/suite/roll-v2.js');
    // EQC-1 (#1152): the old 'weapon' bucket merged into 'combat_gear',
    // weapon-shaped distinguished via isCombatGearWeaponShaped.
    expect(src).toMatch(/bucket === 'combat_gear' && isCombatGearWeaponShaped\(entry\)[\s\S]{0,400}isEquipmentOnMe\(item\)/);
  });
});
