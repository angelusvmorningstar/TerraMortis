/**
 * oxp.10 — direct coverage for `server/scripts/seed-office-content.js`'s pure
 * functions and its reconciliation logic against real MongoDB.
 *
 * Added after external Codex review (2026-08-27) found this coverage did not
 * exist at all (Medium: "Task 7/AC10 claims direct seed, schema, and cache
 * tests that do not exist") — and, independently, found a REAL reconciliation
 * bug in the same pass (Medium, reproduced against a real replica set): an
 * existing document with any `kind` other than `'office'` or `'merit_caps'`
 * (a legacy leftover, a malformed insert) aliased onto the `merit_caps`
 * sentinel key, which let `--apply` finish "successfully" having never
 * written the real merit-caps singleton at all, with the orphan never
 * reported. Fixed in `seedOfficeContent()`'s own `keyOf()`; the regression
 * test below (`'an unrecognised-kind orphan...'`) is the permanent guard —
 * reverting the fix (bare `d.kind === 'office' ? d.category : 'merit_caps'`)
 * reproduces exactly this failure against real Mongo.
 *
 * Precedent: `bl3b-archived-seed-smoke.test.js` (bloodlines' own pure-function
 * coverage for its seed script) — same shape, pure functions need no
 * database, reconciliation needs a real collection.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Ajv from 'ajv';
import {
  checkIntegrity,
  buildSeedDocs,
  seedOfficeContent,
  OFFICE_DATA,
  MERIT_DOT_CAPS,
} from '../scripts/seed-office-content.js';
import { officeContentSchema } from '../schemas/office_content.schema.js';
import { getCollection } from '../db.js';
import { setupDb, isDbAvailable } from './helpers/db-setup.js';

const NOW = '2026-08-27T00:00:00.000Z';

// A clean two-office, two-cap source so each failure case changes exactly one thing.
const okOfficeData = () => ({
  'Head of State': {
    asset: 'Government House', style: 'First Among Equals',
    merits: ['Safe Place'],
    manoeuvres: [{ name: 'Due Diligence', effect: 'Spend Influence.' }],
    statusPower: ['You can raise or lower Status.'],
  },
  'Primogen': {
    asset: 'Chains of Office', style: 'Balance of Power',
    merits: ['Contacts'],
    manoeuvres: [{ name: 'People Talk', effect: 'Spend Influence.' }],
    statusPower: ['You can raise or lower Status, once.'],
  },
});
const okMeritCaps = () => ({ 'Safe Place': 5, 'Contacts': 5 });

// ─────────────────────────────────────────────────────────────────────────────
// checkIntegrity — the gate that runs before anything is built
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp-10 seed — checkIntegrity passes a clean source', () => {
  it('accepts the two-office sample with no errors', () => {
    const { errors, officeCount, meritCount } = checkIntegrity({ officeData: okOfficeData(), meritCaps: okMeritCaps() });
    expect(errors).toEqual([]);
    expect(officeCount).toBe(2);
    expect(meritCount).toBe(2);
  });

  it('accepts the real frozen source the seed script ships', () => {
    const { errors, officeCount, meritCount } = checkIntegrity({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS });
    expect(errors).toEqual([]);
    expect(officeCount).toBe(4);
    expect(meritCount).toBe(10);
  });
});

describe('oxp-10 seed — checkIntegrity refuses each defect class', () => {
  const failsWith = (officeData, meritCaps, pattern) => {
    const { errors } = checkIntegrity({ officeData, meritCaps });
    expect(errors.length, `expected at least one error matching ${pattern}`).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(pattern);
  };

  it('rejects a category not in OFFICE_CATEGORY_ENUM', () => {
    const data = okOfficeData();
    data['Not A Real Office'] = data['Primogen'];
    failsWith(data, okMeritCaps(), /"Not A Real Office" is not a known office category/);
  });

  it('rejects an empty asset', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], asset: '' };
    failsWith(data, okMeritCaps(), /"Primogen" has an empty or non-string "asset"/);
  });

  it('rejects an empty merits array', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], merits: [] };
    failsWith(data, okMeritCaps(), /"Primogen" has no merits array, or it is empty/);
  });

  it('rejects a manoeuvre with an empty name', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], manoeuvres: [{ name: '', effect: 'x' }] };
    failsWith(data, okMeritCaps(), /"Primogen" has a manoeuvre with an empty or missing name/);
  });

  it('rejects a manoeuvre with an empty effect', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], manoeuvres: [{ name: 'x', effect: '' }] };
    failsWith(data, okMeritCaps(), /manoeuvre "x" has an empty or missing effect/);
  });

  it('rejects a duplicate manoeuvre name within one office', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], manoeuvres: [{ name: 'x', effect: 'a' }, { name: 'x', effect: 'b' }] };
    failsWith(data, okMeritCaps(), /lists manoeuvre "x" more than once/);
  });

  it('rejects an empty statusPower array', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], statusPower: [] };
    failsWith(data, okMeritCaps(), /"Primogen" has no statusPower array, or it is empty/);
  });

  it('rejects a non-positive-integer merit cap', () => {
    failsWith(okOfficeData(), { ...okMeritCaps(), 'Contacts': 0 }, /MERIT_DOT_CAPS\["Contacts"\] is 0/);
  });

  it('rejects a non-integer merit cap', () => {
    failsWith(okOfficeData(), { ...okMeritCaps(), 'Contacts': 2.5 }, /MERIT_DOT_CAPS\["Contacts"\] is 2\.5/);
  });

  it('does NOT reject a merit listed by an office but absent from MERIT_DOT_CAPS (defaults to 5 downstream, by design), but DOES warn', () => {
    // Codex review, oxp-10 (Low): checkIntegrity's own comment used to
    // promise this warning without emitting one. This is the permanent
    // regression guard.
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], merits: ['Contacts', 'Some Unlisted Merit'] };
    const { errors, warnings } = checkIntegrity({ officeData: data, meritCaps: okMeritCaps() });
    expect(errors).toEqual([]);
    expect(warnings.join('\n')).toMatch(/"Primogen" lists merit "Some Unlisted Merit".*defaults? to a cap of 5/);
  });

  it('the real frozen source produces no warnings — every merit an office grants has a real cap entry', () => {
    const { warnings } = checkIntegrity({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS });
    expect(warnings).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSeedDocs — the documents that would actually be written
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp-10 seed — buildSeedDocs', () => {
  it('refuses to build from a source the gate rejects, rather than dropping rows', () => {
    const data = okOfficeData();
    data['Primogen'] = { ...data['Primogen'], merits: [] };
    expect(() => buildSeedDocs({ officeData: data, meritCaps: okMeritCaps() })).toThrow(/buildSeedDocs refused/);
  });

  it('builds one office document per category, sorted, plus exactly one merit_caps document', () => {
    const docs = buildSeedDocs({ officeData: okOfficeData(), meritCaps: okMeritCaps(), now: NOW });
    expect(docs).toHaveLength(3);
    const officeDocs = docs.filter(d => d.kind === 'office');
    expect(officeDocs.map(d => d.category)).toEqual(['Head of State', 'Primogen']); // sorted
    const capsDocs = docs.filter(d => d.kind === 'merit_caps');
    expect(capsDocs).toHaveLength(1);
    expect(capsDocs[0].caps).toEqual(okMeritCaps());
  });

  it('stamps created_at and updated_at identically on every document', () => {
    const docs = buildSeedDocs({ officeData: okOfficeData(), meritCaps: okMeritCaps(), now: NOW });
    for (const d of docs) {
      expect(d.created_at).toBe(NOW);
      expect(d.updated_at).toBe(NOW);
    }
  });

  it('builds the real frozen source into 4 office documents + 1 merit_caps document', () => {
    const docs = buildSeedDocs({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS, now: NOW });
    expect(docs.filter(d => d.kind === 'office')).toHaveLength(4);
    expect(docs.filter(d => d.kind === 'merit_caps')).toHaveLength(1);
  });

  it('produces documents that validate against officeContentSchema', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(officeContentSchema);
    const docs = buildSeedDocs({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS, now: NOW });
    for (const d of docs) {
      expect(validate(d), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// officeContentSchema — the discriminated oneOf itself
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp-10 — office_content.schema.js', () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(officeContentSchema);

  it('accepts Administrator as a schema-valid category — the schema does not enforce "no content yet"', () => {
    // Codex review, oxp-10 (Medium): the category enum matches
    // office_seat.schema.js's OFFICE_CATEGORY_ENUM exactly (AC1's literal
    // wording), all 5 values including Administrator — narrowing it would
    // force oxp-8 (explicitly content-only, no code dependency) into a code
    // deploy just to widen the schema. "No Administrator document exists
    // yet" is a fact about what the seed script produces (see the
    // OFFICE_DATA-has-no-Administrator-key test below), not a schema rule.
    const doc = {
      kind: 'office', category: 'Administrator', asset: 'x', style: 'x',
      merits: ['x'], manoeuvres: [{ name: 'x', effect: 'x' }], statusPower: ['x'],
    };
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('the frozen OFFICE_DATA has no Administrator key — the real reason no such document is seeded today', () => {
    expect(OFFICE_DATA.Administrator).toBeUndefined();
  });

  it('rejects a document that matches neither shape', () => {
    expect(validate({ kind: 'nonsense' })).toBe(false);
  });

  it('rejects a document that could be read as matching both shapes at once', () => {
    // A hybrid document with fields from both kinds must still fail oneOf
    // (exactly one match required) - additionalProperties:false on each
    // branch is what should reject this, not accidentally validate as both.
    const hybrid = {
      kind: 'office', category: 'Primogen', asset: 'x', style: 'x',
      merits: ['x'], manoeuvres: [{ name: 'x', effect: 'x' }], statusPower: ['x'],
      caps: { x: 1 }, // merit_caps-only field
    };
    expect(validate(hybrid)).toBe(false);
  });

  it('accepts a well-formed merit_caps document', () => {
    expect(validate({ kind: 'merit_caps', caps: { 'Safe Place': 5 } })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seedOfficeContent — reconciliation against a real collection
// ─────────────────────────────────────────────────────────────────────────────

const dbAvailable = await isDbAvailable();
const COLLECTION = 'office_content';

describe.skipIf(!dbAvailable)('oxp-10 seed — seedOfficeContent reconciliation (real MongoDB)', () => {
  beforeAll(async () => { await setupDb(); });
  beforeEach(async () => { await getCollection(COLLECTION).deleteMany({}); });
  afterAll(async () => { await getCollection(COLLECTION).deleteMany({}); });

  it('dry-run against an empty collection reports every document as "would insert" and writes nothing', async () => {
    const summary = await seedOfficeContent({ dryRun: true, log: false });
    expect(summary.wouldInsert).toBe(5);
    expect(summary.inserted).toBe(0);
    const count = await getCollection(COLLECTION).countDocuments({});
    expect(count).toBe(0);
  });

  it('--apply against an empty collection inserts all 5 documents and is idempotent on immediate re-run', async () => {
    const first = await seedOfficeContent({ dryRun: false, log: false });
    expect(first.inserted).toBe(5);
    const second = await seedOfficeContent({ dryRun: false, log: false });
    expect(second.inserted).toBe(0);
    expect(second.alreadyPresent).toBe(5);
    const count = await getCollection(COLLECTION).countDocuments({});
    expect(count).toBe(5);
  });

  it('reports DIFFERS and never overwrites a document that disagrees with the frozen source', async () => {
    await getCollection(COLLECTION).insertOne({
      kind: 'office', category: 'Primogen', asset: 'WRONG ASSET', style: 'x',
      merits: [], manoeuvres: [], statusPower: [],
    });
    const summary = await seedOfficeContent({ dryRun: false, log: false });
    expect(summary.differing.map(d => d.key)).toContain('office:Primogen');
    const live = await getCollection(COLLECTION).findOne({ kind: 'office', category: 'Primogen' });
    expect(live.asset).toBe('WRONG ASSET'); // untouched
  });

  it('refuses to apply when a genuine duplicate exists for the same natural key', async () => {
    // The real-world scenario this guards is a pre-migration bulk import that
    // landed duplicates BEFORE the unique index existed — so this test drops
    // the index `setupDb()` already created, to reach the same starting
    // state, rather than testing MongoDB's own index enforcement.
    const col = getCollection(COLLECTION);
    await col.dropIndexes();
    await col.insertMany([
      { kind: 'office', category: 'Primogen', asset: 'a', style: 'x', merits: [], manoeuvres: [], statusPower: [] },
      { kind: 'office', category: 'Primogen', asset: 'b', style: 'x', merits: [], manoeuvres: [], statusPower: [] },
    ]);
    await expect(seedOfficeContent({ dryRun: false, log: false })).rejects.toThrow(/duplicate document/);
    const count = await col.countDocuments({ kind: 'office', category: 'Primogen' });
    expect(count).toBe(2); // nothing written, nothing removed
  });

  it('an unrecognised-kind orphan is reported as an orphan and does NOT swallow the merit_caps singleton (Codex review regression test)', async () => {
    // The exact bug an external review found and reproduced: a document with
    // any kind other than 'office'/'merit_caps' used to alias onto the
    // merit_caps sentinel key in keyOf(), which skipped the real caps
    // document from `toInsert` (it looked "already present") and hid the
    // orphan from the report entirely. --apply used to "succeed" having
    // never written the caps singleton at all.
    const { insertedId } = await getCollection(COLLECTION).insertOne({
      kind: 'legacy', category: 'Old Office', notes: 'pre-migration leftover',
    });

    const summary = await seedOfficeContent({ dryRun: false, log: false });

    expect(summary.orphans).toContain(`unrecognised-kind:${insertedId}`);
    const capsDoc = await getCollection(COLLECTION).findOne({ kind: 'merit_caps' });
    expect(capsDoc).not.toBeNull();
    expect(capsDoc.caps).toEqual(MERIT_DOT_CAPS);
    // The orphan itself is left untouched, not deleted or merged.
    const orphanDoc = await getCollection(COLLECTION).findOne({ _id: insertedId });
    expect(orphanDoc.kind).toBe('legacy');
  });
});
