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

    // Tracking flags — not consumed by game logic yet
    selected:    { type: 'boolean' },   // power is actively chosen by at least one character
    implemented: { type: 'boolean' },   // all rules/prereqs/mechanics verified correct in backend
  },
};
