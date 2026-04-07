/**
 * JSON Schema (Draft-07) for TM Session Log.
 * Collection: session_logs
 *
 * ST narrative entries for a game session — notes, mechanics, story beats.
 */

export const sessionLogSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Session Log',
  type: 'object',
  required: ['session_date'],
  additionalProperties: true,

  properties: {
    session_date:  { type: 'string', minLength: 1 },
    entry_type:    { type: 'string' },
    character_id:  { type: ['string', 'null'] },
    title:         { type: 'string' },
    notes:         { type: 'string' },
    created_at:    { type: 'string' },
  },
};
