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
 *
 * EQC-1 (issue #1152, epic #1038) — bucket re-partition, 2026-08-13. The old
 * four buckets (weapon/armour/equipment/asset) become FIVE new values:
 *
 *   combat_gear  — weapons AND armour, distinguished by which stat fields are
 *                  populated (damage_mod/damage_type/weapon_type = weapon-shaped;
 *                  armour_value/defence_penalty = armour-shaped). Both sets of
 *                  fields stay on the schema for this bucket; a given item
 *                  populates whichever subset applies and leaves the rest null.
 *   skill_gear   — old `equipment` bucket, unchanged meaning (skill_domain +
 *                  bonus_dice). Renamed only.
 *   tool_utility — NEW. "Does a thing, no bonus" per the epic description —
 *                  mechanical_effect (free text), no numeric bonus field.
 *   narrative    — NEW. Purely descriptive; no bucket-specific stat fields.
 *   container    — old `asset` bucket. "Assets are containers... no
 *                  stat-stacking on the asset itself" (epic #1038) — holds
 *                  other equipment (see character.schema.js's `container_id`)
 *                  rather than granting a bonus of its own. mechanical_effect
 *                  stays available for descriptive/narrative notes (e.g. what
 *                  a haven confers), not a combat bonus.
 *
 * Migration: server/scripts/migrate-eqc1-bucket-taxonomy.mjs maps every live
 * equipment_catalogue document from the old enum to the new one
 * (weapon→combat_gear, armour→combat_gear, equipment→skill_gear,
 * asset→container). Must run before/alongside this schema landing — see that
 * script's own header for why the two cannot ship independently.
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
    bucket:       { type: 'string', enum: ['combat_gear', 'skill_gear', 'tool_utility', 'narrative', 'container'] },
    name:         { type: 'string', minLength: 1 },
    description:  { type: ['string', 'null'] },
    availability: { type: ['integer', 'null'], minimum: 0, maximum: 5 },
    tags:         { type: 'array', items: { type: 'string' } },

    // ── Bucket-specific (explicit null where absent) ──
    damage_mod:        { type: ['integer', 'null'] },
    damage_type:       { type: ['string',  'null'] },
    weapon_type:       { type: ['string',  'null'] },
    armour_value:      { type: ['integer', 'null'] },
    defence_penalty:   { type: ['integer', 'null'] },
    skill_domain:      { type: ['string',  'null'] },
    bonus_dice:        { type: ['integer', 'null'] },
    // mechanical_effect — asset-bucket-only in practice (free-text note on
    // what the asset does mechanically); follows the same nullable shape as
    // the other bucket-specific fields. Widened in ECM-6 (#873) after the
    // ECM-2 seed surfaced that the source carries this field on asset
    // entries — ECM-1's properties block had omitted it, causing PATCH to
    // silently drop edits via the allowlist. Per epic Non-Goal "no state-
    // enum per-bucket schema validation", the schema does not enforce
    // bucket=asset; the field is nullable across all buckets.
    mechanical_effect: { type: ['string',  'null'] },

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
  'mechanical_effect',
]);
