/**
 * Unit tests — issue #937: meetsPrereq must resolve a `merit`-typed prereq
 * leaf against c.fighting_styles, not just c.merits.
 *
 * Fighting styles (Street Fighting, Martial Arts, ...) are stored in
 * c.fighting_styles with effective dots = cp + xp + free_mci + free_ots, but
 * rules reference them as `merit` prereqs (e.g. Iron Skin requires
 * (Martial Arts ●● OR Street Fighting ●●) AND Stamina ●●●). Pre-fix the engine
 * only scanned c.merits, so such prereqs were unsatisfiable and Iron Skin was
 * permanently hidden from the merit/XP-spend pickers.
 */

import { vi, describe, it, expect } from 'vitest';

vi.mock('../../public/js/data/accessors.js', () => ({
  // Honour Stamina (and any attribute) from char.attributes so the Iron Skin
  // tree can be exercised end to end.
  getAttrVal: (char, name) =>
    char?.attributes?.[name]?.dots ?? char?.attributes?.[name] ?? 0,
  skDots: () => 0,
}));

import { meetsPrereq } from '../../public/js/data/prereq.js';

const STYLE_LEAF = { type: 'merit', name: 'Street Fighting', dots: 2 };

const IRON_SKIN_PREREQ = {
  all: [
    {
      any: [
        { type: 'merit', name: 'Martial Arts', dots: 2 },
        { type: 'merit', name: 'Street Fighting', dots: 2 },
      ],
    },
    { type: 'attribute', name: 'Stamina', dots: 3 },
  ],
};

describe('meetsPrereq — fighting-style merit leaves (issue #937)', () => {
  it('passes when the named style has enough cp dots in fighting_styles', () => {
    const char = { fighting_styles: [{ name: 'Street Fighting', cp: 2 }] };
    expect(meetsPrereq(char, STYLE_LEAF)).toBe(true);
  });

  it('uses effective dots (cp + xp + free_mci + free_ots)', () => {
    const char = { fighting_styles: [{ name: 'Street Fighting', xp: 1, free_mci: 1 }] };
    expect(meetsPrereq(char, STYLE_LEAF)).toBe(true);
  });

  it('fails when the style is below the required dots', () => {
    const char = { fighting_styles: [{ name: 'Street Fighting', cp: 1 }] };
    expect(meetsPrereq(char, STYLE_LEAF)).toBe(false);
  });

  it('fails when the style is absent', () => {
    const char = { fighting_styles: [{ name: 'Boxing', cp: 5 }] };
    expect(meetsPrereq(char, STYLE_LEAF)).toBe(false);
  });

  it('Iron Skin tree passes with Street Fighting ●● and Stamina ●●●', () => {
    const char = {
      attributes: { Stamina: { dots: 3 } },
      fighting_styles: [{ name: 'Street Fighting', cp: 2 }],
    };
    expect(meetsPrereq(char, IRON_SKIN_PREREQ)).toBe(true);
  });

  it('Iron Skin tree passes via the Martial Arts OR-branch', () => {
    const char = {
      attributes: { Stamina: { dots: 3 } },
      fighting_styles: [{ name: 'Martial Arts', xp: 2 }],
    };
    expect(meetsPrereq(char, IRON_SKIN_PREREQ)).toBe(true);
  });

  it('Iron Skin tree fails when the style is only ●', () => {
    const char = {
      attributes: { Stamina: { dots: 3 } },
      fighting_styles: [{ name: 'Street Fighting', cp: 1 }],
    };
    expect(meetsPrereq(char, IRON_SKIN_PREREQ)).toBe(false);
  });

  it('Iron Skin tree fails when Stamina is below ●●●', () => {
    const char = {
      attributes: { Stamina: { dots: 2 } },
      fighting_styles: [{ name: 'Street Fighting', cp: 2 }],
    };
    expect(meetsPrereq(char, IRON_SKIN_PREREQ)).toBe(false);
  });

  it('still resolves a normal merit prereq from c.merits (no regression)', () => {
    const char = { merits: [{ name: 'Danger Sense', rating: 1 }] };
    expect(meetsPrereq(char, { type: 'merit', name: 'Danger Sense', dots: 1 })).toBe(true);
  });

  it('does not match a fighting style when the prereq carries a qualifier', () => {
    const char = { fighting_styles: [{ name: 'Street Fighting', cp: 5 }] };
    expect(
      meetsPrereq(char, { type: 'merit', name: 'Street Fighting', qualifier: 'Brawl', dots: 2 }),
    ).toBe(false);
  });
});
