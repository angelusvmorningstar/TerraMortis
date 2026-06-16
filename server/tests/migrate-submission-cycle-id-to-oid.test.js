/**
 * Tests for the cycle_id migration script (issue #497, story 497).
 *
 * Two sections:
 *   1. Unit tests for the pure classifier (no DB needed).
 *   2. Integration tests against tm_suite_test using the exported
 *      auditSubmissions / applyUpdates / countStringCycleIdsRemaining functions.
 *
 * All DB tests run against tm_suite_test (forced by vitest setupFile via
 * MONGODB_DB). Tests seed their own fixtures and clean them up in afterEach.
 * Assertions are scoped to seeded _ids because tm_suite_test may hold
 * pre-existing submissions from other suites / dev fixtures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

import {
  isOidShaped,
  classifyCycleId,
  auditSubmissions,
  applyUpdates,
} from '../scripts/migrate-submission-cycle-id-to-oid.js';

// ── Section 1: Unit tests (pure classifier, no DB) ──────────────────────────

describe('isOidShaped', () => {
  it('recognises 24-char hex (lower and upper)', () => {
    expect(isOidShaped('69d0a3c5052b57f6be774e69')).toBe(true);
    expect(isOidShaped('69D0A3C5052B57F6BE774E69')).toBe(true);
  });
  it('rejects non-24-hex and non-strings', () => {
    expect(isOidShaped('not-an-oid')).toBe(false);
    expect(isOidShaped('123')).toBe(false);
    expect(isOidShaped('')).toBe(false);
    expect(isOidShaped(null)).toBe(false);
    expect(isOidShaped(new ObjectId())).toBe(false); // an ObjectId is not a string
  });
});

describe('classifyCycleId', () => {
  it('flags a valid-hex string for migration', () => {
    const r = classifyCycleId('69d0a3c5052b57f6be774e69');
    expect(r.needsMigration).toBe(true);
    expect(r.newValue).toBeInstanceOf(ObjectId);
    expect(String(r.newValue)).toBe('69d0a3c5052b57f6be774e69');
    expect(r.unresolvable).toBe(false);
  });
  it('skips an ObjectId (already migrated)', () => {
    const r = classifyCycleId(new ObjectId('69e955c784bbfc821bed2810'));
    expect(r.needsMigration).toBe(false);
    expect(r.unresolvable).toBe(false);
  });
  it('skips null and undefined', () => {
    expect(classifyCycleId(null).needsMigration).toBe(false);
    expect(classifyCycleId(undefined).needsMigration).toBe(false);
    expect(classifyCycleId(null).unresolvable).toBe(false);
  });
  it('marks an unparseable string as unresolvable (safety abort)', () => {
    const r = classifyCycleId('cycle_test_001');
    expect(r.needsMigration).toBe(false);
    expect(r.unresolvable).toBe(true);
  });
});

// ── Section 2: Integration tests (real tm_suite_test DB) ────────────────────

let client;
let db;
let seededCycleIds = [];
let seededSubmissionIds = [];

async function seedCycle() {
  const result = await db.collection('downtime_cycles').insertOne({ label: '497 Test Cycle', status: 'active' });
  seededCycleIds.push(result.insertedId);
  return result.insertedId;
}

async function seedSubmissions(docs) {
  const result = await db.collection('downtime_submissions').insertMany(docs);
  const ids = Object.values(result.insertedIds);
  seededSubmissionIds.push(...ids);
  return ids;
}

async function cleanup() {
  if (seededCycleIds.length) {
    await db.collection('downtime_cycles').deleteMany({ _id: { $in: seededCycleIds } });
    seededCycleIds = [];
  }
  if (seededSubmissionIds.length) {
    await db.collection('downtime_submissions').deleteMany({ _id: { $in: seededSubmissionIds } });
    seededSubmissionIds = [];
  }
}

beforeEach(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'tm_suite_test');
  await seedCycle(); // satisfies the ≥1-cycle safety guard
});

afterEach(async () => {
  await cleanup();
  await client.close();
});

describe('auditSubmissions — integration', () => {
  it('detects a string cycle_id and plans its conversion', async () => {
    const cid = '69d0a3c5052b57f6be774e69';
    const [strId, oidId] = await seedSubmissions([
      { character_id: 'c1', cycle_id: cid, status: 'submitted' },           // string → migrate
      { character_id: 'c2', cycle_id: new ObjectId(cid), status: 'submitted' }, // ObjectId → skip
    ]);

    const { submissionUpdates } = await auditSubmissions(db);

    const planned = submissionUpdates.find(u => u._id.toString() === strId.toString());
    expect(planned).toBeDefined();
    expect(planned.newCycleId).toBeInstanceOf(ObjectId);
    expect(String(planned.newCycleId)).toBe(cid);

    // The already-ObjectId doc is NOT in the update set.
    expect(submissionUpdates.find(u => u._id.toString() === oidId.toString())).toBeUndefined();
  });

  it('--apply converts string → ObjectId, and is idempotent on a second run', async () => {
    const cid = '69d0a3c5052b57f6be774e69';
    const [strId] = await seedSubmissions([
      { character_id: 'c1', cycle_id: cid, status: 'submitted' },
    ]);

    // First apply: convert just our seeded update(s).
    const { submissionUpdates } = await auditSubmissions(db);
    const mine = submissionUpdates.filter(u => seededSubmissionIds.some(id => id.toString() === u._id.toString()));
    await applyUpdates(db, mine);

    const after = await db.collection('downtime_submissions').findOne({ _id: strId });
    expect(after.cycle_id).toBeInstanceOf(ObjectId);
    expect(String(after.cycle_id)).toBe(cid);

    // Idempotency: re-classify the converted doc — no further migration needed.
    expect(classifyCycleId(after.cycle_id).needsMigration).toBe(false);
  });

  it('safety-aborts when a submission has an unparseable string cycle_id', async () => {
    await seedSubmissions([
      { character_id: 'c1', cycle_id: 'cycle_test_001', status: 'submitted' }, // not 24-hex
    ]);

    await expect(auditSubmissions(db)).rejects.toMatchObject({ code: 'SAFETY_ABORT' });
  });
});
