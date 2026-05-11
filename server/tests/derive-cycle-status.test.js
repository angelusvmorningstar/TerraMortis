/**
 * Unit tests for deriveCycleStatus — the pure function that derives a
 * downtime cycle's effective status from its phase_signoff state and the
 * issue #231 manual_open override flag.
 *
 * Source of truth: public/js/downtime/db.js (deriveCycleStatus).
 *
 * Why this test mirrors the function rather than importing it directly:
 * db.js imports public/js/data/api.js, which references `location` at
 * module-load time — undefined in Node. The repo convention (see
 * server/tests/feeding-grounds-double-free.test.js) is to mirror the pure
 * function in the test file. Keep this mirror in lockstep with db.js.
 *
 * Behaviour matrix (issue #231):
 *   1. phase_signoff.projects signed → 'closed' (closed wins, AC-4)
 *   2. manual_open === true (strict)  → 'active' (AC-1, AC-3)
 *   3. !phase_signoff.prep            → 'prep'
 *   4. !phase_signoff.city            → 'game'
 *   5. else                           → 'active'
 */

import { describe, it, expect } from 'vitest';

// Mirror of deriveCycleStatus in public/js/downtime/db.js. If you change
// the production function, change this mirror in the same commit.
function deriveCycleStatus(cycle) {
  const ps = cycle?.phase_signoff || {};
  if (ps.projects) return 'closed';
  if (cycle?.manual_open === true) return 'active';
  if (!ps.prep) return 'prep';
  if (!ps.city) return 'game';
  return 'active';
}

const sig = { at: '2026-05-09T10:00:00.000Z', by: 'st-user-1' };

describe('deriveCycleStatus — regression (no override)', () => {
  it('returns "prep" when no phases signed', () => {
    expect(deriveCycleStatus({ phase_signoff: {} })).toBe('prep');
  });

  it('returns "prep" when phase_signoff is absent altogether', () => {
    expect(deriveCycleStatus({})).toBe('prep');
  });

  it('returns "game" when only prep signed', () => {
    expect(deriveCycleStatus({ phase_signoff: { prep: sig } })).toBe('game');
  });

  it('returns "active" when prep + city signed', () => {
    expect(deriveCycleStatus({ phase_signoff: { prep: sig, city: sig } })).toBe('active');
  });

  it('returns "closed" when prep + city + projects signed', () => {
    expect(deriveCycleStatus({
      phase_signoff: { prep: sig, city: sig, projects: sig },
    })).toBe('closed');
  });

  it('returns "closed" even with only projects signed (closed gate is independent)', () => {
    expect(deriveCycleStatus({ phase_signoff: { projects: sig } })).toBe('closed');
  });

  it('treats explicit manual_open: false the same as absent', () => {
    expect(deriveCycleStatus({ manual_open: false, phase_signoff: {} })).toBe('prep');
    expect(deriveCycleStatus({ manual_open: false, phase_signoff: { prep: sig } })).toBe('game');
  });
});

describe('deriveCycleStatus — manual_open override (issue #231)', () => {
  it('forces "active" when override on with no signoffs', () => {
    expect(deriveCycleStatus({ manual_open: true, phase_signoff: {} })).toBe('active');
  });

  it('forces "active" when override on with prep signed (would otherwise be "game")', () => {
    expect(deriveCycleStatus({
      manual_open: true,
      phase_signoff: { prep: sig },
    })).toBe('active');
  });

  it('stays "active" when override on with prep + city signed (would also be "active" without override — proves no over-derivation)', () => {
    expect(deriveCycleStatus({
      manual_open: true,
      phase_signoff: { prep: sig, city: sig },
    })).toBe('active');
  });

  it('returns "closed" when override on but projects signed (closed wins, AC-4)', () => {
    expect(deriveCycleStatus({
      manual_open: true,
      phase_signoff: { projects: sig },
    })).toBe('closed');
  });

  it('returns "closed" when override on with all three phases signed (closed wins regardless of override)', () => {
    expect(deriveCycleStatus({
      manual_open: true,
      phase_signoff: { prep: sig, city: sig, projects: sig },
    })).toBe('closed');
  });

  it('falls through to phase derivation when manual_open is the string "true" (strict equality discipline)', () => {
    // String 'true' from a hand-edited or migrated doc must NOT activate the override.
    expect(deriveCycleStatus({ manual_open: 'true', phase_signoff: {} })).toBe('prep');
    expect(deriveCycleStatus({ manual_open: 'true', phase_signoff: { prep: sig } })).toBe('game');
  });

  it('falls through when manual_open is 1 (truthy but not strictly true)', () => {
    expect(deriveCycleStatus({ manual_open: 1, phase_signoff: {} })).toBe('prep');
  });
});
