/**
 * JSON Schema (Draft-07) for TM Player.
 * Collection: players
 *
 * Players are Discord-linked accounts that own characters.
 * Created by STs via admin panel or auto-linked during Discord OAuth.
 */

export const playerSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Player',
  type: 'object',
  required: ['display_name'],
  additionalProperties: true,

  properties: {
    display_name:       { type: 'string', minLength: 1 },
    discord_id:         { type: ['string', 'null'] },
    discord_username:   { type: ['string', 'null'] },
    discord_global_name:{ type: ['string', 'null'] },
    discord_avatar:     { type: ['string', 'null'] },
    role:             { type: 'string', enum: ['player', 'st', 'dev'], default: 'player' },
    character_ids:    { type: 'array', items: { type: 'string' } },
    ordeals:          { type: 'object', additionalProperties: true },
    created_at:       { type: 'string' },
    last_login:       { type: ['string', 'null'] },
  },
};
