export const ruleSpecialityGrantSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Speciality Grant',
  type: 'object',
  required: ['source', 'target_skill', 'spec'],
  additionalProperties: false,

  properties: {
    source:       { type: 'string', minLength: 1 },
    tier:         { type: 'integer', minimum: 1, maximum: 5 },
    condition:    { type: 'string', enum: ['always', 'tier', 'choice', 'pact_present'] },
    target_skill: { type: 'string', minLength: 1 },
    spec:         { type: 'string', minLength: 1 },
    notes:        { type: 'string' },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
  },
};
