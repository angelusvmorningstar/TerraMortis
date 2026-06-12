/**
 * Contract tests — CYCLE epic #708, story 3: Phase controls
 * Static-grep assertions over server/routes/tracker.js and
 * public/js/admin/cycle-views.js.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const TRACKER     = fs.readFileSync('../server/routes/tracker.js', 'utf8');
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');

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

  it('exports setGamePhase function', () => {
    expect(CYCLE_VIEWS).toContain('setGamePhase');
  });

  it('calls DELETE /api/tracker_state on game phase set', () => {
    expect(CYCLE_VIEWS).toContain('/api/tracker_state');
  });

  it('shows confirm dialog before game phase transition', () => {
    expect(CYCLE_VIEWS).toContain('confirm(');
  });

  it('uses data-phase attribute on phase buttons', () => {
    expect(CYCLE_VIEWS).toContain('data-phase');
  });

  it('calls apiPut with game_phase on cycle update', () => {
    expect(CYCLE_VIEWS).toContain('game_phase');
    expect(CYCLE_VIEWS).toContain('apiPut');
  });

  it('highlights active phase with gold2 colour', () => {
    expect(CYCLE_VIEWS).toContain('gold2');
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
