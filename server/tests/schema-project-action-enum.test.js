/**
 * Unit tests — project action enum coverage in downtime_submission schema (#235).
 *
 * Form-side `PROJECT_ACTIONS` (public/js/tabs/downtime-data.js:10-21) lists
 * every action the player can pick. The server schema's `projectActionEnum`
 * gates POST /api/downtime_submissions; missing values land in 400
 * VALIDATION_ERROR. Pre-fix `'maintenance'` (added by dt-form.28) was missing
 * from the enum — latent landmine for any submission with a maintenance
 * project action.
 *
 * These tests compile the schema with AJV (same setup as the validate
 * middleware) and assert the enum accepts every form-side action value.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

import { downtimeSubmissionSchema } from '../schemas/downtime_submission.schema.js';

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validate = ajv.compile(downtimeSubmissionSchema);

// Mirrors public/js/tabs/downtime-data.js:10-21 (PROJECT_ACTIONS).
// Update both when adding a new project action.
const FORM_PROJECT_ACTIONS = [
  '',
  'ambience_change',
  'attack',
  'hide_protect',
  'investigate',
  'patrol_scout',
  'rote',
  'xp_spend',
  'misc',
  'maintenance',
];

function minimalSubmission(overrides = {}) {
  return {
    character_id: '69d4e1d6277e2b2144b6166c',
    status: 'draft',
    responses: {},
    ...overrides,
  };
}

describe('downtime_submission schema — projectActionEnum coverage (#235)', () => {
  for (const action of FORM_PROJECT_ACTIONS) {
    it(`accepts project_1_action='${action || '<empty>'}' as a valid project action`, () => {
      const doc = minimalSubmission({
        responses: { project_1_action: action },
      });
      const ok = validate(doc);
      const errs = (validate.errors || []).filter(e => /project_1_action/.test(e.instancePath || ''));
      expect(errs, JSON.stringify(errs)).toEqual([]);
      expect(ok).toBe(true);
    });
  }

  it('rejects an unknown project action value', () => {
    const doc = minimalSubmission({
      responses: { project_1_action: 'definitely_not_a_real_action' },
    });
    const ok = validate(doc);
    expect(ok).toBe(false);
    const enumErr = (validate.errors || []).find(e => e.keyword === 'enum' && /project_1_action/.test(e.instancePath || ''));
    expect(enumErr).toBeTruthy();
  });
});
