export const ruleGrantSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Grant',
  type: 'object',
  required: ['source', 'grant_type', 'target', 'amount', 'amount_basis'],
  additionalProperties: false,

  properties: {
    source:           { type: 'string', minLength: 1 },
    tier:             { type: 'integer', minimum: 1, maximum: 5 },
    condition:        { type: 'string', enum: ['always', 'tier', 'choice', 'pact_present'] },
    grant_type:       { type: 'string', enum: ['merit', 'pool'] },
    target:           { type: 'string', minLength: 1 },
    target_qualifier: { type: 'string' },
    amount:           { type: 'integer', minimum: 0 },
    amount_basis: {
      type: 'string',
      enum: ['flat', 'rating_of_source', 'rating_of_partner_merit'],
    },
    read_refs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'name'],
        additionalProperties: false,
        properties: {
          kind:      { type: 'string', enum: ['attribute', 'skill', 'merit', 'discipline', 'derived_stat'] },
          name:      { type: 'string', minLength: 1 },
          predicate: { type: 'string' },
          value:     { type: 'number' },
        },
      },
    },
    notes:      { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};
