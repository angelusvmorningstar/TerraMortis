/**
 * JSON Schema (Draft-07) for TM Tickets, Archive Documents, and Tracker State.
 * Collections: tickets, archive_documents, tracker_state
 */

export const ticketSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Ticket',
  type: 'object',
  required: ['title', 'type'],
  additionalProperties: true,

  properties: {
    title:        { type: 'string', minLength: 1 },
    body:         { type: 'string' },
    type:         { type: 'string', enum: ['bug', 'feature', 'question', 'sheet', 'other'] },
    player_id:    { type: 'string' },
    submitted_by: { type: 'string' },
    status:       { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
    priority:     { type: 'string', enum: ['normal', 'high'] },
    st_note:      { type: 'string' },
    created_at:   { type: 'string' },
    resolved_at:  { type: ['string', 'null'] },
  },
};

export const archiveDocumentSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Archive Document',
  type: 'object',
  required: ['type'],
  additionalProperties: true,

  properties: {
    character_id:      { type: ['string', 'null'] },
    type:              { type: 'string', minLength: 1 },
    cycle:             { type: ['integer', 'null'] },
    title:             { type: 'string' },
    content_html:      { type: 'string' },
    visible_to_player: { type: 'boolean' },
    created_at:        { type: 'string' },
    updated_at:        { type: ['string', 'null'] },
  },
};

export const trackerStateSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Tracker State',
  type: 'object',
  required: ['character_id'],
  additionalProperties: true,

  properties: {
    character_id: { type: 'string', minLength: 1 },
    health:       { type: 'integer', minimum: 0 },
    vitae:        { type: 'integer', minimum: 0 },
    wp:           { type: 'integer', minimum: 0 },
    inf:          { type: 'integer', minimum: 0 },
  },
};
