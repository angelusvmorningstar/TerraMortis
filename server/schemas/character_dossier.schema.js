/**
 * JSON Schema (Draft-07) for TM character dossiers.
 * Collection: character_dossier
 *
 * WHY THIS FILE DID NOT EXIST UNTIL DBO-2 (2026-08-14). It was cited as
 * authority by two sites while being a phantom: `server/scripts/_dossier-
 * audit.js:3` imports `DOSSIER_TAGS` from here (confirmed unrunnable, the
 * import threw ERR_MODULE_NOT_FOUND), and TM Wiki's `server/routes/
 * characters.js` cited this path for `character_id`'s type. TM Wiki has since
 * self-corrected its own half (their Story 31-1); this file closes ours and
 * gives that citation something real to point back at.
 *
 * DOCUMENTATION AND TEST CONTRACT, NOT A RUNTIME VALIDATOR. Nothing under
 * `server/routes/` reads or writes `character_dossier` at all - the only
 * writers in this repo are one-off `server/scripts/_*.js` tools - and the live
 * collection carries no MongoDB `$jsonSchema` validator (which is exactly what
 * `_dossier-audit.js:50` prints). Adding one is a separate, riskier decision
 * and is deliberately out of scope. Everything declared here is derived from a
 * full read-only inventory of live `tm_suite` on 2026-08-14 (30 documents,
 * 442 facts), not guessed. Full investigation:
 * `specs/epic-dbo-database-ownership.md`, DBO-2 section.
 *
 * THE `fact_key` CONTRACT, and it is an upstream contract this repo owes TM
 * Wiki rather than a local convenience. Their `tm_wiki.visibility_prefs`
 * mechanism (fact-level reveal, three tiers, named reveals/conceals) is built
 * and shipped but gated dark behind `wiki_config.fact_level_enabled: false`
 * for exactly one reason, quoted from `../TM Wiki/specs/tm-wiki-schema.md`:
 * canonical `facts[]` entries are POSITIONALLY addressed, so any reorder,
 * insert or delete silently repoints every reference. Three invariants
 * follow, and every future writer of a dossier fact is bound by them:
 *
 *   1. Minted ONCE AT CREATION.
 *   2. NEVER the array index, and NEVER a hash of the value.
 *   3. PRESERVED ACROSS ST RE-AUTHORING - editing, reordering, inserting or
 *      deleting other facts must never change or recycle an existing key.
 *
 * The mint is `randomUUID()` from `node:crypto` (no new dependency; neither
 * `nanoid` nor `ulid` is a declared production dependency here, and no
 * first-party opaque-ID minting precedent existed in this repo before DBO-2).
 * TM Wiki declares `subject_ref.fact_key` as `{ type: 'string', minLength: 1 }`,
 * which a UUID string satisfies unchanged, so their spec's "ULID/nanoid"
 * wording names the class of key rather than mandating a format.
 *
 * KNOWN TRANSITIONAL STATE, stated here rather than discovered later: until
 * `server/scripts/dbo-2-dossier-fact-key-backfill.mjs` has been run with
 * `--apply` against live `tm_suite`, ALL 442 live facts fail this schema's
 * `required` on `fact_key`. That is intended and visible, not an oversight.
 * Because nothing validates this collection at runtime, `required` here has no
 * live blast radius - the backfill is the thing that closes the gap.
 *
 * `st_hidden` IS REQUIRED, AND THE REASON IS A LIVE FAIL-OPEN READER. TM
 * Wiki's shipped `filterFactsForViewer` (`../TM Wiki/server/routes/
 * characters.js:210-214`) reads `if (fact.st_hidden !== true) return true` -
 * fail-open - so a fact minted WITHOUT `st_hidden` is silently visible to
 * everyone. All 442 live facts carry it, so requiring it costs nothing today
 * and closes a real default-open hazard for every future writer. (TM Wiki's
 * newer `visibility_prefs` projection is allowlist / fail-closed by design;
 * the `filterFactsForViewer` path described here is the one live today.)
 */

/**
 * The 26 tags observed across all 442 live facts, ordered by live frequency.
 *
 * A KNOWN-TAG SET FOR DRIFT REPORTING, NOT A REJECTION LIST. `_dossier-
 * audit.js:13-14` prints `<DRIFT>` beside any tag outside this array; that is
 * drift reporting, not drift rejection. `tag` is therefore declared as a plain
 * string below, deliberately NOT `enum: DOSSIER_TAGS` - enum-ing it would turn
 * adding a tag into a schema change and would contradict the very script this
 * export exists to serve.
 */
export const DOSSIER_TAGS = [
  'aspiration', 'worldview', 'motivation', 'notable_event', 'sire',
  'embrace_event', 'touchstone', 'notable_enemy', 'hunting_method',
  'faction_history', 'family_member', 'key_location', 'haven',
  'notable_ally', 'mortal_vocation', 'secret', 'embrace_location',
  'current_activity', 'mortal_faction', 'birthplace', 'signature_ability',
  'debt', 'boon', 'birth_year', 'brood_sibling', 'early_nights',
];

/**
 * The four `source` values observed on live facts (excel:357, history:51,
 * downtime:18, questionnaire:16).
 *
 * A DOCUMENTED INVENTORY, NOT A CLOSED VOCABULARY. `source` is likewise NOT
 * enumed below: `server/scripts/_rene-disambig.js:11` filters on
 * `source: 'st'`, a value no live fact carries, which is direct evidence the
 * vocabulary is still open.
 */
export const DOSSIER_FACT_SOURCES = ['excel', 'history', 'downtime', 'questionnaire'];

/**
 * `severity` IS a genuinely closed, ordered vocabulary (live: major:10,
 * life_threatening:2, minor:1 - all on secret-tagged facts), so it is the one
 * field here that is enumed.
 */
export const DOSSIER_SEVERITIES = ['minor', 'major', 'life_threatening'];

const factSchema = {
  type: 'object',
  // `fact_key` sits alongside the four fields all 442 live facts already
  // carry. See the header for why requiring it is intended to fail live data
  // until the backfill runs.
  required: ['tag', 'value', 'source', 'st_hidden', 'fact_key'],
  additionalProperties: false,
  properties: {
    tag:    { type: 'string', minLength: 1 },   // see DOSSIER_TAGS - not enumed on purpose
    value:  { type: 'string' },
    source: { type: 'string', minLength: 1 },   // see DOSSIER_FACT_SOURCES - not enumed on purpose
    st_hidden: { type: 'boolean' },

    // Durable opaque per-fact key. Minted once at creation, never the array
    // index, never a value hash, preserved across ST re-authoring. See header.
    fact_key: { type: 'string', minLength: 1 },

    // Declared, never written by anything in this repo. Its only current
    // reader is TM Wiki's shipped `filterFactsForViewer`, so this is a live
    // reader contract rather than a dead field. Zero live facts carry one.
    revealed_to: { type: 'array', items: { type: 'string' } },

    note:        { type: 'string' },
    sheet_field: { type: 'string' },
    sheet_value: { type: 'string' },
    clash:       { type: 'boolean' },

    // Holds a NAME, not a reference - `_dossier-audit.js:27` already reports
    // every live value as `(NAME - not a ref)`. Turning it into a real
    // reference is DBO-7's problem, not this schema's.
    counterparty: { type: 'string' },

    // Both shapes are live (string:18, null:6).
    npc_id: { type: ['string', 'null'] },

    since:       { type: 'string' },
    severity:    { type: 'string', enum: DOSSIER_SEVERITIES },
    compromised: { type: 'boolean' },

    // NOT enumed. Only one live value exists (`outstanding`, on 9 boon/debt
    // facts), nothing reads it, and a debt plausibly gains `settled` or
    // `forgiven` later - enum-ing a single observed value would turn a data
    // edit into a schema change.
    status: { type: 'string', minLength: 1 },
  },
};

export const characterDossierSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title:   'TM Character Dossier',
  type:    'object',
  required: ['character_id', 'facts'],
  additionalProperties: false,

  properties: {
    // Live `_id` is a BSON ObjectId on all 30 documents; the same tolerance
    // as `character_id` applies, for the same reason.
    _id: { type: ['string', 'object'] },

    // ALL 30 LIVE DOCUMENTS STORE A BSON ObjectId here, not a string. This
    // declaration is the authority TM Wiki's `server/routes/characters.js`
    // was reaching for, and why their `['string', 'object']` tolerance plus
    // `String()` normalisation is correct rather than defensive noise.
    // Ajv cannot express BSON ObjectId directly, so `'object'` is the honest
    // declaration, not a shrug: consumers normalise with `String()`.
    character_id: { type: ['string', 'object'] },

    facts: { type: 'array', items: factSchema },

    // Provenance of the dossier as a whole (excel:23, history:4,
    // questionnaire:2, absent on 1).
    source:      { type: 'string' },
    source_note: { type: 'string' },   // present on exactly 1 live document
    updated_at:  { type: 'string' },   // ISO-8601 string, e.g. '2026-06-21T14:00:00Z'
  },
};
