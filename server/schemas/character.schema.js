/**
 * JSON Schema (Draft-07) for TM Character v2.
 *
 * This schema enforces structural correctness — types, required fields,
 * enum values, and array/object shapes. It does NOT enforce business rules
 * such as XP arithmetic, CP budgets, merit prerequisites, or array-length
 * parity between merits and merit_creation. Those require a separate audit layer.
 *
 * Known legacy fields still present in real data (not rejected, just tolerated):
 *   - merit_creation[].up  (old alias for free, from Excel import)
 *   - fighting_styles[].up (same)
 *   - merits[].benefit_grants (old MCI format, pre-migration)
 */

export const characterSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Character v2',
  type: 'object',
  required: ['name'],
  additionalProperties: true,

  properties: {

    // ── Identity ──────────────────────────────────────────────
    name:         { type: 'string', minLength: 1 },
    player:       { type: ['string', 'null'] },
    moniker:      { type: ['string', 'null'] },
    honorific:    { type: ['string', 'null'] },
    concept:      { type: ['string', 'null'] },
    pronouns:     { type: ['string', 'null'] },
    apparent_age: { type: ['string', 'null'] },
    features:     { type: ['string', 'null'] },
    retired:      { type: 'boolean' },

    clan: {
      type: 'string',
      enum: ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue']
    },
    bloodline:   { type: ['string', 'null'] },
    clan_attribute: { type: ['string', 'null'] },

    covenant: {
      type: 'string',
      enum: [
        'Carthian Movement', 'Circle of the Crone', 'Invictus',
        'Lancea et Sanctum', 'Ordo Dracul', 'Unaligned'
      ]
    },

    mask:        { type: ['string', 'null'] },
    dirge:       { type: ['string', 'null'] },
    court_title: { type: ['string', 'null'] },

    regent_territory:  { type: ['string', 'null'] },
    regent_lieutenant: { type: ['string', 'null'] },

    // ── Core Stats ────────────────────────────────────────────
    blood_potency: { type: 'integer', minimum: 0, maximum: 10 },
    bp_creation:   { type: 'object', properties: { cp: { type: 'integer', minimum: 0 } }, additionalProperties: false },
    humanity:      { type: 'integer', minimum: 0, maximum: 10 },
    humanity_base: { type: 'integer', minimum: 0, maximum: 10 },
    xp_total:      { type: 'number',  minimum: 0 },
    xp_spent:      { type: 'number',  minimum: 0 },

    // ── Status ────────────────────────────────────────────────
    status: {
      type: 'object',
      properties: {
        city:     { type: 'integer', minimum: 0, maximum: 5 },
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

    // ── Attribute creation & priorities ──────────────────────
    attribute_priorities: {
      type: 'object',
      properties: {
        Mental:   { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] },
        Physical: { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] },
        Social:   { type: 'string', enum: ['Primary', 'Secondary', 'Tertiary'] }
      },
      additionalProperties: false
    },
    attr_creation: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/creationPts' }
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
    skill_creation: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/creationPts' }
    },

    // ── Disciplines ───────────────────────────────────────────
    disciplines: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0, maximum: 5 }
    },
    disc_creation: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/creationPts' }
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

    // Parallel array to merits — same length required (not enforceable in JSON Schema).
    merit_creation: {
      type: 'array',
      items: { $ref: '#/definitions/meritCreation' }
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
        dots:  { type: 'integer', minimum: 0, maximum: 10 },
        bonus: { type: 'integer', minimum: 0 }
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
        nine_again: { type: 'boolean' }
      },
      additionalProperties: false
    },

    // Shared creation-points object used for attrs, skills, discs.
    creationPts: {
      type: 'object',
      properties: {
        cp:   { type: 'integer', minimum: 0 },
        xp:   { type: 'integer', minimum: 0 },
        free: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    },

    merit: {
      type: 'object',
      required: ['category', 'name'],
      properties: {
        category:      { type: 'string', enum: ['general', 'influence', 'domain', 'standing', 'manoeuvre'] },
        name:          { type: 'string', minLength: 1 },
        rating:        { type: 'integer', minimum: 0, maximum: 5 },
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
        dot3_choice:   { type: 'string', enum: ['skill', 'merits'] },
        dot5_choice:   { type: 'string', enum: ['advantage', 'merits'] },
        dot5_text:     { type: 'string' },
        // Legacy MCI format — tolerated but not required
        benefits:      { type: 'array' },
        benefit_grants:{ type: 'array' }
      },
      additionalProperties: true
    },

    meritCreation: {
      type: 'object',
      properties: {
        cp:       { type: 'integer', minimum: 0 },
        xp:       { type: 'integer', minimum: 0 },
        free:     { type: 'integer', minimum: 0 },
        free_mci: { type: 'integer', minimum: 0 },
        free_vm:  { type: 'integer', minimum: 0 },
        free_lk:  { type: 'integer', minimum: 0 },
        free_ohm: { type: 'integer', minimum: 0 },
        // Legacy field from Excel import — tolerated
        up:       { type: 'integer', minimum: 0 }
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
        ohm_skills:        { type: 'array', items: { type: 'string' }, maxItems: 2 },
        ohm_allies_sphere: { type: ['string', 'null'] },
        partner:           { type: ['string', 'null'] },
        shared_merit:      { type: ['string', 'null'] }
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
        // Legacy field from Excel import — tolerated
        up:        { type: 'integer', minimum: 0 },
        // Legacy per-style picks — tolerated during migration to fighting_picks
        picks:     { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    }
  }
};
