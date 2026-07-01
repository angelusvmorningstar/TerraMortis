// character_dossier: a parallel, history-derived knowledge layer for characters.
// One doc per character. Facts are tagged (Entity-Attribute-Value) so any datum
// can be classified, and tags are normalised across characters via DOSSIER_TAGS.
//
// THE CHARACTER SHEET IS AUTHORITATIVE. Where a fact maps to a sheet field and
// disagrees with it, the sheet wins and the fact is flagged `clash: true` for ST
// review - the dossier never overrides the sheet.
//
// People are NOT stored here as facts. They live in the `npcs` / `relationships`
// collections; dossier facts reference them by `npc_id` where relevant (e.g. the
// `sire` fact links to Mr. Green's NPC doc).

export const characterDossierSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Character Dossier',
  type: 'object',
  additionalProperties: true,
  required: ['character_id'],
  properties: {
    character_id: { type: ['string', 'object'] },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tag', 'value'],
        properties: {
          tag:         { type: 'string' },            // normalised classification (DOSSIER_TAGS)
          value:       { type: 'string' },            // the datum
          source:      { type: 'string' },            // history | sheet | st | downtime
          npc_id:      { type: ['string', 'null'] },  // link when the fact references a person/entity
          sheet_field: { type: ['string', 'null'] },  // sheet field this maps to, if any
          sheet_value: { type: ['string', 'null'] },  // sheet value at extraction time
          clash:       { type: 'boolean' },           // true when value contradicts the authoritative sheet
          note:        { type: ['string', 'null'] },  // ST-facing note (e.g. "sheet has fewer touchstones")
          // Stateful facts (secrets, boons, debts) live here too, but carry the
          // state that keeps them honest - a debt fact must know if it's repaid,
          // a secret must know if it's been compromised. Without this they'd rot.
          st_hidden:   { type: 'boolean' },           // ST-only (secrets, sensitive obligations)
          severity:    { type: ['string', 'null'], enum: ['trivial', 'minor', 'major', 'life_threatening', null] }, // tag=secret
          compromised: { type: ['boolean', 'null'] }, // tag=secret: has it been exposed?
          status:      { type: ['string', 'null'], enum: ['outstanding', 'repaid', null] }, // tag=boon|debt
          counterparty:{ type: ['string', 'null'] },  // tag=boon|debt: the other party (npc_id or name)
        },
        additionalProperties: true,
      },
    },
    source_history_id: { type: ['string', 'object', 'null'] },
    updated_at:        { type: 'string' },
  },
};

// Normalised, growing tag vocabulary. New data types add a tag here so the same
// kind of fact is always tagged the same way across characters (no birthplace
// AND place_of_birth). Review additions to keep it merged.
export const DOSSIER_TAGS = [
  'birthplace',        // where the mortal was born
  'birth_year',        // mortal birth year
  'mortal_vocation',   // what they did in life
  'mortal_faction',    // mortal organisation/affiliation
  'sire',              // who Embraced them (npc_id)
  'brood_sibling',     // co-childe / brood-mate (npc_id)
  'embrace_event',     // when/where/how Embraced (maps to date_of_embrace)
  'embrace_location',  // city/place of Embrace
  'faction_history',   // past covenant/court roles
  'key_location',      // a place significant to their Requiem
  'notable_event',     // a defining event in their unlife
  'signature_ability', // a distinctive power/ritual they are known for
  'notable_ally',      // (npc_id)
  'notable_enemy',     // (npc_id)
  'family_member',     // mortal/extended family (npc_id)
  'current_activity',  // what they're doing now
  'haven',             // where the character sleeps (a real Sydney location); shared haven = coterie
  // questionnaire-derived
  'aspiration',        // what they want (aspired role/position/goals)
  'motivation',        // why they're here / why this covenant
  'worldview',         // views on traditions / Elysium / mortals etc.
  'hunting_method',    // how they feed
  'touchstone',        // a touchstone (reconcile vs the sheet, which is authoritative)
  'secret',            // ST-sensitive: st_hidden:true + severity + compromised
  'boon',              // a favour owed TO the character: status (outstanding|repaid) + counterparty
  'debt',              // a favour the character OWES: status (outstanding|repaid) + counterparty
];

// Secret severity scale (ST judgement at ingest; default compromised:false).
export const SECRET_SEVERITY = ['trivial', 'minor', 'major', 'life_threatening'];
