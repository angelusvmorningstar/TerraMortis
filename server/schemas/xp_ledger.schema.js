export const xpLedgerSchema = {
  type: 'object',
  required: ['character_id', 'category', 'trait_name', 'delta', 'new_total', 'at', 'st_username'],
  additionalProperties: false,
  properties: {
    character_id: { type: 'object' }, // ObjectId
    category:     { type: 'string', enum: ['attribute', 'skill', 'discipline', 'merit'] },
    trait_name:   { type: 'string', minLength: 1 },
    delta:        { type: 'integer' },
    new_total:    { type: 'integer' },
    at:           { type: 'string' },
    st_username:  { type: 'string', minLength: 1 },
    reason:       { type: 'string' },
  },
};
