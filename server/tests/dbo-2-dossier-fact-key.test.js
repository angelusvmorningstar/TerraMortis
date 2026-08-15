/**
 * DBO-2 - `character_dossier` schema plus the `fact_key` mint TM Wiki's
 * fact-level reveal path is waiting on.
 *
 * Three halves:
 *   1. Schema validation (AC7): direct Ajv tests against
 *      `characterDossierSchema`, using fixtures shaped like the real live
 *      documents (30 docs / 442 facts) rather than bare stubs.
 *   2. `_dossier-audit.js`'s dead import proven fixed (AC8), two ways. The
 *      audit script itself is NEVER imported here - it connects to Mongo with
 *      a top-level await at module load and hard-codes `db('tm_suite')`, so
 *      importing it in a test would reach LIVE data.
 *   3. The backfill script (AC6), exercised through its exported functions
 *      against `tm_suite_test` only, never by shelling out. The load-bearing
 *      assertions are the NON-mutations: every `st_hidden` still true, no
 *      fact gained a `revealed_to`, every pre-existing `fact_key` byte-for-
 *      byte unchanged.
 *
 * DB-backed for part 3: real MongoDB required. A skipped suite is not a
 * passing suite - read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// AC8 proof one: this is the SAME specifier `server/scripts/_dossier-audit.js`
// uses, from the same relative depth (`server/tests/` and `server/scripts/`
// are siblings), so a module-resolution failure fails this whole file.
import { characterDossierSchema, DOSSIER_TAGS, DOSSIER_FACT_SOURCES, DOSSIER_SEVERITIES } from '../schemas/character_dossier.schema.js';
import { setupDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { planBackfill, applyBackfill } from '../scripts/dbo-2-dossier-fact-key-backfill.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, '..');
const read = rel => readFileSync(join(SERVER_ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// AC7 - schema validation against the real live shapes
// ─────────────────────────────────────────────────────────────────────────────

describe('DBO-2: characterDossierSchema describes the real live documents', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(characterDossierSchema);

  // A minimal fact carrying exactly the five required fields.
  const baseFact = () => ({
    tag: 'aspiration',
    value: 'Wants the Prince gone before the century turns.',
    source: 'excel',
    st_hidden: true,
    fact_key: '11111111-2222-4333-8444-555555555555',
  });

  // Shaped like a real live document: ObjectId-ish character_id, a doc-level
  // `source`, an ISO `updated_at` string, and a facts array.
  const baseDoc = (facts = [baseFact()]) => ({
    character_id: { _bsontype: 'ObjectId' },
    source: 'excel',
    updated_at: '2026-06-21T14:00:00Z',
    facts,
  });

  it('validates a document shaped like a real live one, fact_key present on every fact', () => {
    const doc = baseDoc([
      baseFact(),
      { ...baseFact(), fact_key: 'k2', tag: 'secret', severity: 'major', compromised: true, note: 'Only two others know.' },
      { ...baseFact(), fact_key: 'k3', tag: 'debt', counterparty: 'Henry St. John', status: 'outstanding', since: '2024' },
      { ...baseFact(), fact_key: 'k4', tag: 'haven', sheet_field: 'haven', sheet_value: 'Warehouse, Pyrmont', clash: false },
      { ...baseFact(), fact_key: 'k5', tag: 'sire', npc_id: null },
      { ...baseFact(), fact_key: 'k6', tag: 'sire', npc_id: '664b1f0e0e0e0e0e0e0e0e0e' },
      { ...baseFact(), fact_key: 'k7', revealed_to: ['664b1f0e0e0e0e0e0e0e0e0e'] },
    ]);
    expect(validate(doc)).toBe(true);
  });

  it('validates the one live document that carries source_note', () => {
    expect(validate({ ...baseDoc(), source_note: 'Reconstructed from the 2026-06 history pass.' })).toBe(true);
  });

  it('AC2 - fails when fact_key is absent from one fact, and the failing keyword is `required`', () => {
    const { fact_key: _dropped, ...keyless } = baseFact();
    expect(validate(baseDoc([baseFact(), keyless]))).toBe(false);
    const missing = (validate.errors || [])
      .filter(e => e.keyword === 'required')
      .map(e => e.params?.missingProperty);
    expect(missing).toContain('fact_key');
  });

  it('AC3 - fails when st_hidden is absent from one fact (TM Wiki\'s filterFactsForViewer is fail-open)', () => {
    const { st_hidden: _dropped, ...open } = baseFact();
    expect(validate(baseDoc([open]))).toBe(false);
    const missing = (validate.errors || [])
      .filter(e => e.keyword === 'required')
      .map(e => e.params?.missingProperty);
    expect(missing).toContain('st_hidden');
  });

  it('validates character_id as a plain string AND as an object - both are the declared tolerance', () => {
    expect(validate({ ...baseDoc(), character_id: '664b1f0e0e0e0e0e0e0e0e0e' })).toBe(true);
    expect(validate({ ...baseDoc(), character_id: { _bsontype: 'ObjectId' } })).toBe(true);
  });

  it('rejects an undeclared field ON A FACT, naming it as the additionalProperty', () => {
    expect(validate(baseDoc([{ ...baseFact(), not_a_real_field: 'x' }]))).toBe(false);
    const additional = (validate.errors || []).map(e => e.params?.additionalProperty);
    expect(additional).toContain('not_a_real_field');
  });

  it('rejects an undeclared field on the document', () => {
    expect(validate({ ...baseDoc(), not_a_real_top_level_field: 'x' })).toBe(false);
    const additional = (validate.errors || []).map(e => e.params?.additionalProperty);
    expect(additional).toContain('not_a_real_top_level_field');
  });

  it('AC1 - severity IS enumed: `catastrophic` fails, the three live values pass', () => {
    expect(validate(baseDoc([{ ...baseFact(), severity: 'catastrophic' }]))).toBe(false);
    for (const sev of ['minor', 'major', 'life_threatening']) {
      expect(validate(baseDoc([{ ...baseFact(), severity: sev }]))).toBe(true);
    }
  });

  it('AC1 - status is NOT enumed: `settled` validates even though only `outstanding` exists live', () => {
    expect(validate(baseDoc([{ ...baseFact(), status: 'settled' }]))).toBe(true);
    expect(validate(baseDoc([{ ...baseFact(), status: 'outstanding' }]))).toBe(true);
  });

  it('AC4 - tag is NOT enumed: a tag outside DOSSIER_TAGS still validates (drift is reported, not rejected)', () => {
    expect(validate(baseDoc([{ ...baseFact(), tag: 'brand_new_tag' }]))).toBe(true);
  });

  it('AC4 - fact source is NOT enumed: `st` validates (it exists in _rene-disambig.js but in no live fact)', () => {
    expect(validate(baseDoc([{ ...baseFact(), source: 'st' }]))).toBe(true);
  });

  it('revealed_to is declared and optional: an array of strings validates, absent validates', () => {
    expect(validate(baseDoc([{ ...baseFact(), revealed_to: ['someid'] }]))).toBe(true);
    expect(validate(baseDoc([{ ...baseFact(), revealed_to: [] }]))).toBe(true);
    expect(validate(baseDoc([baseFact()]))).toBe(true);
    expect(validate(baseDoc([{ ...baseFact(), revealed_to: 'someid' }]))).toBe(false);
  });

  it('rejects an empty fact_key - it is opaque but never blank', () => {
    expect(validate(baseDoc([{ ...baseFact(), fact_key: '' }]))).toBe(false);
  });

  it('requires character_id and facts at the document level', () => {
    const { character_id: _c, ...noChar } = baseDoc();
    expect(validate(noChar)).toBe(false);
    const { facts: _f, ...noFacts } = baseDoc();
    expect(validate(noFacts)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 / AC8 - the exported inventories, and _dossier-audit.js's dead import
// ─────────────────────────────────────────────────────────────────────────────

describe('DBO-2: DOSSIER_TAGS export closes _dossier-audit.js:3\'s dead import', () => {
  it('exports exactly the 26 live tags', () => {
    expect(Array.isArray(DOSSIER_TAGS)).toBe(true);
    expect(DOSSIER_TAGS).toHaveLength(26);
    expect(new Set(DOSSIER_TAGS).size).toBe(26);
    // Spot-check both ends of the live frequency distribution.
    expect(DOSSIER_TAGS).toEqual(expect.arrayContaining([
      'aspiration', 'worldview', 'motivation', 'notable_event', 'sire', 'embrace_event',
      'touchstone', 'notable_enemy', 'hunting_method', 'faction_history', 'family_member',
      'key_location', 'haven', 'notable_ally', 'mortal_vocation', 'secret', 'embrace_location',
      'current_activity', 'mortal_faction', 'birthplace', 'signature_ability', 'debt', 'boon',
      'birth_year', 'brood_sibling', 'early_nights',
    ]));
  });

  it('exports the four observed fact sources and the three severities as documented inventories', () => {
    expect(DOSSIER_FACT_SOURCES).toEqual(['excel', 'history', 'downtime', 'questionnaire']);
    expect(DOSSIER_SEVERITIES).toEqual(['minor', 'major', 'life_threatening']);
  });

  it('_dossier-audit.js still imports DOSSIER_TAGS from ../schemas/character_dossier.schema.js', () => {
    const src = read('scripts/_dossier-audit.js');
    // Anchored to line-start with the `m` flag so a commented-out or
    // string-embedded import cannot false-pass - the exact false-pass DBO-9's
    // own external review found and fixed.
    expect(src).toMatch(/^import\s*\{[^}]*\bDOSSIER_TAGS\b[^}]*\}\s*from\s*['"]\.\.\/schemas\/character_dossier\.schema\.js['"]/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 / AC6 - the backfill script, against tm_suite_test only
// ─────────────────────────────────────────────────────────────────────────────

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('DBO-2: dbo-2-dossier-fact-key-backfill.mjs', () => {
  const ID_PREFIX = 'dbo-2-test-';
  const ids = {
    mixed: `${ID_PREFIX}doc-mixed`,   // every live fact shape, one already keyed
    stale: `${ID_PREFIX}doc-stale`,   // used for the stale-plan guard
    clean: `${ID_PREFIX}doc-clean`,   // fully keyed already - must not be planned at all
  };
  const PRE_EXISTING_KEY = 'dbo-2-pre-existing-key-do-not-touch';
  // A keyless fact that ALREADY carries `revealed_to`. Zero live facts are in
  // this state today, but it becomes the ordinary state the moment TM Wiki's
  // reveal mechanism goes live, so the preservation is pinned now.
  const PRE_EXISTING_REVEALED_TO = ['664b1f0e0e0e0e0e0e0e0e05', '664b1f0e0e0e0e0e0e0e0e06'];

  // Every shape observed in the live inventory (2026-08-14, 30 docs / 442
  // facts), not simplified stand-ins.
  const fixtures = () => ([
    {
      _id: ids.mixed,
      character_id: '664b1f0e0e0e0e0e0e0e0e01',
      source: 'excel',
      updated_at: '2026-06-21T14:00:00Z',
      facts: [
        // 0 - the four required fields only
        { tag: 'aspiration', value: 'Wants the Prince gone.', source: 'excel', st_hidden: true },
        // 1 - secret-tagged: severity / compromised / note
        { tag: 'secret', value: 'Fed on a Sheriff\'s ghoul.', source: 'history', st_hidden: true, severity: 'major', compromised: true, note: 'Two others know.' },
        // 2 - obligation: counterparty / status / since
        { tag: 'debt', value: 'Owes a boon for the Pyrmont favour.', source: 'downtime', st_hidden: true, counterparty: 'Henry St. John', status: 'outstanding', since: '2024' },
        // 3 - sheet cross-reference: sheet_field / sheet_value / clash
        { tag: 'haven', value: 'A disused wool store.', source: 'excel', st_hidden: true, sheet_field: 'haven', sheet_value: 'Warehouse, Pyrmont', clash: false },
        // 4 - npc_id: null (6 live facts carry the null form)
        { tag: 'sire', value: 'Sired by a Nosferatu long since gone.', source: 'questionnaire', st_hidden: true, npc_id: null },
        // 5 - npc_id: string (18 live facts carry the string form)
        { tag: 'notable_ally', value: 'Runs errands for the Harpy.', source: 'excel', st_hidden: true, npc_id: '664b1f0e0e0e0e0e0e0e0e02' },
        // 6 - ALREADY carries a fact_key: must survive byte-for-byte
        { tag: 'worldview', value: 'The city keeps its own accounts.', source: 'excel', st_hidden: true, fact_key: PRE_EXISTING_KEY },
        // 7 - NO fact_key (so it must be stamped) but ALREADY carries a
        // revealed_to: that array must come through untouched.
        { tag: 'notable_event', value: 'Named at the Prince\'s court.', source: 'history', st_hidden: true, revealed_to: [...PRE_EXISTING_REVEALED_TO] },
      ],
    },
    {
      _id: ids.stale,
      character_id: '664b1f0e0e0e0e0e0e0e0e03',
      source: 'history',
      updated_at: '2026-06-21T14:00:00Z',
      facts: [
        { tag: 'motivation', value: 'Fear of being forgotten.', source: 'history', st_hidden: true },
        { tag: 'birthplace', value: 'Glasgow.', source: 'history', st_hidden: true },
      ],
    },
    {
      _id: ids.clean,
      character_id: '664b1f0e0e0e0e0e0e0e0e04',
      source: 'excel',
      updated_at: '2026-06-21T14:00:00Z',
      facts: [
        { tag: 'boon', value: 'Holds a minor boon over the Seneschal.', source: 'excel', st_hidden: true, fact_key: 'already-keyed-a', counterparty: 'Cassian', status: 'outstanding' },
      ],
    },
  ]);

  const fixtureIds = Object.values(ids);
  const col = () => getCollection('character_dossier');

  // `planBackfill` scans the whole shared tm_suite_test collection by design
  // (that is the real, production-matching behaviour under test) - but every
  // WRITE below must stay scoped to this suite's own fixtures, or a stray
  // document left by another suite sharing this database gets stamped too.
  // (DBO-1's own external review found exactly this defect in DBO-1's tests.)
  const ownRows = rows => rows.filter(r => fixtureIds.includes(r._id));

  async function cleanupFixtures() {
    await col().deleteMany({ _id: { $in: fixtureIds } });
  }

  beforeAll(async () => { await setupDb(); });
  beforeEach(async () => {
    await cleanupFixtures();
    await col().insertMany(fixtures());
  });
  afterAll(async () => { await cleanupFixtures(); });

  it('plans exactly the unkeyed fact indices, omitting the fully-keyed document entirely', async () => {
    const rows = ownRows(await planBackfill(col()));
    const byId = Object.fromEntries(rows.map(r => [r._id, r]));

    expect(byId[ids.mixed].indices).toEqual([0, 1, 2, 3, 4, 5, 7]); // 6 is already keyed; 7 is keyless-but-revealed
    expect(byId[ids.stale].indices).toEqual([0, 1]);
    expect(byId[ids.clean]).toBeUndefined();
    expect(byId[ids.mixed].character_id).toBe('664b1f0e0e0e0e0e0e0e0e01');
  });

  it('dry run (the default) writes nothing', async () => {
    const rows = ownRows(await planBackfill(col()));
    const result = await applyBackfill(col(), rows, { apply: false });

    expect(result).toEqual({ documentsTouched: 0, factsStamped: 0, backedUp: 0 });
    const after = await col().findOne({ _id: ids.mixed });
    expect(after.facts.filter(f => f.fact_key !== undefined)).toHaveLength(1);
  });

  it('AC6 - apply stamps every unkeyed fact and mutates nothing else, byte-for-byte', async () => {
    const before = await col().find({ _id: { $in: fixtureIds } }).toArray();
    const beforeById = Object.fromEntries(before.map(d => [d._id, d]));

    const rows = ownRows(await planBackfill(col()));
    const result = await applyBackfill(col(), rows, { apply: true });

    expect(result.documentsTouched).toBe(2);
    expect(result.factsStamped).toBe(9); // 7 on mixed + 2 on stale
    expect(result.backedUp).toBe(2);

    const after = await col().find({ _id: { $in: fixtureIds } }).toArray();
    for (const doc of after) {
      const original = beforeById[doc._id];
      // Every top-level field except `facts` is untouched.
      const { facts: _af, ...restAfter } = doc;
      const { facts: _bf, ...restBefore } = original;
      expect(restAfter).toEqual(restBefore);
      expect(doc.facts).toHaveLength(original.facts.length);

      doc.facts.forEach((fact, i) => {
        expect(typeof fact.fact_key).toBe('string');
        expect(fact.fact_key.length).toBeGreaterThan(0);
        // st_hidden untouched; no fact acquired a revealed_to, and any fact
        // that already had one kept it exactly.
        expect(fact.st_hidden).toBe(true);
        if (Object.prototype.hasOwnProperty.call(original.facts[i], 'revealed_to')) {
          expect(fact.revealed_to).toEqual(original.facts[i].revealed_to);
        } else {
          expect(fact).not.toHaveProperty('revealed_to');
        }
        // Everything except fact_key is byte-for-byte identical.
        const { fact_key: _ak, ...restFactAfter } = fact;
        const { fact_key: _bk, ...restFactBefore } = original.facts[i];
        expect(restFactAfter).toEqual(restFactBefore);
      });
    }

    // The already-keyed fact kept its ORIGINAL key, not a fresh mint.
    const mixed = after.find(d => d._id === ids.mixed);
    expect(mixed.facts[6].fact_key).toBe(PRE_EXISTING_KEY);
    // A keyless fact carrying revealed_to gains its key WITHOUT the single-
    // field $set disturbing that array. This is the state every fact enters
    // once TM Wiki's reveal mechanism is live, so it is pinned explicitly
    // rather than left to the generic byte-for-byte sweep above.
    expect(typeof mixed.facts[7].fact_key).toBe('string');
    expect(mixed.facts[7].fact_key.length).toBeGreaterThan(0);
    expect(mixed.facts[7].revealed_to).toEqual(PRE_EXISTING_REVEALED_TO);
    // The fully-keyed document was never planned, so never written.
    const clean = after.find(d => d._id === ids.clean);
    expect(clean.facts[0].fact_key).toBe('already-keyed-a');
  });

  it('AC6 - minted keys are unique across every fact in the fixture set', async () => {
    const rows = ownRows(await planBackfill(col()));
    await applyBackfill(col(), rows, { apply: true });

    const after = await col().find({ _id: { $in: fixtureIds } }).toArray();
    const keys = after.flatMap(d => d.facts.map(f => f.fact_key));
    expect(keys).toHaveLength(11);
    expect(new Set(keys).size).toBe(11);
  });

  it('AC6 - is idempotent: a second plan is empty and a re-applied stale plan stamps zero', async () => {
    const firstPlan = ownRows(await planBackfill(col()));
    await applyBackfill(col(), firstPlan, { apply: true });
    const stamped = await col().find({ _id: { $in: fixtureIds } }).toArray();

    const secondPlan = ownRows(await planBackfill(col()));
    expect(secondPlan).toEqual([]);

    // Re-running the ORIGINAL plan is the harder idempotency case: the stale
    // indices all still exist, so only the $exists:false guard stops a re-mint.
    const second = await applyBackfill(col(), firstPlan, { apply: true });
    expect(second.factsStamped).toBe(0);

    const reread = await col().find({ _id: { $in: fixtureIds } }).toArray();
    const keysOf = docs => Object.fromEntries(docs.map(d => [d._id, d.facts.map(f => f.fact_key)]));
    expect(keysOf(reread)).toEqual(keysOf(stamped));
  });

  it('AC6 - a stale plan never overwrites a key stamped out of band between plan and apply', async () => {
    const rows = ownRows(await planBackfill(col()));
    expect(rows.find(r => r._id === ids.stale).indices).toEqual([0, 1]);

    // Another actor stamps facts.0 after planning, before applying.
    const OUT_OF_BAND = 'stamped-by-someone-else';
    await col().updateOne({ _id: ids.stale }, { $set: { 'facts.0.fact_key': OUT_OF_BAND } });

    await applyBackfill(col(), rows, { apply: true });

    const after = await col().findOne({ _id: ids.stale });
    expect(after.facts[0].fact_key).toBe(OUT_OF_BAND);
    expect(after.facts[1].fact_key).not.toBe(OUT_OF_BAND);
    expect(typeof after.facts[1].fact_key).toBe('string');
  });

  it('AC5 - a facts array REORDERED between plan and apply is still fully stamped', async () => {
    // The Pass 1 / Pass 3a finding of the DBO-2 external review. `row.indices`
    // describes the layout at PLAN time. If anything shifts the array before
    // the apply, iterating those stale positions stamps whatever slid into a
    // planned slot and silently misses the fact that was actually planned.
    // AC5 requires the write decisions - positions included - to come from the
    // fresh backup read, which makes this self-correcting.
    const rows = ownRows(await planBackfill(col()));
    expect(rows.find(r => r._id === ids.stale).indices).toEqual([0, 1]);

    // A REAL Mongo write between plan and apply, not a mutated JS variable:
    // another actor inserts an unkeyed fact at the FRONT, shifting both
    // planned facts one position to the right.
    await col().updateOne(
      { _id: ids.stale },
      {
        $push: {
          facts: {
            $each: [{ tag: 'secret', value: 'Inserted between plan and apply.', source: 'history', st_hidden: true }],
            $position: 0,
          },
        },
      }
    );

    await applyBackfill(col(), rows, { apply: true });

    const after = await col().findOne({ _id: ids.stale });
    expect(after.facts).toHaveLength(3);
    // Nothing was skipped by stale indexing: every fact actually present and
    // unkeyed at apply time carries a key now.
    for (const fact of after.facts) {
      expect(typeof fact.fact_key).toBe('string');
      expect(fact.fact_key.length).toBeGreaterThan(0);
    }
    expect(new Set(after.facts.map(f => f.fact_key)).size).toBe(3);
    // Named specifically: the fact that shifted to index 2 is the one a stale
    // index walk never visits.
    const byValue = Object.fromEntries(after.facts.map(f => [f.value, f]));
    expect(byValue['Glasgow.'].fact_key.length).toBeGreaterThan(0);
    expect(byValue['Fear of being forgotten.'].fact_key.length).toBeGreaterThan(0);
    expect(byValue['Inserted between plan and apply.'].fact_key.length).toBeGreaterThan(0);
  });

  it('AC5 - a present-but-INVALID fact_key is healed, and a valid one is still never touched', async () => {
    // The other Pass 1 finding: a presence-only completeness test treats
    // `fact_key: ''` / `null` as permanently complete, even though the schema
    // this story ships (`{ type: 'string', minLength: 1 }`) rejects exactly
    // those values, so no re-run could ever repair the document.
    const invalidId = `${ID_PREFIX}doc-invalid`;
    const VALID_KEY = 'a-genuinely-valid-key-keep-me';
    await col().insertOne({
      _id: invalidId,
      character_id: '664b1f0e0e0e0e0e0e0e0e07',
      source: 'excel',
      facts: [
        { tag: 'aspiration', value: 'Empty-string key.', source: 'excel', st_hidden: true, fact_key: '' },
        { tag: 'worldview', value: 'Null key.', source: 'excel', st_hidden: true, fact_key: null },
        { tag: 'boon', value: 'Valid key, must survive.', source: 'excel', st_hidden: true, fact_key: VALID_KEY },
      ],
    });
    try {
      const rows = await planBackfill(col());
      const row = rows.find(r => r._id === invalidId);
      expect(row).toBeDefined();
      expect(row.indices).toEqual([0, 1]); // the valid key at 2 is not planned

      await applyBackfill(col(), rows.filter(r => r._id === invalidId), { apply: true });

      const after = await col().findOne({ _id: invalidId });
      for (const i of [0, 1]) {
        expect(typeof after.facts[i].fact_key).toBe('string');
        expect(after.facts[i].fact_key.length).toBeGreaterThan(0);
      }
      expect(after.facts[0].fact_key).not.toBe(after.facts[1].fact_key);
      // Never overwrite an existing VALID key - that invariant is untouched.
      expect(after.facts[2].fact_key).toBe(VALID_KEY);
    } finally {
      await col().deleteOne({ _id: invalidId });
    }
  });

  it('does not touch a foreign document sharing this tm_suite_test collection', async () => {
    const foreignId = 'not-a-dbo-2-fixture';
    await col().insertOne({
      _id: foreignId,
      character_id: '664b1f0e0e0e0e0e0e0e0e09',
      facts: [{ tag: 'aspiration', value: 'Unrelated.', source: 'excel', st_hidden: true }],
    });
    try {
      const rows = ownRows(await planBackfill(col()));
      await applyBackfill(col(), rows, { apply: true });

      const foreign = await col().findOne({ _id: foreignId });
      expect(foreign.facts[0]).not.toHaveProperty('fact_key');
    } finally {
      await col().deleteOne({ _id: foreignId });
    }
  });

  it('a document whose facts array is missing or empty is omitted from the plan', async () => {
    const emptyId = `${ID_PREFIX}doc-empty`;
    await col().insertOne({ _id: emptyId, character_id: '664b1f0e0e0e0e0e0e0e0e08', facts: [] });
    try {
      const rows = await planBackfill(col());
      expect(rows.find(r => r._id === emptyId)).toBeUndefined();
    } finally {
      await col().deleteOne({ _id: emptyId });
    }
  });
});
