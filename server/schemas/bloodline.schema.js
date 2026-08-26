/**
 * JSON Schema (Draft-07) for a TM Bloodline.
 * Collection: bloodlines
 *
 * Epic BL (issue #1008) — "migrate bloodlines to MongoDB so they can be added
 * without a deploy". Shape follows `equipment_catalogue.schema.js`: Draft-07,
 * `_id: {}`, explicit `required`, `additionalProperties: false`.
 *
 * Two constraints here are deliberate rulings, not descriptions of the data
 * as it happens to be today (Angelus, 2026-08-10):
 *
 *   1. `disciplines` is EXACTLY four. Four disciplines is a rule of the game.
 *      A three-discipline bloodline is invalid, not a draft — which is why
 *      BL-4's admin CRUD will have no partial-save.
 *   2. `name` is the canonical key. `characters.bloodline` stays a plain name
 *      string matched against it, deliberately NOT an ObjectId FK — see drift
 *      pattern #2 in D:\Terra Mortis\data-map.md, which has bitten this
 *      ecosystem four times. The seed script puts a unique index on `name`.
 *
 * `slug` is a stable kebab id reserved for future internal joins. Nothing
 * reads it yet and nothing may start to before it has a consumer.
 *
 * Bane / gift modelling is deliberately absent: no bloodline has one, and a
 * field with no data rots.
 */

import { CLAN_NAMES } from './character.schema.js';

export const bloodlineSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Bloodline',
  type: 'object',
  required: ['name', 'slug', 'clan', 'disciplines'],
  additionalProperties: false,

  properties: {
    // MongoDB _id — injected on insert, present on read.
    _id: {},

    // ── Identity ──
    // `name` is the canonical key, matched by `characters.bloodline`.
    name: { type: 'string', minLength: 1 },
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },

    // Parent clan. Reuses the character schema's five-clan list by import so
    // the two cannot drift; unlike `characters.clan` it admits no '' or null.
    clan: { type: 'string', enum: CLAN_NAMES },

    // Exactly four, each a non-empty name, no repeats. See the header note —
    // the count is a game rule, and without minLength/uniqueItems a document
    // like ['Auspex', 'Auspex', '', ' '] would satisfy it while granting one
    // real discipline. The names themselves are checked against CORE_DISCS +
    // RITUAL_DISCS by the seed script's integrity gate rather than by an enum
    // here, so adding a discipline to the game stays a data change.
    disciplines: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      uniqueItems: true,
      items: { type: 'string', minLength: 1 },
    },

    // NOTE: there is deliberately no `active` / soft-retire field. BL-1 shipped
    // one; it was removed 2026-08-10 when Angelus ruled that a bloodline cannot
    // be retired — they are permanent. A boolean that can only ever hold one
    // value is a claim the code cannot keep, the same reasoning that deferred
    // banes and kept the WS broadcast out of BL-1. If that rule ever changes,
    // adding the field back is a one-line schema edit plus a trivial migration
    // over ~23 documents.

    // ST bookkeeping, NOT player-facing flavour (ruled 2026-08-10). The public
    // reads in routes/bloodlines.js project it out; BL-4 adds an ST-gated read
    // that includes it. If bloodlines ever need player-visible flavour text,
    // that is a separate `description` field, as the equipment catalogue has.
    notes: { type: ['string', 'null'] },

    // ── Audit-light metadata, as ECM does ──
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

// ADMR-1 (2026-08-26): BLOODLINE_UPDATABLE_FIELDS (the PATCH allowlist, BL-4
// #1008) removed - its only consumer was server/routes/bloodlines.js's own
// PATCH handler, retired to TM Admin along with the rest of the write API.
// bloodlineSchema above stays: it is still an executable validation gate for
// server/scripts/archive/seed-bloodlines.js's real (if rare) --apply runs,
// confirmed via ajv.compile(bloodlineSchema) in that script, not merely
// documentation.
