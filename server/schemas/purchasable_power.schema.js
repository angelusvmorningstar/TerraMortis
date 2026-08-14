/**
 * JSON Schema (Draft-07) for TM Purchasable Power.
 * Collection: purchasable_powers
 *
 * Unified schema for all XP-purchasable game elements:
 * attributes, skills, disciplines, merits, devotions, rites, manoeuvres.
 *
 * XP cost is NOT stored — calculated at runtime from character context.
 * Exception: devotions have a fixed intrinsic cost in xp_fixed.
 *
 * Prerequisites use composable JSON Logic trees with all/any combinators.
 * Labels are derived at render time, not stored.
 */

const categoryEnum = [
  'attribute', 'skill', 'discipline', 'merit', 'devotion', 'rite', 'manoeuvre'
];

// Recursive prereq tree definition.
// Leaf: { type, name, dots?, qualifier?, max? }
// Combinator: { all: [...] } or { any: [...] }
const prereqLeaf = {
  type: 'object',
  properties: {
    type:      { type: 'string' },
    name:      { type: 'string' },
    dots:      { type: 'integer', minimum: 0 },
    qualifier: { type: 'string' },
    max:       { type: 'integer', minimum: 0 },
  },
  required: ['type'],
  additionalProperties: false,
};

// Note: JSON Schema Draft-07 doesn't support true recursion natively.
// We define up to 3 nesting levels which covers all known prereq patterns.
const prereqNode = {
  oneOf: [
    prereqLeaf,
    {
      type: 'object',
      properties: {
        all: { type: 'array', items: { oneOf: [prereqLeaf, {
          type: 'object',
          properties: {
            all: { type: 'array', items: prereqLeaf },
            any: { type: 'array', items: prereqLeaf },
          },
          additionalProperties: false,
        }] } },
        any: { type: 'array', items: { oneOf: [prereqLeaf, {
          type: 'object',
          properties: {
            all: { type: 'array', items: prereqLeaf },
            any: { type: 'array', items: prereqLeaf },
          },
          additionalProperties: false,
        }] } },
      },
      additionalProperties: false,
    },
  ],
};

export const purchasablePowerSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Purchasable Power',
  type: 'object',
  required: ['key', 'name', 'category'],
  additionalProperties: false,

  properties: {
    // MongoDB _id (injected on insert, present on read)
    _id: {},

    // Identity
    key:       { type: 'string', minLength: 1, pattern: '^[a-z0-9][a-z0-9-]*$' },
    name:      { type: 'string', minLength: 1 },
    category:  { type: 'string', enum: categoryEnum },

    // Classification
    parent:       { type: ['string', 'null'] },
    rank:         { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    rating_range: {
      oneOf: [
        { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
        { type: 'null' },
      ],
    },

    // Mechanics
    description: { type: 'string' },
    // Issue #992: full rulebook text uplift. Optional — populated by
    // server/scripts/uplift-power-rules-text.js. `description` (above)
    // remains the untouched one-line summary; `rules_text` is the full
    // parsed rules body, `rules_source` records provenance (e.g.
    // "VtR 2e Rulebook" or "VtR 2e Rulebook + TM Errata").
    rules_text:   { type: 'string' },
    rules_source: { type: 'string' },
    pool: {
      oneOf: [
        {
          type: 'object',
          properties: {
            attr:  { type: ['string', 'null'] },
            skill: { type: ['string', 'null'] },
            disc:  { type: ['string', 'null'] },
          },
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
    resistance: { type: ['string', 'null'] },
    cost:       { type: ['string', 'null'] },
    action:     { type: ['string', 'null'] },
    duration:   { type: ['string', 'null'] },

    // Prerequisites
    prereq: {
      oneOf: [
        prereqNode,
        { type: 'null' },
      ],
    },
    exclusive: { type: ['string', 'null'] },

    // Sub-category: merits use general/influence/domain/standing; other categories use null or a free string
    sub_category: { type: ['string', 'null'] },

    // Cost & metadata
    xp_fixed:  { type: ['integer', 'null'], minimum: 0 },
    bloodline: { type: ['string', 'null'] },
    offering:  { type: ['string', 'null'] },
    cult:      { type: ['string', 'null'] },

    // ── ADR-010 D8 (OATH-A, issue #1111) ──────────────────────
    // These three ship WITH the field family, not after it. The object is
    // `additionalProperties: false`, so until they are declared here every
    // oath row carrying them is rejected by POST /api/rules — which is how
    // the live rows came to exist only because they were written straight
    // to Atlas, and why they fail their own validator today.
    //
    // `cost_model` — how the power is paid for.
    //   'swear_by' — no XP; the player pledges an equal number of dots from
    //                merits already owned (D1b). OATH-A implements this.
    //   'free'     — granted at no cost and nothing is pledged.
    // BOTH values are live: 5 rows carry 'swear_by' and 5 carry 'free'
    // (measured against tm_suite 2026-08-07). Declaring only 'swear_by'
    // would have made the other five newly invalid.
    cost_model: { type: ['string', 'null'], enum: ['swear_by', 'free', null] },

    // `rating_basis` — ADR-010 D4. Discriminator-typed, following the
    // ADR-005 §D3/§D5 pattern: each variant carries its own neighbouring
    // fields and never overloads another variant's. Absent/null means "use
    // rating_range", which is every other power, unchanged. Resolved at
    // render time by resolveRatingBasis(); NEVER stored on the character.
    rating_basis: {
      oneOf: [
        {
          type: 'object',
          required: ['type'],
          properties: {
            type:   { type: 'string', enum: ['blood_potency_multiple'] },
            factor: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['type'],
          properties: {
            type:  { type: 'string', enum: ['highest_status'] },
            pools: { type: 'array', items: { type: 'string' }, minItems: 1 },
          },
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },

    // `forfeiture` — ADR-010 D7. Discriminator-typed like `rating_basis`.
    //
    // OATH-B (#1111) tightens this from a free-form object to the DEFAULT
    // VARIANT ONLY. `{ type: 'session', sessions: n }` is deliberately NOT
    // accepted: its entire content is "this suspension ends automatically at
    // the end of the session", and with restoration deferred (ADR-010 D3b)
    // nothing ends it — so accepting it would let an ST author a suspension
    // that never terminates, and the failure would be invisible (a
    // correct-looking suspension that simply never lifts). It defers together
    // with restoration. Enforcing that here makes it a schema fact rather
    // than a convention someone can seed around, which is exactly how the
    // five oath rows came to exist while failing their own validator.
    //
    // Verified before tightening: 0 live rows carry `forfeiture` at all
    // (tm_suite 2026-08-07), so this cannot reject existing data.
    //
    // Both parameters are RESTORATION parameters, so nothing reads either in
    // the shipped scope. That is fine because D8 makes the field declared,
    // schema-valid and ST-editable — declared-and-manageable-but-not-yet-
    // consumed is ordinary forward-declared rules data, unlike `cost_model`,
    // which was undeclared and unwritable.
    forfeiture: {
      oneOf: [
        {
          type: 'object',
          required: ['type'],
          properties: {
            type:              { type: 'string', enum: ['chapter_span_then_monthly'] },
            chapters:          { type: 'integer', minimum: 0 },
            restore_per_month: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },

    // `selected` (legacy `Held by` boolean, retired by issue #5, 2026-05-07)
    // is deliberately NOT declared here. DBO-1 (2026-08-14) answered the open
    // question the previous version of this comment left standing: neither
    // `selected` nor `special` is being re-seeded by anything live — both are
    // un-migrated data from the original Excel import, and the archived
    // collection-wide strip script (`server/scripts/archive/strip-selected-
    // from-purchasable-powers.js`) has simply never been run with `--apply`.
    // `selected` stays undeclared on purpose so `additionalProperties: false`
    // keeps rejecting it; `server/scripts/dbo-1-purchasable-powers-field-
    // cleanup.mjs` removes it from disk. Full investigation:
    // specs/epic-dbo-database-ownership.md, DBO-1.
    //
    // `special` — event-granted-merit marker. Load-bearing since DBO-3
    // (2026-08-14): `isMeritEventGranted(rule)` in
    // `public/js/editor/merits.js` reads `rule.special === 'standing'` to
    // exclude Mystery Cult Initiation and Professional Training from XP-spend
    // merit pickers. Only those two live rows carry `'standing'`; the
    // remaining 515 carry `null`. Declared (not stripped) for exactly that
    // reason — unlike `selected`, this field is read by live code.
    special: { type: ['string', 'null'], enum: ['standing', null] },

    implemented: { type: 'boolean' },   // all rules/prereqs/mechanics verified correct in backend
  },
};
