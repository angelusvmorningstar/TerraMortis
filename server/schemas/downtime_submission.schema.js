/**
 * JSON Schema (Draft-07) for TM Downtime Submission.
 *
 * Authoritative schema for the downtime_submissions collection.
 * Kept in sync with downtime-form.js collectResponses() — every field
 * that the player portal writes is documented here.
 *
 * The responses object uses flat string keys with numbered suffixes for
 * repeating slots (project_1_action, sphere_2_outcome, etc.). JSON-encoded
 * values (arrays, objects) are stored as strings — content parsing is the
 * responsibility of consuming code.
 *
 * Data sources:
 *   - Player portal (downtime-form.js collectResponses) → flat key/value responses
 *   - CSV import (downtime/db.js upsertCycle) → adds _raw with structured parsed data
 *
 * XP spending rules (business logic, not enforced by schema):
 *   - Merits 1–3 dots: always available, no project action required
 *   - All other categories (Attribute, Skill, Discipline, Devotion, Rite,
 *     Merit 4–5): require 1 XP Spend project action per dot purchased
 *
 * Last synced: 2026-04-04 from collectResponses() in downtime-form.js
 */

// ── Enums ──────────────────────────────────────────────────────

const projectActionEnum = [
  '', 'ambience_increase', 'ambience_decrease', 'attack', 'feed',
  'hide_protect', 'investigate', 'patrol_scout', 'support', 'xp_spend', 'misc'
];

const sphereActionEnum = [
  '', 'ambience_increase', 'ambience_decrease', 'attack', 'block',
  'hide_protect', 'investigate', 'patrol_scout', 'rumour', 'support',
  'grow', 'misc', 'acquisition'
];

const feedMethodEnum = [
  '', 'seduction', 'stalking', 'force', 'familiar', 'intimidation', 'other'
];

const territoryEnum = [
  '', 'academy', 'dockyards', 'harbour', 'northshore', 'secondcity'
];

const bloodTypeEnum = ['Animal', 'Human', 'Kindred'];

const yesNoGate = { type: 'string', enum: ['yes', 'no', ''] };

// ── Helper: generate per-slot properties ───────────────────────

function projectSlotProps(n) {
  return {
    // Action type
    [`project_${n}_action`]:       { type: 'string', enum: projectActionEnum },
    // Core fields
    [`project_${n}_outcome`]:      { type: 'string' },
    [`project_${n}_description`]:  { type: 'string' },
    [`project_${n}_title`]:        { type: 'string' },
    [`project_${n}_territory`]:    { type: 'string', enum: territoryEnum },
    // Dice pools (primary + secondary)
    [`project_${n}_pool_attr`]:    { type: 'string' },
    [`project_${n}_pool_skill`]:   { type: 'string' },
    [`project_${n}_pool_disc`]:    { type: 'string' },
    [`project_${n}_pool2_attr`]:   { type: 'string' },
    [`project_${n}_pool2_skill`]:  { type: 'string' },
    [`project_${n}_pool2_disc`]:   { type: 'string' },
    // Cast (JSON array of character IDs)
    [`project_${n}_cast`]:         { type: 'string' },
    // Applicable merits (JSON array of "Name|qualifier" keys)
    [`project_${n}_merits`]:       { type: 'string' },
    // XP expenditure note (for xp_spend action)
    [`project_${n}_xp`]:           { type: 'string' },
    // Secondary hunt method (for feed/rote action)
    [`project_${n}_feed_method2`]: { type: 'string', enum: feedMethodEnum },
  };
}

function sphereSlotProps(n) {
  return {
    [`sphere_${n}_action`]:      { type: 'string', enum: sphereActionEnum },
    [`sphere_${n}_outcome`]:     { type: 'string' },
    [`sphere_${n}_description`]: { type: 'string' },
    [`sphere_${n}_territory`]:   { type: 'string', enum: territoryEnum },
    [`sphere_${n}_merit`]:       { type: 'string' },  // Display label: "Allies ●●● (Police)"
    [`sphere_${n}_cast`]:        { type: 'string' },   // JSON array of character IDs
  };
}

function contactSlotProps(n) {
  return {
    // New structured fields
    [`contact_${n}_info`]:    { type: 'string' },  // Supporting info (one-liner)
    [`contact_${n}_request`]: { type: 'string' },  // Information request (textarea)
    [`contact_${n}_merit`]:   { type: 'string' },  // Display label: "Contacts ● (Police)"
    // Backwards compat: combined info + request
    [`contact_${n}`]:         { type: 'string' },
  };
}

function retainerSlotProps(n) {
  return {
    // New structured fields
    [`retainer_${n}_type`]:  { type: 'string' },  // Task type (one-liner)
    [`retainer_${n}_task`]:  { type: 'string' },  // Task description (textarea)
    [`retainer_${n}_merit`]: { type: 'string' },  // Display label: "Retainer ●● (Ghoul Bodyguard)"
    // Backwards compat: combined type + task
    [`retainer_${n}`]:       { type: 'string' },
  };
}

function sorcerySlotProps(n) {
  return {
    [`sorcery_${n}_rite`]:    { type: 'string' },  // Rite name from character powers
    [`sorcery_${n}_targets`]: { type: 'string' },  // Target description
    [`sorcery_${n}_notes`]:   { type: 'string' },  // Additional notes
  };
}

// ── Main schema ────────────────────────────────────────────────

export const downtimeSubmissionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Downtime Submission',
  type: 'object',
  required: ['character_id', 'status'],
  additionalProperties: true,

  properties: {

    // ── Document wrapper ─────────────────────────────────────
    character_id:    { type: ['string', 'null'], minLength: 1 },
    character_name:  { type: 'string' },
    cycle_id:        { type: ['string', 'null'] },
    status:          { type: 'string', enum: ['draft', 'submitted'] },
    submitted_at:    { type: 'string' },  // ISO timestamp
    approval_status: { type: 'string', enum: ['pending', 'approved', 'modified', 'rejected'] },

    // ── Player responses ─────────────────────────────────────
    responses: {
      type: 'object',
      additionalProperties: true,
      properties: {

        // ── Gate flags (auto-detected from character data) ──
        _gate_attended:         yesNoGate,
        _gate_is_regent:        yesNoGate,
        _gate_has_sorcery:      yesNoGate,
        _gate_has_acquisitions: yesNoGate,  // Legacy — acquisitions always shown now
        regent_territory:       { type: 'string' },

        // ── Merit toggle states (legacy, preserved for contacts/retainers) ──
        // Dynamic keys: _merit_<merit_key> = "yes" | "no"
        // merit_key format: "name_rating_area".toLowerCase().replace(/[^a-z0-9]+/g, '_')

        // ══════════════════════════════════════════════════════
        //  COURT (gated: _gate_attended === "yes")
        // ══════════════════════════════════════════════════════
        travel:         { type: 'string' },   // Travel method and precautions
        game_recount:   { type: 'string' },   // 3–5 in-character highlights
        rp_shoutout:    { type: 'string' },   // JSON array of character IDs
        correspondence: { type: 'string' },   // In-character letter to NPC
        trust:          { type: 'string' },   // Most trusted PC and why
        harm:           { type: 'string' },   // PC being actively hampered
        aspirations:    { type: 'string' },   // Short/medium/long term goals

        // ══════════════════════════════════════════════════════
        //  FEEDING: THE HUNT (always present)
        // ══════════════════════════════════════════════════════
        _feed_method:       { type: 'string', enum: feedMethodEnum },
        _feed_disc:         { type: 'string' },   // Discipline added to feeding pool
        _feed_spec:         { type: 'string' },   // Skill specialisation for feeding pool
        _feed_custom_attr:  { type: 'string' },   // Custom pool attribute (for "other" method)
        _feed_custom_skill: { type: 'string' },   // Custom pool skill
        _feed_custom_disc:  { type: 'string' },   // Custom pool discipline
        _feed_rote:         { type: 'string', enum: ['yes', ''] },  // Rote: dedicates Project 1 to feeding
        _feed_blood_types:  { type: 'string' },   // JSON array: subset of ["Animal","Human","Kindred"]
        feeding_description: { type: 'string' },  // Narrative feeding description

        // ══════════════════════════════════════════════════════
        //  THE CITY: TERRITORY AND INFLUENCE (always present)
        // ══════════════════════════════════════════════════════
        // Territory grid: JSON object { territory_slug: "resident" | "poach" | "none" }
        // Territory slugs: the_academy, the_city_harbour, the_docklands, the_second_city, the_northern_shore, the_barrens__no_territory_
        feeding_territories: { type: 'string' },
        // Influence spend: JSON object { territory_slug: integer (-N to +N) }
        influence_spend:     { type: 'string' },

        // ══════════════════════════════════════════════════════
        //  REGENCY (gated: _gate_is_regent === "yes")
        // ══════════════════════════════════════════════════════
        regency_action: { type: 'string' },  // Proclamations, policies
        // residency_1 … residency_N: character IDs assigned to feeding slots (dynamic keys)

        // ══════════════════════════════════════════════════════
        //  PROJECTS: PERSONAL ACTIONS (4 tabbed slots)
        //  Action-specific field visibility:
        //    feed:             summary + secondary method/pool/territory/description
        //    xp_spend:         note only (spending done in Admin section)
        //    ambience +/-:     title, territory, pools, cast, description
        //    attack/investigate/hide_protect: title, pools, outcome, territory, cast, merits, description
        //    patrol_scout:     title, pools, outcome, territory, cast, description
        //    support:          title, pools, outcome, cast, description
        //    misc:             title, pools, outcome, description
        // ══════════════════════════════════════════════════════
        ...projectSlotProps(1),
        ...projectSlotProps(2),
        ...projectSlotProps(3),
        ...projectSlotProps(4),

        // ══════════════════════════════════════════════════════
        //  SPHERES OF INFLUENCE (tabbed, up to 5 slots)
        //  Pre-populated from character's Allies/Status merits.
        //  Action-specific field visibility:
        //    ambience +/-:     territory, outcome, description
        //    attack/block/support: cast, outcome, description
        //    investigate/patrol_scout: territory, outcome, description
        //    rumour/grow/misc/acquisition: outcome, description
        // ══════════════════════════════════════════════════════
        ...sphereSlotProps(1),
        ...sphereSlotProps(2),
        ...sphereSlotProps(3),
        ...sphereSlotProps(4),
        ...sphereSlotProps(5),

        // ══════════════════════════════════════════════════════
        //  CONTACTS: REQUESTS FOR INFORMATION (expandable table, up to 5)
        //  Each contact has: info (one-liner), request (textarea), merit label.
        // ══════════════════════════════════════════════════════
        ...contactSlotProps(1),
        ...contactSlotProps(2),
        ...contactSlotProps(3),
        ...contactSlotProps(4),
        ...contactSlotProps(5),

        // ══════════════════════════════════════════════════════
        //  RETAINERS: TASK DELEGATION (expandable table, dynamic count)
        //  Each retainer has: type (one-liner), task (textarea), merit label.
        // ══════════════════════════════════════════════════════
        ...retainerSlotProps(1),
        ...retainerSlotProps(2),
        ...retainerSlotProps(3),

        // ══════════════════════════════════════════════════════
        //  BLOOD SORCERY (gated: _gate_has_sorcery === "yes", 3 slots)
        // ══════════════════════════════════════════════════════
        ...sorcerySlotProps(1),
        ...sorcerySlotProps(2),
        ...sorcerySlotProps(3),

        // ══════════════════════════════════════════════════════
        //  ACQUISITIONS (always shown)
        // ══════════════════════════════════════════════════════
        // Resources acquisition (structured)
        acq_description:       { type: 'string' },  // What to acquire and why
        acq_availability:      { type: 'string' },  // "1"–"5" dot rating (Common to Unique)
        acq_merits:            { type: 'string' },  // JSON array of "Name|qualifier" merit keys
        resources_acquisitions: { type: 'string' },  // Backwards compat: combined text

        // Skill-based acquisition (structured)
        skill_acq_description:  { type: 'string' },  // What to acquire and how
        skill_acq_pool_attr:    { type: 'string' },  // Pool attribute name
        skill_acq_pool_skill:   { type: 'string' },  // Pool skill name
        skill_acq_pool_spec:    { type: 'string' },  // Pool skill specialisation
        skill_acq_availability: { type: 'string' },  // "1"–"5" dot rating
        skill_acq_merits:       { type: 'string' },  // JSON array of "Name|qualifier" merit keys
        skill_acquisitions:     { type: 'string' },  // Backwards compat: combined text

        // ══════════════════════════════════════════════════════
        //  VAMPING (always present)
        // ══════════════════════════════════════════════════════
        vamping: { type: 'string' },  // Flavour RP, non-mechanical activities

        // ══════════════════════════════════════════════════════
        //  ADMIN (always present)
        // ══════════════════════════════════════════════════════
        // XP spend grid: JSON array of { category, item, dotsBuying }
        // category: "attribute" | "skill" | "discipline" | "merit" | "devotion" | "rite"
        // item: attribute/skill/discipline name, or "MeritName|flat|rating|0" / "MeritName|grad|currentDots|maxTarget"
        xp_spend:      { type: 'string' },
        lore_request:  { type: 'string' },   // Rules/lore questions for STs
        form_rating:   { type: 'string' },   // "1"–"10" (half-star widget)
        form_feedback: { type: 'string' },   // Form UX feedback
      },
    },

    // ── ST review (stripped from player responses) ────────────
    st_review: {
      type: 'object',
      additionalProperties: true,
      properties: {
        narrative: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              text:   { type: 'string' },
              status: { type: 'string', enum: ['draft', 'ready'] },
            },
            additionalProperties: false,
          },
        },
        mechanical_summary:  { type: 'string' },
        outcome_text:        { type: 'string' },
        outcome_visibility:  { type: 'string', enum: ['draft', 'ready', 'published'] },
        published_at:        { type: 'string' },  // ISO timestamp
        ready_at:            { type: 'string' },  // ISO timestamp
      },
    },

    // ── Resolved action results (ST-populated) ───────────────
    projects_resolved: {
      type: 'array',
      items: { $ref: '#/definitions/resolvedAction' },
    },
    merit_actions_resolved: {
      type: 'array',
      items: { $ref: '#/definitions/resolvedAction' },
    },
    feeding_roll:        { $ref: '#/definitions/rollResult' },
    feeding_roll_player: { $ref: '#/definitions/rollResult' },  // Player-side roll (persisted)
    feeding_deferred:    { type: 'boolean' },                   // Player chose to defer — see Storytellers at game

    // ── ST narrative authoring (DT Story tab) ───────────────────
    // Written by STs via the DT Story tab; persisted as a top-level object.
    // Internal shape is not strictly enforced here (additionalProperties: true)
    // to allow B stories to extend it incrementally without schema conflicts.
    st_narrative: {
      type: 'object',
      additionalProperties: true,
      properties: {
        locked:             { type: 'boolean' },
        letter_from_home:   { type: 'object', additionalProperties: true },
        touchstone:         { type: 'object', additionalProperties: true },
        feeding_validation: { type: 'object', additionalProperties: true },
        territory_reports:  { type: 'array' },
        project_responses:  { type: 'array' },
        action_responses:   { type: 'array' },
        resource_approvals: { type: 'array' },
        cacophony_savvy:    { type: 'array' },
      },
    },

    // ── Published outcome (promoted from st_review for players) ──
    published_outcome: { type: 'string' },

    // ── CSV import structured data ───────────────────────────
    _raw: {
      type: 'object',
      additionalProperties: true,
    },
  },

  // ── Definitions ──────────────────────────────────────────────
  definitions: {
    rollResult: {
      type: 'object',
      properties: {
        successes:   { type: 'integer', minimum: 0 },
        exceptional: { type: 'boolean' },
        dice:        { type: 'array', items: { type: 'integer' } },
        cols:        { type: 'array' },  // Full roll columns with chain data
        vessels:     { type: 'integer', minimum: 0 },
        safeVitae:   { type: 'integer', minimum: 0 },
        methodName:  { type: 'string' },
        pool:        { type: 'integer', minimum: 0 },
        breakdown:   { type: 'string' },
        rolledAt:    { type: 'string' },  // ISO timestamp
      },
      additionalProperties: true,
    },

    resolvedAction: {
      type: 'object',
      properties: {
        pool: {
          type: 'object',
          properties: {
            total:      { type: 'integer', minimum: 0 },
            expression: { type: 'string' },
          },
          additionalProperties: true,
        },
        roll:               { $ref: '#/definitions/rollResult' },
        no_roll:            { type: 'boolean' },
        st_note:            { type: 'string' },
        player_facing_note: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
};

// ── Cycle schema ───────────────────────────────────────────────

export const downtimeCycleSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Downtime Cycle',
  type: 'object',
  additionalProperties: true,

  properties: {
    label:            { type: 'string' },
    title:            { type: 'string' },
    deadline_at:      { type: 'string' },  // ISO timestamp
    game_number:      { type: 'integer', minimum: 1 },
    status:           { type: 'string', enum: ['open', 'closed'] },
    submission_count: { type: 'integer', minimum: 0 },
  },
};
