/**
 * JSON Schema (Draft-07) for TM XP Ledger entries.
 * Collection: xp_ledger
 *
 * Append-only audit record of XP-affecting writes to a character. Not
 * currently wired to Ajv/route validation anywhere — the insert
 * (server/routes/characters.js's PUT /:id handler) writes directly via
 * insertMany, so this schema is documentation-of-intended-shape only, the
 * same status oxp.1's office_seats schema had before its own consumer
 * existed.
 *
 * Code-review (2026-08-15, Medium) found the original version would have
 * REJECTED every real document had it ever been wired up: `_id` was
 * undeclared under `additionalProperties: false` (Mongo always adds one),
 * and `character_id: { type: 'object' }` is a JSON-Schema type that a
 * validator sees the JSON-serialised request/document form of, never the
 * raw BSON ObjectId — matching office_seat.schema.js's own `holderRef`
 * convention (24-hex string pattern) fixes both.
 */

// Canonical STORAGE is a real ObjectId; a validator sees the serialised
// form. Lowercase-only 24-hex, matching holderRef in office_seat.schema.js
// and territoryOid in downtime_submission.schema.js.
const characterIdRef = { type: 'string', pattern: '^[a-f0-9]{24}$' };

export const xpLedgerSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM XP Ledger Entry',
  type: 'object',
  required: ['character_id', 'category', 'trait_name', 'delta', 'new_total', 'at', 'st_username'],
  additionalProperties: false,
  properties: {
    _id:          { type: 'string' },
    character_id: characterIdRef,
    category:     { type: 'string', enum: ['attribute', 'skill', 'discipline', 'merit'] },
    trait_name:   { type: 'string', minLength: 1 },
    delta:        { type: 'integer' }, // non-zero by construction (diffXpLedgerRows never emits a zero delta)
    new_total:    { type: 'integer' },
    at:           { type: 'string' },
    st_username:  { type: 'string', minLength: 1 },
    reason:       { type: 'string' },
  },
};
