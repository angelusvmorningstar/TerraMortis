/**
 * JSON Schema for the POST body of /api/office_purchase_requests (oxp.9).
 *
 * Mirrors humanity_check_request.schema.js's shape: a REQUEST-BODY schema for
 * one route, not a document schema for the whole `contested_roll_requests`
 * collection (which carries four discriminated shapes side by side and has no
 * MongoDB collection-level $jsonSchema validator — re-verified by grep at
 * oxp.9 dev time, as gdx.12 verified it before that).
 *
 * THE `title` IS LOAD-BEARING, NOT DECORATION. server/middleware/validate.js
 * caches compiled Ajv validators keyed by `schema.title`, so a title-less
 * schema compiles under cache key `undefined` and silently collides with
 * `office_action.schema.js` (still title-less). gdx.12 lost real debugging
 * time to exactly that — every POST to its new route was validated against
 * officeActionSchema instead, surfacing as an unexplained 400 on a
 * schema-valid payload. Do not remove it, and do not add a title-less schema
 * to this directory.
 */
export const officePurchaseRequestSchema = {
  title: 'TM Office Purchase Request',
  type: 'object',
  required: ['seat_id', 'purchase_kind'],
  additionalProperties: false,
  properties: {
    // The office SEAT the purchase is against (`office_seats._id` as 24-hex).
    // Case-insensitive here; resolveOfficeSeat normalises it to lower case,
    // and the NORMALISED form is what gets stored on the pending record, so a
    // later accept cannot mint a second purchase document for the same seat.
    seat_id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },

    // One request buys exactly one dot: one merit dot, or the next manoeuvre
    // rank. Batch purchases are deliberately out of scope — one dot per
    // request is what makes the accept-time budget check a single,
    // unambiguous `left >= 1` question.
    purchase_kind: { type: 'string', enum: ['merit', 'manoeuvre'] },

    // Optional at the schema layer, conditionally required at the route:
    // required when purchase_kind === 'merit', rejected (400) when supplied
    // for a manoeuvre request. Ajv's `if`/`then` could express that, but the
    // route already owns every other purchase-validity rule (the merit must
    // belong to THIS office, and be below ITS cap) and splitting one rule
    // across two layers is how the two drift.
    merit: { type: ['string', 'null'] },
  },
};
