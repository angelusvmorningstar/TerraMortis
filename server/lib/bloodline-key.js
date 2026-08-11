/**
 * The one normalised bloodline-name key, server side (Epic BL, BL-5 / #1008).
 *
 * `public/js/data/bloodlines-cache.js:86-88` resolves every costing lookup
 * through `name.trim().toLowerCase()`. BL-5's referential check has to match on
 * exactly that key rather than on exact string equality, or a bloodline that
 * costs correctly could still be refused at acquisition over a stray space
 * from a CSV import, and the two answers would disagree about the same value.
 *
 * The server had no shared copy of that helper. It now has this one. It is a
 * separate module from `character-write-once.js` on purpose: that module is a
 * pure transition rule with no imports at all, and this is a fact about how
 * bloodline NAMES compare, which is a different concern with a different set of
 * future callers.
 *
 * `server/lib/bloodline-name-index.js` keeps its own private `normKey` with the
 * same body. Deliberately left alone: BL-5's scope explicitly excludes changing
 * BL-4's shared modules, and collapsing them is a one-line follow-up rather
 * than something to smuggle in here. Flagged in the story record.
 */

/** Trim + case-fold. Matches `bloodlines-cache.js`'s `_key` exactly. */
export function bloodlineKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}
