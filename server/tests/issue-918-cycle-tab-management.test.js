import { describe, it, expect } from 'vitest';
import fs from 'fs';

const DOWNTIME = fs.readFileSync('../server/routes/downtime.js', 'utf8');
const DB       = fs.readFileSync('../public/js/downtime/db.js', 'utf8');
const VIEWS    = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const CSS      = fs.readFileSync('../public/css/admin-layout.css', 'utf8');

// ── Server: DELETE /api/downtime_cycles/:id ──────────────────────────────────

describe('issue-918 — cycle DELETE route', () => {
  it('DELETE /:id requires ST role', () =>
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete\s*\(\s*'\/:id'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('validates the id format (400)', () =>
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,400}VALIDATION_ERROR/));

  it('guards against deleting a cycle with submissions (409)', () => {
    expect(DOWNTIME).toContain('CYCLE_HAS_SUBMISSIONS');
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,600}countDocuments\(\{\s*cycle_id:\s*oid/);
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,600}status\(409\)/);
  });

  it('returns 404 when nothing was deleted', () =>
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,800}deletedCount === 0[\s\S]{0,120}NOT_FOUND/));
});

// ── Client db.js helpers ─────────────────────────────────────────────────────

describe('issue-918 — db.js cycle helpers', () => {
  it('exports deleteCycle', () =>
    expect(DB).toMatch(/export async function deleteCycle\(id\)/));

  it('deleteCycle DELETEs the cycle endpoint', () =>
    expect(DB).toMatch(/deleteCycle[\s\S]{0,120}apiDelete\('\/api\/downtime_cycles\/'\s*\+\s*id\)/));

  it('imports apiDelete', () =>
    expect(DB).toMatch(/import\s*\{[^}]*apiDelete[^}]*\}\s*from\s*'\.\.\/data\/api\.js'/));

  it('createCycle accepts label and chapterId options', () => {
    expect(DB).toMatch(/createCycle\(gameNumber,\s*\{[^}]*label/);
    expect(DB).toContain('chapterId');
    expect(DB).toMatch(/chapter_id = chapterId|body\.chapter_id = chapterId/);
  });
});

// ── Client cycle-views.js ────────────────────────────────────────────────────

describe('issue-918 — cycle-views.js wiring', () => {
  it('imports cycle CRUD + status helper from db.js', () =>
    expect(VIEWS).toMatch(/import\s*\{[^}]*createCycle[^}]*deleteCycle[^}]*deriveCycleStatus[^}]*\}\s*from\s*'\.\.\/downtime\/db\.js'/));

  it('renders a status ribbon', () => {
    expect(VIEWS).toContain('buildRibbon');
    expect(VIEWS).toContain('renderRibbon');
    expect(VIEWS).toContain('deriveCurrentCycle');
    expect(VIEWS).toContain('cy-ribbon');
  });

  it('phase toggle clears to neutral (active phase → null)', () =>
    expect(VIEWS).toMatch(/\(cy\.game_phase === phase\)\s*\?\s*null\s*:\s*phase/));

  it('clearing a phase does NOT reset the tracker — tracker delete is gated behind game phase', () => {
    const gameGuardIdx = VIEWS.indexOf("phaseOrNull === 'game'");
    const trackerDelIdx = VIEWS.indexOf("apiDelete('/api/tracker_state')");
    expect(gameGuardIdx).toBeGreaterThan(-1);
    expect(trackerDelIdx).toBeGreaterThan(gameGuardIdx);
  });

  it('inline-edits the label via updateCycle', () => {
    expect(VIEWS).toContain('buildLabelCell');
    expect(VIEWS).toMatch(/updateCycle\(cy\._id,\s*\{\s*label/);
  });

  it('assigns chapter via a dropdown writing chapter_id', () => {
    expect(VIEWS).toContain('buildChapterSelect');
    expect(VIEWS).toMatch(/updateCycle\(cy\._id,\s*\{\s*chapter_id/);
  });

  it('adds a new cycle via createCycle', () => {
    expect(VIEWS).toContain('new-cy-save');
    expect(VIEWS).toMatch(/createCycle\(num,\s*\{\s*label,\s*chapterId/);
  });

  it('add-cycle form uses the handler-free chapter picker (no phantom updateCycle)', () => {
    // Regression (QA #918): the add form must NOT reuse buildChapterSelect,
    // whose change handler persists to an existing cycle id. With no cycle to
    // write to, that fired updateCycle(undefined,...) and reverted the choice.
    expect(VIEWS).toContain('buildChapterPicker(chapters)');
    expect(VIEWS).not.toContain('buildChapterSelect({ chapter_id: null }');
  });

  it('deletes a cycle via deleteCycle with confirmation', () => {
    expect(VIEWS).toContain('btn-danger');
    expect(VIEWS).toMatch(/deleteCycle\(cy\._id\)/);
    expect(VIEWS).toContain('confirm(');
  });

  it('uses normalised CSS — no inline styles in the rewritten view', () => {
    expect(VIEWS).not.toContain('cssText');
    expect(VIEWS).not.toContain('style="');
  });
});

// ── CSS normalised classes ───────────────────────────────────────────────────

describe('issue-918 — admin-layout.css cycle classes', () => {
  it('defines the ribbon', () =>
    expect(CSS).toContain('.cy-ribbon'));

  it('defines the neutral phase chip', () =>
    expect(CSS).toContain('.cy-phase--none'));

  it('defines toggleable phase buttons', () => {
    expect(CSS).toContain('.cy-phase-btn');
    expect(CSS).toContain('.cy-phase-btn.is-active');
  });
});
