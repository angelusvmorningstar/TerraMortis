/**
 * JSON Schema (Draft-07) for TM Game Session.
 * Collection: game_sessions
 *
 * Each session has a date, optional metadata, and an attendance array
 * where each entry tracks a character's presence, costuming, downtime
 * completion, extra XP, and payment status.
 *
 * Game XP per character = attended(1) + costuming(1) + downtime(1) + extra(n)
 */

export const gameSessionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Game Session',
  type: 'object',
  required: ['session_date'],
  additionalProperties: true,

  properties: {
    session_date:     { type: 'string', minLength: 1 },
    title:            { type: 'string' },
    game_number:      { type: 'integer', minimum: 1 },
    doors_open:       { type: 'string' },
    downtime_deadline:{ type: 'string' },
    created_at:       { type: 'string' },
    updated_at:       { type: 'string' },

    attendance: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character_id:      { type: 'string' },
          character_name:    { type: 'string' },
          character_display: { type: 'string' },
          display_name:      { type: 'string' },
          name:              { type: 'string' },
          player:            { type: 'string' },
          attended:          { type: 'boolean' },
          costuming:         { type: 'boolean' },
          downtime:          { type: 'boolean' },
          extra:             { type: 'number', minimum: 0 },
          paid:              { type: 'boolean' },
          payment_method:    { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  },
};
