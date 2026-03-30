/* Shared dice rolling engine — pure functions for WoD d10 mechanics */

import state from '../suite/data.js';

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
