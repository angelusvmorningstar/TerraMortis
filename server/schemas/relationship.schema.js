/**
 * JSON Schema (Draft-07) for TM NPC/PC Relationship edges.
 * Collection: relationships
 *
 * An edge connects two endpoints {type, id}. Endpoint identity collision
 * (same type AND id on both sides) is rejected by the route handler,
 * not by this schema.
 *
 * History is append-only; the route handler writes each row, never
 * the client. Each history row records one mutation with an array of
 * per-field {name, before, after} deltas.
 *
 * kind='other' requires a non-empty custom_label — enforced at the
 * route layer (the schema allows custom_label for any kind).
 */

export const KIND_ENUM = [
  'sire', 'childe', 'grand-sire', 'clan-mate',
  'coterie', 'ally', 'rival', 'enemy', 'mentor', 'debt-holder', 'debt-bearer',
  'touchstone', 'family', 'contact', 'retainer', 'correspondent', 'romantic',
  'other',
];

export const DIRECTION_ENUM = ['a_to_b', 'mutual'];

export const DISPOSITION_ENUM = ['positive', 'neutral', 'negative'];

export const STATUS_ENUM = ['active', 'retired', 'pending_confirmation', 'rejected'];

export const ENDPOINT_TYPE_ENUM = ['pc', 'npc'];

const endpointSchema = {
  type: 'object',
  required: ['type', 'id'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ENDPOINT_TYPE_ENUM },
    id:   { type: 'string', minLength: 1 },
  },
};

const actorSchema = {
  type: 'object',
  required: ['type', 'id'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['st', 'player'] },
    id:   { type: 'string', minLength: 1 },
  },
};

const fieldDeltaSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name:   { type: 'string' },
    before: {},
    after:  {},
  },
};

const historyItemSchema = {
  type: 'object',
  required: ['at', 'by', 'change'],
  additionalProperties: false,
  properties: {
    at:     { type: 'string' },
    by:     actorSchema,
    change: { type: 'string' },
    fields: { type: 'array', items: fieldDeltaSchema },
  },
};

export const relationshipSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title:   'TM Relationship',
  type:    'object',
  required: ['a', 'b', 'kind'],
  additionalProperties: false,

  properties: {
    _id:          { type: 'string' },
    a:            endpointSchema,
    b:            endpointSchema,
    kind:         { type: 'string', enum: KIND_ENUM },
    custom_label: { type: 'string', maxLength: 200 },
    direction:    { type: 'string', enum: DIRECTION_ENUM },
    // disposition: string enum for setting; null to clear (route $unsets on null).
    disposition:  { oneOf: [{ type: 'string', enum: DISPOSITION_ENUM }, { type: 'null' }] },
    state:        { type: 'string', maxLength: 4000 },
    st_hidden:    { type: 'boolean' },
    status:       { type: 'string', enum: STATUS_ENUM },
    created_by:   actorSchema,
    history:      { type: 'array', items: historyItemSchema },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
  },
};
