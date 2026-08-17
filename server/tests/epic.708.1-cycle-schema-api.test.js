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
  // different referent entirely. cm-2b is now that moment: the SUBMISSION
  // schema in this same file declares its own `chapter_id` (the FK into the
  // renamed `chapters` collection), so the assertion below is scoped to the
  // CYCLE schema's own block rather than the whole file.
  it('declares story_cycle_id field', () =>
    expect(SCHEMA).toContain('story_cycle_id'));

  it('story_cycle_id is nullable', () =>
    expect(SCHEMA).toMatch(/story_cycle_id.*\['string',\s*'null'\]/));

  it('no longer declares the old chapter_id field', () => {
    const cycleBlock = SCHEMA.slice(SCHEMA.indexOf('export const downtimeCycleSchema'));
    expect(cycleBlock).not.toMatch(/^\s*chapter_id\s*:/m);
  });

  // cm-2b: and the SUBMISSION schema is where `chapter_id` now legitimately
  // lives — same declared type as the `cycle_id` it replaced.
  it('the submission schema declares chapter_id, not cycle_id', () => {
    const subBlock = SCHEMA.slice(
      SCHEMA.indexOf('export const downtimeSubmissionSchema'),
      SCHEMA.indexOf('export const downtimeCycleSchema'),
    );
    expect(subBlock).toMatch(/^\s*chapter_id\s*:\s*\{ type: \['string', 'null'\] \}/m);
    expect(subBlock).not.toMatch(/^\s*cycle_id\s*:/m);
  });
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

  // cm-2 AC3: no deprecated alias is left behind, and cm-2b has now mounted
  // its OWN router at /api/chapters. Express is first-match-wins, so what this
  // has to prove is that the two mounts are distinct routers from distinct
  // files, not that /api/chapters is absent.
  it('mounts cm-2b cyclesRouter, not storyCyclesRouter, at /api/chapters', () => {
    expect(INDEX).toContain("import { cyclesRouter } from './routes/chapters.js';");
    expect(INDEX).toMatch(/app\.use\('\/api\/chapters',.*cyclesRouter\)/);
    expect(INDEX).not.toMatch(/app\.use\('\/api\/chapters',.*storyCyclesRouter\)/);
  });

  // cm-2b AC3: the old path is gone outright, no compatibility alias.
  it('leaves no /api/downtime_cycles mount behind', () =>
    expect(INDEX).not.toContain("'/api/downtime_cycles'"));
});
