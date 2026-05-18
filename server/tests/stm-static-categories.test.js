/**
 * STM-5 buildStatPathCategories (Epic STM, issue #386 AC#14).
 *
 * Pure function — builds the categorised dropdown options for the
 * admin panel from STM_STATIC_CATEGORIES + the active character's
 * merit/discipline arrays. No DOM, no fetch, no globals.
 *
 * Imports public/js/data/st-mod-labels.js directly. That module is pure
 * (no esc, no auth chain) so it's safe under vitest.
 */

import { describe, it, expect } from 'vitest';
import {
  buildStatPathCategories,
  STM_STATIC_CATEGORIES,
} from '../../public/js/data/st-mod-labels.js';

describe('STM-5 STM_STATIC_CATEGORIES (Rev 2 §D3)', () => {
  it('exposes the four static category groups', () => {
    const names = STM_STATIC_CATEGORIES.map(c => c.category);
    expect(names).toEqual(['Attributes', 'Skills', 'Current State', 'Derived']);
  });
  it('Attributes group has 18 entries (9 attrs × {dots, bonus})', () => {
    const attrs = STM_STATIC_CATEGORIES.find(c => c.category === 'Attributes');
    expect(attrs.entries.length).toBe(18);
    expect(attrs.entries.some(e => e.path === 'attributes.Strength.dots')).toBe(true);
    expect(attrs.entries.some(e => e.path === 'attributes.Strength.bonus')).toBe(true);
  });
  it('Skills group has 48 entries (24 skills × {dots, bonus})', () => {
    const skills = STM_STATIC_CATEGORIES.find(c => c.category === 'Skills');
    expect(skills.entries.length).toBe(48);
    expect(skills.entries.some(e => e.path === 'skills.Animal Ken.dots')).toBe(true);
  });
  it('Current State group includes both tracker-resident and char-doc paths', () => {
    const current = STM_STATIC_CATEGORIES.find(c => c.category === 'Current State');
    const paths = current.entries.map(e => e.path);
    expect(paths).toContain('current.willpower');
    expect(paths).toContain('current.vitae');
    expect(paths).toContain('current.damage_bashing');
    expect(paths).toContain('blood_potency');
    expect(paths).toContain('humanity');
  });
});

describe('STM-5 buildStatPathCategories — character-derived', () => {
  it('appends Merits group when character has merits with names', () => {
    const char = {
      merits: [
        { name: 'Allies', dots: 2 },
        { name: 'Resources', dots: 3 },
      ],
      disciplines: {},
    };
    const cats = buildStatPathCategories(char);
    const merits = cats.find(c => c.category === 'Merits');
    expect(merits).toBeTruthy();
    expect(merits.entries).toHaveLength(2);
    expect(merits.entries[0]).toEqual({ path: 'merits.0.dots', label: 'Allies (dots)' });
    expect(merits.entries[1]).toEqual({ path: 'merits.1.dots', label: 'Resources (dots)' });
  });

  it('appends Disciplines group from object-keyed c.disciplines (v2 schema shape)', () => {
    const char = {
      merits: [],
      disciplines: {
        Auspex:   { dots: 1 },
        Celerity: { dots: 2 },
      },
    };
    const cats = buildStatPathCategories(char);
    const discs = cats.find(c => c.category === 'Disciplines');
    expect(discs).toBeTruthy();
    expect(discs.entries).toHaveLength(2);
    const paths = discs.entries.map(e => e.path).sort();
    expect(paths).toEqual(['disciplines.Auspex.dots', 'disciplines.Celerity.dots']);
  });

  it('skips merits with empty/missing names (defensive against sparse docs)', () => {
    const char = {
      merits: [
        { name: 'Allies', dots: 1 },
        null,
        { dots: 2 }, // no name
        { name: '', dots: 1 },
        { name: 'Resources', dots: 3 },
      ],
      disciplines: {},
    };
    const cats = buildStatPathCategories(char);
    const merits = cats.find(c => c.category === 'Merits');
    expect(merits.entries).toHaveLength(2);
    // Indices preserved from the sparse array — STM-5 dropdown labels are
    // human-readable, but the path indices must match what the server
    // resolves against the character document.
    expect(merits.entries[0].path).toBe('merits.0.dots');
    expect(merits.entries[1].path).toBe('merits.4.dots');
  });

  it('omits Merits/Disciplines groups entirely when the character has none', () => {
    const cats = buildStatPathCategories({ merits: [], disciplines: {} });
    expect(cats.find(c => c.category === 'Merits')).toBeUndefined();
    expect(cats.find(c => c.category === 'Disciplines')).toBeUndefined();
    // Static groups still present
    expect(cats.find(c => c.category === 'Attributes')).toBeTruthy();
  });

  it('handles null/undefined character defensively', () => {
    const cats = buildStatPathCategories(null);
    expect(cats.find(c => c.category === 'Attributes')).toBeTruthy();
    expect(cats.find(c => c.category === 'Merits')).toBeUndefined();
    expect(cats.find(c => c.category === 'Disciplines')).toBeUndefined();
  });

  it('returns expected category count for a character with 2 merits + 3 disciplines', () => {
    const char = {
      merits: [{ name: 'A', dots: 1 }, { name: 'B', dots: 1 }],
      disciplines: {
        Auspex:    { dots: 1 },
        Celerity:  { dots: 1 },
        Resilience:{ dots: 1 },
      },
    };
    const cats = buildStatPathCategories(char);
    expect(cats).toHaveLength(6); // 4 static + Merits + Disciplines
    expect(cats[4].entries).toHaveLength(2);
    expect(cats[5].entries).toHaveLength(3);
  });
});
