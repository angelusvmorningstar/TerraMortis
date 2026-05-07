/**
 * JSON Schema (Draft-07) for TM Territory.
 * Collection: territories
 *
 * ADR-002 contract: _id is the canonical FK. The legacy `id` field is renamed
 * to `slug` and demoted to a non-required, non-unique human-readable label.
 *
 * Strict cutover (issue #33, 2026-05-07): `additionalProperties: false`. Any
 * body containing fields outside this canonical set is rejected with
 * `VALIDATION_ERROR`. This closes the silent-accept window that produced 5
 * duplicate territories on 2026-05-05 when a stale browser session posted
 * bodies carrying the retired `id` field.
 *
 * Canonical post-ADR-002 fieldset (per issue #33 spec):
 *   _id, slug, name, ambience, ambienceMod, regent_id, lieutenant_id,
 *   feeding_rights, updated_at
 */

export const territorySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory',
  type: 'object',
  // No universally-required field. The route layer enforces what it needs per
  // endpoint (POST without _id requires an insert; POST with _id requires the
  // doc to exist).
  additionalProperties: false,

  properties: {
    _id:             { type: 'string', minLength: 1 },
    slug:            { type: 'string', minLength: 1 },
    name:            { type: 'string' },
    ambience:        { type: 'string' },
    ambienceMod:     { type: 'number' },
    regent_id:       { type: ['string', 'null'] },
    lieutenant_id:   { type: ['string', 'null'] },
    feeding_rights:  { type: 'array', items: { type: 'string' } },
    updated_at:      { type: 'string' },
  },
};
