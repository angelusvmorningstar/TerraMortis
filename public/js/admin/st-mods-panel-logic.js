/* ST Mods panel — pure logic helpers (Epic STM, STM-12 issue #440).
 *
 * Extracted from st-mods-panel.js so they carry NO browser-only imports
 * (no window/location/api), which lets vitest import + unit-test them
 * directly in Node. The panel imports these for partitioning, filtering,
 * and the soft-duplicate (dormant) match.
 *
 * Active semantics (ADR-004 Rev 4 §D15/D19): a mod is active unless its
 * `active` field is explicitly false. A missing field (pre-Rev 4 doc) is
 * treated as active.
 */

export function isActive(m) {
  return !!m && m.active !== false;
}

/** Split mods into { active, inactive }, preserving input order within each. */
export function partitionMods(mods) {
  const active = [];
  const inactive = [];
  for (const m of mods || []) {
    (isActive(m) ? active : inactive).push(m);
  }
  return { active, inactive };
}

/** Apply the panel's view filter. view ∈ {'all','active','inactive'}. */
export function filterMods(mods, view) {
  const { active, inactive } = partitionMods(mods);
  if (view === 'active') return { active, inactive: [] };
  if (view === 'inactive') return { active: [], inactive };
  return { active, inactive };
}

/**
 * Soft-duplicate match for the create form (load-bearing AC, STM-12).
 *
 * Returns the first INACTIVE mod on this character whose stat_path equals
 * the form's path, or null. Active-path matches return null on purpose:
 * stacking multiple active mods on one path is by design (ADR Rev 1 §D4),
 * so the create form must stay silent for them. The warning only nudges
 * the ST to reactivate a dormant mod instead of creating a near-duplicate.
 */
export function findDormantMatch(mods, statPath) {
  if (!statPath) return null;
  return (mods || []).find(m => !isActive(m) && m.stat_path === statPath) || null;
}
