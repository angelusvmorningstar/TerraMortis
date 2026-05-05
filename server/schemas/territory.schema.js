/**
 * JSON Schema (Draft-07) for TM Territory and Territory Residency.
 * Collections: territories, territory_residency
 *
 * ADR-002 contract: _id is the canonical FK. The legacy `id` field is renamed
 * to `slug` and demoted to a non-required, non-unique human-readable label.
 * territory_residency upsert key is `territory_id` (ObjectId-string), not the
 * territory name.
 */

export const territorySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory',
  type: 'object',
  // No universally-required field. The route layer enforces what it needs per
  // endpoint (POST without _id requires an insert; POST with _id requires the
  // doc to exist).
  additionalProperties: true,

  properties: {
    slug:            { type: 'string', minLength: 1 },
    name:            { type: 'string' },
    ambience:        { type: 'string' },
    regent_id:       { type: ['string', 'null'] },
    lieutenant_id:   { type: ['string', 'null'] },
    feeding_rights:  { type: 'array', items: { type: 'string' } },
    updated_at:      { type: 'string' },
  },
};

export const territoryResidencySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory Residency',
  type: 'object',
  required: ['territory_id', 'residents'],
  additionalProperties: true,

  properties: {
    territory_id: { type: 'string', minLength: 1 },
    residents:    { type: 'array', items: { type: 'string' } },
    updated_at:   { type: 'string' },
  },
};
