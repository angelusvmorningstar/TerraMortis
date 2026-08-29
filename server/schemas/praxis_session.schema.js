/**
 * JSON Schema (Draft-07) for a Praxis night board.
 * Collection: praxis_sessions - exactly ONE document per Chapter.
 *
 * One board carries TWO independent tallies (prax.1 AC1, Angelus's locked
 * ruling):
 *
 *   - `praxis` : the Head of State claim, weighted by City Status at render
 *                time.
 *   - `harpy`  : the People's Harpy vote, a plain headcount.
 *
 * They live in the same document because they are run on the same night, off
 * the same attendee pool, by the same ST. They are NEVER synced to each other:
 * a supporter chip sits on at most one claimant within Praxis and, entirely
 * independently, at most one claimant within Harpy, and a character may hold an
 * open claim in both tallies at once. Nothing in this schema, and nothing in
 * server/routes/praxis-sessions.js, couples the two sub-documents.
 *
 * ═══ WHAT IS PERSISTED, AND WHAT DELIBERATELY IS NOT ═══
 *
 * Only the LINKAGE is stored: who has an open claim, and which supporter is
 * assigned to which claimant. The live computed score is never stored, in
 * keeping with this repo's standing "derived stats are never stored" rule
 * (root CLAUDE.md). It is recomputed on every render from these assignments
 * plus live character/territory data, so an ST correcting a character's City
 * Status mid-night sees the tally move without anybody having to rebuild the
 * board.
 *
 * The ONE sanctioned exception is `resolved.<tally>`, a frozen snapshot taken
 * at resolve time so a historical result cannot drift when the underlying
 * characters change afterwards. prax.1 does not write it: this story only
 * reserves the field, which is why it is typed loosely below.
 *
 * ═══ ID TYPES: TWO DIFFERENT CONVENTIONS, ON PURPOSE ═══
 *
 * `chapter_id` is stored as a real BSON ObjectId, matching the canonical write
 * in game-sessions.js's own `coerceChapterId` and keeping this collection's
 * foreign key out of data-map.md's Known Drift Pattern #2 (a mixed
 * string/ObjectId FK). This schema validates the JSON-SERIALISED form, where an
 * ObjectId arrives as its 24-character hex string, so the pattern below is the
 * guard on that boundary. Same convention office_seat.schema.js documents for
 * its own `holder_id`.
 *
 * Every CHARACTER id inside `praxis` / `harpy`, by contrast, is a 24-hex
 * lower-case STRING. That is forced, not chosen: `support` is a map KEYED by
 * supporter character id, and a BSON document key can only ever be a string.
 * Storing the claim ids or the support VALUES as ObjectIds while the keys were
 * strings would leave the one comparison this whole document exists to support
 * - "does this support entry point at the claimant being withdrawn?" (AC6) -
 * comparing an ObjectId against a string and silently never matching. One
 * consistent string form throughout the two sub-documents removes that class
 * of bug entirely.
 */

// A character id at the JSON boundary: 24-hex, lower case only. Lower-case-only
// (rather than a case-insensitive pattern) is what stops an upper-case request
// minting a SECOND support key for a supporter who already has one; the routes
// normalise before writing, and this pins that they did.
const charIdRef = { type: 'string', pattern: '^[a-f0-9]{24}$' };

// ISO 8601. This repo's AJV is configured without ajv-formats, so
// `format: 'date-time'` would throw at compile time (see
// downtime_submission.schema.js and office_seat.schema.js for the same
// constraint). Month and day are range-bounded so '2026-99-99' cannot match a
// shape check and then parse to Invalid Date further downstream.
const isoTimestamp = {
  type: 'string',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])([T ][0-9:.+\\-Z]+)?$',
};

/**
 * One tally: its open claims, and the supporter to claimant assignments made
 * against them.
 *
 * `support` is a plain object keyed by supporter character id and valued by
 * claimant character id, the same "collection keyed by a hex-string id" idiom
 * `office_manoeuvre_ranks` already uses for its own `_id`. It is not an array
 * of pairs, because a supporter has at most ONE assignment per tally and a map
 * makes that a structural fact rather than something a route has to police:
 * reassigning simply overwrites the key, and unassigning deletes it.
 *
 * `additionalProperties: false` alongside `patternProperties` is load-bearing.
 * It means a malformed supporter key is a schema failure rather than a silently
 * accepted entry that no reader will ever match against a real character.
 */
const tallyShape = {
  type: 'object',
  required: ['claims', 'support'],
  additionalProperties: false,
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['character_id', 'opened_at'],
        additionalProperties: false,
        properties: {
          character_id: charIdRef,
          opened_at: isoTimestamp,
        },
      },
    },
    support: {
      type: 'object',
      patternProperties: { '^[a-f0-9]{24}$': charIdRef },
      additionalProperties: false,
    },
  },
};

/**
 * A frozen resolve-time snapshot, or null while the tally is unresolved.
 *
 * Typed loosely and deliberately: prax.4a (Praxis) and prax.4b (Harpy) design
 * their own snapshot shapes, and pinning a shape here before either exists
 * would only have to be rewritten from inside those stories. prax.1 needs one
 * thing from this field and one thing only - that it exists, and that it is
 * null. Tighten it when there is a real writer to tighten it against.
 */
const resolvedShape = { type: ['object', 'null'], additionalProperties: true };

export const praxisSessionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Praxis Session',
  type: 'object',
  required: ['chapter_id', 'praxis', 'harpy', 'resolved', 'created_at', 'updated_at'],
  additionalProperties: false,

  properties: {
    _id: { type: 'string' },

    // The Chapter this board belongs to. One board per Chapter, enforced at the
    // DB level by a partial unique index created at boot (server/index.js) as
    // well as by the route-level 409 in POST /api/praxis_sessions - defence in
    // depth, because the index also catches a write that never went through the
    // route at all.
    chapter_id: { type: 'string', pattern: '^[a-f0-9]{24}$' },

    praxis: tallyShape,
    harpy: tallyShape,

    // Both null for the whole of prax.1's lifetime. Nothing in this story ever
    // writes into either.
    resolved: {
      type: 'object',
      required: ['praxis', 'harpy'],
      additionalProperties: false,
      properties: {
        praxis: resolvedShape,
        harpy: resolvedShape,
      },
    },

    created_at: isoTimestamp,
    updated_at: isoTimestamp,
  },
};
