/**
 * JSON Schema (Draft-07) for TM Downtime Investigation and NPC.
 * Collections: downtime_investigations, npcs
 */

const thresholdTypeEnum = [
  'public_identity', 'hidden_identity', 'private_activity',
  'haven', 'touchstone', 'bloodline'
];

export const investigationSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Downtime Investigation',
  type: 'object',
  required: ['target_description'],
  additionalProperties: true,

  properties: {
    target_description:       { type: 'string', minLength: 1 },
    threshold_type:           { type: 'string', enum: thresholdTypeEnum },
    threshold:                { type: 'integer', minimum: 1 },
    investigating_character_id: { type: ['string', 'null'] },
    cycle_id:                 { type: ['string', 'null'] },
    successes_accumulated:    { type: 'integer', minimum: 0 },
    status:                   { type: 'string', enum: ['active', 'resolved', 'abandoned'] },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text:     { type: 'string' },
          added_at: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

export const npcSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM NPC',
  type: 'object',
  required: ['name'],
  additionalProperties: true,

  properties: {
    name:                { type: 'string', minLength: 1 },
    description:         { type: 'string' },
    status:              { type: 'string', enum: ['active', 'inactive', 'destroyed'] },
    linked_character_ids:{ type: 'array', items: { type: 'string' } },
    linked_cycle_id:     { type: ['string', 'null'] },
    notes:               { type: 'string' },
    created_at:          { type: 'string' },
    updated_at:          { type: 'string' },
  },
};
