/**
 * feat #784 — DT processing: Confirm Outcome button
 *
 * downtime-views.js uses browser globals so can't be imported into vitest.
 * These tests assert the rendered source contains the correct patterns,
 * which is the appropriate coverage level for a DOM-rendering change.
 *
 * ACs covered:
 *   AC-1: Outcome textarea rows="4" at all three render sites
 *         (project, full merit, and — since feat.847/#847 — compact merit)
 *   AC-2: proc-confirm-outcome-btn present at all three render sites
 *   AC-5: proc-player-note-input absent from Outcome textarea
 *         (still present on Player Feedback textarea only)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(
  resolve(process.cwd(), '../public/js/admin/downtime-views.js'),
  'utf8'
);
const lines = src.split('\n');

/** Return all 1-indexed line numbers where `pattern` matches. */
function matchingLines(pattern) {
  return lines
    .map((l, i) => ({ n: i + 1, line: l }))
    .filter(({ line }) => pattern.test(line));
}

describe('feat-784 — Confirm Outcome button source assertions', () => {

  // ── AC-1: rows="4" on both Outcome textareas ─────────────────────────────

  describe('AC-1: Outcome textarea is rows="4"', () => {
    it('no Outcome textarea has rows="2"', () => {
      // The only rows="2" that remain should be Player Feedback textareas
      // (proc-player-note-input), not proc-outcome-input ones.
      const outcomeRows2 = matchingLines(/proc-outcome-input[^"]*"[^>]*rows="2"/);
      expect(outcomeRows2).toHaveLength(0);
    });

    it('exactly three proc-outcome-input textareas exist with rows="4"', () => {
      // Three render sites: project action panel, full merit panel, and
      // (since feat.847 / #847) the compact merit panel.
      const hits = matchingLines(/class="proc-outcome-input"[^>]*rows="4"/);
      expect(hits).toHaveLength(3);
    });
  });

  // ── AC-2: Confirm Outcome button at both render sites ────────────────────

  describe('AC-2: proc-confirm-outcome-btn present at both render sites', () => {
    it('exactly three Confirm button render lines', () => {
      // Button label is "Confirm" (renamed from "Confirm Outcome"); three
      // render sites since feat.847 added the compact merit panel. The double
      // quote after the class excludes the querySelectorAll handler line.
      const hits = matchingLines(/proc-confirm-outcome-btn"[^>]*>Confirm</);
      expect(hits).toHaveLength(3);
    });

    it('event handler wires proc-confirm-outcome-btn', () => {
      const hits = matchingLines(/querySelectorAll\(.*proc-confirm-outcome-btn/);
      expect(hits).toHaveLength(1);
    });

    it('handler saves outcome via saveEntryReview', () => {
      // Find the confirm-outcome handler block
      const handlerStart = lines.findIndex(l => /querySelectorAll\(.*proc-confirm-outcome-btn/.test(l));
      expect(handlerStart).toBeGreaterThan(0);
      // The handler builds a `patch` containing `outcome` and passes it to
      // saveEntryReview. Window widened (handler grew a roll_mode/pool_status
      // branch) and the two tokens are matched separately since `patch` and the
      // call are now on different lines.
      const handlerBlock = lines.slice(handlerStart, handlerStart + 20).join('\n');
      expect(handlerBlock).toMatch(/outcome/);
      expect(handlerBlock).toMatch(/saveEntryReview/);
    });

    it('handler calls renderProcessingMode after save', () => {
      const handlerStart = lines.findIndex(l => /querySelectorAll\(.*proc-confirm-outcome-btn/.test(l));
      const handlerBlock = lines.slice(handlerStart, handlerStart + 20).join('\n');
      expect(handlerBlock).toMatch(/renderProcessingMode\(container\)/);
    });

    it('handler guards empty textarea (no-op if no text)', () => {
      const handlerStart = lines.findIndex(l => /querySelectorAll\(.*proc-confirm-outcome-btn/.test(l));
      const handlerBlock = lines.slice(handlerStart, handlerStart + 14).join('\n');
      expect(handlerBlock).toMatch(/if \(!text\) return/);
    });
  });

  // ── AC-5: dual-class bug fixed ────────────────────────────────────────────

  describe('AC-5: Outcome textarea no longer carries proc-player-note-input', () => {
    it('no line has both proc-outcome-input and proc-player-note-input', () => {
      const dual = matchingLines(/proc-outcome-input.*proc-player-note-input|proc-player-note-input.*proc-outcome-input/);
      expect(dual).toHaveLength(0);
    });

    it('proc-player-note-input still exists (Player Feedback textarea unaffected)', () => {
      const hits = matchingLines(/class="proc-player-note-input"/);
      expect(hits.length).toBeGreaterThanOrEqual(2);
    });
  });
});
