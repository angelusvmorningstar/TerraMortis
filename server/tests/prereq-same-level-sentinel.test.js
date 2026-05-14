/**
 * Unit tests — `"same level"` qualifier sentinel in meetsPrereq (issue #239).
 *
 * The sentinel encodes Mandragora Garden's per-rating cap on Safe Place: the
 * prereq Safe Place must be at the same (or higher) dot rating as the
 * Mandragora Garden being purchased. Pre-fix the engine matched the sentinel
 * literally against `m.qualifier` / `m.area`, silently excluding the merit
 * from every character's XP-purchase picker.
 */

import { vi, describe, it, expect } from 'vitest';

vi.mock('../../public/js/data/accessors.js', () => ({
  getAttrVal: () => 0,
  skDots: () => 0,
}));

import { meetsPrereq } from '../../public/js/data/prereq.js';

const MANDRAGORA_PREREQ = {
  type: 'merit',
  name: 'Safe Place',
  qualifier: 'same level',
};

describe('meetsPrereq — "same level" qualifier sentinel', () => {
  it('passes when the named merit exists at >= 1 dot, regardless of its qualifier', () => {
    const char = { merits: [{ name: 'Safe Place', rating: 1 }] };
    expect(meetsPrereq(char, MANDRAGORA_PREREQ)).toBe(true);
  });

  it('passes when the named merit has a real qualifier set (not the sentinel literal)', () => {
    const char = { merits: [{ name: 'Safe Place', rating: 3, qualifier: 'Penthouse Apartment' }] };
    expect(meetsPrereq(char, MANDRAGORA_PREREQ)).toBe(true);
  });

  it('passes when the named merit has area set instead of qualifier', () => {
    const char = { merits: [{ name: 'Safe Place', rating: 2, area: 'The Old Quarter' }] };
    expect(meetsPrereq(char, MANDRAGORA_PREREQ)).toBe(true);
  });

  it('fails when the character has no instance of the named merit', () => {
    const char = { merits: [{ name: 'Haven', rating: 3 }] };
    expect(meetsPrereq(char, MANDRAGORA_PREREQ)).toBe(false);
  });

  it('fails when the character has the named merit at 0 dots', () => {
    const char = { merits: [{ name: 'Safe Place', rating: 0 }] };
    expect(meetsPrereq(char, MANDRAGORA_PREREQ)).toBe(false);
  });

  it('fails when the character has no merits array at all', () => {
    expect(meetsPrereq({}, MANDRAGORA_PREREQ)).toBe(false);
  });

  it('honours an explicit dots floor in the prereq', () => {
    const char = { merits: [{ name: 'Safe Place', rating: 2 }] };
    const prereqWithFloor = { ...MANDRAGORA_PREREQ, dots: 3 };
    expect(meetsPrereq(char, prereqWithFloor)).toBe(false);
    const charHigher = { merits: [{ name: 'Safe Place', rating: 4 }] };
    expect(meetsPrereq(charHigher, prereqWithFloor)).toBe(true);
  });
});

describe('meetsPrereq — non-sentinel qualifiers still work as before (regression guard)', () => {
  it('passes when qualifier matches m.qualifier', () => {
    const char = { merits: [{ name: 'Allies', rating: 2, qualifier: 'Police' }] };
    expect(meetsPrereq(char, { type: 'merit', name: 'Allies', qualifier: 'Police' })).toBe(true);
  });

  it('passes when qualifier matches m.area', () => {
    const char = { merits: [{ name: 'Contacts', rating: 1, area: 'Media' }] };
    expect(meetsPrereq(char, { type: 'merit', name: 'Contacts', qualifier: 'Media' })).toBe(true);
  });

  it('fails when qualifier does not match any character merit qualifier or area', () => {
    const char = { merits: [{ name: 'Allies', rating: 2, qualifier: 'Police' }] };
    expect(meetsPrereq(char, { type: 'merit', name: 'Allies', qualifier: 'High Society' })).toBe(false);
  });
});
