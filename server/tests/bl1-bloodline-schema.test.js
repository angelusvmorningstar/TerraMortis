/**
 * BL-1 (issue #1008) — `bloodlines` collection schema.
 *
 * AC 1, 2, 9. The four-discipline constraint is the load-bearing assertion
 * here: four disciplines is a rule of the game, not an artefact of the
 * current data, so a three-discipline bloodline must be rejected rather than
 * tolerated as a draft.
 *
 * The clan enum is asserted to be the SAME array the character schema uses,
 * because two hand-maintained copies of the five clans is precisely the drift
 * class this epic exists to delete.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { bloodlineSchema } from '../schemas/bloodline.schema.js';
import { characterSchema, CLAN_NAMES } from '../schemas/character.schema.js';

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validate = ajv.compile(bloodlineSchema);

/** A valid document, matching what the seed script produces. */
function doc(overrides = {}) {
  const now = new Date().toISOString();
  return {
    name: 'Khaibit',
    slug: 'khaibit',
    clan: 'Mekhet',
    disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
    active: true,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** True when the failure mentions the given instance path (e.g. '/disciplines'). */
function failedOn(path) {
  return (validate.errors || []).some(e => e.instancePath === path);
}

describe('BL-1 — bloodline schema, valid shapes', () => {
  it('accepts a complete document', () => {
    expect(validate(doc())).toBe(true);
  });

  it('accepts a document with an ObjectId _id present (read shape)', () => {
    expect(validate(doc({ _id: 'anything-goes-here' }))).toBe(true);
  });

  it('accepts a soft-retired bloodline (active false)', () => {
    expect(validate(doc({ active: false }))).toBe(true);
  });

  it('accepts a free-text note', () => {
    expect(validate(doc({ notes: 'Extinct in Sydney since 1998.' }))).toBe(true);
  });
});

describe('BL-1 — bloodline schema, the four-discipline rule', () => {
  it('rejects three disciplines', () => {
    expect(validate(doc({ disciplines: ['Auspex', 'Celerity', 'Obfuscate'] }))).toBe(false);
    expect(failedOn('/disciplines')).toBe(true);
  });

  it('rejects five disciplines', () => {
    expect(validate(doc({
      disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour', 'Dominate'],
    }))).toBe(false);
    expect(failedOn('/disciplines')).toBe(true);
  });

  it('rejects an empty discipline list', () => {
    expect(validate(doc({ disciplines: [] }))).toBe(false);
    expect(failedOn('/disciplines')).toBe(true);
  });

  it('rejects a non-string discipline entry', () => {
    expect(validate(doc({ disciplines: ['Auspex', 'Celerity', 'Obfuscate', 4] }))).toBe(false);
  });

  it('rejects a repeated discipline — four entries granting three powers is not four', () => {
    expect(validate(doc({ disciplines: ['Auspex', 'Auspex', 'Celerity', 'Vigour'] }))).toBe(false);
    expect(failedOn('/disciplines')).toBe(true);
  });

  it('rejects an empty-string discipline padding the count out to four', () => {
    expect(validate(doc({ disciplines: ['Auspex', 'Celerity', 'Obfuscate', ''] }))).toBe(false);
  });
});

describe('BL-1 — bloodline schema, rejections', () => {
  it('rejects an unknown clan', () => {
    expect(validate(doc({ clan: 'Tzimisce' }))).toBe(false);
    expect(failedOn('/clan')).toBe(true);
  });

  it('rejects a null clan — a bloodline always belongs to a clan', () => {
    expect(validate(doc({ clan: null }))).toBe(false);
  });

  it('rejects an unknown top-level property', () => {
    expect(validate(doc({ bane: 'Wanton Curse' }))).toBe(false);
    expect((validate.errors || []).some(e => e.params?.additionalProperty === 'bane')).toBe(true);
  });

  it('rejects a missing name', () => {
    const d = doc();
    delete d.name;
    expect(validate(d)).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(validate(doc({ name: '' }))).toBe(false);
  });

  it('rejects a missing slug, clan or disciplines', () => {
    for (const field of ['slug', 'clan', 'disciplines']) {
      const d = doc();
      delete d[field];
      expect(validate(d), `expected a missing ${field} to be rejected`).toBe(false);
    }
  });

  it('rejects a slug that is not kebab-case', () => {
    for (const slug of ['Khaibit', 'khai bit', 'khaibit_1', '-khaibit', 'Lidérc']) {
      expect(validate(doc({ slug })), `expected slug "${slug}" to be rejected`).toBe(false);
    }
  });
});

describe('BL-1 — the clan enum is shared, not copied', () => {
  it('uses the exact CLAN_NAMES array exported by the character schema', () => {
    expect(bloodlineSchema.properties.clan.enum).toBe(CLAN_NAMES);
  });

  it('CLAN_NAMES is the five clans', () => {
    expect(CLAN_NAMES).toEqual(['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue']);
  });

  it('the character schema still tolerates unset clan, and is built from CLAN_NAMES', () => {
    expect(characterSchema.properties.clan.enum).toEqual([...CLAN_NAMES, '', null]);
  });
});
