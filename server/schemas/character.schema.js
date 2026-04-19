/**
 * JSON Schema (Draft-07) for TM Character v3.
 *
 * This schema enforces structural correctness — types, required fields,
 * enum values, and array/object shapes. It does NOT enforce business rules
 * such as XP arithmetic, CP budgets, or merit prerequisites.
 * Those require a separate audit layer.
 *
 * v3 changes (PP.9): creation tracking is now inline on each object.
 *   - attr_creation, skill_creation, disc_creation, merit_creation removed
 *   - Attributes, skills, disciplines, merits each embed cp/xp/free + rule_key
 *   - Powers and fighting styles gain rule_key
 *   - Disciplines changed from integer to object { dots, cp, xp, free, rule_key }
 *
 * Known legacy fields still present in real data (not rejected, just tolerated):
 *   - fighting_styles[].up (old alias for free, from Excel import)
 *   - merits[].benefit_grants (old MCI format, pre-migration)
 */

/**
 * Derive a partial-update schema: same type/shape validation but no required fields.
 * Used for PUT (partial $set updates) where only some fields are sent.
 */
function derivePartialSchema(schema) {
  const clone = JSON.parse(JSON.stringify(schema));
  clone.title += ' (partial)';
  delete clone.$schema;
  (function stripRequired(obj) {
    if (!obj || typeof obj !== 'object') return;
    delete obj.required;
    for (const v of Object.values(obj)) stripRequired(v);
  })(clone);
  return clone;
}

export const characterSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Character v3',
  type: 'object',
  required: ['name'],
  additionalProperties: false,

  properties: {

    // ── Identity ──────────────────────────────────────────────
    name:         { type: 'string', minLength: 1 },
    player:       { type: ['string', 'null'] },
    moniker:      { type: ['string', 'null'] },
    honorific:    { type: ['string', 'null'] },
    concept:      { type: ['string', 'null'] },
    pronouns:     { type: ['string', 'null'] },
    apparent_age:    { type: ['string', 'null'] },
    features:        { type: ['string', 'null'] },
    date_of_embrace: { type: ['string', 'null'] },
    retired:          { type: 'boolean' },
    pending_approval: { type: 'boolean' },
    created_at:       { type: 'string' },

    clan: {
      type: ['string', 'null'],
      enum: ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue', '', null]
    },
    bloodline:   { type: ['string', 'null'] },
    clan_attribute: { type: ['string', 'null'] },

    covenant: {
      type: ['string', 'null'],
      enum: [
        'Carthian Movement', 'Circle of the Crone', 'Invictus',
        'Lancea et Sanctum', 'Ordo Dracul', 'Unaligned', '', null
      ]
    },

    mask:        { type: ['string', 'null'] },
    dirge:       { type: ['string', 'null'] },
    court_title:    { type: ['string', 'null'] },
    court_category: { type: ['string', 'null'], enum: ['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer', '', null] },

    // regent_territory / regent_lieutenant removed — regent status is
    // now derived from the territories collection (regent_id field).

    // ── Core Stats ────────────────────────────────────────────
    blood_potency: { type: 'integer', minimum: 0, maximum: 10 },
    bp_creation:   { type: 'object', properties: { cp: { type: 'integer', minimum: 0 }, xp: { type: 'integer', minimum: 0 }, lost: { type: 'integer', minimum: 0 } }, additionalProperties: false },
    humanity:      { type: 'integer', minimum: 0, maximum: 10 },
    humanity_base: { type: 'integer', minimum: 0, maximum: 10 },
    humanity_lost: { type: 'integer', minimum: 0 },
    humanity_xp:   { type: 'integer', minimum: 0 },
    xp_total:      { type: 'number',  minimum: 0 },
    xp_spent:      { type: 'number',  minimum: 0 },

    // ── Status ────────────────────────────────────────────────
    status: {
      type: 'object',
      properties: {
        city:     { type: 'integer', minimum: 0, maximum: 10 },
        clan:     { type: 'integer', minimum: 0, maximum: 5 },
        covenant: { type: 'integer', minimum: 0, maximum: 5 }
      },
      additionalProperties: false
    },

    covenant_standings: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0, maximum: 5 }
    },

    // ── Willpower conditions ──────────────────────────────────
    // Fields are absent when not yet filled in — never null.
    willpower: {
      type: 'object',
      properties: {
        mask_1wp:  { type: 'string' },
        mask_all:  { type: 'string' },
        dirge_1wp: { type: 'string' },
        dirge_all: { type: 'string' }
      },
      additionalProperties: false
    },

    aspirations: { type: 'array', items: { type: 'string' } },

    // ── Attributes ────────────────────────────────────────────
    // All nine must be present; each is { dots, bonus }.
    attributes: {
      type: 'object',
      required: [
        'Intelligence','Wits','Resolve',
        'Strength','Dexterity','Stamina',
        'Presence','Manipulation','Composure'
      ],
      properties: {
        Intelligence: { $ref: '#/definitions/attrObj' },
        Wits:         { $ref: '#/definitions/attrObj' },
        Resolve:      { $ref: '#/definitions/attrObj' },
        Strength:     { $ref: '#/definitions/attrObj' },
        Dexterity:    { $ref: '#/definitions/attrObj' },
        Stamina:      { $ref: '#/definitions/attrObj' },
        Presence:     { $ref: '#/definitions/attrObj' },
        Manipulation: { $ref: '#/definitions/attrObj' },
        Composure:    { $ref: '#/definitions/attrObj' }
      },
      additionalProperties: false
    },

    // ── Attribute priorities ─────────────────────────────────
    attribute_priorities: {
      type: 'object',
      properties: {
        Mental:   { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] },
        Physical: { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] },
        Social:   { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] }
      },
      additionalProperties: false
    },

    // ── Skills ────────────────────────────────────────────────
    // Sparse: only skills with dots/bonus/specs present. Each is { dots, bonus, specs, nine_again }.
    skills: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/skillObj' }
    },

    skill_priorities: {
      type: 'object',
      properties: {
        Mental:   { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] },
        Physical: { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] },
        Social:   { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] }
      },
      additionalProperties: false
    },

    // ── Disciplines ───────────────────────────────────────────
    // v3: each discipline is now { dots, cp, xp, free, rule_key } instead of integer
    disciplines: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/discObj' }
    },

    // ── Powers ────────────────────────────────────────────────
    powers: {
      type: 'array',
      items: { $ref: '#/definitions/power' }
    },

    // ── Merits ────────────────────────────────────────────────
    merits: {
      type: 'array',
      items: { $ref: '#/definitions/merit' }
    },

    // ── Fighting styles & picks ───────────────────────────────
    fighting_styles: {
      type: 'array',
      items: { $ref: '#/definitions/fightingStyle' }
    },

    // Character-level flat pick list (new — replaces per-style picks array).
    fighting_picks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['manoeuvre'],
        properties: {
          manoeuvre: { type: 'string', minLength: 1 }
        },
        additionalProperties: false
      }
    },

    // ── Touchstones ───────────────────────────────────────────
    touchstones: {
      type: 'array',
      items: {
        type: 'object',
        required: ['humanity', 'name'],
        properties: {
          humanity: { type: 'integer', minimum: 1, maximum: 10 },
          name:     { type: 'string' },
          // desc is absent when not yet written — never null
          desc:     { type: 'string' }
        },
        additionalProperties: false
      }
    },

    // ── Banes ─────────────────────────────────────────────────
    banes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:   { type: 'string' },
          effect: { type: 'string' }
        },
        additionalProperties: false
      }
    },

    // ── Ordeals ───────────────────────────────────────────────
    ordeals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:     { type: 'string' },
          complete: { type: 'boolean' },
          xp:       { type: 'number' }
        },
        additionalProperties: true
      }
    },

    // ── Influence balance (monthly income accumulator) ────────
    influence_balance: { type: 'number', minimum: 0 },

    // ── Equipment ─────────────────────────────────────────────
    equipment: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type:             { type: 'string', enum: ['weapon', 'armour'] },
          name:             { type: 'string' },
          damage_rating:    { type: 'number' },
          damage_type:      { type: 'string', enum: ['B', 'L', 'A'] },
          attack_skill:     { type: 'string', enum: ['Brawl', 'Weaponry', 'Firearms'] },
          general_ar:       { type: 'number' },
          ballistic_ar:     { type: 'number' },
          mobility_penalty: { type: 'number' },
          tags:             { type: 'array', items: { type: 'string' } },
          notes:            { type: 'string' }
        },
        additionalProperties: false
      }
    },

    // ── XP log ────────────────────────────────────────────────
    xp_log: {
      type: 'object',
      properties: {
        earned: { type: 'object', additionalProperties: { type: 'number' } },
        spent:  { type: 'object', additionalProperties: { type: 'number' } }
      },
      additionalProperties: false
    }
  },

  // ── Definitions ─────────────────────────────────────────────────────────────

  definitions: {

    attrObj: {
      type: 'object',
      required: ['dots', 'bonus'],
      properties: {
        dots:     { type: 'integer', minimum: 0, maximum: 10 },
        bonus:    { type: 'integer', minimum: 0 },
        cp:       { type: 'integer', minimum: 0 },
        xp:       { type: 'integer', minimum: 0 },
        free:     { type: 'integer', minimum: 0 },
        rule_key: { type: ['string', 'null'] }
      },
      additionalProperties: false
    },

    skillObj: {
      type: 'object',
      required: ['dots'],
      properties: {
        dots:       { type: 'integer', minimum: 0, maximum: 5 },
        bonus:      { type: 'integer', minimum: 0 },
        specs:      { type: 'array',   items: { type: 'string' } },
        nine_again: { type: 'boolean' },
        cp:         { type: 'integer', minimum: 0 },
        xp:         { type: 'integer', minimum: 0 },
        free:       { type: 'integer', minimum: 0 },
        rule_key:   { type: ['string', 'null'] }
      },
      additionalProperties: false
    },

    discObj: {
      type: 'object',
      required: ['dots'],
      properties: {
        dots:     { type: 'integer', minimum: 0, maximum: 5 },
        cp:       { type: 'integer', minimum: 0 },
        xp:       { type: 'integer', minimum: 0 },
        free:     { type: 'integer', minimum: 0 },
        rule_key: { type: ['string', 'null'] }
      },
      additionalProperties: false
    },

    merit: {
      type: 'object',
      required: ['category', 'name'],
      properties: {
        category:      { type: 'string', enum: ['general', 'influence', 'domain', 'standing', 'manoeuvre'] },
        name:          { type: 'string', minLength: 1 },
        rating:        { type: 'integer', minimum: 0 },
        qualifier:     { type: 'string' },
        area:          { type: ['string', 'null'] },
        cult_name:     { type: ['string', 'null'] },
        role:          { type: ['string', 'null'] },
        asset_skills:  { type: 'array', items: { type: 'string' } },
        shared_with:   { type: 'array', items: { type: 'string' } },
        spheres:       { type: 'array', items: { type: 'string' } },
        granted_by:    { type: 'string' },
        active:        { type: 'boolean' },
        narrow:        { type: 'boolean' },
        ghoul:         { type: 'boolean' },
        derived:       { type: 'boolean' },
        // MCI per-dot choices
        dot1_choice:   { type: 'string', enum: ['speciality', 'merits'] },
        dot1_spec:     { type: 'string' },
        dot1_spec_skill: { type: 'string' },
        dot3_choice:   { type: 'string', enum: ['skill', 'merits'] },
        dot3_skill:    { type: 'string' },
        dot4_skill:    { type: 'string' },
        dot5_choice:   { type: 'string', enum: ['advantage', 'merits'] },
        dot5_text:     { type: 'string' },
        // MCI per-tier merit grants
        tier_grants: {
          type: 'array',
          items: {
            type: 'object',
            required: ['tier', 'name', 'category', 'rating'],
            properties: {
              tier:      { type: 'integer', minimum: 1, maximum: 5 },
              name:      { type: 'string', minLength: 1 },
              category:  { type: 'string' },
              rating:    { type: 'integer', minimum: 0, maximum: 5 },
              qualifier: { type: ['string', 'null'] }
            },
            additionalProperties: false
          }
        },
        // Legacy MCI format — tolerated but not required
        benefits:      { type: 'array' },
        benefit_grants:{ type: 'array' },
        // v3: inline creation tracking (formerly in merit_creation parallel array)
        cp:       { type: 'integer', minimum: 0 },
        xp:       { type: 'integer', minimum: 0 },
        free:     { type: 'integer', minimum: 0 },
        free_mci:       { type: 'integer', minimum: 0 },
        free_vm:        { type: 'integer', minimum: 0 },
        free_lk:        { type: 'integer', minimum: 0 },
        free_ohm:       { type: 'integer', minimum: 0 },
        free_inv:       { type: 'integer', minimum: 0 },
        free_attache:   { type: 'integer', minimum: 0 },
        free_pt:        { type: 'integer', minimum: 0 },
        free_mdb:       { type: 'integer', minimum: 0 },
        free_sw:        { type: 'integer', minimum: 0 },
        free_bloodline: { type: 'integer', minimum: 0 },
        free_pet:       { type: 'integer', minimum: 0 },
        free_retainer:  { type: 'integer', minimum: 0 },
        attached_to:    { type: ['string', 'null'] },
        rule_key: { type: ['string', 'null'] }
      },
      additionalProperties: false
    },

    power: {
      type: 'object',
      required: ['category', 'name'],
      properties: {
        category:  { type: 'string', enum: ['discipline', 'devotion', 'rite', 'pact'] },
        name:      { type: 'string', minLength: 1 },
        discipline:{ type: 'string' },
        rank:      { type: 'integer', minimum: 1, maximum: 5 },
        level:     { type: 'integer', minimum: 1 },
        // stats is absent on pact/rite powers — never null
        stats:     { type: 'string' },
        pool_size: { type: ['integer', 'null'] },
        effect:    { type: 'string' },
        tradition:    { type: 'string' },
        free:         { type: 'boolean' },
        // Pact-specific fields
        cp:                { type: 'integer', minimum: 0 },
        xp:                { type: 'integer', minimum: 0 },
        ohm_skills:        { type: 'array', items: { type: 'string' }, maxItems: 2 },
        ohm_allies_sphere: { type: ['string', 'null'] },
        partner:           { type: ['string', 'null'] },
        shared_merit:      { type: ['string', 'null'] },
        // v3: reference to purchasable_powers key
        rule_key:          { type: ['string', 'null'] }
      },
      additionalProperties: false
    },

    fightingStyle: {
      type: 'object',
      required: ['name'],
      properties: {
        name:      { type: 'string', minLength: 1 },
        type:      { type: 'string', enum: ['style', 'merit'] },
        cp:        { type: 'integer', minimum: 0 },
        xp:        { type: 'integer', minimum: 0 },
        free:      { type: 'integer', minimum: 0 },
        free_mci:  { type: 'integer', minimum: 0 },
        free_ots:  { type: 'integer', minimum: 0 },
        // Legacy field from Excel import — tolerated
        up:        { type: 'integer', minimum: 0 },
        // Legacy per-style picks — tolerated during migration to fighting_picks
        picks:     { type: 'array', items: { type: 'string' } },
        // v3: reference to purchasable_powers key
        rule_key:  { type: ['string', 'null'] }
      },
      additionalProperties: false
    }
  }
};

/** Partial schema for PUT — validates types/shapes but no field is required. */
export const characterPartialSchema = derivePartialSchema(characterSchema);
