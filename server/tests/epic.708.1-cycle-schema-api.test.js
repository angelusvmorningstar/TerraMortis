import { describe, it, expect } from 'vitest';
import fs from 'fs';

const SCHEMA   = fs.readFileSync('../server/schemas/downtime_submission.schema.js', 'utf8');
const CHAPTERS = fs.readFileSync('../server/routes/chapters.js', 'utf8');
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

  it('declares chapter_id field', () =>
    expect(SCHEMA).toContain('chapter_id'));

  it('chapter_id is nullable', () =>
    expect(SCHEMA).toMatch(/chapter_id.*\['string',\s*'null'\]/));
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

// ── Chapters route ─────────────────────────────────────────────────────────

describe('epic.708.1 — chapters route handlers', () => {
  it('has GET / handler', () =>
    expect(CHAPTERS).toContain("chaptersRouter.get('/',"));

  it('has GET /:id handler', () =>
    expect(CHAPTERS).toContain("chaptersRouter.get('/:id',"));

  it('POST / requires ST role', () =>
    expect(CHAPTERS).toMatch(/chaptersRouter\.post\s*\(\s*'\/'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('PATCH /:id requires ST role', () =>
    expect(CHAPTERS).toMatch(/chaptersRouter\.patch\s*\(\s*'\/:id'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('DELETE /:id requires ST role', () =>
    expect(CHAPTERS).toMatch(/chaptersRouter\.delete\s*\(\s*'\/:id'\s*,\s*requireRole\s*\(\s*'st'\s*\)/));

  it('DELETE checks for in-use cycles and returns 409', () => {
    expect(CHAPTERS).toContain('CHAPTER_IN_USE');
    expect(CHAPTERS).toContain('409');
    expect(CHAPTERS).toContain('linked_cycles');
  });

  it('GET / sorts by number asc', () =>
    expect(CHAPTERS).toContain('number: 1'));

  it('POST / returns 201', () =>
    expect(CHAPTERS).toContain('201'));
});

// ── server/index.js mount ──────────────────────────────────────────────────

describe('epic.708.1 — server/index.js', () => {
  it('imports chaptersRouter', () =>
    expect(INDEX).toContain("from './routes/chapters.js'"));

  it("mounts chaptersRouter at '/api/chapters'", () =>
    expect(INDEX).toContain("'/api/chapters'"));

  it('mounts chapters with requireAuth', () =>
    expect(INDEX).toMatch(/\/api\/chapters.*requireAuth|requireAuth.*\/api\/chapters/));
});
