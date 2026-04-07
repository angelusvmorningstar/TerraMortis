/**
 * JSON Schema (Draft-07) for TM Territory and Territory Residency.
 * Collections: territories, territory_residency
 */

export const territorySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory',
  type: 'object',
  required: ['id'],
  additionalProperties: true,

  properties: {
    id:              { type: 'string', minLength: 1 },
    name:            { type: 'string' },
    ambience:        { type: 'string' },
    regent:          { type: ['string', 'null'] },
    lieutenant:      { type: ['string', 'null'] },
    feeding_rights:  { type: 'array', items: { type: 'string' } },
    updated_at:      { type: 'string' },
  },
};

export const territoryResidencySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory Residency',
  type: 'object',
  required: ['territory', 'residents'],
  additionalProperties: true,

  properties: {
    territory:  { type: 'string', minLength: 1 },
    residents:  { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
  },
};
