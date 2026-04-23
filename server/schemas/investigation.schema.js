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
    status:              { type: 'string', enum: ['active', 'inactive', 'destroyed', 'pending', 'archived'] },
    linked_character_ids:{ type: 'array', items: { type: 'string' } },
    linked_cycle_id:     { type: ['string', 'null'] },
    notes:               { type: 'string' },
    // DTOSL.1: ST-managed flag marking an NPC as available in the
    // Personal Story "Correspondence" dropdown on the DT form.
    is_correspondent:    { type: 'boolean' },
    // DTOSL.3: per-character list of character IDs for which this NPC
    // has been ST-suggested. Players see Confirm/Reject on their DT form.
    st_suggested_for:    { type: 'array', items: { type: 'string' } },
    // DTOSL.5: populated when a player creates an NPC via the quick-add
    // endpoint; ST reviews and promotes to status:'active'.
    created_by: {
      type: 'object',
      additionalProperties: true,
      properties: {
        type:         { type: 'string', enum: ['player', 'st'] },
        player_id:    { type: ['string', 'null'] },
        character_id: { type: ['string', 'null'] },
      },
    },
    created_at:          { type: 'string' },
    updated_at:          { type: 'string' },
  },
};
