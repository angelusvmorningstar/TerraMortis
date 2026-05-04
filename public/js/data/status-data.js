/* Shared status-data helpers — single source of truth for the player-view
 * filter logic used by both status renderers (tabs/status-tab.js and
 * suite/status.js). Pure functions, no DOM, no CSS. Both renderers wrap
 * the output in their own UI shell.
 *
 * Adding a new free_* / status field, or changing the rules for what
 * counts as "in this covenant", happens in ONE place — both views update
 * automatically. Same anti-drift discipline as the merit-render
 * unification (commit 8c1a82d et al).
 *
 * Three rules the player view enforces:
 *   1. Always include the active character's primary covenant table (if any).
 *   2. Also include any covenant where the active char has status > 0.
 *   3. Each table lists every character who is either a rank-holder
 *      (status.covenant[cov] > 0) OR a primary member (c.covenant === cov).
 *
 * No OTS subtraction. The OTS pact's social-check penalty is narrative-only
 * and does not modify displayed status anywhere.
 */

/**
 * Pick the active character's record from the chars array (the same snapshot
 * the rows render from). Falls back to the passed-in object if the active
 * character isn't present in chars (e.g. retired since fetch).
 */
export function resolveActiveChar(chars, activeChar) {
  if (!activeChar) return null;
  const id = String(activeChar._id);
  return chars.find(c => String(c._id) === id) || activeChar;
}

/**
 * Ordered covenant list to render tables for, in the player view.
 * Primary first (if set), then any covenant the character has standing in.
 */
export function covenantListFor(activeChar) {
  const list = [];
  if (activeChar?.covenant) list.push(activeChar.covenant);
  for (const [cov, v] of Object.entries(activeChar?.status?.covenant || {})) {
    if ((v | 0) > 0 && !list.includes(cov)) list.push(cov);
  }
  return list;
}

/**
 * Rows for a single covenant section: anyone with status > 0 in that covenant,
 * plus anyone whose primary IS that covenant (members at 0 standing still
 * appear). Sorted by val desc, then by sort name. Caller owns the chip render.
 */
export function covenantRowsFor(chars, cov, sortNameFn) {
  return chars
    .map(c => ({ c, val: c.status?.covenant?.[cov] || 0 }))
    .filter(r => r.val > 0 || r.c.covenant === cov)
    .sort((a, b) => b.val - a.val || sortNameFn(a.c).localeCompare(sortNameFn(b.c)));
}

/**
 * Rows for the clan section — characters of the same clan as the active char,
 * sorted by clan-status desc.
 */
export function clanRowsFor(chars, clan, sortNameFn) {
  return chars
    .filter(c => c.clan && c.clan === clan)
    .map(c => ({ c, val: c.status?.clan || 0 }))
    .sort((a, b) => b.val - a.val || sortNameFn(a.c).localeCompare(sortNameFn(b.c)));
}
