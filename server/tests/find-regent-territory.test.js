/**
 * Unit tests — findRegentTerritory() in public/js/data/helpers.js
 *
 * Issue #216: function was hardened to prefer canonical-slug territories
 * over stale/orphaned duplicates when multiple docs share the same regent_id.
 *
 * Browser-only imports (icons, constants, discord auth) are mocked so Vitest
 * can import the frontend module without a DOM.  TERRITORY_DATA from
 * downtime-data.js is NOT mocked — it is pure data with no browser deps and
 * we want to test against the real canonical slug set.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock browser-only imports that helpers.js pulls in at module level.
vi.mock('../../public/js/data/icons.js', () => ({ ICONS: {} }));
vi.mock('../../public/js/data/constants.js', () => ({ ARCHETYPES_DB: {} }));
vi.mock('../../public/js/auth/discord.js', () => ({
  getRole: () => 'player',
  isLoggedIn: () => true,
  validateToken: () => true,
  login: () => {},
  logout: () => {},
  getUser: () => null,
  getPlayerInfo: () => null,
  isSTRole: () => false,
  handleCallback: () => {},
}));

const { findRegentTerritory } = await import('../../public/js/data/helpers.js');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALICE_ID  = '69d73ea49162ece35897a47c';
const RENE_ID   = '69d73ea49162ece35897a496';

const northShore = {
  _id: '69d9e54b00815d471503bea6',
  slug: 'northshore',
  name: 'The North Shore',
  regent_id: ALICE_ID,
  lieutenant_id: null,
  ambience: 'Tended',
};

const dockyards = {
  _id: '69d9e54c00815d471503bea9',
  slug: 'dockyards',
  name: 'The Dockyards',
  regent_id: RENE_ID,
  lieutenant_id: null,
  ambience: 'Settled',
};

const academy = {
  _id: '69d9e54b00815d471503bea7',
  slug: 'academy',
  name: 'The Academy',
  regent_id: '69d9e54b00815d471503aaaa',
  lieutenant_id: null,
  ambience: 'Curated',
};

const ALL_TERRITORIES = [
  { _id: '69d5dc6a00815d47150397c6', slug: 'harbour',     name: 'The Harbour',      regent_id: '69d5dc6a00815d47150397ff', lieutenant_id: null, ambience: 'Untended' },
  northShore,
  academy,
  { _id: '69d9e54c00815d471503bea8', slug: 'secondcity',  name: 'The Second City',  regent_id: '69d9e54c00815d471503bbbb', lieutenant_id: null, ambience: 'Tended' },
  dockyards,
];

const aliceChar = { _id: ALICE_ID };
const reneChar  = { _id: RENE_ID };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('findRegentTerritory', () => {

  describe('normal operation — correct data', () => {
    it('returns North Shore for Alice in a clean 5-territory array', () => {
      const result = findRegentTerritory(ALL_TERRITORIES, aliceChar);
      expect(result).not.toBeNull();
      expect(result.territory).toBe('The North Shore');
      expect(result.slug).toBe('northshore');
      expect(result.territoryId).toBe(northShore._id);
    });

    it('returns Dockyards for Rene in a clean 5-territory array', () => {
      const result = findRegentTerritory(ALL_TERRITORIES, reneChar);
      expect(result).not.toBeNull();
      expect(result.territory).toBe('The Dockyards');
      expect(result.slug).toBe('dockyards');
    });

    it('returns null when the character has no regent territory', () => {
      const nonRegent = { _id: 'ffffffffffffffffffffffff' };
      expect(findRegentTerritory(ALL_TERRITORIES, nonRegent)).toBeNull();
    });

    it('returns null for null/undefined inputs', () => {
      expect(findRegentTerritory(null, aliceChar)).toBeNull();
      expect(findRegentTerritory(ALL_TERRITORIES, null)).toBeNull();
      expect(findRegentTerritory(null, null)).toBeNull();
    });

    it('returns null for empty territories array', () => {
      expect(findRegentTerritory([], aliceChar)).toBeNull();
    });

    it('exposes all required fields in the return value', () => {
      const result = findRegentTerritory(ALL_TERRITORIES, aliceChar);
      expect(result).toMatchObject({
        territory:   expect.any(String),
        territoryId: expect.any(String),
        slug:        expect.any(String),
        ambience:    expect.any(String),
      });
      // lieutenantId allowed to be null
      expect('lieutenantId' in result).toBe(true);
    });
  });

  describe('AC-4 — canonical-slug preference (issue #216 guard)', () => {
    it('prefers canonical-slug doc over non-canonical doc with same regent_id', () => {
      // Simulate a stale orphan: same regent_id as North Shore but no canonical slug.
      const staleOrphan = {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        slug: null,        // no slug — not canonical
        name: 'The Dockyards',  // confusingly named, same as Dockyards
        regent_id: ALICE_ID,
        lieutenant_id: null,
        ambience: 'Settled',
      };
      // Orphan appears BEFORE the real North Shore in the array.
      const territoriesWithOrphan = [staleOrphan, ...ALL_TERRITORIES];

      const result = findRegentTerritory(territoriesWithOrphan, aliceChar);
      expect(result.slug).toBe('northshore');
      expect(result.territory).toBe('The North Shore');
      expect(result.territoryId).toBe(northShore._id);
    });

    it('prefers canonical-slug doc when stale doc has a non-canonical slug', () => {
      const staleDupe = {
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        slug: 'old-dockyards-id',  // non-canonical slug
        name: 'The Dockyards',
        regent_id: ALICE_ID,
        lieutenant_id: null,
        ambience: 'Settled',
      };
      const territoriesWithDupe = [staleDupe, ...ALL_TERRITORIES];

      const result = findRegentTerritory(territoriesWithDupe, aliceChar);
      expect(result.slug).toBe('northshore');
    });

    it('falls back to first match when no canonical slug exists in matches', () => {
      // Edge case: regent_id matches, but no match has a canonical slug.
      const orphanA = { _id: 'cccccccccccccccccccccccc', slug: 'unknown-a', name: 'Unknown A', regent_id: ALICE_ID, lieutenant_id: null, ambience: null };
      const orphanB = { _id: 'dddddddddddddddddddddddd', slug: 'unknown-b', name: 'Unknown B', regent_id: ALICE_ID, lieutenant_id: null, ambience: null };
      // Neither matches canonical slugs — first should win as safe fallback.
      const orphansOnly = [orphanA, orphanB];

      const result = findRegentTerritory(orphansOnly, aliceChar);
      expect(result).not.toBeNull();
      expect(result.territoryId).toBe(orphanA._id);
    });

    it('does not affect Rene — Dockyards has canonical slug and remains correct', () => {
      const staleOrphan = {
        _id: 'eeeeeeeeeeeeeeeeeeeeeeee',
        slug: null,
        name: 'Some Territory',
        regent_id: ALICE_ID,
        lieutenant_id: null,
        ambience: null,
      };
      const territoriesWithOrphan = [staleOrphan, ...ALL_TERRITORIES];

      const result = findRegentTerritory(territoriesWithOrphan, reneChar);
      expect(result.slug).toBe('dockyards');
      expect(result.territory).toBe('The Dockyards');
    });
  });

  describe('return value field behaviour', () => {
    it('uses name over slug for territory display string', () => {
      const result = findRegentTerritory(ALL_TERRITORIES, aliceChar);
      // name = 'The North Shore', slug = 'northshore' — name wins
      expect(result.territory).toBe('The North Shore');
    });

    it('falls back to slug when name is absent', () => {
      const noNameTerritory = [{
        _id: 'ffffffffffffffffffffffff',
        slug: 'northshore',
        name: '',
        regent_id: ALICE_ID,
        lieutenant_id: null,
        ambience: 'Tended',
      }];
      const result = findRegentTerritory(noNameTerritory, aliceChar);
      expect(result.territory).toBe('northshore');
    });

    it('stringifies territoryId even when _id is ObjectId-like', () => {
      const result = findRegentTerritory(ALL_TERRITORIES, aliceChar);
      expect(typeof result.territoryId).toBe('string');
    });
  });
});
