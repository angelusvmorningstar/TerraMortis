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
 */
export async function preloadRules() {
  if (_cache) return _cache;
  const [grant, nineAgain, skillBonus, specialityGrant, tierBudget, discAttr, derivedStatMod] = await Promise.all([
    apiGet('/api/rules/grant'),
    apiGet('/api/rules/nine_again'),
    apiGet('/api/rules/skill_bonus'),
    apiGet('/api/rules/speciality_grant'),
    apiGet('/api/rules/tier_budget'),
    apiGet('/api/rules/disc_attr'),
    apiGet('/api/rules/derived_stat_modifier'),
  ]);
  _cache = {
    rule_grant:                   Array.isArray(grant)          ? grant          : [],
    rule_nine_again:              Array.isArray(nineAgain)      ? nineAgain      : [],
    rule_skill_bonus:             Array.isArray(skillBonus)     ? skillBonus     : [],
    rule_speciality_grant:        Array.isArray(specialityGrant)? specialityGrant: [],
    rule_tier_budget:             Array.isArray(tierBudget)     ? tierBudget     : [],
    rule_disc_attr:               Array.isArray(discAttr)       ? discAttr       : [],
    rule_derived_stat_modifier:   Array.isArray(derivedStatMod) ? derivedStatMod : [],
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
