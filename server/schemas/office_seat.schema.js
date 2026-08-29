/**
 * JSON Schema (Draft-07) for TM Office Seat.
 * Collection: office_seats
 *
 * One document per SEAT, not per office. A seat's identity is its own
 * MongoDB `_id`; `holder_id` is only its current pointer at a character.
 * That separation is the whole point of the collection, and it exists
 * because `characters.court_category` demonstrably cannot carry it:
 *
 *   - Socialite has TWO live holders with two distinct titles
 *     (Brandy LaRoux "Harpy", Carver "People's Harpy").
 *   - Primogen ALSO has two live holders, and their `court_title` strings
 *     are identical ("Primogen"), so nothing in the character document
 *     distinguishes them at all. Ruled real, not a data-hygiene bug, by
 *     Angelus on 2026-08-13: "you can have more than one Primogen".
 *
 * So: ANY office may have N concurrent seats. Nothing here special-cases an
 * office name, caps a per-office count, or asserts uniqueness on
 * `office_category`. Two documents sharing an `office_category` with
 * different `holder_id` values are both valid and both correct. If you are
 * about to add a unique index on `office_category`, read oxp.1's story file
 * first (`specs/stories/oxp-1-data-lock-office-seat-schema.md`).
 *
 * Additive only. This collection does NOT replace, derive from or write to
 * `characters.court_category`; the two are separate facts that happen to
 * agree today. Formally linking them is a live open design question, noted
 * in oxp.1's Dev Notes and deliberately out of scope there.
 *
 * NOTHING READS THIS COLLECTION YET. oxp.1 delivers the schema and a manual
 * seed script only. No API route, no client consumer. The first story that
 * genuinely needs to read seats (most likely oxp.2's derived XP) builds the
 * route it actually needs then.
 *
 * Not covered here, deliberately (see oxp.1's Dev Notes for the reasoning):
 *   - `office_merit_dots` / `office_manoeuvre_rank` are still keyed by office
 *     category alone (`_id: 'Socialite'`) and are NOT migrated to seat-keying.
 *   - Handover (a change of `holder_id`) has no behaviour attached. This
 *     records who holds a seat NOW; reacting to a CHANGE is oxp.5's job.
 */

// The five office categories, kept in lockstep with `court_category`'s enum
// in character.schema.js, minus the '' / null members that mean "holds no
// office". A seat document is never "no office", so those two are dropped.
//
// Note that the `office_content` collection (oxp.10) still holds only
// FOUR office documents: Administrator's manoeuvre and merit content is
// oxp.8 and has not been written yet. The Administrator SEAT is nonetheless
// real and filled (Ivana Horvat, since Game 5), so this enum follows
// character.schema.js rather than the content collection.
export const OFFICE_CATEGORY_ENUM = [
  'Head of State',
  'Primogen',
  'Administrator',
  'Socialite',
  'Enforcer',
];

// ── prax.0: which offices one character may hold AT THE SAME TIME. ─────────
//
// Until prax.0 the rule was implicit and absolute: `office-seats.js`'s handover
// route refused ANY second seat, because `characters.court_category` is a
// single field and could only ever display one office. Praxis (Epic PRAX)
// breaks that assumption by game rule, not by accident: a Praxis winner who
// already holds Primogen KEEPS the Primogen seat, and only their HEADLINE flips
// to Head of State. So the rule stops being "at most one seat" and becomes a
// matrix with exactly one carved-out exception.
//
// EXACTLY ONE pairing is compatible. Every other pairing, INCLUDING a category
// with itself (two Primogen seats for one person, which is meaningless), stays
// mutually exclusive, unchanged from the pre-prax.0 behaviour. Widening this
// list is a game-rules decision, not a tidy-up: see
// `specs/stories/prax-0-court-office-identity-fix.md`.
//
// A holder's HEADLINE (`court_category`/`court_title`) when they hold two seats
// is derived by `server/lib/court-category.js`'s `deriveCourtCategory`, in the
// precedence order `OFFICE_CATEGORY_ENUM` above already lists.
export const COMPATIBLE_OFFICE_PAIRS = Object.freeze([
  Object.freeze(['Head of State', 'Primogen']),
]);

/**
 * prax.0 AC1: may one character hold both of these offices at once?
 *
 * Order-insensitive. Two seats of the SAME category are never compatible, so
 * `mayHoldBothOffices('Primogen', 'Primogen')` is false: a second Primogen seat
 * adds nothing a character could display or use, and allowing it would make the
 * derived headline ambiguous for no gain.
 *
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean}
 */
export function mayHoldBothOffices(a, b) {
  if (!a || !b || a === b) return false;
  return COMPATIBLE_OFFICE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// Nullable reference to `characters._id`. Canonical STORAGE is a real
// ObjectId; the validator sees the JSON-serialised form, so the 24-hex
// pattern is the guard that keeps this from silently degrading into the
// mixed string/ObjectId foreign key of data-map.md Known Drift Pattern #2.
// Lowercase only, matching `territoryOid` in downtime_submission.schema.js.
//
// `null` means the seat is VACANT. The field is REQUIRED even so, so that a
// vacant seat is an explicit null rather than an absent key that a reader
// could mistake for "not yet migrated".
const holderRef = { type: ['string', 'null'], pattern: '^[a-f0-9]{24}$' };

// ISO 8601. This repo's AJV is configured without ajv-formats, so `format:
// 'date-time'` would throw at compile time (see downtime_submission.schema.js
// line 234 for the same constraint). A date-first pattern is used instead of
// a bare `{ type: 'string' }`: seat creation dates feed oxp.2's
// months-since-creation arithmetic, and "21 February 2026" parsing to NaN
// there would be a silent wrong answer rather than a loud failure.
// Accepts '2026-02-21' and '2026-02-21T09:30:00.000Z' alike.
//
// The month and day are RANGE-BOUNDED, not bare `\d{2}`. An unbounded pair
// accepts '2026-99-99', which matches the shape and then parses to Invalid
// Date, i.e. precisely the silent-NaN outcome this pattern exists to prevent.
// Bounding them catches that class at the schema level, with no JS Date
// object involved.
//
// Known residual gap, accepted deliberately: no regex can express "this day
// exists in THIS month", so '2026-02-30' and '2027-02-29' still match. That
// is tolerable here because the schema is a shape guard, and the only write
// path that exists today (server/scripts/seed-office-seats.mjs) closes the
// gap completely with its own UTC round-trip calendar check before building
// any document. A future writer that is not that script should do the same.
const isoDate = {
  type: 'string',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])([T ][0-9:.+\\-Z]+)?$',
};

export const officeSeatSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Office Seat',
  type: 'object',
  required: ['office_category', 'holder_id', 'created_at'],
  additionalProperties: false,

  properties: {
    _id: { type: 'string' },

    office_category: { type: 'string', enum: OFFICE_CATEGORY_ENUM },

    holder_id: holderRef,

    // When this SEAT came into being, not when its current holder took it.
    // A handover leaves `created_at` alone (oxp.5's problem, not this one's).
    created_at: isoDate,

    // Human-readable distinguisher for offices whose seats need one, e.g.
    // Socialite's "Harpy" (appointed) versus "People's Harpy" (popular).
    // Null where the office_category alone is enough, which is the usual case:
    // both Primogen seats carry null, because nothing distinguishes them by
    // title. A label is a convenience for STs, never an identity.
    seat_label: { type: ['string', 'null'] },

    // Free text. Provenance notes, ST caveats, anything that would otherwise
    // be lost. Not parsed by anything.
    notes: { type: ['string', 'null'] },
  },
};
