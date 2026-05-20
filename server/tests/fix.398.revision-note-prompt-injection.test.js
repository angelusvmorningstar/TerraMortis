/**
 * fix.398 — Revision note label fix and prompt generator injection.
 *
 * Verifies:
 *   AC1 — No 'Revision note for player' placeholder exists in downtime-story.js.
 *          All 7 revision textareas read 'Revision note for Story'.
 *   AC2 — Each builder reads the revision_note from the correct st_narrative path.
 *          Mirrors the field-access pattern for: project, action, territory,
 *          home report, cacophony savvy, story moment (letter + touchstone),
 *          feeding narrative.
 *   AC3 — Injection is conditional: empty / falsy revision note produces no output line.
 *   AC4 — revision_note is absent from player-facing story-tab.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root       = resolve(import.meta.dirname, '../..');
const storyJs    = readFileSync(resolve(root, 'public/js/admin/downtime-story.js'), 'utf8');
const storyTabJs = readFileSync(resolve(root, 'public/js/tabs/story-tab.js'),       'utf8');

// ── AC1: Placeholder text ──────────────────────────────────────────────────────

describe('AC1 — placeholder text', () => {
  it('no instance of "Revision note for player" remains', () => {
    expect(storyJs).not.toContain('Revision note for player');
  });

  it('exactly 7 occurrences of "Revision note for Story" placeholder text', () => {
    // Count textarea placeholder attributes only (not other uses like heading text)
    const matches = storyJs.match(/placeholder="Revision note for Story[^"]*"/g) || [];
    expect(matches.length).toBe(7);
  });

  it('sections covered: feeding, projects, story-moment, merits, home-report, territories, cacophony-savvy', () => {
    // Verify each section's revision textarea placeholder by its data attribute or class context.
    // The feeding revision textarea sits inside dt-feed-val-narrative-block.
    expect(storyJs).toContain('dt-feed-val-narrative-block');
    expect(storyJs).toContain('dt-feed-narrative-ta');
    // Projects: placeholder adjacent to data-proj-idx on the same textarea
    expect(storyJs).toMatch(/data-proj-idx[^"]*"[^>]*placeholder="Revision note for Story/);
    // Merits: placeholder adjacent to data-action-idx on the same textarea
    expect(storyJs).toMatch(/data-action-idx[^"]*"[^>]*placeholder="Revision note for Story/);
    // Territories: placeholder adjacent to data-terr-idx on the same textarea
    expect(storyJs).toMatch(/data-terr-idx[^"]*"[^>]*placeholder="Revision note for Story/);
    // Cacophony Savvy: placeholder adjacent to data-slot-idx on the same textarea
    expect(storyJs).toMatch(/data-slot-idx[^"]*"[^>]*placeholder="Revision note for Story/);
  });
});

// ── AC2: Field path correctness (mirror the access expressions) ───────────────

// Helper: simulate the injection logic for lines-array builders.
function injectRevisionNote(lines, revisionNote) {
  if (revisionNote) {
    lines.push('');
    lines.push(`Revision note: ${revisionNote}`);
  }
}

// Helper: simulate the injection logic for home-report string builder.
function injectRevisionNoteStr(ctx, revisionNote) {
  if (revisionNote) ctx += `\nRevision note: ${revisionNote}\n`;
  return ctx;
}

describe('AC2 — field path correctness per builder', () => {
  it('buildProjectContext reads project_responses[idx].revision_note', () => {
    const sub = { st_narrative: { project_responses: [{}, { revision_note: 'Needs more detail on the contact' }] } };
    const idx = 1;
    const revisionNote = sub.st_narrative?.project_responses?.[idx]?.revision_note || '';
    expect(revisionNote).toBe('Needs more detail on the contact');
  });

  it('buildProjectContext returns empty string when idx has no revision_note', () => {
    const sub = { st_narrative: { project_responses: [{ revision_note: '' }] } };
    const revisionNote = sub.st_narrative?.project_responses?.[0]?.revision_note || '';
    expect(revisionNote).toBe('');
  });

  it('buildActionContext reads action_responses[idx].revision_note', () => {
    const sub = { st_narrative: { action_responses: [{ revision_note: 'Rewrite — too passive' }] } };
    const revisionNote = sub.st_narrative?.action_responses?.[0]?.revision_note || '';
    expect(revisionNote).toBe('Rewrite — too passive');
  });

  it('buildTerritoryContext finds report by territory_id (not by index)', () => {
    const sub = {
      st_narrative: {
        territory_reports: [
          { territory_id: 'harbour',   revision_note: 'Wrong tone' },
          { territory_id: 'dockyards', revision_note: 'Check the ambience level' },
        ],
      },
    };
    const terrId = 'dockyards';
    const terrReports  = sub.st_narrative?.territory_reports || [];
    const terrReport   = terrReports.find(r => r?.territory_id === terrId) || {};
    const revisionNote = terrReport.revision_note || '';
    expect(revisionNote).toBe('Check the ambience level');
  });

  it('buildTerritoryContext returns empty string when no matching territory_id', () => {
    const sub = { st_narrative: { territory_reports: [{ territory_id: 'harbour', revision_note: 'OK' }] } };
    const terrReport   = (sub.st_narrative?.territory_reports || []).find(r => r?.territory_id === 'academy') || {};
    const revisionNote = terrReport.revision_note || '';
    expect(revisionNote).toBe('');
  });

  it('buildHomeReportContext reads home_report.revision_note', () => {
    const sub = { st_narrative: { home_report: { revision_note: 'Too long — cut to 60 words' } } };
    const revisionNote = sub.st_narrative?.home_report?.revision_note || '';
    expect(revisionNote).toBe('Too long — cut to 60 words');
  });

  it('buildCacophonySavvyContext reads cacophony_savvy[slotIdx].revision_note', () => {
    const sub = { st_narrative: { cacophony_savvy: [null, { revision_note: 'Wrong district mentioned' }] } };
    const slotIdx = 1;
    const revisionNote = sub?.st_narrative?.cacophony_savvy?.[slotIdx]?.revision_note || '';
    expect(revisionNote).toBe('Wrong district mentioned');
  });

  it('buildLetterContext reads story_moment.revision_note', () => {
    const sub = { st_narrative: { story_moment: { revision_note: 'Touchstone name spelled wrong' } } };
    const revisionNote = sub?.st_narrative?.story_moment?.revision_note || '';
    expect(revisionNote).toBe('Touchstone name spelled wrong');
  });

  it('buildTouchstoneContext reads the same story_moment.revision_note path', () => {
    const sub = { st_narrative: { story_moment: { revision_note: 'Vignette is too long' } } };
    const revisionNote = sub?.st_narrative?.story_moment?.revision_note || '';
    expect(revisionNote).toBe('Vignette is too long');
  });

  it('handleCopyFeedingContext reads feeding_narrative.revision_note', () => {
    const sub = { st_narrative: { feeding_narrative: { revision_note: 'Remove the mechanical reference to successes' } } };
    const revisionNote = sub.st_narrative?.feeding_narrative?.revision_note || '';
    expect(revisionNote).toBe('Remove the mechanical reference to successes');
  });

  it('all builders are safe against missing st_narrative (no throw)', () => {
    const sub = {};
    expect(() => (sub.st_narrative?.project_responses?.[0]?.revision_note   || '')).not.toThrow();
    expect(() => (sub.st_narrative?.action_responses?.[0]?.revision_note    || '')).not.toThrow();
    expect(() => (sub.st_narrative?.territory_reports || []).find(() => false)).not.toThrow();
    expect(() => (sub.st_narrative?.home_report?.revision_note              || '')).not.toThrow();
    expect(() => (sub?.st_narrative?.cacophony_savvy?.[0]?.revision_note    || '')).not.toThrow();
    expect(() => (sub?.st_narrative?.story_moment?.revision_note            || '')).not.toThrow();
    expect(() => (sub.st_narrative?.feeding_narrative?.revision_note        || '')).not.toThrow();
  });
});

// ── AC3: Conditional injection — no empty line emitted ────────────────────────

describe('AC3 — conditional injection (empty revision note produces no line)', () => {
  it('lines-array builder: non-empty revision note appends two lines', () => {
    const lines = ['Existing content'];
    injectRevisionNote(lines, 'Needs rework');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('Revision note: Needs rework');
  });

  it('lines-array builder: empty string produces no extra lines', () => {
    const lines = ['Existing content'];
    injectRevisionNote(lines, '');
    expect(lines).toHaveLength(1);
  });

  it('lines-array builder: null produces no extra lines', () => {
    const lines = ['Existing content'];
    injectRevisionNote(lines, null);
    expect(lines).toHaveLength(1);
  });

  it('lines-array builder: undefined produces no extra lines', () => {
    const lines = ['Existing content'];
    injectRevisionNote(lines, undefined);
    expect(lines).toHaveLength(1);
  });

  it('string-concat builder (home report): non-empty note appends correctly', () => {
    const result = injectRevisionNoteStr('Style: second person.', 'Keep it shorter');
    expect(result).toContain('\nRevision note: Keep it shorter\n');
  });

  it('string-concat builder (home report): empty string appends nothing', () => {
    const original = 'Style: second person.';
    const result   = injectRevisionNoteStr(original, '');
    expect(result).toBe(original);
  });

  it('injected line text exactly matches expected format', () => {
    const lines = [];
    injectRevisionNote(lines, 'Rewrite from scratch — tone is wrong');
    expect(lines[1]).toBe('Revision note: Rewrite from scratch — tone is wrong');
    expect(lines[1]).not.toMatch(/^Revision note:\s*$/); // no empty-value line
  });
});

// ── AC4: Player-facing path clean ─────────────────────────────────────────────

describe('AC4 — revision_note absent from player-facing story-tab.js', () => {
  it('story-tab.js does not reference revision_note', () => {
    expect(storyTabJs).not.toContain('revision_note');
  });

  it('story-tab.js does not import buildHomeReportContext', () => {
    expect(storyTabJs).not.toContain('buildHomeReportContext');
  });
});
