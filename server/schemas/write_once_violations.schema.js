/**
 * JSON Schema (Draft-07) for TM write-once violation records.
 * Collection: write_once_violations
 *
 * Append-only audit record of a REFUSED write-once transition on a character's
 * `clan` or `bloodline` (issue #1132, on top of BL-5 / #1008). Only refusals
 * are recorded; a legitimate acquisition or a no-op save writes nothing.
 *
 * Not currently wired to Ajv/route validation anywhere — the insert
 * (server/lib/write-once-violation-log.js, called from
 * server/routes/characters.js's PUT /:id handler at its two existing 409
 * sites) writes directly via insertMany, so this schema is
 * documentation-of-intended-shape only, the same status
 * xp_ledger.schema.js holds.
 *
 * Two shape decisions are inherited from that file's own code review
 * (2026-08-15) rather than rediscovered the hard way:
 *
 *   - `_id` is DECLARED. Under `additionalProperties: false` an undeclared
 *     `_id` would reject every document Mongo actually writes.
 *   - `character_id` is the 24-hex STRING a validator sees, not
 *     `{ type: 'object' }`. Canonical storage is a real ObjectId; a validator
 *     only ever meets the JSON-serialised form.
 *
 * `stored_value` and `attempted_value` are deliberately loose. The whole point
 * of the record is what was actually stored and what was actually attempted —
 * including a malformed stored value, which is precisely the case
 * character-write-once.js's own `hasNoValue` docstring says you most want
 * visible. Nothing is trimmed, case-folded or coerced on the way in; an absent
 * value is normalised to `null` only so the key persists at all.
 */

// Canonical STORAGE is a real ObjectId; a validator sees the serialised form.
// Lowercase-only 24-hex, matching characterIdRef in xp_ledger.schema.js and
// holderRef in office_seat.schema.js.
const characterIdRef = { type: 'string', pattern: '^[a-f0-9]{24}$' };

// Mirrors `by` in the st_mod_audit event stream (server/routes/st_mods.js's
// creatorFromUser). The id is the durable half — a Discord username can be
// changed by its owner, the snowflake cannot — so an audit row carries both.
const actorRef = {
  type: 'object',
  required: ['discord_id', 'discord_name'],
  additionalProperties: false,
  properties: {
    discord_id:   { type: 'string' },
    discord_name: { type: 'string', minLength: 1 },
  },
};

export const writeOnceViolationSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Write-Once Violation Record',
  type: 'object',
  required: ['character_id', 'field', 'stored_value', 'attempted_value', 'actor', 'at'],
  additionalProperties: false,
  properties: {
    _id:             { type: 'string' },
    character_id:    characterIdRef,
    // The two fields WRITE_ONCE_FIELDS governs, in its own order.
    field:           { type: 'string', enum: ['clan', 'bloodline'] },
    // Codex review (2026-08-31): clan/bloodline are string-or-null by their
    // own schema on every write this route validates, but that validation
    // did not always exist - a malformed legacy stored value (or a bug
    // upstream) can reach here as any JSON type, and the module's own intent
    // (see write-once-violation-log.js) is to preserve exactly what was
    // there, not coerce it to fit this documentation-only schema.
    stored_value:    {},
    attempted_value: {},
    actor:           actorRef,
    at:              { type: 'string' },
  },
};
