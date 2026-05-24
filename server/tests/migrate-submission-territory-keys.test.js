/**
 * Tests for the submission territory-key migration script (issue #496, story 496.3).
 *
 * Two sections:
 *   1. Unit tests for the pure helper functions (no DB needed).
 *   2. Integration tests against tm_suite_test using the exported
 *      auditSubmissions / applyUpdates / countLegacyKeysRemaining functions.
 *
 * All DB tests run against tm_suite_test (forced by vitest setupFile).
 * Tests seed their own fixtures and clean them up in afterEach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

import {
  isOidShaped,
  isBarrens,
  parseJsonField,
  auditJsonKeyField,
  auditValueField,
  auditSubmissions,
  applyUpdates,
  countLegacyKeysRemaining,
  buildTerritoryLookupMaps,
} from '../scripts/migrate-submission-territory-keys.js';

// ── Shared fixture data ─────────────────────────────────────────────────────

const TERRITORY_DOCS = [
  { _id: new ObjectId('69d5dc6a00815d47150397c6'), slug: 'harbour',    name: 'The Harbour' },
  { _id: new ObjectId('69d9e54b00815d471503bea6'), slug: 'northshore', name: 'The North Shore' },
  { _id: new ObjectId('69d9e54b00815d471503bea7'), slug: 'academy',    name: 'The Academy' },
  { _id: new ObjectId('69d9e54c00815d471503bea8'), slug: 'secondcity', name: 'The Second City' },
  { _id: new ObjectId('69d9e54c00815d471503bea9'), slug: 'dockyards',  name: 'The Dockyards' },
];

const MAPS = buildTerritoryLookupMaps(TERRITORY_DOCS);

// Canonical OIDs for convenience
const OID = {
  harbour:    '69d5dc6a00815d47150397c6',
  northshore: '69d9e54b00815d471503bea6',
  academy:    '69d9e54b00815d471503bea7',
  secondcity: '69d9e54c00815d471503bea8',
  dockyards:  '69d9e54c00815d471503bea9',
};

// ── Section 1: Unit tests (pure helpers, no DB) ─────────────────────────────

describe('isOidShaped', () => {
  it('recognises 24-char lowercase hex', () => {
    expect(isOidShaped('69d5dc6a00815d47150397c6')).toBe(true);
  });
  it('recognises uppercase hex', () => {
    expect(isOidShaped('69D5DC6A00815D47150397C6')).toBe(true);
  });
  it('rejects short strings', () => {
    expect(isOidShaped('harbour')).toBe(false);
    expect(isOidShaped('the_harbour')).toBe(false);
    expect(isOidShaped('')).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(isOidShaped(null)).toBe(false);
    expect(isOidShaped(undefined)).toBe(false);
    expect(isOidShaped(0)).toBe(false);
  });
});

describe('isBarrens', () => {
  it('matches the single-underscore variant (DT2)', () => {
    expect(isBarrens('the_barrens_no_territory_')).toBe(true);
  });
  it('matches the double-underscore variant (DT1)', () => {
    expect(isBarrens('the_barrens__no_territory_')).toBe(true);
  });
  it('matches display-name variants', () => {
    expect(isBarrens('The Barrens')).toBe(true);
    expect(isBarrens('The Barrens (No Territory)')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(isBarrens('THE_BARRENS')).toBe(true);
  });
  it('does not match non-Barrens territory keys', () => {
    expect(isBarrens('the_harbour')).toBe(false);
    expect(isBarrens('academy')).toBe(false);
    expect(isBarrens('69d5dc6a00815d47150397c6')).toBe(false);
  });
  it('does not match non-strings', () => {
    expect(isBarrens(null)).toBe(false);
    expect(isBarrens(undefined)).toBe(false);
  });
});

describe('parseJsonField', () => {
  it('parses a JSON string', () => {
    expect(parseJsonField('{"the_harbour":"none"}')).toEqual({ the_harbour: 'none' });
  });
  it('passes through a plain object', () => {
    const obj = { the_harbour: 'none' };
    expect(parseJsonField(obj)).toBe(obj);
  });
  it('returns null for null/undefined/empty', () => {
    expect(parseJsonField(null)).toBe(null);
    expect(parseJsonField(undefined)).toBe(null);
    expect(parseJsonField('')).toBe(null);
  });
  it('returns null for malformed JSON', () => {
    expect(parseJsonField('not-json')).toBe(null);
    expect(parseJsonField('{unclosed')).toBe(null);
  });
  it('returns null for arrays (not an object)', () => {
    expect(parseJsonField('[1,2,3]')).toBe(null);
  });
});

describe('auditJsonKeyField', () => {
  it('remaps long-slug keys to OID', () => {
    const raw = JSON.stringify({ the_harbour: 'none', the_academy: 'resident' });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.needsMigration).toBe(true);
    expect(result.remapped).toEqual({
      [OID.harbour]: 'none',
      [OID.academy]: 'resident',
    });
    expect(result.unresolvable).toHaveLength(0);
    expect(result.barrensKept).toBe(0);
  });

  it('preserves Barrens sentinels (single-underscore)', () => {
    const raw = JSON.stringify({
      the_harbour: 'none',
      the_barrens_no_territory_: 'none',
    });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.needsMigration).toBe(true);
    expect(result.remapped[OID.harbour]).toBe('none');
    expect(result.remapped['the_barrens_no_territory_']).toBe('none');
    expect(result.barrensKept).toBe(1);
  });

  it('preserves Barrens sentinels (double-underscore)', () => {
    const raw = JSON.stringify({ the_barrens__no_territory_: 'none' });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.needsMigration).toBe(false);
    expect(result.barrensKept).toBe(1);
    expect(result.remapped['the_barrens__no_territory_']).toBe('none');
  });

  it('counts already-OID keys without marking as needing migration', () => {
    const raw = JSON.stringify({
      [OID.harbour]: 'none',
      [OID.academy]: 'resident',
      the_barrens_no_territory_: 'none',
    });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.needsMigration).toBe(false);
    expect(result.alreadyOid).toBe(2);
    expect(result.barrensKept).toBe(1);
    expect(result.unresolvable).toHaveLength(0);
  });

  it('flags unresolvable keys', () => {
    const raw = JSON.stringify({ the_harbour: 'none', the_atlantis: 'none' });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.unresolvable).toContain('the_atlantis');
    expect(result.remapped['the_atlantis']).toBe('none'); // kept (caller will abort)
  });

  it('preserves values unchanged (including negative integers)', () => {
    const raw = JSON.stringify({ the_harbour: -1, the_academy: 3 });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.remapped[OID.harbour]).toBe(-1);
    expect(result.remapped[OID.academy]).toBe(3);
  });

  it('resolves display-name keys (influence_territories format)', () => {
    const raw = JSON.stringify({ 'The Harbour': 2, 'The Second City': 1 });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.needsMigration).toBe(true);
    expect(result.remapped[OID.harbour]).toBe(2);
    expect(result.remapped[OID.secondcity]).toBe(1);
  });

  it('resolves the "The Shore" typo to North Shore OID', () => {
    const raw = JSON.stringify({ 'The Shore': 2 });
    const result = auditJsonKeyField(raw, MAPS);
    expect(result.needsMigration).toBe(true);
    expect(result.remapped[OID.northshore]).toBe(2);
    expect(result.unresolvable).toHaveLength(0);
  });

  it('returns null for null/empty field', () => {
    expect(auditJsonKeyField(null, MAPS)).toBe(null);
    expect(auditJsonKeyField('{}', MAPS)).toBe(null);
  });
});

describe('auditValueField', () => {
  it('remaps short-slug to OID', () => {
    const result = auditValueField('northshore', MAPS);
    expect(result.needsMigration).toBe(true);
    expect(result.newValue).toBe(OID.northshore);
    expect(result.unresolvable).toBe(false);
  });

  it('detects already-OID value', () => {
    const result = auditValueField(OID.academy, MAPS);
    expect(result.needsMigration).toBe(false);
    expect(result.alreadyOid).toBe(true);
    expect(result.newValue).toBe(OID.academy);
  });

  it('returns null for empty string', () => {
    expect(auditValueField('', MAPS)).toBe(null);
    expect(auditValueField('   ', MAPS)).toBe(null);
  });

  it('returns null for null/undefined', () => {
    expect(auditValueField(null, MAPS)).toBe(null);
    expect(auditValueField(undefined, MAPS)).toBe(null);
  });

  it('flags unresolvable value', () => {
    const result = auditValueField('the_atlantis', MAPS);
    expect(result.unresolvable).toBe(true);
    expect(result.needsMigration).toBe(false);
  });
});

// ── Section 2: Integration tests (real tm_suite_test DB) ───────────────────

let client;
let db;
let seededTerritoryIds = [];
let seededSubmissionIds = [];

async function seedTerritories() {
  const col = db.collection('territories');
  const result = await col.insertMany(TERRITORY_DOCS.map(t => ({ ...t })));
  seededTerritoryIds = Object.values(result.insertedIds);
}

async function seedSubmissions(docs) {
  const col = db.collection('downtime_submissions');
  const result = await col.insertMany(docs);
  seededSubmissionIds = Object.values(result.insertedIds);
  return seededSubmissionIds;
}

async function cleanup() {
  if (seededTerritoryIds.length > 0) {
    await db.collection('territories').deleteMany({ _id: { $in: seededTerritoryIds } });
    seededTerritoryIds = [];
  }
  if (seededSubmissionIds.length > 0) {
    await db.collection('downtime_submissions').deleteMany({ _id: { $in: seededSubmissionIds } });
    seededSubmissionIds = [];
  }
}

beforeEach(async () => {
  const uri = process.env.MONGODB_URI;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'tm_suite_test');
  await seedTerritories();
});

afterEach(async () => {
  await cleanup();
  await client.close();
});

describe('auditSubmissions — integration', () => {
  it('detects legacy slug keys and builds the correct plan', async () => {
    const [subId] = await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({
            the_harbour: 'resident',
            the_academy: 'none',
            the_barrens_no_territory_: 'none',
          }),
          influence_spend: JSON.stringify({ the_dockyards: 2 }),
          sphere_1_territory: 'northshore',
        },
      },
    ]);

    const { plan, submissionUpdates } = await auditSubmissions(db);

    // Scope assertions to the seeded submission — tm_suite_test may have
    // pre-existing submissions from other test runs or dev fixtures.
    const seededUpdate = submissionUpdates.find(u => u._id.toString() === subId.toString());
    expect(seededUpdate).toBeDefined();

    const sets = seededUpdate.sets;
    const ft = JSON.parse(sets['responses.feeding_territories']);
    expect(ft[OID.harbour]).toBe('resident');
    expect(ft[OID.academy]).toBe('none');
    expect(ft['the_barrens_no_territory_']).toBe('none');
    expect(sets['responses.sphere_1_territory']).toBe(OID.northshore);

    // Field-level mutation counters reflect the seeded submission
    expect(plan.byField['feeding_territories'].mutations).toBeGreaterThanOrEqual(1);
    expect(plan.byField['influence_spend'].mutations).toBeGreaterThanOrEqual(1);
    expect(plan.byField['sphere_1_territory'].mutations).toBeGreaterThanOrEqual(1);
  });

  it('detects display-name keys in influence_territories', async () => {
    const [subId] = await seedSubmissions([
      {
        responses: {
          influence_territories: JSON.stringify({ 'The Harbour': 2, 'The Second City': 1 }),
        },
      },
    ]);

    const { submissionUpdates } = await auditSubmissions(db);
    const seededUpdate = submissionUpdates.find(u => u._id.toString() === subId.toString());
    expect(seededUpdate).toBeDefined();
    const it = JSON.parse(seededUpdate.sets['responses.influence_territories']);
    expect(it[OID.harbour]).toBe(2);
    expect(it[OID.secondcity]).toBe(1);
  });

  it('resolves "The Shore" typo to North Shore OID', async () => {
    const [subId] = await seedSubmissions([
      {
        responses: {
          influence_territories: JSON.stringify({ 'The Shore': 3 }),
        },
      },
    ]);

    const { submissionUpdates } = await auditSubmissions(db);
    const seededUpdate = submissionUpdates.find(u => u._id.toString() === subId.toString());
    expect(seededUpdate).toBeDefined();
    const it = JSON.parse(seededUpdate.sets['responses.influence_territories']);
    expect(it[OID.northshore]).toBe(3);
  });

  it('does not include an already-OID submission in submissionUpdates', async () => {
    const [subId] = await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({
            [OID.harbour]: 'none',
            [OID.academy]: 'resident',
            the_barrens_no_territory_: 'none',
          }),
          sphere_1_territory: OID.northshore,
        },
      },
    ]);

    const { submissionUpdates } = await auditSubmissions(db);
    const seededUpdate = submissionUpdates.find(u => u._id.toString() === subId.toString());
    expect(seededUpdate).toBeUndefined();
  });

  it('throws SAFETY_ABORT when a non-Barrens key is unresolvable', async () => {
    await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({ the_atlantis: 'none' }),
        },
      },
    ]);

    await expect(auditSubmissions(db)).rejects.toMatchObject({ code: 'SAFETY_ABORT' });
  });
});

describe('applyUpdates + countLegacyKeysRemaining — integration', () => {
  it('migrates a submission and post-state shows 0 legacy keys', async () => {
    const [subId] = await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({
            the_harbour: 'resident',
            the_north_shore: 'none',
            the_barrens_no_territory_: 'none',
          }),
          sphere_1_territory: 'academy',
        },
      },
    ]);

    const { submissionUpdates } = await auditSubmissions(db);
    await applyUpdates(db, submissionUpdates);

    const remaining = await countLegacyKeysRemaining(db);
    expect(remaining).toBe(0);

    // Verify the written doc directly
    const col = db.collection('downtime_submissions');
    const doc = await col.findOne({ _id: subId });
    const ft = JSON.parse(doc.responses.feeding_territories);
    expect(ft[OID.harbour]).toBe('resident');
    expect(ft[OID.northshore]).toBe('none');
    expect(ft['the_barrens_no_territory_']).toBe('none');
    expect(doc.responses.sphere_1_territory).toBe(OID.academy);
  });

  it('is idempotent: second audit finds seeded submission already migrated', async () => {
    const [subId] = await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({ the_harbour: 'none' }),
        },
      },
    ]);

    // First pass
    const first = await auditSubmissions(db);
    await applyUpdates(db, first.submissionUpdates);

    // Second pass — seeded submission should NOT appear in submissionUpdates
    const second = await auditSubmissions(db);
    const stillPending = second.submissionUpdates.find(
      u => u._id.toString() === subId.toString()
    );
    expect(stillPending).toBeUndefined();
  });

  it('handles double-underscore Barrens sentinel correctly', async () => {
    await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({
            the_harbour: 'none',
            the_barrens__no_territory_: 'none',
          }),
        },
      },
    ]);

    const { submissionUpdates } = await auditSubmissions(db);
    await applyUpdates(db, submissionUpdates);

    const remaining = await countLegacyKeysRemaining(db);
    expect(remaining).toBe(0);

    const col = db.collection('downtime_submissions');
    const [doc] = await col.find({ _id: { $in: seededSubmissionIds } }).toArray();
    const ft = JSON.parse(doc.responses.feeding_territories);
    expect(ft['the_barrens__no_territory_']).toBe('none'); // preserved
    expect(ft[OID.harbour]).toBe('none');
  });

  it('preserves negative integers in influence_territories values', async () => {
    await seedSubmissions([
      {
        responses: {
          influence_territories: JSON.stringify({ 'The Harbour': -1, 'The Academy': 3 }),
        },
      },
    ]);

    const { submissionUpdates } = await auditSubmissions(db);
    await applyUpdates(db, submissionUpdates);

    const col = db.collection('downtime_submissions');
    const [doc] = await col.find({ _id: { $in: seededSubmissionIds } }).toArray();
    const it = JSON.parse(doc.responses.influence_territories);
    expect(it[OID.harbour]).toBe(-1);
    expect(it[OID.academy]).toBe(3);
  });

  it('skips empty-string value fields without migrating them', async () => {
    await seedSubmissions([
      {
        responses: {
          feeding_territories: JSON.stringify({ the_harbour: 'none' }),
          sphere_1_territory: '',
          project_1_ambience_target: '',
        },
      },
    ]);

    const { plan, submissionUpdates } = await auditSubmissions(db);
    expect(plan.byField['sphere_1_territory'].mutations).toBe(0);
    expect(plan.byField['project_1_ambience_target'].mutations).toBe(0);
    await applyUpdates(db, submissionUpdates);

    const remaining = await countLegacyKeysRemaining(db);
    expect(remaining).toBe(0);
  });
});
