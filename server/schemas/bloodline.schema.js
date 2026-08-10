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

    // Soft-retire rather than delete, so historical characters keep resolving.
    active: { type: 'boolean' },
    notes: { type: ['string', 'null'] },

    // ── Audit-light metadata, as ECM does ──
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};
