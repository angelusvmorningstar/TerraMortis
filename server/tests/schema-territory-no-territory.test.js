/**
 * Unit tests — territory fields accept the "--" (no territory) option (#514).
 *
 * The territory pill's `--` option serialises to '' (no territory). The schema's
 * `territoryOid` previously required a strict ObjectId (`^[a-f0-9]{24}$`) and
 * rejected '', so any project/action left as `--` 400'd the whole submission.
 * Fix: `^([a-f0-9]{24})?$` — accepts '' OR a 24-hex ObjectId, still rejects
 * slugs/garbage. Covers `project_${n}_territory` and `sphere_${n}_territory`.
 *
 * Compiles the schema with AJV (same setup as the validate middleware).
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

import { downtimeSubmissionSchema } from '../schemas/downtime_submission.schema.js';

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validate = ajv.compile(downtimeSubmissionSchema);

const OID = '69d4e1d6277e2b2144b6166c'; // a valid 24-hex ObjectId

function minimalSubmission(overrides = {}) {
  return {
    character_id: OID,
    status: 'draft',
    responses: {},
    ...overrides,
  };
}

describe('territoryOid accepts the "--" (no territory) option (#514)', () => {
  it("AC#1: project_1_territory: '' (no territory) validates", () => {
    expect(validate(minimalSubmission({ responses: { project_1_territory: '' } }))).toBe(true);
  });

  it('AC#2: project_1_territory: <ObjectId> still validates (no regression)', () => {
    expect(validate(minimalSubmission({ responses: { project_1_territory: OID } }))).toBe(true);
  });

  it('AC#3: project_1_territory: a slug is still rejected', () => {
    expect(validate(minimalSubmission({ responses: { project_1_territory: 'the_docklands' } }))).toBe(false);
  });

  it('AC#4: sphere_1_territory behaves the same — "" valid, OID valid, slug rejected', () => {
    expect(validate(minimalSubmission({ responses: { sphere_1_territory: '' } }))).toBe(true);
    expect(validate(minimalSubmission({ responses: { sphere_1_territory: OID } }))).toBe(true);
    expect(validate(minimalSubmission({ responses: { sphere_1_territory: 'underworld' } }))).toBe(false);
  });

  it('all four project slots set to "" (the common cycle-blocker case) validate together', () => {
    const responses = {};
    for (let n = 1; n <= 4; n++) responses[`project_${n}_territory`] = '';
    expect(validate(minimalSubmission({ responses }))).toBe(true);
  });

  // QA: the optional-ObjectId regex must still reject every near-miss, so the
  // empty-string allowance doesn't accidentally widen to garbage.
  it.each([
    ['23-hex (too short)', '69d4e1d6277e2b2144b6166'],
    ['25-hex (too long)',  '69d4e1d6277e2b2144b6166cc'],
    ['uppercase hex',      '69D4E1D6277E2B2144B6166C'],
    ['24 chars, one non-hex', 'g9d4e1d6277e2b2144b6166c'],
    ['leading space + OID', ' 69d4e1d6277e2b2144b6166c'],
    ['OID + trailing newline', '69d4e1d6277e2b2144b6166c\n'],
  ])('rejects %s', (_label, val) => {
    expect(validate(minimalSubmission({ responses: { project_1_territory: val } }))).toBe(false);
  });
});
