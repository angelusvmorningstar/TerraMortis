/**
 * Unit tests — issue #939: Personal Story (Off-Screen Life) is no longer part
 * of the minimum-complete gate. A submission with a blank Personal Story must
 * still be minimum-complete (so its XP credit is not held), and Personal Story
 * must never appear in missingMinimumPieces. The other minimum rules (game
 * recount, feeding, project 1, regency-if-regent) must still gate.
 */

import { describe, it, expect } from 'vitest';
import { isMinimalComplete, missingMinimumPieces } from '../../public/js/data/dt-completeness.js';

// A responses bag that satisfies every minimum rule EXCEPT Personal Story.
function completeMinusPersonalStory() {
  return {
    game_recount_1: 'Confronted the Prince at Elysium.',
    feeding_territories: JSON.stringify({ 'kings-cross': 'open' }),
    _feed_method: 'hunt',
    _feed_blood_types: JSON.stringify(['mortal']),
    feed_violence: 'kiss',
    project_1_action: 'investigate',
  };
}

describe('dt-completeness — Personal Story optional (issue #939)', () => {
  it('isMinimalComplete is true with a blank Personal Story when other pieces are present', () => {
    expect(isMinimalComplete(completeMinusPersonalStory())).toBe(true);
  });

  it('missingMinimumPieces does not list personal_story (live branch)', () => {
    const missing = missingMinimumPieces(completeMinusPersonalStory());
    expect(missing.some(p => p.section === 'personal_story')).toBe(false);
  });

  it('missingMinimumPieces does not list personal_story (null-responses fallback)', () => {
    const missing = missingMinimumPieces(null);
    expect(missing.some(p => p.section === 'personal_story')).toBe(false);
  });

  // Regression — the OTHER minimum rules must still gate.
  it('still requires a game recount', () => {
    const r = completeMinusPersonalStory();
    delete r.game_recount_1;
    expect(isMinimalComplete(r)).toBe(false);
    expect(missingMinimumPieces(r).some(p => p.section === 'court')).toBe(true);
  });

  it('still requires feeding to be complete', () => {
    const r = completeMinusPersonalStory();
    delete r.feed_violence;
    expect(isMinimalComplete(r)).toBe(false);
    expect(missingMinimumPieces(r).some(p => p.section === 'feeding')).toBe(true);
  });

  it('still requires project 1', () => {
    const r = completeMinusPersonalStory();
    delete r.project_1_action;
    expect(isMinimalComplete(r)).toBe(false);
    expect(missingMinimumPieces(r).some(p => p.section === 'projects')).toBe(true);
  });

  it('still requires regency confirmation for a regent', () => {
    expect(isMinimalComplete(completeMinusPersonalStory(), { isRegent: true, regencyConfirmed: false })).toBe(false);
    expect(isMinimalComplete(completeMinusPersonalStory(), { isRegent: true, regencyConfirmed: true })).toBe(true);
  });
});
