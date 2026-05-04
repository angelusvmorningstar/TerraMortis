export const ruleGrantSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Grant',
  type: 'object',
  // Universally required. Per-grant_type extras are enforced via allOf below.
  required: ['source', 'grant_type', 'amount_basis'],
  additionalProperties: false,

  properties: {
    source:               { type: 'string', minLength: 1 },
    tier:                 { type: 'integer', minimum: 1, maximum: 5 },
    condition:            { type: 'string', enum: ['always', 'tier', 'choice', 'pact_present', 'bloodline', 'fighting_style_present'] },
    grant_type:           { type: 'string', enum: ['merit', 'pool', 'speciality', 'auto_bonus', 'status_floor', 'style_pool'] },
    target:               { type: 'string', minLength: 1 },
    target_field:         { type: 'string', minLength: 1 },
    target_qualifier:     { type: 'string' },
    target_category:      { type: 'string' },
    bloodline_name:       { type: 'string' },
    amount:               { type: 'integer', minimum: 0 },
    amount_basis:         { type: 'string', enum: ['flat', 'rating_of_source', 'rating_of_partner_merit', 'rating_of_status'] },
    pool_targets:         { type: 'array', items: { type: 'string', minLength: 1 } },
    partner_merit_names:  { type: 'array', items: { type: 'string', minLength: 1 } },
    partner_status_names: { type: 'array', items: { type: 'string', minLength: 1 } },
    auto_create:          { type: 'boolean' },
    sphere_source:        { type: 'string' },
    choice_field:         { type: 'string' },
    excluded_choice:      { type: 'string' },
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

  allOf: [
    {
      if:   { properties: { grant_type: { const: 'pool' } }, required: ['grant_type'] },
      then: { required: ['pool_targets'] },
    },
    {
      if:   { properties: { grant_type: { const: 'auto_bonus' } }, required: ['grant_type'] },
      then: { required: ['target', 'target_field'] },
    },
    {
      if:   { properties: { grant_type: { enum: ['merit', 'speciality', 'status_floor', 'style_pool'] } }, required: ['grant_type'] },
      then: { required: ['target', 'amount'] },
    },
  ],
};
