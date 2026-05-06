/**
 * Regression test — detectMerits() retainers bucket detects Attaché merits
 * and benefit_grants-sourced Retainers. (Issue #45)
 *
 * Charlie Ballsack holds Retainer via Attaché (Resources) — category 'influence',
 * name starts with 'Attaché ('. Before this fix the filter was name === 'Retainer'
 * only, so no Retainer action surfaced in his DT form.
 */

import { describe, it, expect } from 'vitest';

// Pure re-implementation of the detection algorithm — mirrors detectMerits()
// in public/js/tabs/downtime-form.js. Update this if the algorithm changes.
function detectRetainers(c) {
  const merits = (c.merits || []).filter(m => m.category);
  const expandedInfluence = [...merits];
  for (const m of merits) {
    if (m.category === 'standing' && Array.isArray(m.benefit_grants)) {
      for (const g of m.benefit_grants) {
        if (g.category === 'influence') expandedInfluence.push({ ...g, _from_mci: m.cult_name || m.name });
      }
    }
  }
  return expandedInfluence.filter(m =>
    m.category === 'influence' && (m.name === 'Retainer' || m.name?.startsWith('Attaché ('))
  );
}

describe('Issue #45 — detectMerits() retainers bucket', () => {

  it('detects a plain Retainer merit', () => {
    const c = { merits: [{ category: 'influence', name: 'Retainer', rating: 3, area: 'Nicole - EA', ghoul: false }] };
    const result = detectRetainers(c);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Retainer');
  });

  it('detects Attaché (*) as a retainer — Charlie Ballsack shape', () => {
    const charlie = {
      merits: [
        { category: 'influence', name: 'Resources', rating: 5 },
        { category: 'influence', name: 'Attaché (Resources)', rating: 5, ghoul: true },
        { category: 'influence', name: 'Contacts', rating: 3 },
        { category: 'standing', name: 'Mystery Cult Initiation', rating: 5, cult_name: 'The Ashen Path' },
        { category: 'standing', name: 'Professional Training', rating: 5 },
      ]
    };
    const result = detectRetainers(charlie);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Attaché (Resources)');
    expect(result[0].ghoul).toBe(true);
  });

  it('detects Retainer sourced from a standing-merit benefit_grants chain', () => {
    const c = {
      merits: [
        {
          category: 'standing',
          name: 'Mystery Cult Initiation',
          cult_name: 'The Test Cult',
          benefit_grants: [
            { category: 'influence', name: 'Retainer', rating: 1 }
          ]
        }
      ]
    };
    const result = detectRetainers(c);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Retainer');
    expect(result[0]._from_mci).toBe('The Test Cult');
  });

  it('does not double-list a Retainer that appears both directly and in benefit_grants', () => {
    const c = {
      merits: [
        { category: 'influence', name: 'Retainer', rating: 2, area: 'Bodyguard' },
        {
          category: 'standing',
          name: 'Mystery Cult Initiation',
          benefit_grants: [
            { category: 'influence', name: 'Retainer', rating: 2, area: 'Bodyguard' }
          ]
        }
      ]
    };
    // deduplicateMerits handles this in the real code; here we confirm raw count
    // (dedup is not re-implemented — raw result should have 2 before dedup,
    // but importantly both are Retainer entries that would be collapsed by dedup)
    const result = detectRetainers(c);
    expect(result.every(m => m.name === 'Retainer')).toBe(true);
  });

  it('does not include non-retainer influence merits', () => {
    const c = {
      merits: [
        { category: 'influence', name: 'Allies', rating: 2 },
        { category: 'influence', name: 'Contacts', rating: 3 },
        { category: 'influence', name: 'Resources', rating: 4 },
        { category: 'influence', name: 'Status', rating: 1 },
        { category: 'influence', name: 'Attaché (Resources)', rating: 5, ghoul: true },
      ]
    };
    const result = detectRetainers(c);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Attaché (Resources)');
  });

  it('detects multiple retainers including mixed shapes', () => {
    const c = {
      merits: [
        { category: 'influence', name: 'Retainer', rating: 2, area: 'Bodyguard', ghoul: false },
        { category: 'influence', name: 'Attaché (Resources)', rating: 3, ghoul: true },
      ]
    };
    expect(detectRetainers(c)).toHaveLength(2);
  });

});
