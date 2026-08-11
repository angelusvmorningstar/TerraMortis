import { describe, it, expect } from 'vitest';
import {
  calcEffectiveCityStatus,
  titleStatusBonusFor,
  regentAmbienceBonusFor,
  REGENT_AMBIENCE_BONUS,
} from '../../public/js/data/city-status-calc.js';

describe('otc.2 — city-status-calc.js (pure, shared client/server)', () => {
  describe('titleStatusBonusFor', () => {
    it('returns the correct bonus per court category', () => {
      expect(titleStatusBonusFor('Head of State')).toBe(3);
      expect(titleStatusBonusFor('Primogen')).toBe(2);
      expect(titleStatusBonusFor('Socialite')).toBe(1);
      expect(titleStatusBonusFor('Enforcer')).toBe(1);
      expect(titleStatusBonusFor('Administrator')).toBe(1);
    });

    it('returns 0 for no office / unknown category', () => {
      expect(titleStatusBonusFor(undefined)).toBe(0);
      expect(titleStatusBonusFor(null)).toBe(0);
      expect(titleStatusBonusFor('Not A Real Office')).toBe(0);
    });
  });

  describe('regentAmbienceBonusFor', () => {
    it('returns the correct bonus per ambience', () => {
      expect(regentAmbienceBonusFor('Curated')).toBe(1);
      expect(regentAmbienceBonusFor('Verdant')).toBe(1);
      expect(regentAmbienceBonusFor('The Rack')).toBe(2);
    });

    it('returns 0 for no ambience / not a regent', () => {
      expect(regentAmbienceBonusFor(undefined)).toBe(0);
      expect(regentAmbienceBonusFor(null)).toBe(0);
      expect(regentAmbienceBonusFor('Some Other Ambience')).toBe(0);
    });

    it('REGENT_AMBIENCE_BONUS is frozen (single canonical source, not re-copyable)', () => {
      expect(Object.isFrozen(REGENT_AMBIENCE_BONUS)).toBe(true);
    });
  });

  describe('calcEffectiveCityStatus — the regression this story fixes', () => {
    it('base dots only, no office, no ambience', () => {
      const c = { status: { city: 4 }, court_category: undefined };
      expect(calcEffectiveCityStatus(c, null)).toBe(4);
    });

    it('base dots + title bonus (the everyday case)', () => {
      const c = { status: { city: 4 }, court_category: 'Head of State' };
      expect(calcEffectiveCityStatus(c, null)).toBe(7); // matches the "7 of 7" example from live scoping
    });

    it('base dots + title bonus + regent-ambience bonus (the case the old server calc dropped)', () => {
      const c = { status: { city: 4 }, court_category: 'Head of State' };
      expect(calcEffectiveCityStatus(c, 'The Rack')).toBe(9); // 4 + 3 + 2
    });

    it('caps at 10 even when the raw sum would exceed it (the other thing the old server calc dropped)', () => {
      const c = { status: { city: 10 }, court_category: 'Head of State' };
      expect(calcEffectiveCityStatus(c, 'The Rack')).toBe(10); // 10 + 3 + 2 = 15, capped to 10
    });

    it('handles a character with no status object at all', () => {
      const c = { court_category: 'Primogen' };
      expect(calcEffectiveCityStatus(c, null)).toBe(2);
    });
  });
});
