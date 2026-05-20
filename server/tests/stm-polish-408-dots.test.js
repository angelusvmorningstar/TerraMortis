/**
 * STM polish #408 — shDotsWithBonus opts param.
 *
 * Verifies the dot helper marks the right sub-range of dots with the
 * stm-modded-dot class + data-stm-marker-path attribute + title. This
 * is the contract that lets clicking a modded dot open the popover
 * (via the delegated handler on document.body) instead of clicking a
 * standalone marker pip that visually collided with the dot run.
 *
 * Imports from public/js/data/helpers.js. helpers.js imports
 * auth/discord.js (browser-only) at module load through the redact
 * chain, so this test inlines shDotsWithBonus + esc to stay in pure
 * Node — matches the path-resolve sanity / popover-spec test pattern.
 */

import { describe, it, expect } from 'vitest';

// ── Inline mirror of public/js/data/helpers.js#shDotsWithBonus + esc ────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function shDots(n) {
  return '<span class="pointed"></span>'.repeat(Math.max(0, n || 0));
}
function shDotsWithBonus(base, bonus, opts) {
  if (!opts || (!opts.filledMod && !opts.hollowMod)) {
    if (!bonus) return shDots(base);
    return '<span class="pointed"></span>'.repeat(Math.max(0, base || 0)) + '<span class="pointed hollow"></span>'.repeat(Math.max(0, bonus || 0));
  }
  const fm = opts.filledMod;
  const hm = opts.hollowMod;
  let out = '';
  const baseN = Math.max(0, base || 0);
  for (let i = 0; i < baseN; i++) {
    if (fm && i >= fm.from && i < fm.to) {
      out += `<span class="pointed stm-modded-dot" data-stm-marker-path="${esc(fm.path || '')}" title="${esc(fm.title || '')}"></span>`;
    } else {
      out += '<span class="pointed"></span>';
    }
  }
  const bonusN = Math.max(0, bonus || 0);
  for (let i = 0; i < bonusN; i++) {
    if (hm && i >= hm.from && i < hm.to) {
      out += `<span class="pointed hollow stm-modded-dot" data-stm-marker-path="${esc(hm.path || '')}" title="${esc(hm.title || '')}"></span>`;
    } else {
      out += '<span class="pointed hollow"></span>';
    }
  }
  return out;
}

// Helper: count occurrences of a substring
function count(s, sub) {
  let n = 0, i = 0;
  while ((i = s.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
  return n;
}

// ── Backwards-compat ────────────────────────────────────────────────

describe('STM #408 — shDotsWithBonus backwards compatibility', () => {
  it('no opts → byte-identical to pre-#408 output (base + bonus dots, no marker)', () => {
    const out = shDotsWithBonus(3, 2);
    expect(out).toBe(
      '<span class="pointed"></span>'.repeat(3)
      + '<span class="pointed hollow"></span>'.repeat(2),
    );
    expect(out).not.toContain('stm-modded-dot');
    expect(out).not.toContain('data-stm-marker-path');
  });

  it('opts with no filledMod/hollowMod → backwards-compat path', () => {
    const out = shDotsWithBonus(3, 2, {});
    expect(out).toBe(shDotsWithBonus(3, 2));
  });

  it('zero base + zero bonus + opts → empty string', () => {
    expect(shDotsWithBonus(0, 0, { filledMod: { from: 0, to: 0, path: 'x' } })).toBe('');
  });
});

// ── Filled mod (attributes.X.dots / skills.X.dots) ──────────────────

describe('STM #408 — filled-stream mod (attributes/skills .dots)', () => {
  it('Presence dots +2 (base 3 → final 5): dots 3..4 are marked, dots 0..2 are not', () => {
    const out = shDotsWithBonus(5, 0, {
      filledMod: {
        from: 3, to: 5,
        path: 'attributes.Presence.dots',
        title: 'ST adjustment: Presence (dots) +2. Click for details.',
      },
    });
    // 5 total filled dots, 2 of which are modded
    expect(count(out, '<span class="pointed"></span>')).toBe(3);
    expect(count(out, '<span class="pointed stm-modded-dot"')).toBe(2);
    // Each modded dot carries the path attribute + title
    expect(out).toContain('data-stm-marker-path="attributes.Presence.dots"');
    expect(out).toContain('title="ST adjustment: Presence (dots) +2. Click for details."');
  });

  it('preserves order: unmarked dots first, modded dots after', () => {
    const out = shDotsWithBonus(4, 0, {
      filledMod: { from: 2, to: 4, path: 'attributes.Wits.dots', title: 'tip' },
    });
    const firstModded = out.indexOf('stm-modded-dot');
    const lastUnmodded = out.lastIndexOf('<span class="pointed"></span>');
    expect(lastUnmodded).toBeLessThan(firstModded);
  });

  it('full-range mod (base 0 → final 3): every dot is modded', () => {
    const out = shDotsWithBonus(3, 0, {
      filledMod: { from: 0, to: 3, path: 'attributes.Strength.dots', title: '' },
    });
    expect(count(out, 'stm-modded-dot')).toBe(3);
    expect(count(out, '<span class="pointed"></span>')).toBe(0);
  });
});

// ── Hollow mod (attributes.X.bonus / skills.X.bonus) ────────────────

describe('STM #408 — hollow-stream mod (attributes/skills .bonus)', () => {
  it('Presence bonus +3 with autoBonus 0 (base 0 → final 3): all 3 hollow dots are marked', () => {
    // shDotsWithBonus(base_dots=0, autoBonus_plus_bonus=3, { hollowMod from 0+0 to 0+3 })
    const out = shDotsWithBonus(0, 3, {
      hollowMod: {
        from: 0, to: 3,
        path: 'attributes.Presence.bonus',
        title: 'ST adjustment: Presence (bonus) +3 — click for details',
      },
    });
    expect(count(out, '<span class="pointed hollow"></span>')).toBe(0);
    expect(count(out, '<span class="pointed hollow stm-modded-dot"')).toBe(3);
  });

  it('attribute bonus mod with autoBonus offset (Majesty +1, bonus mod +2)', () => {
    // c.disciplines.Majesty.dots = 1 → autoBonus = 1
    // c.attributes.Presence.bonus before: 0; after applyStMods with delta +2: 2
    // Call site: shDotsWithBonus(presence_dots, autoBonus + bonus, opts)
    // Hollow stream: 3 positions = autoBonus(1) + manualBonus(2)
    // Modded sub-range: [autoBonus + ov.base, autoBonus + ov.final) = [1, 3)
    const out = shDotsWithBonus(2, 3, {
      hollowMod: { from: 1, to: 3, path: 'attributes.Presence.bonus', title: 't' },
    });
    // 2 filled dots (unmodded), 1 hollow unmarked (autoBonus), 2 hollow modded (manual bonus mod)
    expect(count(out, '<span class="pointed"></span>')).toBe(2);
    expect(count(out, '<span class="pointed hollow"></span>')).toBe(1);
    expect(count(out, '<span class="pointed hollow stm-modded-dot"')).toBe(2);
  });

  it('skill bonus mod: hollow stream layout bn first, then ptBn / mciBn — modded sub-range starts at 0', () => {
    // sk.bonus = 2 (post-mod, was 0, delta +2)
    // ptBn = 1, mciBn = 0
    // Call site: shDotsWithBonus(d, bn + ptBn + mciBn) = shDotsWithBonus(d, 3)
    // Hollow stream layout (skill convention): bn first (positions 0..1), then ptBn (position 2)
    // Modded sub-range = [ov.base, ov.final) = [0, 2) within bn subrange
    const out = shDotsWithBonus(2, 3, {
      hollowMod: { from: 0, to: 2, path: 'skills.Athletics.bonus', title: 't' },
    });
    // 2 filled, 2 hollow modded (the bn portion), 1 hollow unmarked (ptBn)
    expect(count(out, '<span class="pointed"></span>')).toBe(2);
    expect(count(out, '<span class="pointed hollow stm-modded-dot"')).toBe(2);
    expect(count(out, '<span class="pointed hollow"></span>')).toBe(1);
  });
});

// ── Combined filled + hollow mod ────────────────────────────────────

describe('STM #408 — combined filled and hollow mods', () => {
  it('dots +2 AND bonus +1: both sub-ranges marked, rest plain', () => {
    const out = shDotsWithBonus(5, 1, {
      filledMod: { from: 3, to: 5, path: 'attributes.Presence.dots', title: 'd' },
      hollowMod: { from: 0, to: 1, path: 'attributes.Presence.bonus', title: 'b' },
    });
    // 3 unmodded filled, 2 modded filled, 1 modded hollow
    expect(count(out, '<span class="pointed"></span>')).toBe(3);
    expect(count(out, '<span class="pointed stm-modded-dot"')).toBe(2);
    expect(count(out, '<span class="pointed hollow"></span>')).toBe(0);
    expect(count(out, '<span class="pointed hollow stm-modded-dot"')).toBe(1);
    // Two distinct paths in the output
    expect(out).toContain('data-stm-marker-path="attributes.Presence.dots"');
    expect(out).toContain('data-stm-marker-path="attributes.Presence.bonus"');
  });
});

// ── Defensive ───────────────────────────────────────────────────────

describe('STM #408 — defensive', () => {
  it('escapes HTML in title and path attributes', () => {
    const out = shDotsWithBonus(1, 0, {
      filledMod: { from: 0, to: 1, path: '<script>', title: '"injection"' },
    });
    expect(out).toContain('data-stm-marker-path="&lt;script&gt;"');
    expect(out).toContain('title="&quot;injection&quot;"');
    expect(out).not.toContain('<script>');
  });

  it('handles missing path/title gracefully', () => {
    const out = shDotsWithBonus(1, 0, {
      filledMod: { from: 0, to: 1 },
    });
    expect(out).toContain('data-stm-marker-path=""');
    expect(out).toContain('title=""');
  });

  it('out-of-range mod (to > base): only marks within actual base', () => {
    const out = shDotsWithBonus(3, 0, {
      filledMod: { from: 1, to: 99, path: 'x', title: 't' },
    });
    // Only positions 1..2 are marked (within base=3)
    expect(count(out, 'stm-modded-dot')).toBe(2);
    expect(count(out, '<span class="pointed"></span>')).toBe(1);
  });
});
