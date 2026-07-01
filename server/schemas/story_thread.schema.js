// story_thread: a per-plot "case file" and source of truth for ONE narrative
// thread. Distinct from character_dossier (per-character facts) - a story thread
// keeps everything about one plot together: who started it and who it connects
// to, the CANONICAL TRUTH, what is KNOWN by whom (including false beliefs), and
// how it EVOLVES over time.
//
// THE CORE DESIGN IS THE SPLIT BETWEEN TRUTH AND KNOWLEDGE:
//   - `truth`     = what is really going on (canonical, ST-only / st_hidden).
//   - `knowledge` = claims in circulation, each tagged true|false|partial|
//                   misleading and attributed to who holds them. A FALSE BELIEF
//                   IS FIRST-CLASS DATA HERE, not an error to correct.
//
// TRUTH IS PARTIAL AND OFTEN WRITTEN BY PLAY. The ST does not pre-author every
// thread; much is left deliberately open and is SETTLED by player action. So a
// truth fact carries a `state` (fixed | provisional | emergent | settled), the
// thread carries a `mode` (how pre-authored it is), and an event can `establishes`
// a fact that play just made canon. DO NOT invent truth the ST has not decided -
// mark it `emergent` and let the open_questions stand.
//
// `events` is an append-only timeline - the thread's evolution. Entities
// (characters, NPCs, factions) are referenced by typed id, matching the
// relationships-collection shape, so a thread joins to the character dossier.
//
// Like character_dossier this is a STAGING schema (a parallel knowledge layer),
// to be integrated into Mongo's canonical model later.

const ref = {
  type: 'object',
  required: ['type'],
  additionalProperties: true,
  properties: {
    type: { type: 'string', enum: ['pc', 'npc', 'faction', 'st', 'item', 'location', 'event'] },
    id:   { type: ['string', 'null'] },   // dossier/character/npc id where known
    name: { type: ['string', 'null'] },   // free-text where no id yet
  },
};
const actor = {
  type: 'object',
  required: ['type', 'id'],
  additionalProperties: false,
  properties: { type: { type: 'string', enum: ['st', 'player'] }, id: { type: 'string' } },
};

export const STORY_TYPES  = ['mystery', 'conflict', 'personal', 'political', 'metaplot', 'other'];
export const STORY_STATUS = ['seeded', 'active', 'escalating', 'dormant', 'resolved', 'abandoned'];
export const TRUTH_STATES = ['true', 'false', 'partial', 'misleading', 'unknown'];

export const storyThreadSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Story Thread',
  type: 'object',
  additionalProperties: true,
  required: ['title'],
  properties: {
    _id:     { type: 'string' },
    title:   { type: 'string' },
    slug:    { type: 'string' },
    type:    { type: 'string', enum: STORY_TYPES },
    status:  { type: 'string', enum: STORY_STATUS },
    logline: { type: 'string' },   // one-line ST summary of the thread
    // how pre-authored the thread is. emergent/hybrid threads are written mostly
    // BY play - do not fabricate truth that has not been decided.
    mode:    { type: 'string', enum: ['authored', 'hybrid', 'emergent'] },

    // --- connections: who started it, who/what it touches ---
    origin:       ref,                                       // who/what started the thread
    participants: { type: 'array', items: {                  // everyone connected, with their role
      type: 'object', required: ['ref'], additionalProperties: true,
      properties: {
        ref:  ref,
        role: { type: 'string' },   // instigator | target | investigator | witness | stakeholder | victim | ally | obstacle
        note: { type: ['string', 'null'] },
      },
    } },
    factions:  { type: 'array', items: { type: 'string' } }, // covenants / orgs involved
    locations: { type: 'array', items: { type: 'string' } }, // territories / places
    related:   { type: 'array', items: { type: 'string' } }, // other story_thread slugs/ids this links to

    // --- the canonical truth (ST-only ground truth) ---
    truth: {
      type: 'object',
      additionalProperties: true,
      properties: {
        summary:   { type: 'string' },                       // what is REALLY going on (may itself be provisional)
        facts: { type: 'array', items: {
          type: 'object', required: ['value'], additionalProperties: true,
          properties: {
            value: { type: 'string' },
            // fixed = ST canon; provisional = working truth, may change;
            // emergent = deliberately undefined, for play to settle; settled = play decided it.
            state: { type: 'string', enum: ['fixed', 'provisional', 'emergent', 'settled'] },
            since: { type: ['string', 'null'] },              // when it became canon (often a play event)
          },
        } },
        st_hidden: { type: 'boolean' },                      // default true - this layer is ST-only
      },
    },

    // --- what is KNOWN, even falsely (the epistemic layer) ---
    knowledge: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'truth_state'],
        additionalProperties: true,
        properties: {
          claim:       { type: 'string' },                   // a piece of information in circulation
          truth_state: { type: 'string', enum: TRUTH_STATES },
          held_by:     { type: 'array', items: ref },         // who believes / knows this (may be wrong)
          origin:      { type: ['string', 'null'] },          // rumour | clue | leak | deduction | disinformation | ST-seed
          since:       { type: ['string', 'null'] },          // when it entered circulation (cycle/date)
          note:        { type: ['string', 'null'] },
        },
      },
    },

    // --- evolution over time (APPEND-ONLY timeline) ---
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: ['at', 'title'],
        additionalProperties: true,
        properties: {
          at:       { type: 'string' },                       // cycle/date e.g. "DT1", "Game 2", ISO date
          title:    { type: 'string' },                       // what happened
          detail:   { type: ['string', 'null'] },
          involved: { type: 'array', items: ref },
          changes:     { type: ['string', 'null'] },          // what this beat changed (truth/knowledge/status)
          establishes: { type: ['string', 'null'] },          // an open question this player action SETTLED into canon
          source:      { type: ['string', 'null'] },          // downtime | game | st
        },
      },
    },

    // --- the pieces and where it can still go ---
    elements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'value'],
        additionalProperties: true,
        properties: {
          kind:   { type: 'string', enum: ['clue', 'item', 'location', 'secret', 'question', 'symbol', 'lead'] },
          value:  { type: 'string' },
          status: { type: ['string', 'null'] },   // open | resolved | dead-end | recurring
          note:   { type: ['string', 'null'] },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },

    created_by: actor,
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};
