/**
 * BL-3b review fix (issue #1008) — the archived migration still works.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this file exists
 * ──────────────────────────────────────────────────────────────────────────
 *
 * BL-3b retired `server/scripts/seed-bloodlines.js` to `scripts/archive/` and
 * deleted `server/tests/bl1-seed-bloodlines.test.js` with it — 35 tests, of
 * which only the five `deriveSlug` cases were relocated (they test the LIVE
 * `server/lib/bloodline-slug.js`). That left `checkIntegrity`, `buildSeedDocs`
 * and `crossCheckHolders` with no executable coverage at all.
 *
 * BL-3b's external review called that the one substantive coverage loss in the
 * story, and it is right, because of AC 5: the archived script is deliberately
 * kept RUNNABLE. Production held zero bloodline documents when it was archived
 * and this is still the only bulk path into the collection, so it may yet be
 * run for real with `--apply`. A regression in the integrity gate, the
 * duplicate-name detection or the document builder would ship silently and
 * surface on the night someone finally seeds production.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   What this covers, and what it deliberately does not
 * ──────────────────────────────────────────────────────────────────────────
 *
 * The three PURE functions, which need no database: they take plain objects and
 * return plain objects. `seedBloodlines()` and `main()` are not exercised here
 * — they read and write Mongo, and the parts of them worth protecting are the
 * pure functions they delegate to plus the unique-index call, which
 * `bl4-bloodlines-write-api.test.js:275-294` already proves behaviourally by
 * dropping `bloodline_name_unique` and asserting a write recreates it with
 * `collation.strength === 2`. This is a smoke suite, not a resurrection of all
 * 35 deleted tests.
 *
 * Importing the archived script does NOT open a connection: `server/db.js`
 * connects only inside `connectDb()`, and `assertTestDbSafety` would refuse a
 * non-`_test` database under vitest anyway. The `dotenv/config` the script
 * loads is already loaded by `tests/helpers/setup-env.js`, which then hard-sets
 * `MONGODB_DB=tm_suite_test`; dotenv does not override an existing variable.
 *
 * This is the one file exempted from the "nothing outside `scripts/archive/`
 * imports the retired seed" guard in `bl3b-constants-deleted.test.js`, and that
 * guard asserts this exemption is real, so it cannot decay into a dead
 * carve-out.
 */

import { describe, it, expect } from 'vitest';
import {
  checkIntegrity,
  buildSeedDocs,
  crossCheckHolders,
} from '../scripts/archive/seed-bloodlines.js';
import { BLOODLINE_FIXTURES, FIXTURE_TIMESTAMP } from './helpers/bloodline-fixtures.js';

/** The 23 as the archived script itself would rebuild them, keyed by name. */
const SOURCE_DISCS = Object.fromEntries(
  BLOODLINE_FIXTURES.map(d => [d.name, [...d.disciplines]])
);

/** clan -> names, the shape `BLOODLINE_CLANS` had. */
const SOURCE_CLANS = BLOODLINE_FIXTURES.reduce((out, d) => {
  (out[d.clan] ??= []).push(d.name);
  return out;
}, {});

const CLANS = ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue'];

/** A clean two-entry source, so each failure case changes exactly one thing. */
const okDiscs = () => ({
  'Ankou': ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
  'Kerberos': ['Animalism', 'Majesty', 'Protean', 'Resilience'],
});
const okClans = () => ({ Mekhet: ['Ankou'], Gangrel: ['Kerberos'] });

// ─────────────────────────────────────────────────────────────────────────────
// checkIntegrity — the gate that runs before anything is written
// ─────────────────────────────────────────────────────────────────────────────

describe('archived seed — checkIntegrity passes a clean source', () => {
  it('accepts the two-entry sample with no errors', () => {
    const { errors, count } = checkIntegrity({ discs: okDiscs(), clans: okClans(), clanNames: CLANS });
    expect(errors).toEqual([]);
    expect(count).toBe(2);
  });

  it('accepts the real 23 the migration was built from', () => {
    // The archived script's own frozen constants produce this same set; see the
    // buildSeedDocs block below, which compares document for document.
    const { errors, count, clanOf } = checkIntegrity({ discs: SOURCE_DISCS, clans: SOURCE_CLANS, clanNames: CLANS });
    expect(errors).toEqual([]);
    expect(count).toBe(23);
    expect(clanOf['Hounds of Actaeon']).toBe('Gangrel');
    expect(clanOf['Malkovians']).toBe('Ventrue');
  });
});

describe('archived seed — checkIntegrity still refuses each defect class', () => {
  const failsWith = (discs, clans, pattern) => {
    const { errors } = checkIntegrity({ discs, clans, clanNames: CLANS });
    expect(errors.length, `expected at least one error matching ${pattern}`).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(pattern);
  };

  it('rejects a bloodline with the wrong number of disciplines', () => {
    const discs = okDiscs();
    discs['Ankou'] = ['Auspex', 'Celerity', 'Obfuscate'];
    failsWith(discs, okClans(), /has 3 disciplines; exactly 4 are required/);
  });

  it('rejects a discipline name that is not a real discipline', () => {
    // The quiet one. "Vigor" for "Vigour" is drift pattern #15 arriving through
    // the discipline field, and it degrades exactly as invisibly.
    const discs = okDiscs();
    discs['Ankou'] = ['Auspex', 'Celerity', 'Obfuscate', 'Vigor'];
    failsWith(discs, okClans(), /"Vigor", which is not a known discipline/);
  });

  it('rejects the same discipline listed twice', () => {
    const discs = okDiscs();
    discs['Ankou'] = ['Auspex', 'Auspex', 'Obfuscate', 'Vigour'];
    failsWith(discs, okClans(), /lists "Auspex" more than once/);
  });

  it('rejects a non-array discipline list rather than throwing', () => {
    const discs = okDiscs();
    discs['Ankou'] = 'Auspex';
    failsWith(discs, okClans(), /has a string where an array of 4 disciplines is required/);
  });

  it('rejects a clan key that is not one of the five', () => {
    const clans = okClans();
    clans.Tremere = ['Ankou'];
    failsWith(okDiscs(), clans, /"Tremere" is not one of the five clans/);
  });

  it('rejects a name claimed by two clans', () => {
    const clans = okClans();
    clans.Gangrel = ['Kerberos', 'Ankou'];
    failsWith(okDiscs(), clans, /claimed by more than one clan: Mekhet and Gangrel/);
  });

  it('rejects the same name listed twice under one clan', () => {
    const clans = okClans();
    clans.Mekhet = ['Ankou', 'Ankou'];
    failsWith(okDiscs(), clans, /listed twice under Mekhet/);
  });

  it('rejects a clan claim with no discipline entry behind it', () => {
    const clans = okClans();
    clans.Mekhet = ['Ankou', 'Norvegi'];
    failsWith(okDiscs(), clans, /"Norvegi" is in BLOODLINE_CLANS \(Mekhet\) but has no BLOODLINE_DISCS entry/);
  });

  it('rejects a bloodline no clan claims', () => {
    const clans = okClans();
    delete clans.Gangrel;
    failsWith(okDiscs(), clans, /"Kerberos" is in BLOODLINE_DISCS but no clan claims it/);
  });

  it('rejects a non-array clan list rather than iterating a string letter by letter', () => {
    const clans = okClans();
    clans.Mekhet = 'Ankou';
    failsWith(okDiscs(), clans, /BLOODLINE_CLANS\.Mekhet is a string where an array of names is required/);
  });

  it('rejects two names that collapse to the same slug', () => {
    // Slugs are meant to be stable identifiers. A collision detected now is a
    // refusal; the same collision detected later is one document permanently
    // unreachable.
    const discs = okDiscs();
    const clans = okClans();
    discs['Ankou!'] = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];
    clans.Mekhet = ['Ankou', 'Ankou!'];
    failsWith(discs, clans, /slug collision: "Ankou" and "Ankou!" both derive "ankou"/);
  });

  it('rejects a name with nothing to derive an id from', () => {
    const discs = okDiscs();
    const clans = okClans();
    discs['---'] = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];
    clans.Mekhet = ['Ankou', '---'];
    failsWith(discs, clans, /derives an empty slug/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSeedDocs — the documents that would actually be written
// ─────────────────────────────────────────────────────────────────────────────

describe('archived seed — buildSeedDocs', () => {
  it('refuses to build from a source the gate rejects, rather than dropping rows', () => {
    // The failure mode this protects against is silent partial truth: emit the
    // 22 that are fine and leave the broken one out, and the collection looks
    // seeded while one bloodline simply does not exist.
    const clans = okClans();
    delete clans.Gangrel;
    expect(() => buildSeedDocs({ discs: okDiscs(), clans })).toThrow(/buildSeedDocs refused/);
  });

  it('builds the migrated 23 exactly, timestamps and all', () => {
    // The strongest assertion in this file. It re-proves, permanently and by
    // test, what BL-3b's review could only confirm once by hand: the constants
    // that travelled into the archived script still produce the documents the
    // frozen fixtures record. `_id` is Mongo's, so it is not built here.
    const docs = buildSeedDocs({ discs: SOURCE_DISCS, clans: SOURCE_CLANS, now: FIXTURE_TIMESTAMP });
    expect(docs).toHaveLength(23);

    const expected = BLOODLINE_FIXTURES.map(({ _id, ...rest }) => ({ ...rest, notes: null }));
    expect(docs).toEqual(expected);
  });

  it('sorts by name, so a re-run reports in a stable order', () => {
    const docs = buildSeedDocs({ discs: SOURCE_DISCS, clans: SOURCE_CLANS, now: FIXTURE_TIMESTAMP });
    expect(docs.map(d => d.name)).toEqual([...docs.map(d => d.name)].sort((a, b) => a.localeCompare(b)));
  });

  it('stamps created_at and updated_at identically on a fresh document', () => {
    const docs = buildSeedDocs({ discs: okDiscs(), clans: okClans(), now: FIXTURE_TIMESTAMP });
    for (const d of docs) {
      expect(d.created_at).toBe(FIXTURE_TIMESTAMP);
      expect(d.updated_at).toBe(FIXTURE_TIMESTAMP);
      expect(d.notes).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// crossCheckHolders — reported, never enforced
// ─────────────────────────────────────────────────────────────────────────────

describe('archived seed — crossCheckHolders', () => {
  const seedNames = new Set(BLOODLINE_FIXTURES.map(d => d.name));

  it('counts holders and distinct values separately', () => {
    // They coincide in production today (13 and 13) and diverge the moment two
    // characters share a bloodline. The distinct count is the one BL-5 has to
    // clear, so a regression that conflated them would mislead exactly the
    // decision this report exists to inform.
    const rows = [
      { name: 'A', bloodline: 'Malkovians' },
      { name: 'B', bloodline: 'Malkovians' },
      { name: 'C', bloodline: 'Ankou' },
    ];
    const out = crossCheckHolders(rows, seedNames);
    expect(out.holders).toBe(3);
    expect(out.distinctValues).toBe(2);
    expect(out.resolving).toBe(3);
    expect(out.distinctResolving).toBe(2);
    expect(out.unresolved).toEqual([]);
  });

  it('names the character behind a value that does not resolve, preferring the moniker', () => {
    const rows = [
      { name: 'Ocka Keats', moniker: 'Ocka', bloodline: 'Hounds of Actaeon' },
      { name: 'Someone', bloodline: 'Not A Bloodline' },
    ];
    const out = crossCheckHolders(rows, seedNames);
    expect(out.resolving).toBe(1);
    expect(out.unresolved).toEqual([{ character: 'Someone', bloodline: 'Not A Bloodline' }]);
  });

  it('falls back to a placeholder rather than an empty label', () => {
    const out = crossCheckHolders([{ bloodline: 'Nope' }], seedNames);
    expect(out.unresolved).toEqual([{ character: '(unnamed)', bloodline: 'Nope' }]);
  });

  it('reports nothing to clear when no character carries a bloodline', () => {
    const out = crossCheckHolders([], seedNames);
    expect(out).toEqual({ holders: 0, distinctValues: 0, resolving: 0, distinctResolving: 0, unresolved: [] });
  });
});
