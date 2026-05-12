/**
 * Regression test — Feeding Grounds double-free bug (Issue #43)
 *
 * Root cause: Yusuf's Feeding Grounds had free: 5 AND free_fwb: 5.
 * meritEffectiveRating sums all free_* channels → returned 10 instead of 5.
 * The fix is a data migration (server/scripts/fix-feeding-grounds-double-free.js)
 * that zeros free on any merit where free === free_fwb (same-value double-entry).
 *
 * These tests assert the meritEffectiveRating logic against the pre-fix and
 * post-fix shapes, and validate the migration detection condition.
 */

import { describe, it, expect } from 'vitest';

// Minimal re-implementation of meritEffectiveRating for a plain domain merit
// (no shared_with branch, no Herd SSJ/Flock). Mirrors domain.js:118-131.
function meritEffectiveRating(m) {
  return (m.cp || 0) + (m.xp || 0) + (m.free || 0)
    + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0)
    + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0)
    + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0)
    + (m.free_fwb || 0) + (m.free_attache || 0);
}

// Condition used by the migration script to detect the double-entry pattern.
function isDoubleEntry(m) {
  return (m.free || 0) > 0 && (m.free_fwb || 0) > 0 && m.free === m.free_fwb;
}

describe('Issue #43 — Feeding Grounds free_fwb double-entry', () => {

  it('pre-fix shape returns double the correct value (demonstrates the bug)', () => {
    const preFix = { cp: 0, xp: 0, free: 5, free_fwb: 5 };
    expect(meritEffectiveRating(preFix)).toBe(10);
  });

  it('post-fix shape (free zeroed) returns correct dot rating', () => {
    const postFix = { cp: 0, xp: 0, free: 0, free_fwb: 5 };
    expect(meritEffectiveRating(postFix)).toBe(5);
  });

  it('alternate correct shape (fwb zeroed, free only) returns correct dot rating', () => {
    const altFix = { cp: 0, xp: 0, free: 5, free_fwb: 0 };
    expect(meritEffectiveRating(altFix)).toBe(5);
  });

  it('no Feeding Grounds contribution returns 0', () => {
    const none = { cp: 0, xp: 0, free: 0, free_fwb: 0 };
    expect(meritEffectiveRating(none)).toBe(0);
  });

  it('detects the double-entry pattern correctly', () => {
    expect(isDoubleEntry({ free: 5, free_fwb: 5 })).toBe(true);
    expect(isDoubleEntry({ free: 3, free_fwb: 3 })).toBe(true);
  });

  it('does not flag single-channel entries as double-entry', () => {
    expect(isDoubleEntry({ free: 0, free_fwb: 5 })).toBe(false);
    expect(isDoubleEntry({ free: 5, free_fwb: 0 })).toBe(false);
    expect(isDoubleEntry({ free: 0, free_fwb: 0 })).toBe(false);
  });

  it('does not flag differing values as double-entry (ambiguous case)', () => {
    expect(isDoubleEntry({ free: 3, free_fwb: 5 })).toBe(false);
    expect(isDoubleEntry({ free: 5, free_fwb: 3 })).toBe(false);
  });

  it('post-migration: all dot ratings (1-5) produce correct pool bonus', () => {
    for (let dots = 1; dots <= 5; dots++) {
      const m = { cp: 0, xp: 0, free: 0, free_fwb: dots };
      expect(meritEffectiveRating(m)).toBe(dots);
    }
  });

  it('Yusuf fixture: pre-fix returns 10, post-fix returns 5', () => {
    const yusufPreFix = { name: 'Feeding Grounds', category: 'domain', cp: 0, xp: 0, free: 5, free_fwb: 5, rating: 5 };
    const yusufPostFix = { ...yusufPreFix, free: 0, rating: 5 };
    expect(meritEffectiveRating(yusufPreFix)).toBe(10);
    expect(meritEffectiveRating(yusufPostFix)).toBe(5);
    expect(isDoubleEntry(yusufPreFix)).toBe(true);
    expect(isDoubleEntry(yusufPostFix)).toBe(false);
  });

});
