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
    chapter_number:   { type: 'integer', minimum: 1 },
    chapter_label:    { type: 'string' },
    // CM-6 (folded into cm-4, cycle-model.md §11a step 6): the enforced link from a session to
    // the Chapter it belongs to. Nullable; the invariant is 1:1 where set, and that is enforced
    // by a PARTIAL UNIQUE INDEX (unique where not null) rather than by convention - created at
    // boot in server/index.js and by cm-4-renumber-chapter-merge.mjs's own --apply.
    // Typed as a string here because this schema validates the JSON request BODY, where an
    // ObjectId arrives as its 24-character hex form; the migration itself writes a real ObjectId.
    // The `pattern` is load-bearing, not decoration (cm-4 review, 2026-08-17): a free-form string
    // here would be stored verbatim, and the partial unique index treats a string and an ObjectId
    // as DISTINCT keys, so a junk value would sit inside the index and quietly weaken the 1:1
    // constraint. The route coerces every accepted value to a real ObjectId before storage - see
    // `coerceChapterId` in server/routes/game-sessions.js.
    chapter_id:       { type: ['string', 'null'], pattern: '^[0-9a-fA-F]{24}$' },
    doors_open:       { type: 'string' },
    downtime_deadline:{ type: 'string' },
    // FIN-7: single per-session door fee. Paid attendance rows mirror this
    // value into payment.amount at write time.
    session_rate:     { type: 'number', minimum: 0 },
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
          // Legacy fields (kept for back-compat; use `payment` object going forward)
          paid:              { type: 'boolean' },
          payment_method:    { type: 'string' },
          // fin.2: structured payment record
          payment: {
            type: 'object',
            properties: {
              method: {
                type: 'string',
                enum: ['cash', 'payid', 'paypal', 'transfer', 'exiles', 'waived', ''],
              },
              amount: { type: 'number', minimum: 0 },
              note:   { type: ['string', 'null'] },
            },
          },
        },
        additionalProperties: true,
      },
    },

    // fin.2: game-level finance — line-item expenses + transfers
    finances: {
      type: 'object',
      properties: {
        expenses: {
          type: 'array',
          items: {
            type: 'object',
            required: ['category', 'amount'],
            properties: {
              category:  { type: 'string' },
              amount:    { type: 'number' },
              date:      { type: ['string', 'null'] },
              proof_url: { type: ['string', 'null'] },
              note:      { type: ['string', 'null'] },
            },
          },
        },
        transfers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['to', 'amount'],
            properties: {
              to:        { type: 'string' },
              amount:    { type: 'number' },
              date:      { type: ['string', 'null'] },
              proof_url: { type: ['string', 'null'] },
            },
          },
        },
        notes: { type: ['string', 'null'] },
      },
    },
  },
};
