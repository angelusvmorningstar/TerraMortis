/**
 * BL-1 (issue #1008) — seed-bloodlines script.
 *
 * AC 3, 4, 5, 6, 9. Two halves:
 *
 *   1. Pure functions — slug derivation, the integrity gate, and the live
 *      cross-check — exercised without a database.
 *   2. The script's actual `main()` run against tm_suite_test. Per the #826
 *      post-mortem, testing only the helpers leaves the wiring untested, and
 *      the wiring is where that bug lived.
 *
 * The integrity gate is the point of the script. Two hand-maintained
 * structures (BLOODLINE_DISCS and BLOODLINE_CLANS) can disagree, and a name
 * present in one but not the other is the exact drift that produced this
 * epic — a missing lookup degrading to a plausible neighbouring value
 * (data-map.md drift pattern #15).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Ajv from 'ajv';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection, getDb } from '../db.js';
import { bloodlineSchema } from '../schemas/bloodline.schema.js';
import { CLAN_NAMES } from '../schemas/character.schema.js';
import {
  deriveSlug,
  checkIntegrity,
  buildSeedDocs,
  crossCheckHolders,
  main,
} from '../scripts/seed-bloodlines.js';
import { BLOODLINE_DISCS, BLOODLINE_CLANS } from '../../public/js/data/constants.js';

const SLUG_PATTERN = new RegExp(bloodlineSchema.properties.slug.pattern);

/** Marker on the throwaway characters the cross-check test seeds. */
const CHAR_FLAG = { _bl1_test: true };

// ─────────────────────────────────────────────────────────────────────────────
// Pure — deriveSlug
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-1 — deriveSlug', () => {
  it('lowercases a single word', () => {
    expect(deriveSlug('Khaibit')).toBe('khaibit');
  });

  it('hyphenates spaces', () => {
    expect(deriveSlug('Order of Sir Martin')).toBe('order-of-sir-martin');
    expect(deriveSlug('Scions of the First City')).toBe('scions-of-the-first-city');
    expect(deriveSlug('Hounds of Actaeon')).toBe('hounds-of-actaeon');
  });

  it('strips diacritics rather than hyphenating through them', () => {
    // Naive non-alphanumeric replacement would give "lid-rc", which is a legal
    // kebab string but a nonsense identifier.
    expect(deriveSlug('Lidérc')).toBe('liderc');
  });

  it('collapses runs of separators and trims the ends', () => {
    expect(deriveSlug("  The O'Hara  Line  ")).toBe('the-o-hara-line');
  });

  it('derives a schema-legal slug for every real bloodline', () => {
    for (const name of Object.keys(BLOODLINE_DISCS)) {
      const slug = deriveSlug(name);
      expect(SLUG_PATTERN.test(slug), `slug "${slug}" from "${name}" is not schema-legal`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure — checkIntegrity
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal well-formed pair of structures the individual cases then break. */
function goodPair() {
  return {
    discs: {
      Alpha: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
      Beta: ['Animalism', 'Dominate', 'Protean', 'Resilience'],
    },
    clans: { Mekhet: ['Alpha'], Ventrue: ['Beta'] },
  };
}

describe('BL-1 — checkIntegrity, the real constants', () => {
  it('passes clean against the live constants and counts 23 bloodlines', () => {
    const r = checkIntegrity({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS, clanNames: CLAN_NAMES });
    expect(r.errors).toEqual([]);
    expect(r.count).toBe(23);
  });

  it('confirms every live bloodline carries exactly four disciplines', () => {
    for (const [name, discs] of Object.entries(BLOODLINE_DISCS)) {
      expect(discs.length, `${name} has ${discs.length} disciplines`).toBe(4);
    }
  });
});

describe('BL-1 — checkIntegrity, failure modes', () => {
  it('flags a bloodline with three disciplines', () => {
    const p = goodPair();
    p.discs.Alpha = ['Auspex', 'Celerity', 'Obfuscate'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Alpha') && e.includes('3'))).toBe(true);
  });

  it('flags a bloodline with five disciplines', () => {
    const p = goodPair();
    p.discs.Alpha = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour', 'Dominate'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Alpha') && e.includes('5'))).toBe(true);
  });

  it('flags a name in BLOODLINE_DISCS that no clan claims', () => {
    const p = goodPair();
    p.discs.Orphan = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Orphan'))).toBe(true);
  });

  it('flags a name in BLOODLINE_CLANS with no disciplines — the Actaeon failure', () => {
    // This is the shape of the defect that opened #1008: the clan list knew
    // the name, the discipline map did not, and clanDiscList fell through.
    const p = goodPair();
    p.clans.Gangrel = ['Hounds of Actaeon'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Hounds of Actaeon'))).toBe(true);
  });

  it('flags a bloodline claimed by two clans', () => {
    const p = goodPair();
    p.clans.Ventrue = ['Beta', 'Alpha'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Alpha') && /more than one clan/i.test(e))).toBe(true);
  });

  it('flags a clan key that is not one of the five', () => {
    const p = goodPair();
    p.clans.Tzimisce = ['Alpha'];
    delete p.clans.Mekhet;
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Tzimisce'))).toBe(true);
  });

  it('flags a discipline name that is not a real discipline', () => {
    // "Vigor" instead of "Vigour" is drift pattern #15 arriving through the
    // discipline field: the count is right, the schema passes, and BL-2's
    // in-clan check silently falls through to the plain clan list.
    const p = goodPair();
    p.discs.Alpha = ['Auspex', 'Celerity', 'Obfuscate', 'Vigor'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => e.includes('Vigor'))).toBe(true);
  });

  it('flags a repeated discipline', () => {
    const p = goodPair();
    p.discs.Alpha = ['Auspex', 'Auspex', 'Celerity', 'Vigour'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => /more than once/i.test(e))).toBe(true);
  });

  it('flags an empty-string discipline', () => {
    const p = goodPair();
    p.discs.Alpha = ['Auspex', 'Celerity', 'Obfuscate', ''];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => /empty or non-string/i.test(e))).toBe(true);
  });

  it('flags a non-array clan list instead of iterating its characters', () => {
    // `Daeva: 'Zelani'` (forgotten brackets) would otherwise emit six errors,
    // one per letter; `Daeva: 5` would throw a raw TypeError.
    const p = goodPair();
    p.clans.Mekhet = 'Alpha';
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => /BLOODLINE_CLANS\.Mekhet is a string/.test(e))).toBe(true);
    expect(r.errors.some(e => /^"A"/.test(e))).toBe(false);

    p.clans.Mekhet = 5;
    expect(() => checkIntegrity({ ...p, clanNames: CLAN_NAMES })).not.toThrow();
  });

  it('distinguishes a name listed twice under one clan from a genuine two-clan conflict', () => {
    const p = goodPair();
    p.clans.Mekhet = ['Alpha', 'Alpha'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => /listed twice under Mekhet/.test(e))).toBe(true);
    expect(r.errors.some(e => /Mekhet and Mekhet/.test(e))).toBe(false);
  });

  it('flags two names that collapse to the same slug', () => {
    const p = goodPair();
    // "Al pha" and "Al-pha" both derive "al-pha".
    p.discs['Al pha'] = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];
    p.discs['Al-pha'] = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];
    p.clans.Mekhet = ['Alpha', 'Al pha', 'Al-pha'];
    const r = checkIntegrity({ ...p, clanNames: CLAN_NAMES });
    expect(r.errors.some(e => /slug/i.test(e))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure — buildSeedDocs
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-1 — buildSeedDocs', () => {
  it('builds one schema-valid document per bloodline', () => {
    const ajv = new Ajv({ allErrors: true, coerceTypes: false });
    const validate = ajv.compile(bloodlineSchema);
    const docs = buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS });

    expect(docs).toHaveLength(23);
    for (const d of docs) {
      expect(validate(d), `${d.name} failed schema: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(d.notes).toBeNull();
    }
  });

  it('assigns each bloodline the clan that claims it', () => {
    const docs = buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS });
    const byName = Object.fromEntries(docs.map(d => [d.name, d]));
    expect(byName['Hounds of Actaeon'].clan).toBe('Gangrel');
    expect(byName['Khaibit'].clan).toBe('Mekhet');
    expect(byName['Zelani'].clan).toBe('Daeva');
    expect(byName['Lidérc'].slug).toBe('liderc');
  });

  it('refuses to build documents from a source that fails the integrity gate', () => {
    // The function is exported. A future caller must not be able to get a
    // silently-filtered partial set out of a bad source.
    const p = goodPair();
    p.discs.Orphan = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];
    expect(() => buildSeedDocs({ discs: p.discs, clans: p.clans })).toThrow(/integrity failure/i);
  });

  it('carries the discipline list through verbatim', () => {
    const docs = buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS });
    const actaeon = docs.find(d => d.name === 'Hounds of Actaeon');
    expect(actaeon.disciplines).toEqual(['Animalism', 'Obfuscate', 'Protean', 'Resilience']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure — crossCheckHolders (AC 6)
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-1 — crossCheckHolders', () => {
  const seedNames = new Set(['Khaibit', 'Kerberos']);

  it('counts holders and resolvers', () => {
    const r = crossCheckHolders([
      { name: 'A', bloodline: 'Khaibit' },
      { name: 'B', bloodline: 'Kerberos' },
    ], seedNames);
    expect(r.holders).toBe(2);
    expect(r.resolving).toBe(2);
    expect(r.unresolved).toEqual([]);
  });

  it('names the character behind a non-resolving value, by moniker where set', () => {
    const r = crossCheckHolders([
      { name: 'Ocka Keats', bloodline: 'Hounds of Actaeon' },
      { name: 'Henry St. John', moniker: 'Keeper', bloodline: 'Nope' },
    ], seedNames);
    expect(r.holders).toBe(2);
    expect(r.resolving).toBe(0);
    expect(r.unresolved).toEqual([
      { character: 'Ocka Keats', bloodline: 'Hounds of Actaeon' },
      { character: 'Keeper', bloodline: 'Nope' },
    ]);
  });

  it('reports the distinct-value count separately from the holder count', () => {
    const r = crossCheckHolders([
      { name: 'A', bloodline: 'Khaibit' },
      { name: 'B', bloodline: 'Khaibit' },
    ], seedNames);
    expect(r.holders).toBe(2);
    expect(r.distinctValues).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB-driven — the script's real main() against tm_suite_test
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-1 — main() against tm_suite_test', () => {
  beforeAll(async () => {
    await setupDb();
    await getCollection('characters').deleteMany(CHAR_FLAG);
  });

  afterAll(async () => {
    await getDb().collection('bloodlines').drop().catch(() => {});
    await getCollection('characters').deleteMany(CHAR_FLAG);
    await teardownDb();
  });

  beforeEach(async () => {
    await getDb().collection('bloodlines').drop().catch(() => {});
  });

  it('dry-run is the default and writes nothing', async () => {
    const r = await main(['node', 'seed-bloodlines.js'], { closeConnection: false });
    expect(r.dryRun).toBe(true);
    expect(r.wouldInsert).toBe(23);
    expect(r.inserted).toBe(0);
    expect(await getCollection('bloodlines').countDocuments()).toBe(0);
  });

  it('--apply inserts all 23 and creates the unique name index', async () => {
    const r = await main(['node', 'seed-bloodlines.js', '--apply'], { closeConnection: false });
    expect(r.dryRun).toBe(false);
    expect(r.inserted).toBe(23);
    expect(await getCollection('bloodlines').countDocuments()).toBe(23);

    const indexes = await getCollection('bloodlines').indexes();
    const nameIdx = indexes.find(i => i.key && i.key.name === 1);
    expect(nameIdx, 'expected an index on name').toBeTruthy();
    expect(nameIdx.unique).toBe(true);
  });

  it('a second --apply run inserts nothing (idempotent)', async () => {
    await main(['node', 'seed-bloodlines.js', '--apply'], { closeConnection: false });
    const r = await main(['node', 'seed-bloodlines.js', '--apply'], { closeConnection: false });
    expect(r.inserted).toBe(0);
    expect(r.alreadyPresent).toBe(23);
    expect(await getCollection('bloodlines').countDocuments()).toBe(23);
  });

  it('the unique index rejects a duplicate name', async () => {
    await main(['node', 'seed-bloodlines.js', '--apply'], { closeConnection: false });
    await expect(
      getCollection('bloodlines').insertOne({
        name: 'Khaibit', slug: 'khaibit-2', clan: 'Mekhet',
        disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
        notes: null,
      })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('reports the live cross-check against real characters, in both modes', async () => {
    // Asserting only `typeof === number` would pass against a broken query
    // returning nothing, which is the whole failure this test exists to catch.
    // Seed characters whose bloodline values are known, then assert the counts.
    const chars = getCollection('characters');
    await chars.insertMany([
      { ...CHAR_FLAG, name: 'BL1 Resolver One', bloodline: 'Khaibit' },
      { ...CHAR_FLAG, name: 'BL1 Resolver Two', bloodline: 'Khaibit' },
      { ...CHAR_FLAG, name: 'BL1 Stranger', moniker: 'Strange', bloodline: 'Nonexistent Line' },
      { ...CHAR_FLAG, name: 'BL1 Empty String', bloodline: '' },
      { ...CHAR_FLAG, name: 'BL1 Explicit Null', bloodline: null },
      { ...CHAR_FLAG, name: 'BL1 Field Absent' },
    ]);

    for (const argv of [['node', 's.js'], ['node', 's.js', '--apply']]) {
      const r = await main(argv, { closeConnection: false });
      const cc = r.crossCheck;
      // Three holders only: '' , null and a missing field must all be excluded.
      expect(cc.holders, `mode ${argv[2] || 'dry-run'}`).toBe(3);
      expect(cc.distinctValues).toBe(2);
      expect(cc.resolving).toBe(2);          // two characters, one value
      expect(cc.distinctResolving).toBe(1);  // one distinct value resolves
      expect(cc.unresolved).toEqual([
        { character: 'Strange', bloodline: 'Nonexistent Line' },
      ]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB-driven — reconciliation against a collection that already disagrees
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-1 — reconciliation with pre-existing documents', () => {
  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await getDb().collection('bloodlines').drop().catch(() => {});
    await teardownDb();
  });

  beforeEach(async () => {
    await getDb().collection('bloodlines').drop().catch(() => {});
  });

  it('reports a same-name document that disagrees with the constants, and does not overwrite it', async () => {
    // The #1008 defect living in Mongo instead of in the constants: a name-only
    // idempotency check reports a clean run over this and the operator's
    // "inserted 0" confirmation reads as "everything is correct".
    await getCollection('bloodlines').insertOne({
      name: 'Hounds of Actaeon',
      slug: 'hounds-of-actaeon',
      clan: 'Mekhet',                                   // wrong: should be Gangrel
      disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'], // wrong list
      notes: null,
    });

    const r = await main(['node', 's.js', '--apply'], { closeConnection: false });

    expect(r.differing).toHaveLength(1);
    expect(r.differing[0].name).toBe('Hounds of Actaeon');
    expect(r.differing[0].deltas.join(' ')).toMatch(/clan/);
    expect(r.differing[0].deltas.join(' ')).toMatch(/disciplines/);
    expect(r.inserted).toBe(22);

    // Reported, never silently corrected — which side is right is a human call.
    const live = await getCollection('bloodlines').findOne({ name: 'Hounds of Actaeon' });
    expect(live.clan).toBe('Mekhet');
  });

  it('reports an orphan document that the source no longer names', async () => {
    await getCollection('bloodlines').insertOne({
      name: 'Malkavians', slug: 'malkavians', clan: 'Ventrue',
      disciplines: ['Auspex', 'Dominate', 'Obfuscate', 'Resilience'],
      notes: null,
    });
    const r = await main(['node', 's.js'], { closeConnection: false });
    expect(r.orphans).toEqual(['Malkavians']);
  });

  it('resumes cleanly from a partially seeded collection', async () => {
    const docs = buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS });
    await getCollection('bloodlines').insertMany(docs.slice(0, 10));

    const r = await main(['node', 's.js', '--apply'], { closeConnection: false });
    expect(r.alreadyPresent).toBe(10);
    expect(r.inserted).toBe(13);
    expect(r.differing).toEqual([]);
    expect(await getCollection('bloodlines').countDocuments()).toBe(23);
  });

  it('refuses to apply when the collection already holds duplicate names', async () => {
    // createIndex would throw a raw E11000 here. Detect it first and say which
    // name is at fault, in dry-run as well as apply, so the preview is honest.
    const dupe = {
      name: 'Khaibit', slug: 'khaibit', clan: 'Mekhet',
      disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
      notes: null,
    };
    await getCollection('bloodlines').insertMany([dupe, { ...dupe, slug: 'khaibit-2' }]);

    const dry = await main(['node', 's.js'], { closeConnection: false });
    expect(dry.duplicateNames).toEqual(['Khaibit']);

    await expect(main(['node', 's.js', '--apply'], { closeConnection: false }))
      .rejects.toThrow(/duplicate name/i);
    // Nothing written: still just the two documents that were there.
    expect(await getCollection('bloodlines').countDocuments()).toBe(2);
  });
});
