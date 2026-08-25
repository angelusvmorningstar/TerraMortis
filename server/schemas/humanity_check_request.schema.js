export const humanityCheckRequestSchema = {
  title: 'TM Humanity Check Request',
  type: 'object',
  required: ['character_id'],
  additionalProperties: false,
  properties: {
    character_id: { type: 'string', minLength: 1 },
  },
};
