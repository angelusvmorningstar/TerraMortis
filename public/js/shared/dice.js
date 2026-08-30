/* Shared dice rolling engine — pure functions for WoD d10 mechanics */

import state from '../suite/data.js';
// dtlt.1: roll-time bonus successes. The evaluator is pure and import-free;
// the cache lookup lives here so every dice surface gets it for free.
import { getRulesCache } from '../editor/rule_engine/load-rules.js';
import { combineSuccesses, formatSuccessBreakdown } from '../editor/rule_engine/bonus-success-evaluator.js';

export { formatSuccessBreakdown };

/** Roll a single d10 (1-10). */
export function d10() { return Math.floor(Math.random() * 10) + 1; }

/** Create a die result object from a rolled value. */
export function mkDie(v) {
  return { v, s: v >= 8, x: !state.NA && v >= state.AGAIN };
}

/** Roll a die chain: initial die plus any exploding re-rolls. */
export function mkChain(rv) {
  const r = mkDie(rv);
  const ch = [];
  if (!state.NA) {
    let l = r;
    while (l.x) { const c = mkDie(d10()); ch.push(c); l = c; }
  }
  return { r, ch };
}

/** Roll a pool of n dice, returning an array of chains. */
export function rollPool(n) {
  const c = [];
  for (let i = 0; i < n; i++) c.push(mkChain(d10()));
  return c;
}

/** Count total successes across all chains. */
export function cntSuc(cols) {
  let s = 0;
  cols.forEach(col => {
    if (col.r.s) s++;
    col.ch.forEach(d => { if (d.s) s++; });
  });
  return s;
}

// ── Bonus successes (dtlt.1) ─────────────────────────────────────────────────
//
// cntSuc stays exactly as it was: the rolled-only primitive. Callers that
// genuinely want rolled-only counts (picking the better of two rote pools, for
// instance) keep using it. Everything that reports a final result should use
// resolveSuccesses / addBonusSuccesses instead, so that a rule like Stronger
// Than You is actually enforced and the breakdown can be shown.

/** The rule_bonus_success docs currently cached, or [] if the cache is cold. */
function _bonusRules() {
  return getRulesCache()?.rule_bonus_success || [];
}

/**
 * Count a pool AND apply any bonus-success rules that fire for this character
 * on this roll.
 *
 * @param {Array}  cols        dice chains, as returned by rollPool
 * @param {object} character   the rolling character (may be null)
 * @param {object} rollContext { attr, skill, disc, spec } describing the pool
 * @returns {{rolled: number, bonus: Array<{source,count}>, total: number}}
 */
export function resolveSuccesses(cols, character, rollContext = {}) {
  return addBonusSuccesses(cntSuc(cols), character, rollContext);
}

/**
 * Same as resolveSuccesses, but starting from an already-counted number of
 * ROLLED successes. Used by the rote path, where the better of two pools is
 * chosen on rolled successes alone and the bonus is then added once, to the
 * winner — never to each candidate.
 */
export function addBonusSuccesses(rolled, character, rollContext = {}) {
  return combineSuccesses(rolled, character, rollContext, _bonusRules());
}
