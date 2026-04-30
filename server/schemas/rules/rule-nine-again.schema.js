export const ruleNineAgainSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Nine Again',
  type: 'object',
  required: ['source', 'target_skills'],
  additionalProperties: false,

  properties: {
    source: { type: 'string', minLength: 1 },
    tier:   { type: 'integer', minimum: 1, maximum: 5 },
    // Either an array of skill name strings, or the sentinel 'asset_skills'
    // which tells the evaluator to use the source merit's asset_skills field.
    target_skills: {
      oneOf: [
        { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
        { type: 'string', const: 'asset_skills' },
      ],
    },
    notes:      { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};
