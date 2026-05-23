/**
 * Unit tests — submission territory key resolver (issue #496, story 496.1).
 *
 * Validates that `resolveSubmissionTerritoryKey()` correctly normalises every
 * key format found in live data by the pre-flight audit:
 *   - ObjectId strings
 *   - short slugs (TERRITORY_DATA.slug)
 *   - long slugs (the_harbour, the_north_shore)
 *   - display names (The Harbour, The North Shore)
 *   - legacy variants (The Shore, The City Harbour, the_northern_shore, the_docklands)
 *   - Barrens variants (null result)
 *   - unmappable garbage (null result)
 */

import { describe, it, expect } from 'vitest';

import {
  buildTerritoryLookupMaps,
  resolveSubmissionTerritoryKey,
} from '../utils/territory-key-resolver.js';

// Realistic fixture mirroring live `tm_suite.territories` doc shape.
const TERRITORIES = [
  { _id: '69d5dc6a00815d47150397c6', slug: 'harbour',     name: 'The Harbour' },
  { _id: '69d9e54b00815d471503bea6', slug: 'northshore',  name: 'The North Shore' },
  { _id: '69d9e54b00815d471503bea7', slug: 'academy',     name: 'The Academy' },
  { _id: '69d9e54c00815d471503bea8', slug: 'secondcity',  name: 'The Second City' },
  { _id: '69d9e54c00815d471503bea9', slug: 'dockyards',   name: 'The Dockyards' },
];

const MAPS = buildTerritoryLookupMaps(TERRITORIES);

describe('buildTerritoryLookupMaps', () => {
  it('indexes territories by id, slug, and name', () => {
    expect(MAPS.byId.size).toBe(5);
    expect(MAPS.bySlug.size).toBe(5);
    expect(MAPS.byName.size).toBe(5);
    expect(MAPS.byId.get('69d5dc6a00815d47150397c6').slug).toBe('harbour');
    expect(MAPS.bySlug.get('harbour').name).toBe('The Harbour');
    expect(MAPS.byName.get('The Harbour').slug).toBe('harbour');
  });

  it('skips territories without _id', () => {
    const maps = buildTerritoryLookupMaps([
      { slug: 'orphan', name: 'Orphan' },
      { _id: 'x', slug: 'kept' },
    ]);
    expect(maps.byId.size).toBe(1);
    expect(maps.bySlug.size).toBe(1);
  });

  it('handles empty / null input', () => {
    const empty = buildTerritoryLookupMaps([]);
    expect(empty.byId.size).toBe(0);
    expect(buildTerritoryLookupMaps(null).byId.size).toBe(0);
    expect(buildTerritoryLookupMaps(undefined).byId.size).toBe(0);
  });
});

describe('resolveSubmissionTerritoryKey — ObjectId path', () => {
  it('resolves a known ObjectId string', () => {
    expect(resolveSubmissionTerritoryKey('69d5dc6a00815d47150397c6', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
  });

  it('returns null for OID-shaped strings that are not in the territories collection', () => {
    expect(resolveSubmissionTerritoryKey('ffffffffffffffffffffffff', MAPS)).toBe(null);
  });

  it('normalises uppercase hex OIDs to lowercase and resolves them', () => {
    // The audit didn't find these in the wild (MongoDB always emits lowercase),
    // but the resolver is defensive against any future writer that doesn't.
    expect(resolveSubmissionTerritoryKey('69D5DC6A00815D47150397C6', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
  });
});

describe('resolveSubmissionTerritoryKey — short slug path', () => {
  it('resolves a short slug (TERRITORY_DATA.slug)', () => {
    expect(resolveSubmissionTerritoryKey('harbour', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
    expect(resolveSubmissionTerritoryKey('northshore', MAPS))
      .toBe('69d9e54b00815d471503bea6');
  });
});

describe('resolveSubmissionTerritoryKey — long slug path (feeding_territories format)', () => {
  it('resolves long slugs used in feeding_territories JSON keys', () => {
    expect(resolveSubmissionTerritoryKey('the_harbour', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
    expect(resolveSubmissionTerritoryKey('the_north_shore', MAPS))
      .toBe('69d9e54b00815d471503bea6');
    expect(resolveSubmissionTerritoryKey('the_academy', MAPS))
      .toBe('69d9e54b00815d471503bea7');
    expect(resolveSubmissionTerritoryKey('the_second_city', MAPS))
      .toBe('69d9e54c00815d471503bea8');
    expect(resolveSubmissionTerritoryKey('the_dockyards', MAPS))
      .toBe('69d9e54c00815d471503bea9');
  });
});

describe('resolveSubmissionTerritoryKey — display-name path', () => {
  it('resolves display names found in influence_territories JSON keys (DT1 legacy)', () => {
    expect(resolveSubmissionTerritoryKey('The Harbour', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
    expect(resolveSubmissionTerritoryKey('The North Shore', MAPS))
      .toBe('69d9e54b00815d471503bea6');
  });

  it('resolves the "The Shore" typo found in DT1 influence_territories', () => {
    expect(resolveSubmissionTerritoryKey('The Shore', MAPS))
      .toBe('69d9e54b00815d471503bea6'); // northshore via SLUG_MAP
  });
});

describe('resolveSubmissionTerritoryKey — legacy variants', () => {
  it('resolves legacy slug variants via TERRITORY_SLUG_MAP', () => {
    expect(resolveSubmissionTerritoryKey('the_city_harbour', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
    expect(resolveSubmissionTerritoryKey('the_docklands', MAPS))
      .toBe('69d9e54c00815d471503bea9');
    expect(resolveSubmissionTerritoryKey('the_northern_shore', MAPS))
      .toBe('69d9e54b00815d471503bea6');
  });

  it('resolves legacy display-name variants', () => {
    expect(resolveSubmissionTerritoryKey('The City Harbour', MAPS))
      .toBe('69d5dc6a00815d47150397c6');
    expect(resolveSubmissionTerritoryKey('The Northern Shore', MAPS))
      .toBe('69d9e54b00815d471503bea6');
  });
});

describe('resolveSubmissionTerritoryKey — Barrens (null sentinel)', () => {
  it('returns null for both Barrens slug variants found in live data', () => {
    // DT1 form: double underscore
    expect(resolveSubmissionTerritoryKey('the_barrens__no_territory_', MAPS)).toBe(null);
    // DT2 form: single underscore
    expect(resolveSubmissionTerritoryKey('the_barrens_no_territory_', MAPS)).toBe(null);
    // Display-name variants
    expect(resolveSubmissionTerritoryKey('The Barrens', MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey('The Barrens (No Territory)', MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey('the_barrens', MAPS)).toBe(null);
  });
});

describe('resolveSubmissionTerritoryKey — unmappable input', () => {
  it('returns null for empty / falsy inputs', () => {
    expect(resolveSubmissionTerritoryKey('', MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey(null, MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey(undefined, MAPS)).toBe(null);
  });

  it('returns null for unknown strings', () => {
    expect(resolveSubmissionTerritoryKey('garbage', MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey('the_atlantis', MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey('Some Random Place', MAPS)).toBe(null);
  });

  it('returns null when a known slug is not in the provided territories list', () => {
    const emptyMaps = buildTerritoryLookupMaps([]);
    expect(resolveSubmissionTerritoryKey('harbour', emptyMaps)).toBe(null);
    expect(resolveSubmissionTerritoryKey('the_harbour', emptyMaps)).toBe(null);
  });
});

describe('resolveSubmissionTerritoryKey — number coercion', () => {
  it('coerces non-string inputs to strings before lookup', () => {
    // Defensive: not expected in production, but resolver should not throw.
    expect(resolveSubmissionTerritoryKey(0, MAPS)).toBe(null);
    expect(resolveSubmissionTerritoryKey(false, MAPS)).toBe(null);
  });
});
