/**
 * Bugfix #425 — suite sheet STM display wiring contract.
 *
 * The bug: the suite renderer (public/js/suite/sheet.js) consumed modded
 * VALUES (via STM-7's cache-entry invariant) but never emitted the STM
 * display markup — no gold-tint dots, no marker pip, no popover. The fix
 * mirrors the editor pattern: shDotsWithBonus opts for attribute/skill
 * dots + markerFor on derived/root stat numbers + popover active-char
 * resolution via window.__activeChar.
 *
 * The render code is browser-only (DOM, location, window). This test
 * verifies the two pure pieces the suite consumes:
 *   1. shDotsWithBonus opts produce the modded-dot markup (the contract
 *      the suite's attribute/skill render now passes opts into)
 *   2. The opts-computation shape mirrors the editor (filledMod offset 0
 *      for dots; hollowMod offset = autoBonus for attributes, 0 for skills)
 *
 * Inline mirrors of shDotsWithBonus + the opts helpers (browser-only
 * modules can't import in Node) — same pattern as the STM-4 / STM-7
 * test files.
 */

import { describe, it, expect } from 'vitest';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function shDotsWithBonus(base, bonus, opts) {
  if (!opts || (!opts.filledMod && !opts.hollowMod)) {
    if (!bonus) return '<span class="pointed"></span>'.repeat(Math.max(0, base || 0));
    return '<span class="pointed"></span>'.repeat(Math.max(0, base || 0)) + '<span class="pointed hollow"></span>'.repeat(Math.max(0, bonus || 0));
  }
  const fm = opts.filledMod, hm = opts.hollowMod;
  let out = '';
  for (let i = 0; i < Math.max(0, base || 0); i++) {
    if (fm && i >= fm.from && i < fm.to) {
      out += `<span class="pointed stm-modded-dot" data-stm-marker-path="${esc(fm.path || '')}" title="${esc(fm.title || '')}"></span>`;
    } else out += '<span class="pointed"></span>';
  }
  for (let i = 0; i < Math.max(0, bonus || 0); i++) {
    if (hm && i >= hm.from && i < hm.to) {
      out += `<span class="pointed hollow stm-modded-dot" data-stm-marker-path="${esc(hm.path || '')}" title="${esc(hm.title || '')}"></span>`;
    } else out += '<span class="pointed hollow"></span>';
  }
  return out;
}

// Mirror of suite/sheet.js _stmAttrOpts + _stmSkillOpts
function stmAttrOpts(c, a, autoBonus) {
  const ovDots = c._st_mod_overlay?.[`attributes.${a}.dots`];
  const ovBonus = c._st_mod_overlay?.[`attributes.${a}.bonus`];
  const opts = {};
  if (ovDots) {
    opts.filledMod = { from: ovDots.base, to: ovDots.final, path: `attributes.${a}.dots`, title: 't' };
  }
  if (ovBonus) {
    opts.hollowMod = { from: autoBonus + ovBonus.base, to: autoBonus + ovBonus.final, path: `attributes.${a}.bonus`, title: 't' };
  }
  return opts;
}
function stmSkillOpts(c, s) {
  const ovDots = c._st_mod_overlay?.[`skills.${s}.dots`];
  const ovBonus = c._st_mod_overlay?.[`skills.${s}.bonus`];
  const opts = {};
  if (ovDots) opts.filledMod = { from: ovDots.base, to: ovDots.final, path: `skills.${s}.dots`, title: 't' };
  if (ovBonus) opts.hollowMod = { from: ovBonus.base, to: ovBonus.final, path: `skills.${s}.bonus`, title: 't' };
  return opts;
}

function count(s, sub) {
  let n = 0, i = 0;
  while ((i = s.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
  return n;
}

describe('#425 — suite attribute dots emit modded markup via opts', () => {
  it('Presence dots +2 (base 3 → final 5): 2 modded filled dots with path attr', () => {
    const c = { _st_mod_overlay: { 'attributes.Presence.dots': { base: 3, delta: 2, final: 5 } } };
    const opts = stmAttrOpts(c, 'Presence', 0);
    const out = shDotsWithBonus(5, 0, opts);
    expect(count(out, '<span class="pointed stm-modded-dot"')).toBe(2);
    expect(count(out, '<span class="pointed"></span>')).toBe(3);
    expect(out).toContain('data-stm-marker-path="attributes.Presence.dots"');
  });

  it('Presence bonus +3 with autoBonus 1 (Majesty): modded sub-range offset by autoBonus', () => {
    // c.attributes.Presence.bonus modded 0→3; discAttrBonus = 1 (Majesty)
    // getAttrBonus total = 1 (disc) + 3 (manual) = 4 hollow dots
    // modded manual bonus sub-range = [autoBonus + 0, autoBonus + 3) = [1, 4)
    const c = { _st_mod_overlay: { 'attributes.Presence.bonus': { base: 0, delta: 3, final: 3 } } };
    const opts = stmAttrOpts(c, 'Presence', 1);
    const out = shDotsWithBonus(3, 4, opts); // base dots 3, total hollow 4
    // 1 hollow unmarked (autoBonus), 3 hollow modded (manual bonus)
    expect(count(out, '<span class="pointed hollow"></span>')).toBe(1);
    expect(count(out, '<span class="pointed hollow stm-modded-dot"')).toBe(3);
  });

  it('no overlay → byte-identical to plain dots (no regression)', () => {
    const c = {}; // no _st_mod_overlay
    const opts = stmAttrOpts(c, 'Wits', 0);
    expect(opts).toEqual({});
    const out = shDotsWithBonus(3, 1, opts);
    expect(out).toBe('<span class="pointed"></span>'.repeat(3) + '<span class="pointed hollow"></span>');
    expect(out).not.toContain('stm-modded-dot');
  });
});

describe('#425 — suite skill dots emit modded markup via opts', () => {
  it('skill bonus mod: hollow stream bn-first, modded sub-range starts at 0', () => {
    // skills.Athletics.bonus modded 0→2; ptBn=1 (so totalBn = 2 + 1 = 3)
    const c = { _st_mod_overlay: { 'skills.Athletics.bonus': { base: 0, delta: 2, final: 2 } } };
    const opts = stmSkillOpts(c, 'Athletics');
    const out = shDotsWithBonus(2, 3, opts); // dots 2, total hollow 3 (bn 2 + ptBn 1)
    expect(count(out, '<span class="pointed hollow stm-modded-dot"')).toBe(2);
    expect(count(out, '<span class="pointed hollow"></span>')).toBe(1);
    expect(out).toContain('data-stm-marker-path="skills.Athletics.bonus"');
  });

  it('skill dots mod: filled sub-range marked', () => {
    const c = { _st_mod_overlay: { 'skills.Brawl.dots': { base: 2, delta: 1, final: 3 } } };
    const opts = stmSkillOpts(c, 'Brawl');
    const out = shDotsWithBonus(3, 0, opts);
    expect(count(out, '<span class="pointed stm-modded-dot"')).toBe(1);
    expect(count(out, '<span class="pointed"></span>')).toBe(2);
  });
});
