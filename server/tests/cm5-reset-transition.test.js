/**
 * CM-5a — the tracker slate-wipe moves to Prep entry; prep -> game is
 * non-destructive. Pure decision imported directly (no mirror); UI wiring
 * asserted via source text per the epic.708.1 convention.
 *
 * Ruling document: D:/Terra Mortis/cycle-model.md Rev 2 section 2;
 * story: specs/stories/cm5-tracker-reset-to-prep.story.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

// CM-4a review finding P4: the "names the tracker reset" test below is DRIVEN,
// not grepped. cycle-views.js's only non-pure dependency chain is
// data/api.js (reached directly and via downtime/db.js), which touches
// `location` and `localStorage` at module load, so mocking that one module is
// enough to import the real cycle-views.js and run writePhase for real. Same
// technique as dt-form-territory-fresh-fetch.test.js.
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(async () => []),
  apiPut: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({})),
  apiRaw: vi.fn(async () => ({})),
}));

import { resetOnTransition } from '../../public/js/downtime/cycle-phase.js';
import { apiPut } from '../../public/js/data/api.js';
import { writePhase } from '../../public/js/admin/cycle-views.js';

const VIEWS  = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const DVIEWS = fs.readFileSync('../public/js/admin/downtime-views.js', 'utf8');

describe('cm5a — resetOnTransition matrix (executable, the full table)', () => {
  it('entering prep from a PRECEDING phase resets (the once-per-chapter slate)', () => {
    for (const from of [null, 'downtime', 'processing']) {
      expect(resetOnTransition(from, 'prep')).toBe(true);
    }
  });

  it('re-entering prep does NOT reset (would discard feeds already confirmed this week)', () =>
    expect(resetOnTransition('prep', 'prep')).toBe(false));

  it('game -> prep does NOT reset (a misclick beside Game must not wipe a live session)', () =>
    expect(resetOnTransition('game', 'prep')).toBe(false));

  it('prep to game is NON-destructive (the point of this story)', () =>
    expect(resetOnTransition('prep', 'game')).toBe(false));

  it('entering game from any non-prep state keeps the legacy reset', () => {
    for (const from of [null, 'downtime', 'processing', 'game']) {
      expect(resetOnTransition(from, 'game')).toBe(true);
    }
  });

  it('downtime, processing and clear-to-neutral never reset', () => {
    for (const from of [null, 'downtime', 'processing', 'prep', 'game']) {
      expect(resetOnTransition(from, 'downtime')).toBe(false);
      expect(resetOnTransition(from, 'processing')).toBe(false);
      expect(resetOnTransition(from, null)).toBe(false);
    }
  });
});

describe('cm5a — UI wiring (source, per the 708.1 convention)', () => {
  // ASSERTION INVERTED BY CM-4a (2026-08-16), deliberately, and kept rather
  // than deleted - the same treatment CM-5a's own review finding C gave the
  // assertion it inverted.
  //
  // This test used to require that writePhase call
  // apiDelete('/api/tracker_state') EXACTLY ONCE, between the confirm and the
  // phase write. That was the defect CM-4a exists to remove: the wipe was a
  // courtesy one UI path extended, made as a second, unrelated HTTP request,
  // so any other caller of PUT /api/downtime_cycles/:id advanced the phase
  // with no wipe and no error. The wipe now belongs to the server route that
  // mutates the phase, inside one transaction with it.
  //
  // What the client still owes, and what this now asserts: the #1003 flip
  // warning, the resetOnTransition consult, the ST-facing confirm dialog,
  // cancel aborting the whole transition, and NO tracker call of its own.
  // The server guarantee is proven behaviourally, never by source text, in
  // cm-4a-phase-transition-enforcement.test.js.
  it('the Cycle tab writePhase consults resetOnTransition with the current uiPhase', () => {
    const start = VIEWS.indexOf('async function writePhase');
    const end = VIEWS.indexOf('function buildPhaseCell');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = VIEWS.slice(start, end);
    expect(body).toContain('resetOnTransition(uiPhase(cy), phaseOrNull)');
    // The client no longer wipes anything itself. Exactly one executor.
    expect(body).not.toContain('tracker_state');
    // Cancel aborts before any phase write: the confirm's false branch
    // returns immediately, and setCyclePhase comes after it.
    const confirmIdx = body.indexOf('if (!confirm(`Setting to ${label} phase');
    const writeIdx = body.indexOf('setCyclePhase(cy, phaseOrNull)');
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(confirmIdx);
    expect(body.slice(confirmIdx, writeIdx)).toContain('return false;');
  });

  it('the dialog label is phase-aware AND every resettable phase has a real label', () => {
    expect(VIEWS).toContain('const label = PHASE_LABELS[phaseOrNull];');
    // Guard against "Setting to undefined phase will reset...": both phases
    // resetOnTransition can fire for must exist in the label map.
    const map = VIEWS.slice(VIEWS.indexOf('const PHASE_LABELS'), VIEWS.indexOf('const PHASES'));
    expect(map).toMatch(/\bprep:\s*'Prep'/);
    expect(map).toMatch(/\bgame:\s*'Game'/);
  });

  // CM-4a added transitionFromPhase to the same import (the shared from-phase
  // reader uiPhase now delegates to), so this matches the named import rather
  // than the exact line it used to be.
  it('resetOnTransition is imported from the pure module', () =>
    expect(VIEWS).toMatch(/import\s*\{[^}]*resetOnTransition[^}]*\}\s*from\s*'\.\.\/downtime\/cycle-phase\.js'/));

  // The Cycle tab is the ONLY live phase-control surface. downtime-views.js's
  // handleOpenGamePhase looked like a second game-entry route but is dead code
  // (its sole reference is its own definition - verified by repo-wide grep,
  // review 2026-08-10), so CM-5a deliberately leaves it untouched rather than
  // wiring a reset into an unreachable function. If it is ever revived it must
  // consult resetOnTransition; this test fails loudly if it gains a listener
  // without one.
  it('the dead processing-view route stays dead, or gains the rule if revived', () => {
    const refs = (DVIEWS.match(/handleOpenGamePhase/g) || []).length;
    if (refs > 1) {
      expect(DVIEWS).toContain('resetOnTransition');
    } else {
      expect(refs).toBe(1);
      expect(DVIEWS).not.toContain('resetOnTransition');
    }
  });
});

// ── CM-4a AC7, driven (review finding P4) ────────────────────────────────────
//
// A failed wipe now arrives as a failed phase PUT rather than a separate
// "Tracker reset failed" throw, because the server performs both in one
// transaction. The ST must still be told that the tracker reset is the thing
// that did not happen.
//
// This used to be `expect(sourceOfWritePhase).toMatch(/tracker reset/i)`, which
// passed on the function's own doc-comment prose: deleting the entire try/catch
// would have left it green. It now rejects the real API call and reads the real
// surfaced error.
describe('cm5a/cm-4a — writePhase error surface (driven, not grepped)', () => {
  beforeEach(() => {
    vi.mocked(apiPut).mockReset();
    globalThis.confirm = () => true;
  });

  it('names the tracker reset when the failed transition was a resetting one', async () => {
    vi.mocked(apiPut).mockRejectedValue(new Error('502 Bad Gateway'));
    // downtime -> prep resets (resetOnTransition true), and skips the #1003
    // game-flip warning entirely, so nothing but the phase PUT is exercised.
    await expect(writePhase({ _id: 'c1', phase: 'downtime' }, 'prep'))
      .rejects.toThrow(/tracker reset/i);
  });

  it('does NOT invent a tracker reset when the transition was non-destructive', async () => {
    vi.mocked(apiPut).mockRejectedValue(new Error('502 Bad Gateway'));
    // prep -> prep does not reset, so the ST must see the raw failure and not
    // be told a reset was skipped that was never due.
    const err = await writePhase({ _id: 'c2', phase: 'prep' }, 'prep').catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('502 Bad Gateway');
    expect(err.message).not.toMatch(/tracker reset/i);
  });

  it('cancelling the reset dialog aborts before any write', async () => {
    globalThis.confirm = () => false;
    const ok = await writePhase({ _id: 'c3', phase: 'downtime' }, 'prep');
    expect(ok).toBe(false);
    expect(vi.mocked(apiPut)).not.toHaveBeenCalled();
  });
});
