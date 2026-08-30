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
  // dtlt.1: roll-time bonus successes. Unlike the families above this one is
  // read by the dice engine (shared/dice.js), not by applyDerivedMerits — it
  // rides the same aggregate round-trip because the cache is already here.
  'bonus_success',
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
    rule_bonus_success:         Array.isArray(data?.rule_bonus_success)         ? data.rule_bonus_success         : [],
  };
  return _cache;
}

/**
 * Synchronously return rule docs for a given source merit name, split by
 * collection. Returns empty arrays/null if the cache has not been preloaded yet.
 */
export function getRulesBySource(source) {
  if (!_cache) {
    return {
      grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null,
      bonusSuccess: [],
    };
  }
  return {
    grants:          (_cache.rule_grant            || []).filter(r => r.source === source),
    nineAgain:       (_cache.rule_nine_again       || []).filter(r => r.source === source),
    skillBonus:      (_cache.rule_skill_bonus      || []).filter(r => r.source === source),
    specialityGrants:(_cache.rule_speciality_grant || []).filter(r => r.source === source),
    tierBudget:      (_cache.rule_tier_budget      || []).find(r => r.source === source) || null,
    // Review fix (Codex, external, dtlt.1): the current evaluator deliberately
    // bypasses this and reads getRulesCache().rule_bonus_success directly to
    // stay pure/import-free, but the Code Map named this function as one to
    // extend — this closes that gap for any future consumer that expects
    // rule_bonus_success to behave like every other family here.
    bonusSuccess:    (_cache.rule_bonus_success    || []).filter(r => r.source === source),
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
