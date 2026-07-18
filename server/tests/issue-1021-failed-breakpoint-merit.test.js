/**
 * Issue #1021 — validate the Failed Breakpoint merit doc shape and
 * confirm it passes the purchasable_power JSON Schema.
 *
 * Pure unit — no DB, no filesystem. Catches doc-shape drift from
 * the schema before any prod write.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { purchasablePowerSchema } from '../schemas/purchasable_power.schema.js';
import { FAILED_BREAKPOINT_DOC } from '../scripts/add-1021-failed-breakpoint-merit.js';

describe('#1021 — Failed Breakpoint merit', () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(purchasablePowerSchema);

  it('passes the purchasable_power JSON Schema', () => {
    const ok = validate(FAILED_BREAKPOINT_DOC);
    expect(ok, `schema errors: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
  });

  it('matches the requested shape verbatim', () => {
    expect(FAILED_BREAKPOINT_DOC.key).toBe('failed-breakpoint');
    expect(FAILED_BREAKPOINT_DOC.name).toBe('Failed Breakpoint');
    expect(FAILED_BREAKPOINT_DOC.category).toBe('merit');
    expect(FAILED_BREAKPOINT_DOC.sub_category).toBe('general');
    expect(FAILED_BREAKPOINT_DOC.description).toBe(
      'You have failed a break point that has reduced your humanity'
    );
    expect(FAILED_BREAKPOINT_DOC.rating_range).toEqual([2, 2]);
    expect(FAILED_BREAKPOINT_DOC.prereq).toBeNull();
  });
});
