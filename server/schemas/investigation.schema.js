/**
 * JSON Schema (Draft-07) for TM NPC.
 * Collections: npcs
 *
 * THE FILENAME IS HISTORICAL. This file also declared `investigationSchema` for
 * the `downtime_investigations` collection, which is where its name came from.
 * TM Wiki Story 31-7 (2026-08-15) retired that collection, its route
 * (server/routes/investigations.js, deleted) and its ST admin panel: it and
 * tm_wiki's `prior_investigations` were the same concept modelled twice, neither
 * side had ever held a document, and `tm_suite.downtime_investigations` had never
 * even been created. TM Wiki's version survives as the single home. No migration
 * was needed - there was nothing to move.
 *
 * THE FILE ITSELF SURVIVES BECAUSE `npcSchema` LIVES HERE and is imported by
 * server/routes/npcs.js, which is live and unrelated. That is why the retirement
 * removed the one export rather than the file: deleting it would have broken the
 * NPC route, which is exactly the adjacent-collateral trap 31-7's own acceptance
 * criteria told the developer to re-check for. Renaming the file to match its
 * remaining contents is a separate, larger change (four story docs and one route
 * cite it by name) and was deliberately not folded in here.
 */

export const npcSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM NPC',
  type: 'object',
  required: ['name'],
  additionalProperties: true,

  properties: {
    name:                { type: 'string', minLength: 1 },
    description:         { type: 'string' },
    status:              { type: 'string', enum: ['active', 'inactive', 'destroyed', 'pending', 'archived'] },
    linked_character_ids:{ type: 'array', items: { type: 'string' } },
    linked_cycle_id:     { type: ['string', 'null'] },
    notes:               { type: 'string' },
    // DTOSL.1: ST-managed flag marking an NPC as available in the
    // Personal Story "Correspondence" dropdown on the DT form.
    is_correspondent:    { type: 'boolean' },
    // DTOSL.3: per-character list of character IDs for which this NPC
    // has been ST-suggested. Players see Confirm/Reject on their DT form.
    st_suggested_for:    { type: 'array', items: { type: 'string' } },
    // DTOSL.5: populated when a player creates an NPC via the quick-add
    // endpoint; ST reviews and promotes to status:'active'.
    created_by: {
      type: 'object',
      additionalProperties: true,
      properties: {
        type:         { type: 'string', enum: ['player', 'st'] },
        player_id:    { type: ['string', 'null'] },
        character_id: { type: ['string', 'null'] },
      },
    },
    created_at:          { type: 'string' },
    updated_at:          { type: 'string' },
  },
};
