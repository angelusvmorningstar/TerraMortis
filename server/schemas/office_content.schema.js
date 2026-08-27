/**
 * JSON Schema (Draft-07) for TM Office Content.
 * Collection: office_content
 *
 * oxp.10 (split out of oxp.1, 2026-08-13) — migrate `OFFICE_DATA`/
 * `MERIT_DOT_CAPS` (`public/js/tabs/office-data.js`) off static JS, following
 * the same "reference data stops requiring a deploy" shape Epic BL already
 * proved out for bloodlines. Shape follows `bloodline.schema.js`: Draft-07,
 * explicit `required`, `additionalProperties: false`.
 *
 * **Locked scope decision (Angelus, 2026-08-27):** this migration is
 * READ-ONLY in TM Game, matching the bloodlines precedent exactly (ADMR-1 —
 * all write handlers retired from `server/routes/bloodlines.js`, ST authoring
 * moved entirely to TM Admin). This repo gets a schema (for the seed script's
 * own validation gate) and a `GET` route. No write route, no admin UI, no
 * admin CRUD screen anywhere in this repo. A future, separate TM Admin story
 * adds ST-editable authoring against this same shared collection.
 *
 * **Two document shapes share this one collection, discriminated by `kind`**:
 *
 *   - `kind: 'office'` — one per office CATEGORY (not per seat; Primogen and
 *     Socialite each carry two concurrent seats per oxp-11, but share one
 *     content document). `category`'s enum is the FULL 5-value
 *     `office_seat.schema.js`'s own `OFFICE_CATEGORY_ENUM`, including
 *     'Administrator' — matching it exactly (AC1). Exactly 4 real documents
 *     exist today (Head of State, Primogen, Socialite, Enforcer);
 *     Administrator is a real, filled seat with NO content document until
 *     oxp-8 authors it. That absence is enforced by this migration's seed
 *     script simply never producing an Administrator document (`OFFICE_DATA`
 *     has no such key) — deliberately NOT by narrowing this enum, which
 *     would force oxp-8 (explicitly "not app code, no code dependency" per
 *     the epic doc) into a TM Game code deploy just to widen it. Every
 *     reader of this collection MUST treat "no document for this category"
 *     as a normal, valid state — see `server/lib/office-seat-resolve.js`'s
 *     own docstring for the existing "seat's office has no rules -> 400
 *     VALIDATION_ERROR, not a crash" convention this migration preserves,
 *     not introduces.
 *   - `kind: 'merit_caps'` — exactly ONE document, `MERIT_DOT_CAPS`'s flat
 *     merit-name -> dot-cap map (10 entries as of this migration — not fixed
 *     at any particular count; the schema itself imposes no cardinality).
 *     Not per-office (the same merit name has the same cap wherever it
 *     appears), so it doesn't fit the per-category shape above. Modelled as
 *     a single well-known document rather than its own per-merit
 *     collection, mirroring this repo's own `app_settings` collection
 *     (`_id: 'global'`, one flat config document) — the closer real
 *     precedent for "a small, rarely-changing, non-per-entity flat map"
 *     than treating each merit name as its own entity.
 *
 * A single `oneOf`-discriminated schema (rather than two files) so the seed
 * script and any future reader validate every document in this collection
 * through one `ajv.compile(officeContentSchema)` call, matching how this
 * collection is actually queried (one `find({})`, both kinds together).
 */

import { OFFICE_CATEGORY_ENUM } from './office_seat.schema.js';

const officeDoc = {
  type: 'object',
  required: ['kind', 'category', 'asset', 'style', 'merits', 'manoeuvres', 'statusPower'],
  additionalProperties: false,
  properties: {
    _id: {},
    kind: { const: 'office' },
    // The FULL 5-value OFFICE_CATEGORY_ENUM, including 'Administrator' —
    // matching it "exactly" is AC1's own literal wording (oxp-10). Codex
    // review, oxp-10 (Medium): an earlier draft filtered Administrator out
    // of this enum specifically to keep a malformed placeholder from
    // validating, but that would make oxp-8 (Administrator content
    // authoring, explicitly "not app code, no code dependency" per the
    // epic doc) require a TM Game code deploy to widen this schema before a
    // real document could ever be written — contradicting the epic's own
    // constraint on that story. "No Administrator document exists yet" is
    // enforced by this migration's seed script simply never producing one
    // (OFFICE_DATA has no Administrator key), not by the schema refusing to
    // admit the category as a legal value.
    category: { type: 'string', enum: OFFICE_CATEGORY_ENUM },
    asset: { type: 'string', minLength: 1 },
    style: { type: 'string', minLength: 1 },
    // Merit NAMES only, not embedded cap values — dot caps live in the
    // separate merit_caps document (a merit's cap does not vary by which
    // office grants it). Cross-referenced against merit_caps by the seed
    // script's integrity gate, not enforced here (an unlisted merit
    // legitimately defaults to a cap of 5 — see MERIT_DOT_CAPS's own
    // existing `|| 5` fallback convention, preserved by every repointed
    // consumer, not re-litigated by this schema).
    merits: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    // ORDER-PRESERVING. office-manoeuvre-rank.js's own "rank" is a graduated
    // integer whose meaning IS the array index into this list — see that
    // file's own comment. A migration that reorders this array silently
    // changes what a stored rank grants. minItems: 1 because every real
    // office has at least one manoeuvre; uniqueItems on name is enforced by
    // the integrity gate (a schema-level check here can't compare only the
    // `name` sub-field without a much heavier keyword).
    manoeuvres: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'effect'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          effect: { type: 'string', minLength: 1 },
        },
      },
    },
    statusPower: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

const meritCapsDoc = {
  type: 'object',
  required: ['kind', 'caps'],
  additionalProperties: false,
  properties: {
    _id: {},
    kind: { const: 'merit_caps' },
    // Flat merit-name -> dot-cap map. Deliberately not a fixed enum of merit
    // names here (that would put the merit list itself back behind a
    // deploy) — the seed script's integrity gate checks internal
    // consistency (positive integers, no empty keys) instead.
    caps: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'integer', minimum: 1 },
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

export const officeContentSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Office Content',
  oneOf: [officeDoc, meritCapsDoc],
};
