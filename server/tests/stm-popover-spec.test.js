/**
 * STM-4 popover composition tests (Epic STM, issue #385 AC#11).
 *
 * Exercises the pure data → render-spec transform (buildPopover) without
 * touching the DOM or any browser-only globals. The transform is the
 * load-bearing logic in the popover; the DOM render and click handler
 * wiring are visually verified.
 *
 * Imports public/js/data/st-mod-popover-spec.js directly — that module
 * pulls in public/js/data/st-mod-labels.js (also pure), and nothing else.
 */

import { describe, it, expect } from 'vitest';
import { buildPopover } from '../../public/js/data/st-mod-popover-spec.js';

// ── Single-mod attribute case (AC#3) ─────────────────────────────────

describe('STM-4 buildPopover — single-mod attribute', () => {
  const overlayEntry = {
    base: 3,
    delta: 1,
    final: 4,
    mods: [{
      _id: 'mod-1',
      stat_path: 'attributes.Strength.dots',
      delta: 1,
      reason: 'Combat training arc',
      show_reason_to_player: false,   // ← reason hidden
      created_by: { discord_id: 'st-001', discord_name: 'Alice' },
      created_at: '2026-05-18T12:00:00.000Z',
    }],
  };

  const spec = buildPopover(overlayEntry, 'attributes.Strength.dots');

  it('returns a spec with the correct label, base, and final', () => {
    expect(spec).toBeTruthy();
    expect(spec.pathLabel).toBe('Strength (dots)');
    expect(spec.baseRow).toEqual({ label: 'Base', value: 3, fromTracker: false });
    expect(spec.finalRow).toEqual({ label: 'Final', value: 4 });
  });

  it('emits exactly one mod row with a signed delta and no reason metadata', () => {
    expect(spec.modRows).toHaveLength(1);
    expect(spec.modRows[0].deltaSigned).toBe('+1');
    // show_reason_to_player: false → reason/creator/when all null
    expect(spec.modRows[0].reason).toBeNull();
    expect(spec.modRows[0].creator).toBeNull();
    expect(spec.modRows[0].when).toBeNull();
  });
});

// ── Multi-mod current.willpower case (AC#4, AC#5, AC#6, AC#7) ────────

describe('STM-4 buildPopover — multi-mod current.willpower with mixed show_reason flags', () => {
  const overlayEntry = {
    base: 5,
    delta: -2,
    final: 3,
    mods: [
      {
        _id: 'mod-A',
        stat_path: 'current.willpower',
        delta: -1,
        reason: 'Reckoning fallout',
        show_reason_to_player: true,
        created_by: { discord_id: 'st-001', discord_name: 'Alice' },
        created_at: '2026-05-18T12:00:00.000Z',
      },
      {
        _id: 'mod-B',
        stat_path: 'current.willpower',
        delta: -1,
        reason: 'Backstage decision (private)',
        show_reason_to_player: false,
        created_by: { discord_id: 'st-002', discord_name: 'Bob' },
        created_at: '2026-05-18T13:00:00.000Z',
      },
    ],
  };

  const spec = buildPopover(overlayEntry, 'current.willpower');

  it('marks the base row with fromTracker:true for current.* paths', () => {
    expect(spec.baseRow.fromTracker).toBe(true);
    expect(spec.baseRow.value).toBe(5);
  });

  it('preserves mod order (creation order from _st_mod_overlay.mods[])', () => {
    expect(spec.modRows).toHaveLength(2);
    expect(spec.modRows[0].deltaSigned).toBe('-1');
    expect(spec.modRows[1].deltaSigned).toBe('-1');
  });

  it('reveals reason/creator/when only on the mod with show_reason_to_player:true', () => {
    expect(spec.modRows[0].reason).toBe('Reckoning fallout');
    expect(spec.modRows[0].creator).toBe('Alice');
    expect(spec.modRows[0].when).toBe('2026-05-18T12:00:00.000Z');

    expect(spec.modRows[1].reason).toBeNull();
    expect(spec.modRows[1].creator).toBeNull();
    expect(spec.modRows[1].when).toBeNull();
  });

  it('renders final = base + sum of deltas', () => {
    expect(spec.finalRow.value).toBe(3);
  });

  it('uses the human-readable label for current.willpower', () => {
    expect(spec.pathLabel).toBe('Willpower (current)');
  });
});

// ── Defensive cases ──────────────────────────────────────────────────

describe('STM-4 buildPopover — defensive', () => {
  it('returns null on null overlay entry', () => {
    expect(buildPopover(null, 'attributes.Strength.dots')).toBeNull();
  });
  it('returns null on non-object', () => {
    expect(buildPopover('not-an-object', 'attributes.Strength.dots')).toBeNull();
  });
  it('positive delta gets a + sign', () => {
    const spec = buildPopover({
      base: 0, delta: 2, final: 2,
      mods: [{ delta: 2, show_reason_to_player: false }],
    }, 'attributes.Wits.dots');
    expect(spec.modRows[0].deltaSigned).toBe('+2');
  });
  it('zero delta gets a + sign', () => {
    const spec = buildPopover({
      base: 5, delta: 0, final: 5,
      mods: [{ delta: 0, show_reason_to_player: false }],
    }, 'derived.defence');
    expect(spec.modRows[0].deltaSigned).toBe('+0');
  });
  it('derived.* paths do NOT get the (from tracker) suffix', () => {
    const spec = buildPopover({
      base: 4, delta: 1, final: 5,
      mods: [{ delta: 1, show_reason_to_player: false }],
    }, 'derived.defence');
    expect(spec.baseRow.fromTracker).toBe(false);
  });
});
