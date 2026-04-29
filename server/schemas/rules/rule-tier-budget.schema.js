export const ruleTierBudgetSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Tier Budget',
  type: 'object',
  required: ['source', 'budgets'],
  additionalProperties: false,

  properties: {
    source: { type: 'string', minLength: 1 },
    // index 0 is unused (kept for 1-indexed clarity); length >= 2 required
    budgets: {
      type: 'array',
      items: { type: 'integer', minimum: 0 },
      minItems: 2,
    },
    notes:      { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};
