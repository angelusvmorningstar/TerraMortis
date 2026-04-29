export const ruleDerivedStatModifierSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Derived Stat Modifier',
  type: 'object',
  required: ['source', 'target_stat', 'mode'],
  additionalProperties: false,

  properties: {
    source:      { type: 'string', minLength: 1 },
    target_stat: { type: 'string', enum: ['size', 'speed', 'defence', 'health', 'willpower_max'] },
    mode:        { type: 'string', enum: ['flat', 'rating', 'skill_swap'] },
    flat_amount: { type: 'integer' },
    swap_from:   { type: 'string' },
    swap_to:     { type: 'string' },
    notes:       { type: 'string' },
    created_at:  { type: 'string' },
    updated_at:  { type: 'string' },
  },
};
