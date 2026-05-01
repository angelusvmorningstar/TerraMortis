export const ruleSkillBonusSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Skill Bonus',
  type: 'object',
  required: ['source', 'target_skill', 'amount'],
  additionalProperties: false,

  properties: {
    source:       { type: 'string', minLength: 1 },
    tier:         { type: 'integer', minimum: 1, maximum: 5 },
    target_skill: { type: 'string', minLength: 1 },
    amount:       { type: 'integer', minimum: 1, maximum: 2 },
    cap_at:       { type: 'integer', minimum: 1 },
    notes:        { type: 'string' },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
  },
};
