/**
 * JSON Schema (Draft-07) for player-to-player contested roll requests.
 * Collection: contested_roll_requests
 *
 * Validated on POST (challenge creation). Status, outcome, timestamps
 * are set server-side and not included in this schema.
 */

export const contestedRollRequestSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Contested Roll Request',
  type: 'object',
  required: [
    'challenger_character_id',
    'challenger_character_name',
    'target_character_id',
    'target_character_name',
    'roll_type',
    'challenger_pool',
    'defender_pool',
  ],
  additionalProperties: false,
  properties: {
    challenger_character_id:   { type: 'string', minLength: 1 },
    challenger_character_name: { type: 'string', minLength: 1 },
    target_character_id:       { type: 'string', minLength: 1 },
    target_character_name:     { type: 'string', minLength: 1 },
    roll_type:    { type: 'string', enum: ['territory', 'social', 'resistance', 'custom'] },
    challenger_pool: { type: 'integer', minimum: 0, maximum: 30 },
    defender_pool:   { type: 'integer', minimum: 0, maximum: 30 },
    power_name:   { type: 'string' },
  },
};
