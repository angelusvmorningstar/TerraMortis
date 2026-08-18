/**
 * Clan and bloodline are write-once (Epic BL, BL-5 / #1008).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   What this module is, and why it is not a middleware
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   Angelus ruled on 2026-08-10 that a character's `clan` is set at the
 *   Embrace and permanent, and that `bloodline` is permanent once acquired
 *   (null to a name is allowed; name to a different name and name to null are
 *   not). Nothing in the code knew that until this story.
 *
 *   The obvious reach was a sibling middleware next to
 *   `validateCharacterPartial`. Rejected, for one structural reason: every
 *   middleware in that chain is BODY-ONLY, and a transition rule needs the
 *   STORED value. A middleware would have to open its own `findOne` of the
 *   very document the PUT handler already reads for the touchstones branch,
 *   and two reads of one document to answer two questions about it is the
 *   shape that invites them to drift apart.
 *
 *   So this is pure: no database, no Express, no imports at all. It takes the
 *   current stored value and the incoming value for one field and returns a
 *   verdict. That is the `bloodline-delete-guard.js` precedent, and it exists
 *   for the same reason: the decision can be tested exhaustively, and the
 *   wiring stays thin enough to test behaviourally through the route.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why '' is "no value"
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   `character.schema.js:70` gives `clan` an enum that explicitly includes
 *   `''`, and `:74` declares `bloodline` as `{ type: ['string', 'null'] }`,
 *   which permits `''` too. A `=== null` check at each call site would let
 *   'Malkovians' -> '' through as an allowed "no change" and quietly erase a
 *   permanent fact. One predicate, `hasNoValue`, covers null, undefined,
 *   absent, '' and whitespace-only, because they all mean the same thing.
 *
 *   Live data carries no '' on either field (measured 2026-08-11 across all 41
 *   characters), so this is a guard against the API, not a fix for existing
 *   rows.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why a no-op must be allowed, loudly
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   The ST editor saves the WHOLE document: `admin.js:1015`/`:1240` PUT
 *   `buildSaveBody(c)`, which carries `clan` and `bloodline` unchanged on every
 *   single save. A guard that refused "the field is present in the body" rather
 *   than "the field's value changed" would break every character save in the
 *   app on its first day. `checkWriteOnce` therefore compares VALUES, and the
 *   route only tightens its update filter when `changed` is true.
 *
 * The mirror of this rule lives at `public/js/data/write-once.js`, because
 * `public/js` deploys to Netlify and `server/` to Render, so neither tree can
 * import the other's copy at runtime. The two are pinned against each other by
 * the parity block in `server/tests/bl5-write-once.test.js`.
 */

/** The fields this rule governs. Order is the order the route checks them in. */
export const WRITE_ONCE_FIELDS = ['clan', 'bloodline'];

/**
 * True when a value means "this character does not have one".
 *
 * Exactly AC 2's list and nothing else: `null`, `undefined`, absent, `''` and
 * whitespace-only. Every other shape is treated as A VALUE.
 *
 * That last clause is the fail-closed choice, and it was made deliberately in
 * BL-5's code review. The first cut read `typeof v !== 'string' || v.trim() === ''`,
 * which also swept numbers, booleans, arrays and objects into "no value". Applied
 * to the character's own STORED value that is a bypass: a malformed or legacy
 * document carrying, say, `bloodline: 7` would be read as "has nothing", the
 * guard would call the next write a fresh acquisition, and the write-once rule
 * would fail OPEN on precisely the corrupt data where you most want it to hold.
 * `character.schema.js` says `['string','null']` so this should not exist, but
 * "should not" is not "cannot" for a field a direct Mongo edit can still reach.
 *
 * Treating an unexpected shape as a value means the transition table refuses to
 * overwrite it, and the correction has to be made deliberately against the
 * database, which is the same remedy the rest of this module names.
 */
export function hasNoValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * Decide one field's transition.
 *
 * @param {string} field        'clan' or 'bloodline'
 * @param {*} current           the value stored on the character today
 * @param {*} incoming          the value the request wants to write
 * @returns {{ allowed: boolean, changed: boolean, field: string, current: *, incoming: *, reason: string|null }}
 *   `changed` is true ONLY for an acquisition (no value to a value). It is what
 *   tells the route to make the write a compare-and-set; a no-op must not gain
 *   a filter condition, or an unrelated concurrent clan write would fail
 *   somebody's merit save.
 */
export function checkWriteOnce(field, current, incoming) {
  const had = !hasNoValue(current);
  const wants = !hasNoValue(incoming);

  // Nothing stored: acquisition, or nothing at all. Both allowed.
  if (!had) {
    return verdict(field, current, incoming, true, wants, null);
  }

  // Stored, and the request would clear it.
  if (!wants) {
    return verdict(field, current, incoming, false, false, writeOnceMessage(field, current, incoming));
  }

  // Stored, and byte-identical. The ordinary full-document save.
  if (current === incoming) {
    return verdict(field, current, incoming, true, false, null);
  }

  // Stored, and different. Case- and whitespace-only differences are
  // deliberately refusals rather than tolerated no-ops: the stored string is
  // the value other things key off (BL-4's name index, the cache's `_byName`),
  // and silently rewriting it is precisely the class of change this rule
  // exists to stop.
  return verdict(field, current, incoming, false, false, writeOnceMessage(field, current, incoming));
}

function verdict(field, current, incoming, allowed, changed, reason) {
  return { allowed, changed, field, current, incoming, reason };
}

/**
 * The human half of a refusal. Names the field, the stored value, the attempted
 * value, and the remedy.
 *
 * The remedy sentence is deliberate and was ruled on: there is intentionally NO
 * in-app override. A mis-entered clan or bloodline is a data correction, not an
 * edit, and the message has to say so, because after this story the ST has no
 * dropdown to reach for and would otherwise be left guessing.
 */
export function writeOnceMessage(field, current, incoming) {
  const stored = String(current);
  if (hasNoValue(incoming)) {
    return `Refusing to clear ${field}. This character's ${field} is "${stored}", `
      + `and a ${field} is permanent once set, so it cannot be removed here. `
      + 'Correcting a mis-entered value is a deliberate data correction rather than an edit, '
      + 'and is made directly against the database.';
  }
  return `Refusing to change ${field} from "${stored}" to "${String(incoming)}". `
    + `A character's ${field} is permanent once set, so it cannot be changed here. `
    + 'Correcting a mis-entered value is a deliberate data correction rather than an edit, '
    + 'and is made directly against the database.';
}

/**
 * The compare-and-set miss. Distinct wording because the cause is different:
 * the stored value changed between this request's read and its write, so the
 * ST's own attempt was fine when they made it and is stale by the time it
 * lands. Same 409, because the stored state is still what conflicts.
 */
export function writeOnceRaceMessage(fields) {
  const list = fields.join(' and ');
  return `Another save set this character's ${list} while this one was in flight, `
    + `and ${fields.length > 1 ? 'those fields are' : 'that field is'} permanent once set. `
    + 'Nothing was written. Reload the character to see the value that landed.';
}
