/**
 * STM-12 (issue #440) — panel lifecycle logic.
 *
 * Unit tests for the pure helpers in
 * public/js/admin/st-mods-panel-logic.js. These carry no browser-only
 * imports, so they import + run directly in Node under vitest. They cover
 * the two load-bearing ACs (soft-warn fires on inactive-path match;
 * active-path stacking is silent) plus the active/inactive partitioning
 * that drives the "reactivate moves the row to the active section" UI.
 */

import { describe, it, expect } from 'vitest';
import {
  isActive,
  partitionMods,
  filterMods,
  findDormantMatch,
} from '../../public/js/admin/st-mods-panel-logic.js';

const STR = 'attributes.Strength.dots';
const DEX = 'attributes.Dexterity.dots';

const activeStr   = { _id: '1', stat_path: STR, delta: 2, active: true };
const inactiveStr = { _id: '2', stat_path: STR, delta: 1, active: false };
const legacyStr   = { _id: '3', stat_path: STR, delta: 3 };           // no active field
const inactiveDex = { _id: '4', stat_path: DEX, delta: -1, active: false };

describe('STM-12 — isActive / partitionMods', () => {
  it('treats a missing active field as active (pre-Rev 4 docs)', () => {
    expect(isActive(legacyStr)).toBe(true);
    expect(isActive(activeStr)).toBe(true);
    expect(isActive(inactiveStr)).toBe(false);
  });

  it('partitions active vs inactive', () => {
    const { active, inactive } = partitionMods([activeStr, inactiveStr, legacyStr, inactiveDex]);
    expect(active.map(m => m._id)).toEqual(['1', '3']);
    expect(inactive.map(m => m._id)).toEqual(['2', '4']);
  });
});

describe('STM-12 — filterMods view', () => {
  const mods = [activeStr, inactiveStr, inactiveDex];
  it('all → both groups', () => {
    const r = filterMods(mods, 'all');
    expect(r.active).toHaveLength(1);
    expect(r.inactive).toHaveLength(2);
  });
  it('active → only active', () => {
    const r = filterMods(mods, 'active');
    expect(r.active).toHaveLength(1);
    expect(r.inactive).toHaveLength(0);
  });
  it('inactive → only inactive', () => {
    const r = filterMods(mods, 'inactive');
    expect(r.active).toHaveLength(0);
    expect(r.inactive).toHaveLength(2);
  });
});

describe('STM-12 — findDormantMatch (soft-duplicate warning)', () => {
  it('AC: fires when the form path matches an INACTIVE mod', () => {
    const match = findDormantMatch([inactiveStr, inactiveDex], STR);
    expect(match).toBe(inactiveStr);
  });

  it('AC negative: silent when the path matches only an ACTIVE mod (stacking is by design)', () => {
    // Strength has an active mod but no inactive one → no dormant warning.
    expect(findDormantMatch([activeStr, inactiveDex], STR)).toBeNull();
  });

  it('silent when the path matches only a legacy (active-by-default) mod', () => {
    expect(findDormantMatch([legacyStr], STR)).toBeNull();
  });

  it('prefers the inactive match even when an active mod shares the path', () => {
    // Mixed: an active AND an inactive mod on Strength → the dormant one is
    // the reactivation target, so it must be returned.
    const match = findDormantMatch([activeStr, inactiveStr], STR);
    expect(match).toBe(inactiveStr);
  });

  it('returns null for an empty path', () => {
    expect(findDormantMatch([inactiveStr], '')).toBeNull();
    expect(findDormantMatch([inactiveStr], null)).toBeNull();
  });
});

describe('STM-12 — reactivate updates the UI grouping', () => {
  it('a reactivated mod moves from the inactive group to the active group', () => {
    const mods = [activeStr, inactiveStr];
    // Before: inactiveStr is in the inactive group.
    expect(partitionMods(mods).inactive.map(m => m._id)).toContain('2');

    // Simulate the PATCH { active: true } result the panel re-fetches.
    const reactivated = mods.map(m => (m._id === '2' ? { ...m, active: true } : m));
    const { active, inactive } = partitionMods(reactivated);
    expect(active.map(m => m._id)).toEqual(['1', '2']);
    expect(inactive).toHaveLength(0);
  });
});
