export const ruleStatusFloorSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Status Floor',
  type: 'object',
  required: ['source', 'target_status_kind', 'target_status_name', 'floor_value'],
  additionalProperties: false,

  properties: {
    source:             { type: 'string', minLength: 1 },
    target_status_kind: { type: 'string', enum: ['covenant', 'city', 'clan'] },
    target_status_name: { type: 'string', minLength: 1 },
    floor_value:        { type: 'integer', minimum: 0 },
    notes:              { type: 'string' },
    created_at:         { type: 'string' },
    updated_at:         { type: 'string' },
  },
};
