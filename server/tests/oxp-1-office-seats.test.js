/**
 * oxp.1 (data-lock) tests: the `office_seats` collection's AJV schema and its
 * one-off seed script.
 *
 * What this suite is actually proving, and why each part matters:
 *
 *   1. The schema accepts a well-formed seat and rejects a bogus
 *      `office_category`, so the collection cannot accrete office names that
 *      `character.schema.js`'s `court_category` enum does not know about.
 *
 *   2. A VACANT seat (`holder_id: null`) validates. A seat outlives its
 *      holder; the seat document is the identity, the holder is a pointer.
 *
 *   3. TWO documents sharing one `office_category` with different `holder_id`
 *      values are BOTH valid, simultaneously. This is the structural proof of
 *      the story's central finding: Socialite has two live seats (Brandy
 *      LaRoux "Harpy", Carver "People's Harpy") and, per Angelus's ruling of
 *      2026-08-13, so does Primogen (Yusuf Kalusicj, Rene St. Dominique). Any
 *      office can have N concurrent seats. There is deliberately no
 *      Socialite-shaped special case anywhere in the schema, so the test
 *      exercises both offices to make sure neither is privileged.
 *
 *   4. `holder_id` is typed consistently as a 24-hex ObjectId string or null,
 *      never a free-form string. data-map.md Known Drift Pattern #2 (mixed
 *      string/ObjectId foreign keys) is the exact failure this guards.
 *
 *   5. The seed script's own logic: seven docs, correct pairings, refuses to
 *      build without Rene St. Dominique's unconfirmed creation date, and is
 *      idempotent against a REAL collection.
 *
 * DB-backed blocks run against `tm_suite_test` only. `tests/helpers/setup-env.js`
 * hard-forces `MONGODB_DB=tm_suite_test` for every vitest worker, and `db.js`'s
 * `assertTestDbSafety` throws if a test context ever resolves a non-`_test`
 * database. They skip (never fail) without a local mongod, per this repo's
 * `describe.skipIf(!dbAvailable)` convention: a skip is NOT evidence AC4 holds,
 * read the summary line.
 *
 * The seed script is NEVER executed as a shell command by this suite. Its
 * exported functions are called directly against the test collection, so it
 * cannot reach the live Atlas cluster that `server/.env` points at.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Ajv from 'ajv';
import { ObjectId } from 'mongodb';

import { officeSeatSchema, OFFICE_CATEGORY_ENUM } from '../schemas/office_seat.schema.js';
import { characterSchema } from '../schemas/character.schema.js';
import {
  OFFICE_SEATS,
  RENE_PRIMOGEN_SEAT_CREATED_AT,
  buildSeatDocs,
  seedOfficeSeats,
} from '../scripts/seed-office-seats.mjs';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// Same AJV options as middleware/validate.js, so a document that passes here
// passes on the request path too.
const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validate = ajv.compile(officeSeatSchema);

const dbAvailable = await isDbAvailable();

// A date to stand in for the unconfirmed Rene value in tests ONLY. This is not
// a guess at the real date and must never be copied into the seed script; see
// the script's header comment.
const TEST_RENE_DATE = '2026-01-01';

function seat(overrides = {}) {
  return {
    office_category: 'Enforcer',
    holder_id: '69d73ea49162ece35897a487',
    created_at: '2026-02-21',
    seat_label: null,
    notes: null,
    ...overrides,
  };
}

function errorsFor(doc) {
  validate(doc);
  return validate.errors || [];
}

// A genuinely independent validator. `ajv.compile(officeSeatSchema)` on the
// SAME Ajv instance and the SAME schema object returns the cached function,
// so it is not a second validator at all; a fresh Ajv instance is. Used where
// two documents are validated as a pair, so neither call can be reading the
// other's `errors` array.
function freshValidator() {
  return new Ajv({ allErrors: true, coerceTypes: false }).compile(officeSeatSchema);
}

// A raw MongoDB document as the AJV schema sees it: `_id` and a non-null
// `holder_id` are BSON ObjectIds in storage and JSON strings at the boundary.
// A vacant seat's null holder must stay null, not become the string 'null'.
function asJsonDoc(stored) {
  return {
    ...stored,
    _id: String(stored._id),
    holder_id: stored.holder_id === null ? null : String(stored.holder_id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 / AC2: schema shape
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.1 office_seat schema, valid documents', () => {
  it('accepts a fully populated seat', () => {
    const doc = seat({ seat_label: 'Harpy', notes: 'Appointed by the Head of State.' });
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts a seat with the optional label and notes omitted entirely', () => {
    const doc = { office_category: 'Head of State', holder_id: '69d73ea49162ece35897a488', created_at: '2026-02-21' };
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts an explicit `_id` string, so a stored document round-trips', () => {
    const doc = seat({ _id: '69d73ea49162ece35897a487' });
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts a full ISO timestamp for created_at, not just a bare date', () => {
    const doc = seat({ created_at: '2026-02-21T09:30:00.000Z' });
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts every one of the five office categories', () => {
    for (const category of OFFICE_CATEGORY_ENUM) {
      const doc = seat({ office_category: category });
      expect(validate(doc), `${category}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});

describe('oxp.1 office_seat schema, vacant seats (AC2)', () => {
  it('accepts a vacant seat with holder_id null', () => {
    const doc = seat({ holder_id: null });
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('still requires holder_id to be PRESENT, so the field is never merely absent', () => {
    const doc = seat();
    delete doc.holder_id;
    const errs = errorsFor(doc);
    expect(errs.some(e => e.keyword === 'required' && e.params.missingProperty === 'holder_id')).toBe(true);
  });
});

describe('oxp.1 office_seat schema, rejections', () => {
  it('rejects an office_category that is not one of the five', () => {
    const errs = errorsFor(seat({ office_category: 'Sheriff' }));
    expect(errs.some(e => e.keyword === 'enum' && e.instancePath === '/office_category')).toBe(true);
  });

  it('rejects the blank office_category that court_category tolerates', () => {
    // `character.court_category` allows '' and null for "holds no office".
    // A SEAT document is never "no office", so the seat enum drops both.
    const errs = errorsFor(seat({ office_category: '' }));
    expect(errs.some(e => e.instancePath === '/office_category')).toBe(true);
  });

  it('rejects a null office_category', () => {
    const errs = errorsFor(seat({ office_category: null }));
    expect(errs.some(e => e.instancePath === '/office_category')).toBe(true);
  });

  it('rejects a holder_id that is not a 24-hex ObjectId string (Drift Pattern #2)', () => {
    const errs = errorsFor(seat({ holder_id: 'Eve Lockridge' }));
    expect(errs.some(e => e.keyword === 'pattern' && e.instancePath === '/holder_id')).toBe(true);
  });

  it('rejects an uppercase-hex holder_id, so the stored casing stays canonical', () => {
    const errs = errorsFor(seat({ holder_id: '69D73EA49162ECE35897A487' }));
    expect(errs.some(e => e.instancePath === '/holder_id')).toBe(true);
  });

  it('rejects a truncated ObjectId', () => {
    const errs = errorsFor(seat({ holder_id: '69d73ea4' }));
    expect(errs.some(e => e.instancePath === '/holder_id')).toBe(true);
  });

  it('rejects a missing created_at', () => {
    const doc = seat();
    delete doc.created_at;
    const errs = errorsFor(doc);
    expect(errs.some(e => e.keyword === 'required' && e.params.missingProperty === 'created_at')).toBe(true);
  });

  it('rejects a non-ISO created_at', () => {
    const errs = errorsFor(seat({ created_at: '21 February 2026' }));
    expect(errs.some(e => e.instancePath === '/created_at')).toBe(true);
  });

  it('rejects a calendar-impossible created_at that still has the YYYY-MM-DD shape', () => {
    // The whole reason `created_at` is patterned rather than a bare string is
    // that oxp.2 will do months-since-creation arithmetic on it. A value like
    // '2026-99-99' matches a naive `\d{4}-\d{2}-\d{2}` and then parses to
    // Invalid Date, which is the silent-NaN failure the pattern exists to
    // stop. The month and day are therefore range-bounded in the pattern
    // itself, so this is caught without needing a JS Date object.
    for (const bad of ['2026-99-99', '2026-13-01', '2026-00-10', '2026-02-32', '2026-02-00']) {
      const errs = errorsFor(seat({ created_at: bad }));
      expect(errs.some(e => e.keyword === 'pattern' && e.instancePath === '/created_at'), bad).toBe(true);
    }
  });

  it('still accepts the boundary dates the bounded pattern must not over-reject', () => {
    for (const good of ['2026-01-01', '2026-12-31', '2026-10-09', '2026-01-19', '2026-01-20']) {
      expect(validate(seat({ created_at: good })), `${good}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('rejects an unknown property, so seat state cannot be smuggled in untyped', () => {
    const errs = errorsFor(seat({ manoeuvre_rank: 3 }));
    expect(errs.some(e => e.keyword === 'additionalProperties')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1: no field assumes one seat per office
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.1 office_seat schema, N seats per office (AC1)', () => {
  it('validates two Socialite seats with different holders, both at once', () => {
    const brandy = seat({ office_category: 'Socialite', holder_id: '69d73ea49162ece35897a47e', seat_label: 'Harpy' });
    const carver = seat({ office_category: 'Socialite', holder_id: '69d73ea49162ece35897a47f', seat_label: "People's Harpy" });

    // Two independent validators (separate Ajv instances), so neither call
    // can be reading the other's cached `errors` array.
    const validateA = freshValidator();
    const validateB = freshValidator();
    expect(validateA(brandy), JSON.stringify(validateA.errors)).toBe(true);
    expect(validateB(carver), JSON.stringify(validateB.errors)).toBe(true);
    expect(validateA).not.toBe(validateB);
  });

  it('validates two Primogen seats with different holders and NO distinguishing label', () => {
    // Primogen is the harder case: unlike Socialite, both live holders carry
    // the identical `court_title: 'Primogen'`, so seat_label is null on both
    // and only the document identity separates them.
    const yusuf = seat({ office_category: 'Primogen', holder_id: '69d720427fdd1b1f9498b0d4' });
    const rene = seat({ office_category: 'Primogen', holder_id: '69d73ea49162ece35897a496' });

    const validateA = freshValidator();
    const validateB = freshValidator();
    expect(validateA(yusuf), JSON.stringify(validateA.errors)).toBe(true);
    expect(validateB(rene), JSON.stringify(validateB.errors)).toBe(true);
  });

  it('validates a filled seat and a vacant seat in the same office simultaneously', () => {
    const filled = seat({ office_category: 'Primogen', holder_id: '69d720427fdd1b1f9498b0d4' });
    const vacant = seat({ office_category: 'Primogen', holder_id: null });

    const validateA = freshValidator();
    const validateB = freshValidator();
    expect(validateA(filled), JSON.stringify(validateA.errors)).toBe(true);
    expect(validateB(vacant), JSON.stringify(validateB.errors)).toBe(true);
  });

  it('carries no uniqueness, cap or per-office count anywhere in the schema', () => {
    const asText = JSON.stringify(officeSeatSchema);
    expect(asText).not.toMatch(/maxItems|uniqueItems|maxProperties/);
    // No office is named in the schema outside the category enum itself.
    expect(officeSeatSchema.properties.seat_label.enum).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1: the enum tracks character.schema.js's court_category
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.1 office_seat schema, category enum parity with court_category', () => {
  it('uses exactly court_category values, minus the blank/null "no office" options', () => {
    const courtCategory = characterSchema.properties.court_category.enum
      .filter(v => v !== '' && v !== null);
    expect([...OFFICE_CATEGORY_ENUM].sort()).toEqual([...courtCategory].sort());
  });

  it('has five categories, including Administrator (which has no office_content entry)', () => {
    // The office_content collection (oxp.10) only carries four office
    // documents; Administrator's content is oxp.8 and unwritten. The seat
    // for it is nevertheless real and filled (Ivana Horvat, since Game 5),
    // so the enum follows the schema, not the content collection.
    expect(OFFICE_CATEGORY_ENUM).toHaveLength(5);
    expect(OFFICE_CATEGORY_ENUM).toContain('Administrator');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: seed script logic (no DB, no shell execution)
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.1 seed script, the seven real seats (AC3)', () => {
  it('refuses to build without Rene St. Dominique\'s creation date', () => {
    expect(() => buildSeatDocs()).toThrow(/Rene St. Dominique/i);
    expect(() => buildSeatDocs({ reneCreatedAt: null })).toThrow(/Rene St. Dominique/i);
    expect(() => buildSeatDocs({ reneCreatedAt: '' })).toThrow(/Rene St. Dominique/i);
  });

  it('rejects a non-ISO override for Rene\'s date rather than seeding rubbish', () => {
    expect(() => buildSeatDocs({ reneCreatedAt: 'sometime in Game 1' })).toThrow(/ISO/i);
  });

  it('rejects a calendar-impossible override on shape alone', () => {
    // Caught by the bounded pattern, before any Date object is built.
    for (const bad of ['2026-99-99', '2026-13-01', '2026-02-32']) {
      expect(() => buildSeatDocs({ reneCreatedAt: bad }), bad).toThrow(/ISO/i);
    }
  });

  it('rejects a pattern-shaped override that is not a real calendar date', () => {
    // These two are exactly the cases a bounded regex CANNOT catch, so they
    // are what proves the script's own calendar check does real work rather
    // than duplicating the pattern:
    //
    //   '2026-02-21T+++'  matches the permissive time tail, Date.parse -> NaN.
    //   '2026-02-30'      matches a day-bounded pattern and, worse, does NOT
    //                     produce Invalid Date in V8: the ISO parse fails and
    //                     the legacy fallback silently rolls it forward to
    //                     2 March. Only a UTC round-trip catches that one.
    for (const bad of ['2026-02-21T+++', '2026-02-30', '2027-02-29', '2026-04-31']) {
      expect(() => buildSeatDocs({ reneCreatedAt: bad }), bad).toThrow(/not a real calendar date/i);
    }
  });

  it('accepts a real leap day, so the calendar check is not merely rejecting everything', () => {
    const docs = buildSeatDocs({ reneCreatedAt: '2028-02-29' });
    const rene = docs.find(d => d.holder_id === '69d73ea49162ece35897a496');
    expect(rene.created_at).toBe('2028-02-29');
  });

  it('ships the constant unset, so nobody can run it on a silent default', () => {
    expect(RENE_PRIMOGEN_SEAT_CREATED_AT).toBeNull();
  });

  it('builds exactly seven seats', () => {
    expect(buildSeatDocs({ reneCreatedAt: TEST_RENE_DATE })).toHaveLength(7);
  });

  it('pairs every office_category with the right character ObjectId', () => {
    const docs = buildSeatDocs({ reneCreatedAt: TEST_RENE_DATE });
    const pairs = docs.map(d => `${d.office_category}|${d.holder_id}`).sort();
    expect(pairs).toEqual([
      'Administrator|69d73ea49162ece35897a48b',   // Ivana Horvat
      'Enforcer|69d73ea49162ece35897a487',        // Einar Solveig
      'Head of State|69d73ea49162ece35897a488',   // Eve Lockridge
      'Primogen|69d720427fdd1b1f9498b0d4',        // Yusuf Kalusicj
      'Primogen|69d73ea49162ece35897a496',        // Rene St. Dominique
      'Socialite|69d73ea49162ece35897a47e',       // Brandy LaRoux
      'Socialite|69d73ea49162ece35897a47f',       // Carver
    ].sort());
  });

  it('gives the two Socialite seats distinct labels and the two Primogen seats none', () => {
    const docs = buildSeatDocs({ reneCreatedAt: TEST_RENE_DATE });
    const socialite = docs.filter(d => d.office_category === 'Socialite');
    const primogen = docs.filter(d => d.office_category === 'Primogen');

    // prax.4b renamed the APPOINTED seat's label from plain 'Harpy' to
    // 'City Harpy'. The two labels being DISTINCT is what this test has always
    // been about, and still is; the rename made them distinct enough for the
    // Praxis mass-clear to match one and never the other, which a label that is
    // a prefix of the other one is not. The popular seat is unchanged.
    expect(socialite.map(d => d.seat_label).sort()).toEqual(['City Harpy', "People's Harpy"]);
    expect(primogen.every(d => d.seat_label === null)).toBe(true);
  });

  it('carries the six epic-known creation dates verbatim and Rene\'s from the caller', () => {
    const docs = buildSeatDocs({ reneCreatedAt: TEST_RENE_DATE });
    const byHolder = Object.fromEntries(docs.map(d => [d.holder_id, d.created_at]));

    expect(byHolder['69d73ea49162ece35897a488']).toBe('2026-02-21');  // Eve, Game 1
    expect(byHolder['69d720427fdd1b1f9498b0d4']).toBe('2026-02-21');  // Yusuf, Game 1
    expect(byHolder['69d73ea49162ece35897a487']).toBe('2026-02-21');  // Einar, Game 1
    expect(byHolder['69d73ea49162ece35897a47e']).toBe('2026-02-21');  // Brandy, Game 1
    expect(byHolder['69d73ea49162ece35897a47f']).toBe('2026-07-18');  // Carver, Game 6
    expect(byHolder['69d73ea49162ece35897a48b']).toBe('2026-06-20');  // Ivana, Game 5
    expect(byHolder['69d73ea49162ece35897a496']).toBe(TEST_RENE_DATE);
  });

  it('produces seven documents that all validate against the schema', () => {
    for (const doc of buildSeatDocs({ reneCreatedAt: TEST_RENE_DATE })) {
      const v = ajv.compile(officeSeatSchema);
      expect(v(doc), `${doc.office_category}/${doc.holder_id}: ${JSON.stringify(v.errors)}`).toBe(true);
    }
  });

  it('assigns no _id, so MongoDB mints a real ObjectId per seat (AC2)', () => {
    for (const doc of buildSeatDocs({ reneCreatedAt: TEST_RENE_DATE })) {
      expect(doc._id).toBeUndefined();
    }
  });

  it('exposes the seat table as data, with the holder names alongside for review', () => {
    expect(OFFICE_SEATS).toHaveLength(7);
    expect(OFFICE_SEATS.map(s => s.holder)).toContain('Rene St. Dominique');
  });
});

describe('oxp.1 seed script, main() fails before it connects to anything', () => {
  // Running this script bare from `server/` resolves its connection through
  // `../db.js` and therefore targets LIVE Atlas. A zero-flag invocation is
  // guaranteed to fail on the missing Rene date, so it must reach that
  // failure WITHOUT having contacted the live cluster first.
  //
  // `db.js` is mocked for this test only, via `doMock` plus a module reset,
  // so the real `main()` runs against a counter rather than a driver. The
  // script is never executed as a shell command anywhere in this suite.
  it('never calls connectDb when the Rene date is missing', async () => {
    vi.resetModules();
    let connectCalls = 0;
    let collectionCalls = 0;
    vi.doMock('../db.js', () => ({
      connectDb: async () => { connectCalls += 1; },
      getCollection: () => { collectionCalls += 1; return null; },
      closeDb: async () => {},
    }));

    try {
      const fresh = await import('../scripts/seed-office-seats.mjs');
      await expect(fresh.main(['node', 'seed-office-seats.mjs'])).rejects.toThrow(/Rene St. Dominique/i);
      expect(connectCalls).toBe(0);
      expect(collectionCalls).toBe(0);
    } finally {
      vi.doUnmock('../db.js');
      vi.resetModules();
    }
  });

  it('also refuses a calendar-impossible date before connecting', async () => {
    vi.resetModules();
    let connectCalls = 0;
    vi.doMock('../db.js', () => ({
      connectDb: async () => { connectCalls += 1; },
      getCollection: () => null,
      closeDb: async () => {},
    }));

    try {
      const fresh = await import('../scripts/seed-office-seats.mjs');
      await expect(
        fresh.main(['node', 'seed-office-seats.mjs', '--apply', '--rene-created-at=2026-02-30'])
      ).rejects.toThrow(/not a real calendar date/i);
      expect(connectCalls).toBe(0);
    } finally {
      vi.doUnmock('../db.js');
      vi.resetModules();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4: DB-backed. tm_suite_test only.
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTION = 'office_seats';

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection(COLLECTION).deleteMany({});
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection(COLLECTION).deleteMany({});
  await teardownDb();
});

describe.skipIf(!dbAvailable)('oxp.1 office_seats collection, two seats per office in real MongoDB', () => {
  it('stores two Socialite seats side by side, each with its own ObjectId _id', async () => {
    const col = getCollection(COLLECTION);
    await col.insertMany([
      { office_category: 'Socialite', holder_id: new ObjectId('69d73ea49162ece35897a47e'), created_at: '2026-02-21', seat_label: 'Harpy', notes: null },
      { office_category: 'Socialite', holder_id: new ObjectId('69d73ea49162ece35897a47f'), created_at: '2026-07-18', seat_label: "People's Harpy", notes: null },
    ]);

    const found = await col.find({ office_category: 'Socialite' }).toArray();
    expect(found).toHaveLength(2);
    expect(new Set(found.map(d => String(d._id))).size).toBe(2);
    expect(new Set(found.map(d => String(d.holder_id))).size).toBe(2);
    for (const d of found) expect(d._id).toBeInstanceOf(ObjectId);

    // Every stored document still validates, not just the Primogen pair.
    for (const d of found) {
      const v = freshValidator();
      expect(v(asJsonDoc(d)), JSON.stringify(v.errors)).toBe(true);
    }
  });

  it('stores two Primogen seats that differ only by holder, and each stored doc validates', async () => {
    const col = getCollection(COLLECTION);
    await col.insertMany([
      { office_category: 'Primogen', holder_id: new ObjectId('69d720427fdd1b1f9498b0d4'), created_at: '2026-02-21', seat_label: null, notes: null },
      { office_category: 'Primogen', holder_id: new ObjectId('69d73ea49162ece35897a496'), created_at: '2026-02-21', seat_label: null, notes: null },
    ]);

    const found = await col.find({ office_category: 'Primogen' }).toArray();
    expect(found).toHaveLength(2);
    for (const d of found) {
      const v = freshValidator();
      expect(v(asJsonDoc(d)), JSON.stringify(v.errors)).toBe(true);
    }
  });

  it('stores a vacant seat alongside a filled one in the same office', async () => {
    const col = getCollection(COLLECTION);
    await col.insertMany([
      { office_category: 'Enforcer', holder_id: new ObjectId('69d73ea49162ece35897a487'), created_at: '2026-02-21', seat_label: null, notes: null },
      { office_category: 'Enforcer', holder_id: null, created_at: '2026-02-21', seat_label: 'Deputy', notes: 'Never filled.' },
    ]);

    const found = await col.find({ office_category: 'Enforcer' }).toArray();
    expect(found).toHaveLength(2);
    expect(found.filter(d => d.holder_id === null)).toHaveLength(1);

    // Including the vacant one: a stored null holder must survive the JSON
    // boundary as a null, not as the string 'null'.
    for (const d of found) {
      const v = freshValidator();
      expect(v(asJsonDoc(d)), JSON.stringify(v.errors)).toBe(true);
    }
  });
});

describe.skipIf(!dbAvailable)('oxp.1 seed script against tm_suite_test (AC3, AC4)', () => {
  it('is a no-op read when not applied', async () => {
    const col = getCollection(COLLECTION);
    const result = await seedOfficeSeats(col, { apply: false, reneCreatedAt: TEST_RENE_DATE });

    expect(result.planned).toBe(7);
    expect(result.missing).toBe(7);
    expect(result.inserted).toBe(0);
    expect(await col.countDocuments({})).toBe(0);
  });

  it('inserts all seven seats with the expected office_category/holder_id pairing', async () => {
    const col = getCollection(COLLECTION);
    const result = await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });

    expect(result.inserted).toBe(7);
    expect(await col.countDocuments({})).toBe(7);

    const stored = await col.find({}).toArray();
    const pairs = stored.map(d => `${d.office_category}|${String(d.holder_id)}`).sort();
    expect(pairs).toEqual([
      'Administrator|69d73ea49162ece35897a48b',
      'Enforcer|69d73ea49162ece35897a487',
      'Head of State|69d73ea49162ece35897a488',
      'Primogen|69d720427fdd1b1f9498b0d4',
      'Primogen|69d73ea49162ece35897a496',
      'Socialite|69d73ea49162ece35897a47e',
      'Socialite|69d73ea49162ece35897a47f',
    ].sort());

    // Every holder_id is a real ObjectId in storage, not a string.
    for (const d of stored) expect(d.holder_id).toBeInstanceOf(ObjectId);
  });

  it('is idempotent: a second apply inserts nothing and leaves seven documents', async () => {
    const col = getCollection(COLLECTION);
    await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });
    const second = await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });

    expect(second.inserted).toBe(0);
    expect(second.alreadyPresent).toBe(7);
    expect(second.missing).toBe(0);
    expect(await col.countDocuments({})).toBe(7);
  });

  it('does not clobber an existing seat\'s notes on re-run', async () => {
    const col = getCollection(COLLECTION);
    await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });
    await col.updateOne(
      { office_category: 'Enforcer' },
      { $set: { notes: 'Hand-edited by an ST after seeding.' } }
    );

    await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });
    const enforcer = await col.findOne({ office_category: 'Enforcer' });
    expect(enforcer.notes).toBe('Hand-edited by an ST after seeding.');
  });

  it('re-inserts only the seat that is missing, leaving the rest untouched', async () => {
    const col = getCollection(COLLECTION);
    await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });
    const before = await col.find({}).toArray();
    const carverId = before.find(d => String(d.holder_id) === '69d73ea49162ece35897a47f')._id;
    await col.deleteOne({ _id: carverId });

    const result = await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });
    expect(result.inserted).toBe(1);
    expect(await col.countDocuments({})).toBe(7);

    // The surviving six kept their original _id values, so seat identity is stable.
    const after = await col.find({}).toArray();
    const survivors = before.filter(d => !d._id.equals(carverId)).map(d => String(d._id)).sort();
    const stillThere = after.map(d => String(d._id)).filter(id => survivors.includes(id)).sort();
    expect(stillThere).toEqual(survivors);
  });

  it('does not duplicate a seat when several applies overlap in flight', async () => {
    // The original shape was `findOne` then, conditionally, `insertOne`: two
    // round-trips with a gap between them. Under `Promise.all` the callers
    // issue their existence check for a given seat before any insert lands,
    // all see nothing, and all insert. That is not idempotency, it is a race
    // that happens to be quiet when the script is run by one ST at a time.
    // The insert is a single atomic upsert on the natural key now, so only
    // one of the overlapping calls can create each seat.
    //
    // FOUR overlapping runs, not two. The race is timing-dependent: with two
    // callers the old find-then-insert shape duplicated on roughly one run in
    // three, which is enough to prove the bug exists but too weak to be a
    // gate. Four callers widen the window until the old shape duplicates every
    // time, while an atomic upsert stays at exactly seven regardless of how
    // many callers pile in.
    const col = getCollection(COLLECTION);
    const CALLERS = 4;
    const results = await Promise.all(
      Array.from({ length: CALLERS }, () =>
        seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE })
      )
    );

    expect(await col.countDocuments({})).toBe(7);
    // Between them the callers account for the seven seats exactly once:
    // whichever won each race reports it as inserted, every loser as present.
    expect(results.reduce((n, r) => n + r.inserted, 0)).toBe(7);
    expect(results.reduce((n, r) => n + r.alreadyPresent, 0)).toBe(7 * (CALLERS - 1));

    const pairs = (await col.find({}).toArray())
      .map(d => `${d.office_category}|${String(d.holder_id)}`);
    expect(new Set(pairs).size).toBe(7);
  });

  it('reports an already-present seat with its real stored _id, not a null', async () => {
    const col = getCollection(COLLECTION);
    const first = await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });
    const second = await seedOfficeSeats(col, { apply: true, reneCreatedAt: TEST_RENE_DATE });

    const firstIds = first.rows.map(r => String(r._id)).sort();
    const secondIds = second.rows.map(r => String(r._id)).sort();
    expect(second.rows.every(r => r.action === 'present' && r._id)).toBe(true);
    expect(secondIds).toEqual(firstIds);
  });

  it('refuses to touch the collection without Rene\'s date, even with apply set', async () => {
    const col = getCollection(COLLECTION);
    await expect(seedOfficeSeats(col, { apply: true })).rejects.toThrow(/Rene St. Dominique/i);
    expect(await col.countDocuments({})).toBe(0);
  });
});
