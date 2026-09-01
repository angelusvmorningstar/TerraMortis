import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

// cycle-views.js's only non-pure dependency is data/api.js (directly and via
// downtime/db.js), which touches `location`/`localStorage` at module load.
// Mocking it lets the phase-toggle assertion below be DRIVEN rather than
// pinned to a source snippet that has now drifted three times (CM-4a review
// finding P2, 2026-08-16).
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(async () => []),
  apiPut: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({})),
  apiRaw: vi.fn(async () => ({})),
  apiBase: () => '',
  headers: () => ({}),
}));

import { resetOnTransition } from '../../public/js/downtime/cycle-phase.js';
import { phaseToggleTarget } from '../../public/js/admin/cycle-views.js';

// cm-2b: the cycle DELETE route moved with cyclesRouter into chapters.js.
const DOWNTIME = fs.readFileSync('../server/routes/chapters.js', 'utf8');
const DB       = fs.readFileSync('../public/js/downtime/db.js', 'utf8');
const VIEWS    = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const CSS      = fs.readFileSync('../public/css/admin-layout.css', 'utf8');

// ── Server: DELETE /api/chapters/:id ──────────────────────────────────

describe('issue-918 — cycle DELETE route', () => {
  it('DELETE /:id requires ST role', () =>
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete\s*\(\s*'\/:id'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('validates the id format (400)', () =>
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,400}VALIDATION_ERROR/));

  // cm-3 (2026-08-17): the proximity windows below were 600/800. The DELETE
  // handler gained a second 409 guard first (CYCLE_IS_STORY_FINALE, AC10) plus
  // its comment, which pushed the submission guard and the 404 past the old
  // limits. Widened, not weakened — every assertion still has to find its
  // target inside this one route handler.
  // cm-2b review rework (2026-08-17): the guard used to be
  // `countDocuments({ chapter_id: oid })` — an ObjectId-ONLY equality that
  // counted zero for a Chapter whose submissions carry DT1-era string FKs, and
  // deleted it, orphaning them. It now goes through the shared dual-read shim.
  // The behavioural proof is in cm-2b-chapters-route-and-dual-read.test.js;
  // this is the source contract that the shared helper is what is used, rather
  // than a re-derived match. Windows widened for the added comment, not
  // weakened — every assertion still has to land inside this one handler.
  it('guards against deleting a cycle with submissions (409), via the shared FK shim', () => {
    expect(DOWNTIME).toContain('CYCLE_HAS_SUBMISSIONS');
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,1800}countDocuments\(chapterFkFilter\(oid\)\)/);
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,1800}status\(409\)/);
    expect(DOWNTIME).toMatch(/import \{ chapterFkFilter \} from '\.\.\/helpers\/chapter-fk\.js'/);
  });

  it('returns 404 when nothing was deleted', () =>
    expect(DOWNTIME).toMatch(/cyclesRouter\.delete[\s\S]{0,2000}deletedCount === 0[\s\S]{0,120}NOT_FOUND/));
});

// ── Client db.js helpers ─────────────────────────────────────────────────────

describe('issue-918 — db.js cycle helpers', () => {
  it('exports deleteCycle', () =>
    expect(DB).toMatch(/export async function deleteCycle\(id\)/));

  it('deleteCycle DELETEs the cycle endpoint', () =>
    expect(DB).toMatch(/deleteCycle[\s\S]{0,120}apiDelete\('\/api\/chapters\/'\s*\+\s*id\)/));

  it('imports apiDelete', () =>
    expect(DB).toMatch(/import\s*\{[^}]*apiDelete[^}]*\}\s*from\s*'\.\.\/data\/api\.js'/));

  // cm-2: chapterId -> storyCycleId, body.chapter_id -> body.story_cycle_id.
  it('createCycle accepts label and storyCycleId options', () => {
    expect(DB).toMatch(/createCycle\(gameNumber,\s*\{[^}]*label/);
    expect(DB).toContain('storyCycleId');
    expect(DB).toMatch(/story_cycle_id = storyCycleId|body\.story_cycle_id = storyCycleId/);
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

  // Toggle semantics unchanged, for the FOURTH time; only the reader keeps
  // moving. #918 hardcoded it, CM-1 (#1028) moved the read to uiPhase(), and
  // CM-4a's review (finding P2, 2026-08-16) moved it again - to the narrow
  // declaredPhase, via the exported phaseToggleTarget - because uiPhase widened
  // to resolve the legacy `status` for the wipe decision, and a button reading
  // that widened value rendered active on a legacy `{status:'active'}` cycle
  // and wrote `phase: null` when clicked instead of `phase: 'downtime'`.
  //
  // This assertion was left red by CM-1 and reached production unnoticed
  // (caught by CM-5a's review, 2026-08-10), so it is now written as BEHAVIOUR
  // rather than as a source snippet: the shape it pinned has drifted three
  // times, and driving the real function cannot drift.
  it('phase toggle clears to neutral (active phase → null)', () => {
    expect(phaseToggleTarget({ phase: 'game' }, 'game')).toBe(null);
    expect(phaseToggleTarget({ game_phase: 'downtime' }, 'downtime')).toBe(null);
    // ...and a non-active button still sets its own phase.
    expect(phaseToggleTarget({ phase: 'game' }, 'prep')).toBe('prep');
  });

  // Intent unchanged and still true: clearing to neutral never wipes the
  // tracker. The MECHANISM has now moved three times - CM-1 kept the
  // hardcoded game check, CM-5a replaced it with resetOnTransition, and CM-4a
  // moved the wipe itself off the client into the cycles PUT route. The
  // predicate assertions below are the durable part; the client-side DELETE
  // this used to locate no longer exists, so its absence is asserted instead.
  it('clearing a phase does NOT reset the tracker', () => {
    expect(resetOnTransition('game', null)).toBe(false);
    expect(resetOnTransition('prep', null)).toBe(false);
    const guardIdx = VIEWS.indexOf('resetOnTransition(uiPhase(cy), phaseOrNull)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(VIEWS).not.toContain("apiDelete('/api/tracker_state')");
  });

  it('inline-edits the label via updateCycle', () => {
    expect(VIEWS).toContain('buildLabelCell');
    expect(VIEWS).toMatch(/updateCycle\(cy\._id,\s*\{\s*label/);
  });

  it('assigns story cycle via a dropdown writing story_cycle_id', () => {
    expect(VIEWS).toContain('buildStoryCycleSelect');
    expect(VIEWS).toMatch(/updateCycle\(cy\._id,\s*\{\s*story_cycle_id/);
  });

  it('adds a new cycle via createCycle', () => {
    expect(VIEWS).toContain('new-cy-save');
    expect(VIEWS).toMatch(/createCycle\(num,\s*\{\s*label,\s*storyCycleId/);
  });

  it('add-cycle form uses the handler-free story cycle picker (no phantom updateCycle)', () => {
    // Regression (QA #918): the add form must NOT reuse buildStoryCycleSelect,
    // whose change handler persists to an existing cycle id. With no cycle to
    // write to, that fired updateCycle(undefined,...) and reverted the choice.
    expect(VIEWS).toContain('buildStoryCyclePicker(storyCycles)');
    expect(VIEWS).not.toContain('buildStoryCycleSelect({ story_cycle_id: null }');
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
