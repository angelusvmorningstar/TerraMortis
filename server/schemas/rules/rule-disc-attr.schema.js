export const ruleDiscAttrSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Disc Attr',
  type: 'object',
  required: ['discipline', 'target_kind', 'target_name', 'amount_basis'],
  additionalProperties: false,

  properties: {
    discipline:   { type: 'string', minLength: 1 },
    target_kind:  { type: 'string', enum: ['attribute', 'derived_stat'] },
    target_name:  { type: 'string', minLength: 1 },
    amount_basis: { type: 'string', enum: ['rating', 'flat'] },
    flat_amount:  { type: 'integer' },
    notes:        { type: 'string' },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
  },
};
