/**
 * Contract tests — CYCLE epic #708, story 4: DT Prep Access Controls
 * Static-grep assertions over public/js/admin/cycle-views.js and
 * public/js/admin/downtime-views.js.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const DT_VIEWS    = fs.readFileSync('../public/js/admin/downtime-views.js', 'utf8');

describe('epic.708.4 — cycle-views.js: Prep Access section', () => {
  it('defines buildAccessSection function', () => {
    expect(CYCLE_VIEWS).toContain('buildAccessSection');
  });

  it('reads out_of_window_player_ids from cycle', () => {
    expect(CYCLE_VIEWS).toContain('out_of_window_player_ids');
  });

  it('writes out_of_window_player_ids via apiPut', () => {
    expect(CYCLE_VIEWS).toContain('apiPut');
    expect(CYCLE_VIEWS).toContain('out_of_window_player_ids');
  });

  it('renders a Prep Access button per cycle row', () => {
    expect(CYCLE_VIEWS).toContain('Prep Access');
  });

  it('accepts charList parameter in buildCyclesPanel', () => {
    expect(CYCLE_VIEWS).toContain('charList');
  });

  it('renders expandable detail row (detailTr)', () => {
    expect(CYCLE_VIEWS).toContain('detailTr');
  });

  it('reverts checkbox on API failure', () => {
    expect(CYCLE_VIEWS).toContain('cb.checked = !cb.checked');
  });

  it('filters out retired characters', () => {
    expect(CYCLE_VIEWS).toContain('retired');
  });
});

describe('epic.708.4 — downtime-views.js: Out-of-Window section removed', () => {
  it('does not contain dt-prep-early class', () => {
    expect(DT_VIEWS).not.toContain('dt-prep-early');
  });

  it('does not contain dt-early-toggle event handler', () => {
    expect(DT_VIEWS).not.toContain('dt-early-toggle');
  });
});
