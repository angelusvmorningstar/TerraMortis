import { describe, it, expect } from 'vitest';
import fs from 'fs';

const ADMIN_HTML  = fs.readFileSync('../public/admin.html', 'utf8');
const ADMIN_JS    = fs.readFileSync('../public/js/admin.js', 'utf8');
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');

// ── admin.html ─────────────────────────────────────────────────────────────

describe('epic.708.2 — admin.html sidebar + domain section', () => {
  it('has Cycle sidebar button with data-domain="cycle"', () =>
    expect(ADMIN_HTML).toContain('data-domain="cycle"'));

  it('has Cycle domain section with id="d-cycle"', () =>
    expect(ADMIN_HTML).toContain('id="d-cycle"'));

  it('has cycle-content target div', () =>
    expect(ADMIN_HTML).toContain('id="cycle-content"'));

  it('Cycle button appears between Downtime and Ordeals', () => {
    const dtIdx     = ADMIN_HTML.indexOf('data-domain="downtime"');
    const cycleIdx  = ADMIN_HTML.indexOf('data-domain="cycle"');
    const ordIdx    = ADMIN_HTML.indexOf('data-domain="ordeals"');
    expect(dtIdx).toBeGreaterThan(-1);
    expect(cycleIdx).toBeGreaterThan(dtIdx);
    expect(ordIdx).toBeGreaterThan(cycleIdx);
  });
});

// ── admin.js ───────────────────────────────────────────────────────────────

describe('epic.708.2 — admin.js wiring', () => {
  it('imports initCycleView', () =>
    expect(ADMIN_JS).toContain('initCycleView'));

  it('imports from cycle-views.js', () =>
    expect(ADMIN_JS).toContain('cycle-views.js'));

  it('calls initCycleView on cycle domain switch', () =>
    expect(ADMIN_JS).toMatch(/domain === 'cycle'.*initCycleView|initCycleView.*domain === 'cycle'/s));
});

// ── cycle-views.js ─────────────────────────────────────────────────────────

describe('epic.708.2 — cycle-views.js', () => {
  it('exports initCycleView', () =>
    expect(CYCLE_VIEWS).toContain('export async function initCycleView'));

  it('fetches /api/chapters', () =>
    expect(CYCLE_VIEWS).toContain('/api/chapters'));

  it('fetches /api/downtime_cycles', () =>
    expect(CYCLE_VIEWS).toContain('/api/downtime_cycles'));

  it('uses apiGet from data/api.js', () =>
    expect(CYCLE_VIEWS).toContain("from '../data/api.js'"));

  it('handles fetch errors without throwing (try/catch present)', () =>
    expect(CYCLE_VIEWS).toContain('} catch (err)'));

  it('supports chapter creation via apiPost', () =>
    expect(CYCLE_VIEWS).toContain('apiPost'));

  it('supports chapter deletion via apiDelete', () =>
    expect(CYCLE_VIEWS).toContain('apiDelete'));

  it('maps game_phase values to human labels', () =>
    expect(CYCLE_VIEWS).toContain('PHASE_LABELS'));
});
