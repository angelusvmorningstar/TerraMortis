/**
 * Contract tests — CYCLE epic #708, story 6: Attendance & XP Absorption
 * Static-grep assertions over cycle-views.js, downtime_submission.schema.js,
 * and the Story 4 Playwright spec (row index fix).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const SCHEMA      = fs.readFileSync('../server/schemas/downtime_submission.schema.js', 'utf8');
const SPEC        = fs.readFileSync('../tests/cycle-prep-access.spec.js', 'utf8');

describe('epic.708.6 — cycle-views.js: buildAttendanceSection', () => {
  it('defines buildAttendanceSection function', () => {
    expect(CYCLE_VIEWS).toContain('buildAttendanceSection');
  });

  it('reads and writes session_id on the cycle', () => {
    expect(CYCLE_VIEWS).toContain('session_id');
  });

  it('renders an Attendance button per cycle row', () => {
    expect(CYCLE_VIEWS).toContain('Attendance');
  });

  it('fetches game_sessions in initCycleView', () => {
    expect(CYCLE_VIEWS).toContain('game_sessions');
  });

  it('uses character_display for name lookup', () => {
    expect(CYCLE_VIEWS).toContain('character_display');
  });

  it('renders a totals row', () => {
    expect(CYCLE_VIEWS).toContain('Total (');
  });

  it('shows fallback message when no attendance recorded', () => {
    expect(CYCLE_VIEWS).toContain('No attendance recorded for this session.');
  });

  it('appends attendTr alongside detailTr in forEach', () => {
    expect(CYCLE_VIEWS).toContain('attendTr');
  });
});

describe('epic.708.6 — downtime_submission.schema.js: session_id field', () => {
  it('declares session_id in the cycle schema', () => {
    expect(SCHEMA).toContain('session_id');
  });
});

describe('epic.708.6 — cycle-prep-access.spec.js: updated row index', () => {
  it('uses nth(4) for cyc-002 prep access detail (row index updated for attendance rows)', () => {
    expect(SPEC).toContain('nth(4)');
  });

  it('does not use the old nth(3) locator for the cyc-002 detail row', () => {
    // nth(3) should not appear as a locator in the test body anymore
    expect(SPEC).not.toMatch(/\.nth\(3\)/);
  });
});
