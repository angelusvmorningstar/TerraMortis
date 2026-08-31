/**
 * Contract tests — CYCLE epic #708, story 3: Phase controls
 * Static-grep assertions over server/routes/tracker.js and
 * public/js/admin/cycle-views.js.
 *
 * #1116 (2026-08-31): three assertions re-pointed at their current location.
 * CM-1 (#1028) moved the canonical phase-write into a shared module, so
 * `setGamePhase`/the `apiPut`+`game_phase` pairing no longer live in
 * cycle-views.js itself — they moved to downtime/db.js + cycle-phase.js.
 * `gold2` never lived in the JS; the active-phase highlight is a CSS rule in
 * admin-layout.css (this project's own convention: no bare hex, --gold2
 * token only). All three behaviours are confirmed still live, just relocated
 * — re-pointed rather than deleted, per this issue's own instruction.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const TRACKER      = fs.readFileSync('../server/routes/tracker.js', 'utf8');
const CYCLE_VIEWS  = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const DOWNTIME_DB  = fs.readFileSync('../public/js/downtime/db.js', 'utf8');
const ADMIN_LAYOUT = fs.readFileSync('../public/css/admin-layout.css', 'utf8');

describe('epic.708.3 — tracker.js: DELETE /api/tracker_state', () => {
  it('has router.delete route', () => {
    expect(TRACKER).toContain('router.delete');
  });

  it('calls deleteMany on the tracker collection', () => {
    expect(TRACKER).toContain('deleteMany');
  });

  it('guards with FORBIDDEN for non-ST/dev roles', () => {
    expect(TRACKER).toContain("'FORBIDDEN'");
  });

  it('returns deleted count in response', () => {
    expect(TRACKER).toContain('deleted');
  });

  it('checks for st and dev roles', () => {
    expect(TRACKER).toContain("'st'");
    expect(TRACKER).toContain("'dev'");
  });
});

describe('epic.708.3 — cycle-views.js: phase control UI', () => {
  it('imports apiPut from api.js', () => {
    expect(CYCLE_VIEWS).toMatch(/import[^;]*apiPut[^;]*from/);
  });

  it('CM-1 (#1028): the canonical phase-writer setCyclePhase exists in downtime/db.js, not cycle-views.js', () => {
    // Relocated from cycle-views.js's own (since-removed) setGamePhase so
    // every API caller is bound by the same writer, not just this button.
    expect(DOWNTIME_DB).toContain('export async function setCyclePhase');
    expect(CYCLE_VIEWS).toContain('setCyclePhase');
  });

  // INVERTED BY CM-4a (2026-08-16), kept rather than deleted so the intent
  // stays on the record. The wipe moved off the client entirely: it is now
  // performed by the server route that mutates chapters.phase, in one
  // transaction with the phase write, so every API caller is bound by it and
  // not just this one button. The DELETE route itself is untouched and still
  // asserted above; what changed is who calls it. Behavioural coverage lives
  // in cm-4a-phase-transition-enforcement.test.js.
  it('does NOT wipe the tracker client-side any more (the server owns it)', () => {
    expect(CYCLE_VIEWS).not.toContain('/api/tracker_state');
  });

  it('shows confirm dialog before game phase transition', () => {
    expect(CYCLE_VIEWS).toContain('confirm(');
  });

  it('uses data-phase attribute on phase buttons (dataset.phase, same contract)', () => {
    // Same DOM attribute (`.dataset.phase` renders as `data-phase="..."`),
    // just spelled the JS-property way rather than the literal string.
    expect(CYCLE_VIEWS).toContain('dataset.phase');
  });

  it('the relocated phase-writer calls apiPut with game_phase on cycle update', () => {
    // apiPut + the game_phase field are still paired, just in db.js/
    // cycle-phase.js now (CM-1's single-writer discipline) rather than here.
    expect(DOWNTIME_DB).toContain('apiPut');
    expect(DOWNTIME_DB).toContain('game_phase');
  });

  it('highlights active phase with gold2 colour (CSS token, not JS)', () => {
    // No bare hex per this project's own convention — the highlight is the
    // --gold2 custom property on .cy-phase-btn.is-active in admin-layout.css.
    expect(ADMIN_LAYOUT).toMatch(/\.cy-phase-btn\.is-active\s*\{[^}]*--gold2/);
  });

  it('shows inline error on phase change failure', () => {
    expect(CYCLE_VIEWS).toContain('Phase change failed');
  });

  it('renders all three phase labels as buttons', () => {
    expect(CYCLE_VIEWS).toContain("'game'");
    expect(CYCLE_VIEWS).toContain("'downtime'");
    expect(CYCLE_VIEWS).toContain("'processing'");
  });
});
