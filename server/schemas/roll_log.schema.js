/**
 * JSON Schema (Draft-07) for persisted player roll history (GDX-8, #989).
 * Collection: roll_log
 *
 * Validated on POST. `player_id` and `rolled_at` are set server-side and
 * deliberately NOT included here — player_id is derived from req.user
 * (never client-supplied, mirrors downtime.js's own player_id pattern),
 * rolled_at is stamped by the route as a real Date at write time (the TTL
 * index on this collection depends on that being a genuine BSON Date, not
 * an ISO string — see server/index.js's own roll_log TTL index comment for
 * why, and contested_roll_requests' own already-documented gotcha this
 * collection deliberately avoids repeating).
 */

export const rollLogSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Roll Log Entry',
  type: 'object',
  required: ['character_id', 'label', 'pool', 'results', 'successes'],
  additionalProperties: false,
  properties: {
    // Review fix (Blind Hunter + Edge Case Hunter, independently): the
    // original schema had no upper bounds on any string/array field —
    // an authenticated player POSTing for their own character could send
    // an arbitrarily large results array or arbitrarily long label/pool
    // text, stored verbatim and fanned out over WS to every ST/dev socket.
    // Bounds below are deliberately generous (well beyond any real roll —
    // the client-side pool builder caps a dice pool at 40) so no legitimate
    // roll is ever rejected; they exist only to put a ceiling on this.
    character_id: { type: 'string', minLength: 1 },
    label:        { type: 'string', minLength: 1, maxLength: 100 },
    pool:         { type: 'string', minLength: 1, maxLength: 100 },
    results:      { type: 'array', minItems: 1, maxItems: 100, items: { type: 'integer', minimum: 1, maximum: 10 } },
    successes:    { type: 'integer', minimum: 0, maximum: 500 },
    again_rule:   { type: ['string', 'null'], maxLength: 10 },
    rote:         { type: 'boolean' },
    wp_bonus:     { type: 'boolean' },
    vitae_spent: { type: 'integer', minimum: 0 },
    wp_spent:    { type: 'integer', minimum: 0 },
  },
};
