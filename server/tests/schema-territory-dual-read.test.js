/**
 * Schema tests — territory key dual-read tolerance (issue #496, story 496.1).
 *
 * Verifies that `project_${n}_territory` and `sphere_${n}_territory` accept
 * BOTH the legacy short-slug enum values AND ObjectId strings during the
 * migration grace window, while still rejecting garbage values.
 *
 * Companion to schema-project-action-enum.test.js (same AJV setup pattern).
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

import { downtimeSubmissionSchema } from '../schemas/downtime_submission.schema.js';

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validate = ajv.compile(downtimeSubmissionSchema);

// Live territory _id (The Harbour) — confirmed against tm_suite.territories
// in the audit. The actual OID isn't important for schema validation; the
// pattern check is `^[a-f0-9]{24}$` and we want the literal that production
// would see.
const LIVE_OID = '69d5dc6a00815d47150397c6';

/** Build a minimal valid submission with the supplied territory key. */
function makeSubmission(slot, field, value) {
  return {
    character_id: 'test-char-id',
    status: 'draft',
    responses: { [`${slot}_${field}`]: value },
  };
}

describe('project_${n}_territory — dual-read tolerance', () => {
  it.each([
    ['', 'empty string (unset)'],
    ['academy', 'short slug'],
    ['harbour', 'short slug'],
    ['northshore', 'short slug'],
    ['secondcity', 'short slug'],
    ['dockyards', 'short slug'],
    [LIVE_OID, 'ObjectId'],
    ['ffffffffffffffffffffffff', 'ObjectId pattern (any 24-char hex)'],
  ])('accepts %s (%s)', (value) => {
    const sub = makeSubmission('project_1', 'territory', value);
    expect(validate(sub)).toBe(true);
  });

  it.each([
    ['the_harbour',  'long slug (form-encoded — not stored in this enum field)'],
    ['The Harbour',  'display name'],
    ['garbage',      'unknown string'],
    ['too-short',    'wrong length for OID'],
    ['ffffff',       'short hex'],
    ['gggggggggggggggggggggggg', '24 chars but non-hex'],
  ])('rejects %s (%s)', (value) => {
    const sub = makeSubmission('project_1', 'territory', value);
    expect(validate(sub)).toBe(false);
  });
});

describe('sphere_${n}_territory — dual-read tolerance', () => {
  it.each([
    ['', 'empty string (unset)'],
    ['secondcity', 'short slug'],
    ['academy', 'short slug'],
    [LIVE_OID, 'ObjectId'],
  ])('accepts %s (%s)', (value) => {
    const sub = makeSubmission('sphere_2', 'territory', value);
    expect(validate(sub)).toBe(true);
  });

  it.each([
    ['the_secondcity', 'long slug'],
    ['Some Random Place', 'unknown string'],
    ['12345', 'short numeric'],
  ])('rejects %s (%s)', (value) => {
    const sub = makeSubmission('sphere_2', 'territory', value);
    expect(validate(sub)).toBe(false);
  });
});

describe('project_${n}_ambience_target — unchanged (already unconstrained string)', () => {
  // Audit found this field uses short slugs uniformly in live data. The
  // schema defines it as { type: 'string' } with no enum constraint — it
  // already accepts both OIDs and slugs and any other string. No schema
  // change in 496.1; this test pins that no accidental enum tightening
  // happened.
  it.each([
    ['', 'empty'],
    ['northshore', 'short slug'],
    [LIVE_OID, 'ObjectId'],
    ['anything-really', 'arbitrary string'],
  ])('accepts %s (%s)', (value) => {
    const sub = makeSubmission('project_1', 'ambience_target', value);
    expect(validate(sub)).toBe(true);
  });
});

describe('all four project slots and five sphere slots are covered', () => {
  // Sanity: the territoryKeyOrOid widening applies via the projectSlotProps
  // / sphereSlotProps factory. Each slot's territory field accepts an OID.
  for (const n of [1, 2, 3, 4]) {
    it(`project_${n}_territory accepts OID`, () => {
      const sub = makeSubmission(`project_${n}`, 'territory', LIVE_OID);
      expect(validate(sub)).toBe(true);
    });
  }
  for (const n of [1, 2, 3, 4, 5]) {
    it(`sphere_${n}_territory accepts OID`, () => {
      const sub = makeSubmission(`sphere_${n}`, 'territory', LIVE_OID);
      expect(validate(sub)).toBe(true);
    });
  }
});
