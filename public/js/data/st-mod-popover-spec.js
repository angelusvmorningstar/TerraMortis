/* ST mod popover — pure data → render-spec transform.
 *
 * Extracted from public/js/editor/st-mod-popover.js so vitest can import
 * it without pulling in browser-only helpers (esc, auth/discord.js).
 * Per ADR-004 Rev 2 §D4: list each mod (no collapse in v1).
 */

import { labelForPath } from './st-mod-labels.js';

/** Pure data transform — overlay entry + path → render spec.
 *
 *  Input:
 *    overlayEntry: c._st_mod_overlay[path] = { base, delta, final, mods: [{...}] }
 *    path: 'attributes.Strength.dots' | 'current.willpower' | ...
 *
 *  Output:
 *    {
 *      pathLabel: '<human label>',
 *      baseRow:   { label: 'Base', value, fromTracker: <bool> },
 *      modRows:   [{ deltaSigned, reason | null, creator | null, when | null }],
 *      finalRow:  { label: 'Final', value },
 *    }
 *
 *  Reason / creator / timestamp are gated by mod.show_reason_to_player —
 *  when false, the row shows ONLY the signed delta. Delta is always visible.
 */
export function buildPopover(overlayEntry, path) {
  if (!overlayEntry || typeof overlayEntry !== 'object') return null;
  const { base, final, mods } = overlayEntry;
  const fromTracker = typeof path === 'string' && path.startsWith('current.');

  const modRows = (Array.isArray(mods) ? mods : []).map(m => {
    const sign = (m.delta ?? 0) >= 0 ? '+' : '';
    const reveal = !!m.show_reason_to_player;
    return {
      deltaSigned: `${sign}${m.delta}`,
      reason: reveal ? (m.reason || '') : null,
      creator: reveal ? (m?.created_by?.discord_name || '') : null,
      when: reveal ? (m.created_at || '') : null,
    };
  });

  return {
    pathLabel: labelForPath(path),
    baseRow: { label: 'Base', value: base, fromTracker },
    modRows,
    finalRow: { label: 'Final', value: final },
  };
}
