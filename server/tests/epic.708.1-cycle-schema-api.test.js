import { describe, it, expect } from 'vitest';
import fs from 'fs';

const SCHEMA   = fs.readFileSync('../server/schemas/downtime_submission.schema.js', 'utf8');
// cm-2: the router formerly at ../server/routes/chapters.js. The collection it
// serves was renamed `chapters` -> `story_cycles` (it always held Stories, not
// Chapters); the file moved with it.
const STORY_CYCLES = fs.readFileSync('../server/routes/story-cycles.js', 'utf8');
const INDEX    = fs.readFileSync('../server/index.js', 'utf8');
const DB       = fs.readFileSync('../public/js/downtime/db.js', 'utf8');

// ── Schema ─────────────────────────────────────────────────────────────────

describe('epic.708.1 — downtimeCycleSchema', () => {
  it('declares game_phase field', () =>
    expect(SCHEMA).toContain('game_phase'));

  it('game_phase enum includes processing', () =>
    expect(SCHEMA).toContain("'processing'"));

  it('game_phase is nullable', () =>
    expect(SCHEMA).toMatch(/game_phase.*\['string',\s*'null'\]/));

  // cm-2: chapter_id -> story_cycle_id. The old declaration is REMOVED, not
  // kept alongside, because cm-2b/cm-6 will reuse the name `chapter_id` for a
  // different referent entirely.
  it('declares story_cycle_id field', () =>
    expect(SCHEMA).toContain('story_cycle_id'));

  it('story_cycle_id is nullable', () =>
    expect(SCHEMA).toMatch(/story_cycle_id.*\['string',\s*'null'\]/));

  it('no longer declares the old chapter_id field', () =>
    expect(SCHEMA).not.toMatch(/^\s*chapter_id\s*:/m));
});

// ── deriveCycleStatus ──────────────────────────────────────────────────────

describe('epic.708.1 — deriveCycleStatus game_phase guard', () => {
  it("returns 'game' when game_phase is 'game'", () =>
    expect(DB).toContain("game_phase === 'game'"));

  it("returns 'active' when game_phase is 'downtime'", () =>
    expect(DB).toContain("game_phase === 'downtime'"));

  it("returns 'closed' when game_phase is 'processing'", () =>
    expect(DB).toContain("game_phase === 'processing'"));

  it('guard block precedes the legacy ps.projects check', () => {
    const gamePhaseIdx = DB.indexOf("game_phase === 'game'");
    const projectsIdx  = DB.indexOf('if (ps.projects)');
    expect(gamePhaseIdx).toBeGreaterThan(-1);
    expect(gamePhaseIdx).toBeLessThan(projectsIdx);
  });
});

// ── Story cycles route (was: chapters) ─────────────────────────────────────

describe('epic.708.1 — story cycles route handlers', () => {
  it('has GET / handler', () =>
    expect(STORY_CYCLES).toContain("storyCyclesRouter.get('/',"));

  it('has GET /:id handler', () =>
    expect(STORY_CYCLES).toContain("storyCyclesRouter.get('/:id',"));

  it('POST / requires ST role', () =>
    expect(STORY_CYCLES).toMatch(/storyCyclesRouter\.post\s*\(\s*'\/'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('PATCH /:id requires ST role', () =>
    expect(STORY_CYCLES).toMatch(/storyCyclesRouter\.patch\s*\(\s*'\/:id'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('DELETE /:id requires ST role', () =>
    expect(STORY_CYCLES).toMatch(/storyCyclesRouter\.delete\s*\(\s*'\/:id'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('DELETE checks for in-use cycles and returns 409', () => {
    expect(STORY_CYCLES).toContain('STORY_CYCLE_IN_USE');
    expect(STORY_CYCLES).toContain('409');
    expect(STORY_CYCLES).toContain('linked_cycles');
  });

  it('DELETE guard counts cycles by story_cycle_id', () =>
    expect(STORY_CYCLES).toMatch(/countDocuments\(\s*\{\s*story_cycle_id:/));

  it('reads the story_cycles collection', () =>
    expect(STORY_CYCLES).toContain("getCollection('story_cycles')"));

  it('GET / sorts by number asc', () =>
    expect(STORY_CYCLES).toContain('number: 1'));

  it('POST / returns 201', () =>
    expect(STORY_CYCLES).toContain('201'));
});

// ── server/index.js mount ──────────────────────────────────────────────────

describe('epic.708.1 — server/index.js', () => {
  it('imports storyCyclesRouter', () =>
    expect(INDEX).toContain("from './routes/story-cycles.js'"));

  it("mounts storyCyclesRouter at '/api/story_cycles'", () =>
    expect(INDEX).toContain("'/api/story_cycles'"));

  it('mounts story cycles with requireAuth', () =>
    expect(INDEX).toMatch(/\/api\/story_cycles.*requireAuth|requireAuth.*\/api\/story_cycles/));

  // cm-2 AC3: no deprecated alias is left behind. cm-2b will mount its own
  // router at /api/chapters, and Express first-match-wins would silently route
  // that traffic here.
  it('leaves no /api/chapters alias mounted', () =>
    expect(INDEX).not.toContain("'/api/chapters'"));
});
