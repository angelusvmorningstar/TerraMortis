/**
 * Unit tests — #886 DT Story tab resolved-outcome publish path.
 *
 * After #886 the Story tab no longer re-authors per-section narratives. The
 * player-facing outcome is written directly in DT Processing
 * (feeding_review.outcome / projects_resolved[i].outcome) plus a player-facing
 * feedback note (player_facing_note). compilePushOutcome must now source the
 * Feeding and Project Reports sections of the published report from those
 * resolved fields instead of the deleted st_narrative.* drafts.
 *
 * `compilePushOutcome(sub, char, cycle)` lives in the browser admin module
 * `public/js/admin/downtime-story.js`; we dynamic-import it after stubbing the
 * browser globals it touches at module-load (mirrors compile-push-outcome-joint).
 */

// ── Browser shims (must run before the module import) ───────────────────────
globalThis.location = {
  origin: 'http://localhost:8080',
  hostname: 'localhost',
  href: 'http://localhost:8080/admin',
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || {
  addEventListener: () => {},
  createElement: () => ({ style: {}, addEventListener: () => {}, appendChild: () => {} }),
  getElementById: () => null,
};

import { describe, it, expect, beforeAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

let compilePushOutcome;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(
    pathResolve(__dirname, '..', '..', 'public', 'js', 'admin', 'downtime-story.js')
  ).href;
  const mod = await import(moduleUrl);
  compilePushOutcome = mod.compilePushOutcome;
});

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeChar(_id = 'char_886', name = 'Test Char') {
  // No home_territory (Home Report removed), no Cacophony dots, no merits — so
  // getApplicableSections yields story_moment + feeding + (projects if any).
  return { _id, name, moniker: '', honorific: '' };
}

function makeSub({
  feedingReview = { pool_status: 'no_feed' },
  projectsResolved = [],
  responses = {},
  forceHasContent = false,
} = {}) {
  return {
    _id: 'sub_886',
    character_id: 'char_886',
    chapter_id: 'cycle_886',
    status: 'submitted',
    responses,
    projects_resolved: projectsResolved,
    merit_actions: [],
    merit_actions_resolved: [],
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
    feeding_review: feedingReview,
    st_narrative: {
      project_responses: [],
      ...(forceHasContent ? { general_notes: '_test general notes_' } : {}),
    },
  };
}

// ── Feeding ───────────────────────────────────────────────────────────────────

describe('#886 compilePushOutcome — Feeding sourced from feeding_review.outcome', () => {
  it('publishes the resolved outcome and player-facing feedback under ## Feeding', () => {
    const sub = makeSub({
      feedingReview: {
        pool_status: 'validated',
        outcome: 'You drink deep at the masque, unseen.',
        player_facing_note: 'I swapped your feeding pool to Expression.',
      },
    });
    const out = compilePushOutcome(sub, makeChar());
    expect(out).toContain('## Feeding');
    expect(out).toContain('You drink deep at the masque, unseen.');
    expect(out).toContain('I swapped your feeding pool to Expression.');
    // The draft layer is gone — no DTSR-7 narrative should be consulted.
  });

  it('omits the Feeding section when no outcome has been written', () => {
    // Feeding validated but no outcome yet; a resolved project flips hasContent.
    const sub = makeSub({
      feedingReview: { pool_status: 'validated' },
      projectsResolved: [{ pool_status: 'validated', outcome: 'A project resolved.' }],
      responses: { project_1_title: 'Some Project' },
    });
    const out = compilePushOutcome(sub, makeChar());
    expect(out).not.toContain('## Feeding');
  });
});

// ── Project Reports ─────────────────────────────────────────────────────────

describe('#886 compilePushOutcome — Projects sourced from projects_resolved[i].outcome', () => {
  it('publishes the resolved outcome + player-facing feedback under the project title', () => {
    const sub = makeSub({
      projectsResolved: [{
        pool_status: 'validated',
        outcome: 'The deal closes by dawn.',
        player_facing_note: 'It cost you a favour to the Prince.',
      }],
      responses: { project_1_title: 'Broker the Deal' },
    });
    const out = compilePushOutcome(sub, makeChar());
    expect(out).toContain('## Broker the Deal');
    expect(out).toContain('The deal closes by dawn.');
    expect(out).toContain('It cost you a favour to the Prince.');
  });

  it('omits skipped project actions entirely', () => {
    const sub = makeSub({
      projectsResolved: [
        { pool_status: 'skipped', outcome: 'should not appear' },
        { pool_status: 'validated', outcome: 'This one is real.' },
      ],
      responses: { project_1_title: 'Skipped One', project_2_title: 'Real One' },
    });
    const out = compilePushOutcome(sub, makeChar());
    expect(out).not.toContain('Skipped One');
    expect(out).not.toContain('should not appear');
    expect(out).toContain('## Real One');
    expect(out).toContain('This one is real.');
  });

  it('shows gap-text for a non-skipped project with no resolved outcome', () => {
    const sub = makeSub({
      projectsResolved: [{ pool_status: 'validated' }],
      responses: { project_1_title: 'Pending One' },
      forceHasContent: true,
    });
    const out = compilePushOutcome(sub, makeChar());
    expect(out).toContain('## Pending One');
    expect(out).toMatch(/still finalising/);
  });
});
