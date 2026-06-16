/**
 * fix.797 — DT proc: confirmed outcome reverts to validated on reload.
 *
 * Two root causes fixed:
 *
 * 1. BLUR RACE (T1): clicking Confirm blurs the outcome textarea, firing both
 *    the blur handler and the click handler concurrently. The blur handler saves
 *    { outcome } without outcome_confirmed. If its PUT lands after the click's
 *    PUT, the DB ends up without outcome_confirmed → entry reverts to 'valid'
 *    on reload.
 *    Fix: blur handler reads the current review and returns early if
 *    outcome_confirmed is already true.
 *
 * 2. AUTO PLAYER POOL (T3): if the ST clicks Confirm without having set a roll
 *    mode, the confirm also auto-saves roll_mode:'player' + pool_status:'validated'
 *    (same effect as clicking Player Pool), guarded by hasPool && !review.roll.
 *
 * AC1 — blur handler reads current review before saving
 * AC2 — blur handler short-circuits when already confirmed
 * AC3 — confirm handler still saves outcome_confirmed
 * AC4 — confirm handler checks modeAlreadySet
 * AC5 — confirm handler auto-sets Player Pool mode when not set
 * AC6 — auto-set is guarded by hasPool and no existing roll
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');
const src  = readFileSync(resolve(root, 'public/js/admin/downtime-views.js'), 'utf8');

// Find the blur handler block for proc-outcome-input
const blurHandlerStart = src.indexOf('Wire outcome textarea (save on blur)');
// Find the confirm handler block
const confirmHandlerStart = src.indexOf('Wire confirm-outcome buttons');

// ── AC1: blur handler reads current review ────────────────────────────────────

describe('AC1 — blur handler reads current review before saving', () => {
  it('blur handler calls getEntryReview before saveEntryReview', () => {
    const reviewCallIdx  = src.indexOf('const review = getEntryReview(entry)', blurHandlerStart);
    const saveCallIdx    = src.indexOf('saveEntryReview(entry, { outcome:', blurHandlerStart);
    expect(reviewCallIdx).toBeGreaterThan(blurHandlerStart);
    expect(reviewCallIdx).toBeLessThan(saveCallIdx);
  });
});

// ── AC2: blur handler short-circuits when already confirmed ───────────────────

describe('AC2 — blur handler returns early if outcome_confirmed', () => {
  it('blur handler contains outcome_confirmed guard before save', () => {
    const guardIdx = src.indexOf('if (review?.outcome_confirmed) return', blurHandlerStart);
    const saveIdx  = src.indexOf('saveEntryReview(entry, { outcome:', blurHandlerStart);
    expect(guardIdx).toBeGreaterThan(blurHandlerStart);
    expect(guardIdx).toBeLessThan(saveIdx);
  });

  it('guard is between blur handler start and confirm handler start', () => {
    const guardIdx = src.indexOf('if (review?.outcome_confirmed) return', blurHandlerStart);
    expect(guardIdx).toBeLessThan(confirmHandlerStart);
  });
});

// ── AC3: confirm handler still saves outcome_confirmed ────────────────────────

describe('AC3 — confirm handler still saves outcome_confirmed: true', () => {
  it('outcome_confirmed: true appears in confirm handler', () => {
    const occIdx = src.indexOf('outcome_confirmed: true', confirmHandlerStart);
    expect(occIdx).toBeGreaterThan(confirmHandlerStart);
  });
});

// ── AC4: confirm handler checks modeAlreadySet ───────────────────────────────

describe('AC4 — confirm handler checks roll mode before auto-setting', () => {
  it('modeAlreadySet is derived from review.roll_mode in confirm handler', () => {
    const modeIdx = src.indexOf(
      "const modeAlreadySet = review.roll_mode === 'player'",
      confirmHandlerStart
    );
    expect(modeIdx).toBeGreaterThan(confirmHandlerStart);
  });
});

// ── AC5: confirm handler auto-sets Player Pool mode ──────────────────────────

describe('AC5 — confirm handler auto-sets Player Pool when mode not set', () => {
  it('patch.roll_mode = player appears in confirm handler', () => {
    const rollModeIdx = src.indexOf("patch.roll_mode = 'player'", confirmHandlerStart);
    expect(rollModeIdx).toBeGreaterThan(confirmHandlerStart);
  });

  it('patch.pool_status = validated appears in confirm handler', () => {
    const statusIdx = src.indexOf("patch.pool_status = 'validated'", confirmHandlerStart);
    expect(statusIdx).toBeGreaterThan(confirmHandlerStart);
  });
});

// ── AC6: auto-set guarded by hasPool and no roll ─────────────────────────────

describe('AC6 — auto-set is guarded by hasPool and !review.roll', () => {
  it('guard condition includes !modeAlreadySet && hasPool && !review.roll', () => {
    const guardIdx = src.indexOf(
      '!modeAlreadySet && hasPool && !review.roll',
      confirmHandlerStart
    );
    expect(guardIdx).toBeGreaterThan(confirmHandlerStart);
  });
});
