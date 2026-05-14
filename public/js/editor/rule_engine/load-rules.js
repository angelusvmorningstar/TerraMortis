/**
 * Rules cache — fetches all rule docs from /api/rules/<family> once and
 * caches them in-memory. applyDerivedMerits (post-flip) calls getRulesBySource()
 * synchronously; callers must await preloadRules() before first render.
 */

import { apiGet } from '../../data/api.js';

let _cache = null; // { rule_grant, rule_nine_again, rule_skill_bonus, rule_speciality_grant, rule_tier_budget, ... }

/**
 * Fetch all rule docs from the server and populate the module cache.
 * Idempotent — subsequent calls return the cached promise.
 *
 * Issue #256 (perf, 2026-05-11): single aggregated round-trip instead
 * of 7 parallel ones. Server route at /api/rules/aggregate accepts
 * a `categories` query param and returns `{ rule_<category>: [...] }`.
 * Cuts the wire overhead from 7 TLS+auth handshakes to 1.
 */
const RULE_CATEGORIES = [
  'grant',
  'nine_again',
  'skill_bonus',
  'speciality_grant',
  'tier_budget',
  'disc_attr',
  'derived_stat_modifier',
];

export async function preloadRules() {
  if (_cache) return _cache;
  const data = await apiGet(`/api/rules/aggregate?categories=${RULE_CATEGORIES.join(',')}`);
  // Guard each field — keeps the cache shape contract stable even if the
  // server response is missing or malformed for any category. Consumers
  // downstream (getRulesBySource) expect arrays only.
  _cache = {
    rule_grant:                 Array.isArray(data?.rule_grant)                 ? data.rule_grant                 : [],
    rule_nine_again:            Array.isArray(data?.rule_nine_again)            ? data.rule_nine_again            : [],
    rule_skill_bonus:           Array.isArray(data?.rule_skill_bonus)           ? data.rule_skill_bonus           : [],
    rule_speciality_grant:      Array.isArray(data?.rule_speciality_grant)      ? data.rule_speciality_grant      : [],
    rule_tier_budget:           Array.isArray(data?.rule_tier_budget)           ? data.rule_tier_budget           : [],
    rule_disc_attr:             Array.isArray(data?.rule_disc_attr)             ? data.rule_disc_attr             : [],
    rule_derived_stat_modifier: Array.isArray(data?.rule_derived_stat_modifier) ? data.rule_derived_stat_modifier : [],
  };
  return _cache;
}

/**
 * Synchronously return rule docs for a given source merit name, split by
 * collection. Returns empty arrays/null if the cache has not been preloaded yet.
 */
export function getRulesBySource(source) {
  if (!_cache) return { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null };
  return {
    grants:          (_cache.rule_grant            || []).filter(r => r.source === source),
    nineAgain:       (_cache.rule_nine_again       || []).filter(r => r.source === source),
    skillBonus:      (_cache.rule_skill_bonus      || []).filter(r => r.source === source),
    specialityGrants:(_cache.rule_speciality_grant || []).filter(r => r.source === source),
    tierBudget:      (_cache.rule_tier_budget      || []).find(r => r.source === source) || null,
  };
}

/** Expose the raw cache — used by evaluator wiring that needs other families. */
export function getRulesCache() {
  return _cache;
}

/** Flush cache — call in tests or when rules are updated via admin UI. */
export function invalidateRulesCache() {
  _cache = null;
}
