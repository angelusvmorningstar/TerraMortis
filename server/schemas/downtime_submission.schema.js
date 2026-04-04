/**
 * JSON Schema (Draft-07) for TM Downtime Submission.
 *
 * Enforces structural correctness of the submission document wrapper and
 * the responses object containing player form data. Does NOT enforce
 * business rules such as gate consistency, slot limits, or XP budgets.
 *
 * The responses object uses flat string keys with numbered suffixes for
 * repeating slots (project_1_action, sphere_2_outcome, etc.). JSON-encoded
 * values (arrays, objects) are stored as strings and validated structurally
 * only as strings here — content parsing is the responsibility of the
 * consuming code.
 *
 * Two data sources feed this collection:
 *   - Player portal (downtime-form.js collectResponses) → flat key/value responses
 *   - CSV import (downtime/db.js upsertCycle) → adds _raw with structured parsed data
 */

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

const yesNoGate = { type: 'string', enum: ['yes', 'no', ''] };

export const downtimeSubmissionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Downtime Submission',
  type: 'object',
  required: ['character_id', 'status'],
  additionalProperties: true,

  properties: {

    // ── Document wrapper ─────────────────────────────────────
    character_id:    { type: 'string', minLength: 1 },
    character_name:  { type: 'string' },
    cycle_id:        { type: ['string', 'null'] },
    status:          { type: 'string', enum: ['draft', 'submitted'] },
    approval_status: { type: 'string', enum: ['pending', 'approved', 'modified', 'rejected'] },

    // ── Player responses ─────────────────────────────────────
    responses: {
      type: 'object',
      additionalProperties: true,
      properties: {

        // ── Gate flags ──
        _gate_attended:         yesNoGate,
        _gate_is_regent:        yesNoGate,
        _gate_has_sorcery:      yesNoGate,
        _gate_has_acquisitions: yesNoGate,
        regent_territory:       { type: 'string' },

        // ── Court (gated: attended) ──
        travel:         { type: 'string' },
        game_recount:   { type: 'string' },
        rp_shoutout:    { type: 'string' },  // JSON-encoded array of character IDs
        correspondence: { type: 'string' },
        trust:          { type: 'string' },
        harm:           { type: 'string' },
        aspirations:    { type: 'string' },

        // ── Feeding ──
        _feed_method:       { type: 'string', enum: feedMethodEnum },
        _feed_disc:         { type: 'string' },
        _feed_spec:         { type: 'string' },
        _feed_custom_attr:  { type: 'string' },
        _feed_custom_skill: { type: 'string' },
        _feed_custom_disc:  { type: 'string' },
        _feed_rote:           { type: 'string', enum: ['yes', ''] },
        _feed_blood_types:    { type: 'string' },  // JSON array: subset of ["Cold","Animal","Human","Kindred"]
        feeding_description:  { type: 'string' },
        feeding_territories:  { type: 'string' },  // JSON object: territory_slug → "resident"/"poach"/"none"
        influence_spend:      { type: 'string' },  // JSON object: territory_slug → integer

        // ── Regency (gated: is_regent) ──
        regency_action: { type: 'string' },
        // residency_1 … residency_N are dynamic keys

        // ── Projects (4 slots) ──
        // Current fields
        project_1_action: { type: 'string', enum: projectActionEnum },
        project_2_action: { type: 'string', enum: projectActionEnum },
        project_3_action: { type: 'string', enum: projectActionEnum },
        project_4_action: { type: 'string', enum: projectActionEnum },

        project_1_outcome: { type: 'string' },
        project_2_outcome: { type: 'string' },
        project_3_outcome: { type: 'string' },
        project_4_outcome: { type: 'string' },

        project_1_description: { type: 'string' },
        project_2_description: { type: 'string' },
        project_3_description: { type: 'string' },
        project_4_description: { type: 'string' },

        // Dice pools (per slot, primary + secondary)
        project_1_pool_attr:  { type: 'string' },
        project_1_pool_skill: { type: 'string' },
        project_1_pool_disc:  { type: 'string' },
        project_1_pool2_attr:  { type: 'string' },
        project_1_pool2_skill: { type: 'string' },
        project_1_pool2_disc:  { type: 'string' },

        project_2_pool_attr:  { type: 'string' },
        project_2_pool_skill: { type: 'string' },
        project_2_pool_disc:  { type: 'string' },
        project_2_pool2_attr:  { type: 'string' },
        project_2_pool2_skill: { type: 'string' },
        project_2_pool2_disc:  { type: 'string' },

        project_3_pool_attr:  { type: 'string' },
        project_3_pool_skill: { type: 'string' },
        project_3_pool_disc:  { type: 'string' },
        project_3_pool2_attr:  { type: 'string' },
        project_3_pool2_skill: { type: 'string' },
        project_3_pool2_disc:  { type: 'string' },

        project_4_pool_attr:  { type: 'string' },
        project_4_pool_skill: { type: 'string' },
        project_4_pool_disc:  { type: 'string' },
        project_4_pool2_attr:  { type: 'string' },
        project_4_pool2_skill: { type: 'string' },
        project_4_pool2_disc:  { type: 'string' },

        // Proposed new project fields (decomposing description)
        project_1_title:        { type: 'string' },
        project_1_cast:         { type: 'string' },  // JSON array of character IDs
        project_1_xp:           { type: 'string' },  // XP expenditure note
        project_1_merits:       { type: 'string' },  // JSON array of merit names
        project_1_territory:    { type: 'string', enum: territoryEnum },
        project_1_feed_method2: { type: 'string', enum: feedMethodEnum },  // Secondary hunt method (rote feed)

        project_2_title:        { type: 'string' },
        project_2_cast:         { type: 'string' },
        project_2_xp:           { type: 'string' },
        project_2_merits:       { type: 'string' },
        project_2_territory:    { type: 'string', enum: territoryEnum },
        project_2_feed_method2: { type: 'string', enum: feedMethodEnum },

        project_3_title:        { type: 'string' },
        project_3_cast:         { type: 'string' },
        project_3_xp:           { type: 'string' },
        project_3_merits:       { type: 'string' },
        project_3_territory:    { type: 'string', enum: territoryEnum },
        project_3_feed_method2: { type: 'string', enum: feedMethodEnum },

        project_4_title:        { type: 'string' },
        project_4_cast:         { type: 'string' },
        project_4_xp:           { type: 'string' },
        project_4_merits:       { type: 'string' },
        project_4_territory:    { type: 'string', enum: territoryEnum },
        project_4_feed_method2: { type: 'string', enum: feedMethodEnum },

        // ── Sphere actions (up to 5) ──
        sphere_1_action:      { type: 'string', enum: sphereActionEnum },
        sphere_1_outcome:     { type: 'string' },
        sphere_1_description: { type: 'string' },
        sphere_1_merit:       { type: 'string' },

        sphere_2_action:      { type: 'string', enum: sphereActionEnum },
        sphere_2_outcome:     { type: 'string' },
        sphere_2_description: { type: 'string' },
        sphere_2_merit:       { type: 'string' },

        sphere_3_action:      { type: 'string', enum: sphereActionEnum },
        sphere_3_outcome:     { type: 'string' },
        sphere_3_description: { type: 'string' },
        sphere_3_merit:       { type: 'string' },

        sphere_4_action:      { type: 'string', enum: sphereActionEnum },
        sphere_4_outcome:     { type: 'string' },
        sphere_4_description: { type: 'string' },
        sphere_4_merit:       { type: 'string' },

        sphere_5_action:      { type: 'string', enum: sphereActionEnum },
        sphere_5_outcome:     { type: 'string' },
        sphere_5_description: { type: 'string' },
        sphere_5_merit:       { type: 'string' },

        // ── Contacts (up to 5) ──
        contact_1:       { type: 'string' },
        contact_1_merit: { type: 'string' },
        contact_2:       { type: 'string' },
        contact_2_merit: { type: 'string' },
        contact_3:       { type: 'string' },
        contact_3_merit: { type: 'string' },
        contact_4:       { type: 'string' },
        contact_4_merit: { type: 'string' },
        contact_5:       { type: 'string' },
        contact_5_merit: { type: 'string' },

        // ── Retainers (dynamic count) ──
        retainer_1:       { type: 'string' },
        retainer_1_merit: { type: 'string' },
        retainer_2:       { type: 'string' },
        retainer_2_merit: { type: 'string' },
        retainer_3:       { type: 'string' },
        retainer_3_merit: { type: 'string' },

        // ── Blood Sorcery (3 slots) ──
        sorcery_1_rite:    { type: 'string' },
        sorcery_1_targets: { type: 'string' },
        sorcery_1_notes:   { type: 'string' },
        sorcery_2_rite:    { type: 'string' },
        sorcery_2_targets: { type: 'string' },
        sorcery_2_notes:   { type: 'string' },
        sorcery_3_rite:    { type: 'string' },
        sorcery_3_targets: { type: 'string' },
        sorcery_3_notes:   { type: 'string' },

        // ── Acquisitions ──
        resources_acquisitions: { type: 'string' },  // Backwards compat: combined text
        acq_description:     { type: 'string' },     // Acquisition description
        acq_availability:    { type: 'string' },     // "1"-"5" dot rating
        acq_merits:          { type: 'string' },     // JSON array of merit keys
        skill_acquisitions:  { type: 'string' },     // Backwards compat: combined text
        skill_acq_description: { type: 'string' },   // Skill acquisition description
        skill_acq_pool_attr:   { type: 'string' },   // Pool attribute name
        skill_acq_pool_skill:  { type: 'string' },   // Pool skill name
        skill_acq_merits:      { type: 'string' },   // JSON array of merit keys

        // ── Vamping ──
        vamping: { type: 'string' },

        // ── Admin ──
        xp_spend:      { type: 'string' },  // JSON array of { category, item, dotsBuying }
        lore_request:  { type: 'string' },
        form_rating:   { type: 'string' },   // "1" – "10"
        form_feedback: { type: 'string' },
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
    feeding_roll: { $ref: '#/definitions/rollResult' },

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
        roll:    { $ref: '#/definitions/rollResult' },
        no_roll: { type: 'boolean' },
        st_note: { type: 'string' },
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
