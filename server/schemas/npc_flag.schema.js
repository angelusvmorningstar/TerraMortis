/**
 * JSON Schema (Draft-07) for TM NPC flags.
 * Collection: npc_flags
 *
 * A flag is a player-to-ST signal of concern about an NPC. Created only
 * by players (AC: ST never POSTs, they only resolve). Uniqueness is per
 * (character, npc) pair — a player with two PCs can flag the same NPC
 * twice, once per character.
 *
 * Schema enforces structure; the route enforces:
 *  - player-only POST
 *  - flagger must own the `flagged_by.character_id`
 *  - flagger's character must have an active relationship edge to the NPC
 *  - no duplicate open flag for the same (character_id, npc_id)
 */

export const STATUS_ENUM = ['open', 'resolved'];

const flaggedBySchema = {
  type: 'object',
  required: ['player_id', 'character_id'],
  additionalProperties: false,
  properties: {
    player_id:    { type: 'string', minLength: 1 },
    character_id: { type: 'string', minLength: 1 },
  },
};

const resolvedBySchema = {
  type: 'object',
  required: ['type', 'id'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['st'] },
    id:   { type: 'string', minLength: 1 },
  },
};

export const npcFlagSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title:   'TM NPC Flag',
  type:    'object',
  required: ['npc_id', 'flagged_by', 'reason'],
  additionalProperties: false,
  properties: {
    _id:             { type: 'string' },
    npc_id:          { type: 'string', minLength: 1 },
    flagged_by:      flaggedBySchema,
    reason:          { type: 'string', minLength: 1, maxLength: 2000 },
    status:          { type: 'string', enum: STATUS_ENUM },
    resolved_by:     resolvedBySchema,
    resolved_at:     { type: 'string' },
    resolution_note: { type: 'string', maxLength: 2000 },
    created_at:      { type: 'string' },
  },
};
