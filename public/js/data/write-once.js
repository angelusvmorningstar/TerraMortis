/**
 * Clan and bloodline are write-once, client side (Epic BL, BL-5 / #1008).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this exists as its own module
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   Both fields have TWO independent editing surfaces: the Identity tab
 *   (`editor/identity.js`, via `updField`) and the character sheet header
 *   (`editor/sheet.js`, via `shEdit`). Locking one and not the other leaves the
 *   rule true on one screen and false on the other, which is the same "one
 *   rule, two implementations" shape that cost this epic a whole extra story
 *   when the downtime form turned out to carry its own private in-clan check.
 *
 *   So the refusal is written once, here, and both handlers call it. The
 *   dropdowns are also rendered `disabled`, but that is defence in depth, not
 *   the defence: `data-map.md`'s own instruction on `characters.clan` is to
 *   "enforce at the handler, not only in the markup".
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   The lock reads the character, never the cache
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   A field is locked when the character already holds a value for it. Full
 *   stop. This must NOT consult `bloodlinesResolvable()`, `bloodlinesByClan()`
 *   or any other cache state. BL-3a's clear-guard needed the cache because it
 *   was deciding whether a value was VALID; this decides whether a value
 *   EXISTS, and the character document is the only authority on that. With
 *   production holding zero bloodline documents, a lock keyed off the cache
 *   would unlock every field in the app.
 *
 * This is the mirror of `server/lib/character-write-once.js`. The rule is
 * necessarily implemented twice, because `public/js` deploys to Netlify and
 * `server/` to Render and neither tree can import the other's copy at runtime.
 * What stops them drifting is the parity block in
 * `server/tests/bl5-write-once.test.js`, which runs the same table through
 * both.
 */

/** The fields this rule governs. */
export const WRITE_ONCE_FIELDS = ['clan', 'bloodline'];

/**
 * True when a value means "this character does not have one".
 *
 * Exactly AC 2's list and nothing else: null, undefined, absent, '' and
 * whitespace-only. Any OTHER shape (a number, a boolean, an array, an object)
 * counts as a value, so a malformed stored value locks the control and is
 * refused by the guard rather than being mistaken for an empty field and
 * quietly overwritten. Fail closed. See the same note on the server twin,
 * `server/lib/character-write-once.js`, and the parity block that pins them.
 */
export function hasNoValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/** True when the field is already set on this character, and so is locked. */
export function isLineageLocked(c, field) {
  return WRITE_ONCE_FIELDS.includes(field) && !hasNoValue(c && c[field]);
}

/**
 * The same transition table the server enforces.
 * `changed` is true only for an acquisition (no value to a value).
 */
export function checkWriteOnce(field, current, incoming) {
  const had = !hasNoValue(current);
  const wants = !hasNoValue(incoming);
  if (!had) return { allowed: true, changed: wants, field, current, incoming, reason: null };
  if (!wants) return { allowed: false, changed: false, field, current, incoming, reason: refusalReason(field, current, incoming) };
  if (current === incoming) return { allowed: true, changed: false, field, current, incoming, reason: null };
  return { allowed: false, changed: false, field, current, incoming, reason: refusalReason(field, current, incoming) };
}

function refusalReason(field, current, incoming) {
  if (hasNoValue(incoming)) {
    return `Refused: ${field} is "${String(current)}" and is permanent once set, so it cannot be cleared here.`;
  }
  return `Refused: ${field} is "${String(current)}" and is permanent once set, so it cannot be changed to "${String(incoming)}" here.`;
}

/**
 * The single guard both handlers call. Returns true when the write must NOT
 * happen, having already said why in the console.
 *
 * Fields outside `WRITE_ONCE_FIELDS` always pass straight through, so a handler
 * can call this unconditionally on its first line without having to know which
 * fields are governed.
 */
export function refuseLineageWrite(c, field, incoming) {
  if (!WRITE_ONCE_FIELDS.includes(field)) return false;
  const v = checkWriteOnce(field, c && c[field], incoming);
  if (v.allowed) return false;
  console.warn('[write-once] ' + v.reason);
  return true;
}

/**
 * The locked copy, rendered in the editor. British English, no em-dashes.
 * It states the rule; it must not imply a mistake has been made or that
 * anything is broken, because nothing is: this is the rule working.
 *
 * No apostrophes, so the same string is safe inside a single-quoted HTML
 * attribute built by string concatenation in sheet.js.
 */
export const LINEAGE_LOCK_NOTE = {
  clan: 'Clan is set at the Embrace and is permanent, so it cannot be changed here.',
  bloodline: 'A bloodline is permanent once acquired, so it cannot be changed here.',
};

/**
 * The locked control's attributes, or the empty string when the field is still
 * open. `disabled` plus an explanatory `title` is the treatment the sheet
 * already uses at `sheet.js`'s `_discLockAttr` and the Identity tab already
 * uses for the derived XP fields, so nothing new is introduced.
 *
 * Both editing surfaces call this rather than each building their own string:
 * four dropdowns, two files, one rule.
 */
export function lineageLockAttr(c, field) {
  return isLineageLocked(c, field) ? ' disabled title="' + LINEAGE_LOCK_NOTE[field] + '"' : '';
}

/**
 * The visible reason under a locked control. Reuses the existing
 * `.derived-note` class (`components.css`, loaded by BOTH apps), which is
 * already the sheet's "here is why this value is what it is" treatment.
 *
 * Deliberately NOT `.bl-disc-locked`: that is error-coloured, and this is not
 * an error, it is the rule working. Deliberately NOT BL-4's `.ec-form-readonly`
 * / `.ec-form-hint`: those live in `admin-layout.css` and belong to the
 * reference-data admin surface, not the character editor.
 */
export function lineageLockNoteHtml(c, field) {
  return isLineageLocked(c, field)
    ? '<div class="derived-note">' + LINEAGE_LOCK_NOTE[field] + '</div>'
    : '';
}
