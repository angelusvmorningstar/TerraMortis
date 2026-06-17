/**
 * JSON Schema (Draft-07) for TM Equipment Catalogue Item.
 * Collection: equipment_catalogue
 *
 * Epic ECM (issue #868 + epic spec specs/epic-ecm-equipment-catalogue-migration.md).
 * Mirrors the EQ-1 catalogue shape — `_id: ObjectId` is the only identity,
 * no slug field. Bucket-specific fields explicit-null where absent (matches
 * the EQ_NULLS / WP_NULLS / AR_NULLS / AS_NULLS pattern from
 * server/data/equipment-catalogue.js).
 *
 * Per epic Non-Goals: NO state-enum per-bucket schema validation in this epic
 * — that's a separate bugfix. Bucket-specific fields are loosely typed (nullable
 * primitives) so the schema accepts every existing seed entry without further
 * coercion in ECM-2.
 */

export const equipmentCatalogueSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Equipment Catalogue Item',
  type: 'object',
  required: ['bucket', 'name'],
  additionalProperties: false,

  properties: {
    // MongoDB _id — injected on insert, present on read.
    _id: {},

    // ── Identity / core ──
    bucket:       { type: 'string', enum: ['weapon', 'armour', 'equipment', 'asset'] },
    name:         { type: 'string', minLength: 1 },
    description:  { type: ['string', 'null'] },
    availability: { type: ['integer', 'null'], minimum: 0, maximum: 5 },
    tags:         { type: 'array', items: { type: 'string' } },

    // ── Bucket-specific (explicit null where absent) ──
    damage_mod:      { type: ['integer', 'null'] },
    damage_type:     { type: ['string',  'null'] },
    weapon_type:     { type: ['string',  'null'] },
    armour_value:    { type: ['integer', 'null'] },
    defence_penalty: { type: ['integer', 'null'] },
    skill_domain:    { type: ['string',  'null'] },
    bonus_dice:      { type: ['integer', 'null'] },

    // ── Audit-light metadata (kept minimal per epic D1 / Non-Goals) ──
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

// Allowlisted fields for PATCH updates. `_id`, `bucket`, `created_at` are
// immutable. `bucket` is excluded specifically: a bucket change would
// orphan bucket-specific field semantics and invalidate render assumptions
// in ECM-4 / ECM-5; force the ST to delete + recreate if bucket needs to change.
export const EQUIPMENT_CATALOGUE_UPDATABLE_FIELDS = new Set([
  'name', 'description', 'availability', 'tags',
  'damage_mod', 'damage_type', 'weapon_type',
  'armour_value', 'defence_penalty',
  'skill_domain', 'bonus_dice',
]);
