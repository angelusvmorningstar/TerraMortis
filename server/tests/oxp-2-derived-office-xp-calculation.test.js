/**
 * oxp.2 (derived office XP) tests.
 *
 * Two halves, deliberately in one file:
 *
 *   1. PURE functions (AC1-AC5, AC8) — `public/js/data/office-xp.js`. Plain
 *      fixture objects in, a derived number or flag out. No DB, no fetch, no
 *      DOM. These mirror `public/js/editor/xp.js`'s shape: the caller supplies
 *      already-fetched data, the function only derives from it.
 *
 *   2. The new `GET /api/office_seats` route (AC6, AC7), DB-backed against
 *      `tm_suite_test` only, per this repo's `describe.skipIf(!dbAvailable)`
 *      convention. A skip is NOT evidence the route works — read the summary
 *      line, not just the exit code.
 *
 * The accrual formula under test is an already-settled ruling, not a design
 * decision made here: `content/rules/office-powers.md` §"Office XP" (Angelus,
 * 2026-08-11) — 1 XP per month from creation, accruing whether or not the seat
 * is held, spent at 1 XP per dot on merits and on the manoeuvre ladder alike.
 * The ruling contains its own worked example ("an office created at the start
 * has accrued roughly seven points by August 2026", chronicle start being
 * February 2026), which is what the Feb->Aug = 7 test below pins.
 *
 * The seven-seat fixture set is NOT re-invented here. It mirrors, value for
 * value, the `OFFICE_SEATS` table in `server/scripts/seed-office-seats.mjs`
 * that oxp.1 shipped and that seeded the live collection, so this file and
 * `oxp-1-office-seats.test.js` describe the same reality.
 *
 * It is MIRRORED rather than imported for one specific reason, worth knowing
 * before "tidying" it into an import: `seed-office-seats.mjs` opens with a
 * `#!/usr/bin/env node` shebang, and vitest's transform of that file fails on
 * it with a bare "SyntaxError: Invalid or unexpected token" and no location.
 * That breakage is PRE-EXISTING on main (it takes down the whole of
 * `oxp-1-office-seats.test.js`, which imports the script) and is not oxp.2's
 * to fix — see this story's Dev Agent Record. Importing the seed script here
 * would simply propagate that failure into this suite for a reason that has
 * nothing to do with office XP.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';

import {
  officeMonthsAccrued,
  officeXpEarned,
  officeXpSpentForCategory,
  officeSpendKnownByCategory,
  officeSeatXp,
  OFFICE_XP_PER_MONTH,
} from '../../public/js/data/office-xp.js';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

const dbAvailable = await isDbAvailable();

// Rene St. Dominique's Primogen seat creation date. `RENE_PRIMOGEN_SEAT_CREATED_AT`
// deliberately ships null in source (oxp.1) so nobody can seed on a silent
// default; the confirmed value is passed at run time. Confirmed 2026-08-13:
// both live Primogen seats were created Game 1.
const TEST_RENE_DATE = '2026-02-21';

/**
 * The seven real seats, value for value as `OFFICE_SEATS` in
 * `server/scripts/seed-office-seats.mjs` records them (holder names kept in a
 * trailing comment, as that table does, so a reader can check the pairings
 * against oxp.1 without opening it). This is the live shape as seeded on
 * 2026-08-13: Primogen and Socialite have two seats each, the other three
 * offices one apiece.
 */
function sevenSeats() {
  return [
    { office_category: 'Head of State', holder_id: '69d73ea49162ece35897a488', seat_label: null,             created_at: '2026-02-21', notes: null }, // Eve Lockridge
    { office_category: 'Primogen',      holder_id: '69d720427fdd1b1f9498b0d4', seat_label: null,             created_at: '2026-02-21', notes: null }, // Yusuf Kalusicj
    { office_category: 'Primogen',      holder_id: '69d73ea49162ece35897a496', seat_label: null,             created_at: TEST_RENE_DATE, notes: null }, // Rene St. Dominique
    { office_category: 'Enforcer',      holder_id: '69d73ea49162ece35897a487', seat_label: null,             created_at: '2026-02-21', notes: null }, // Einar Solveig
    { office_category: 'Socialite',     holder_id: '69d73ea49162ece35897a47e', seat_label: 'Harpy',          created_at: '2026-02-21', notes: null }, // Brandy LaRoux
    { office_category: 'Socialite',     holder_id: '69d73ea49162ece35897a47f', seat_label: "People's Harpy", created_at: '2026-07-18', notes: null }, // Carver
    { office_category: 'Administrator', holder_id: '69d73ea49162ece35897a48b', seat_label: null,             created_at: '2026-06-20', notes: null }, // Ivana Horvat
  ];
}

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

// ─────────────────────────────────────────────────────────────────────────────
// AC1: calendar-month accrual
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.2 officeMonthsAccrued (AC1)', () => {
  it('matches the ruling\'s own worked example: Feb 2026 -> Aug 2026 = 7', () => {
    expect(officeMonthsAccrued('2026-02-21', '2026-08-13')).toBe(7);
  });

  it('is not day-of-month sensitive: ANY day in the same "now" month gives the same 7', () => {
    // This is the distinction the story spells out. A day-difference or
    // 30-day-bucket implementation would give 5 or 6 for early August and 7
    // only near the end of it; a named-month count gives 7 all month.
    for (const day of ['01', '02', '13', '20', '31']) {
      expect(officeMonthsAccrued('2026-02-21', `2026-08-${day}`), day).toBe(7);
    }
    // Including a "now" day EARLIER in the month than the creation day, which
    // is where a day-based implementation most visibly diverges.
    expect(officeMonthsAccrued('2026-02-28', '2026-08-01')).toBe(7);
  });

  it('is inclusive of the creation month: a seat created this month has earned its first point', () => {
    expect(officeMonthsAccrued('2026-08-01', '2026-08-01')).toBe(1);
    expect(officeMonthsAccrued('2026-08-31', '2026-08-01')).toBe(1);
  });

  it('counts one extra per month elapsed, across a year boundary', () => {
    expect(officeMonthsAccrued('2026-08-01', '2026-09-01')).toBe(2);
    expect(officeMonthsAccrued('2026-12-01', '2027-01-01')).toBe(2);
    expect(officeMonthsAccrued('2026-02-21', '2027-02-21')).toBe(13);
  });

  it('returns 0, never a negative number, for a "now" before the creation month', () => {
    expect(officeMonthsAccrued('2026-08-01', '2026-07-31')).toBe(0);
    expect(officeMonthsAccrued('2026-08-01', '2020-01-01')).toBe(0);
  });

  it('accepts a full ISO timestamp as well as a bare date', () => {
    expect(officeMonthsAccrued('2026-02-21T09:30:00.000Z', '2026-08-13T23:59:59.999Z')).toBe(7);
  });

  it('accepts a Date object for "now", reading it as wall-clock local time', () => {
    // Built with the local-time constructor rather than parsed from a string,
    // so the assertion is timezone-independent.
    expect(officeMonthsAccrued('2026-02-21', new Date(2026, 7, 13))).toBe(7);
  });

  it('never reads the clock itself — the same inputs always give the same answer', () => {
    const src = officeMonthsAccrued.toString();
    expect(src).not.toMatch(/Date\.now|new Date\(\s*\)/);
  });

  it('throws on an unparseable created_at rather than returning a silent NaN', () => {
    // The whole reason office_seat.schema.js patterns `created_at` is that a
    // value like '21 February 2026' would otherwise reach this arithmetic and
    // produce a wrong-but-plausible number. Loud beats silent here.
    for (const bad of ['21 February 2026', '', null, undefined, 'sometime in Game 1']) {
      expect(() => officeMonthsAccrued(bad, '2026-08-13'), String(bad)).toThrow();
    }
  });

  it('rejects a value with a valid-looking date PREFIX followed by garbage, rather than matching the prefix and ignoring the rest (Codex review)', () => {
    // The original pattern was anchored at the start only (`^\d{4}-...`), so
    // it matched the first 7 characters of any of these and silently derived
    // a plausible month figure from the rest, which is exactly the class of
    // silent-wrong-answer bug the schema's own ISO pattern already exists to
    // prevent one layer up. Anchored at both ends now, day-bounded too,
    // matching office_seat.schema.js's own isoDate pattern exactly.
    for (const bad of ['2026-02garbage', '2026-02-99', '2026-02-21junk', '2026-02Tnot-a-date', '2026-02']) {
      expect(() => officeMonthsAccrued(bad, '2026-08-13'), bad).toThrow();
    }
  });

  it('still accepts every real shape the schema allows: bare date and full timestamp', () => {
    expect(officeMonthsAccrued('2026-02-21', '2026-08-13')).toBe(7);
    expect(officeMonthsAccrued('2026-02-21T09:30:00.000Z', '2026-08-13')).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: earned XP
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.2 officeXpEarned (AC2)', () => {
  it('is months accrued at the flat 1 XP per month rate', () => {
    expect(OFFICE_XP_PER_MONTH).toBe(1);
    expect(officeXpEarned(seat({ created_at: '2026-02-21' }), '2026-08-13')).toBe(7);
  });

  it('earns identically for a VACANT seat — the XP belongs to the office, not the holder', () => {
    const filled = seat({ created_at: '2026-02-21', holder_id: '69d73ea49162ece35897a487' });
    const vacant = seat({ created_at: '2026-02-21', holder_id: null });
    expect(officeXpEarned(vacant, '2026-08-13')).toBe(officeXpEarned(filled, '2026-08-13'));
    expect(officeXpEarned(vacant, '2026-08-13')).toBe(7);
  });

  it('never reads holder_id at all', () => {
    expect(officeXpEarned.toString()).not.toMatch(/holder_id/);
  });

  it('gives the two later-created real seats their own smaller totals', () => {
    // Age is advantage, per the ruling. Ivana's Administrator seat (Game 5)
    // and Carver's People's Harpy seat (Game 6) are genuinely behind.
    expect(officeXpEarned(seat({ created_at: '2026-06-20' }), '2026-08-13')).toBe(3);
    expect(officeXpEarned(seat({ created_at: '2026-07-18' }), '2026-08-13')).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: spend, at 1 XP per dot, for one office category
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.2 officeXpSpentForCategory (AC3)', () => {
  it('sums every merit dot at 1 XP each', () => {
    // The ruling's own worked figure: three merits at three dots = 9 XP.
    expect(officeXpSpentForCategory({ 'Safe Place': 3, Contacts: 3, Resources: 3 }, 0)).toBe(9);
  });

  it('adds the manoeuvre rank at the same 1 XP per dot rate', () => {
    // A full five-rank ladder is 5 XP; with the 9-XP merit suite that is the
    // ruling's "a working office = 14".
    expect(officeXpSpentForCategory({ 'Safe Place': 3, Contacts: 3, Resources: 3 }, 5)).toBe(14);
    expect(officeXpSpentForCategory({}, 5)).toBe(5);
  });

  it('treats a category with NO documents as 0 spend, not as an error', () => {
    // Both sibling GET routes omit a never-purchased category from their
    // response entirely, so `meritDots[category]` and `ranks[category]` are
    // both undefined for most offices today. That must read as 0.
    expect(officeXpSpentForCategory(undefined, undefined)).toBe(0);
    expect(officeXpSpentForCategory(null, null)).toBe(0);
    expect(officeXpSpentForCategory({}, 0)).toBe(0);
  });

  it('handles one document present and the other missing', () => {
    // This is the live state right now: office_merit_dots has Enforcer and
    // Head of State, office_manoeuvre_ranks has nothing at all.
    expect(officeXpSpentForCategory({ 'Safe Place': 2 }, undefined)).toBe(2);
    expect(officeXpSpentForCategory(undefined, 3)).toBe(3);
  });

  it('accepts the raw MongoDB document shape as well as the API response shape', () => {
    // The GET routes hand the client { [merit]: dots } and a bare rank number;
    // a caller reading the collections directly has { dots: {...} } and
    // { rank: n }. Both are accepted so no caller has to reshape first.
    expect(officeXpSpentForCategory({ dots: { 'Safe Place': 2, 'Trained Observer': 1 } }, { rank: 2 })).toBe(5);
    expect(officeXpSpentForCategory({ _id: 'Enforcer', dots: { 'Safe Place': 4 } }, { _id: 'Enforcer', rank: 1 })).toBe(5);
  });

  it('ignores non-numeric dot values rather than producing NaN', () => {
    expect(officeXpSpentForCategory({ 'Safe Place': 2, Broken: null, AlsoBroken: 'three' }, 0)).toBe(2);
  });

  it('never reads a seat, a holder or a character — spend is category-level today', () => {
    const src = officeXpSpentForCategory.toString();
    expect(src).not.toMatch(/holder_id|character/);
  });

  // oxp.6: office_manoeuvre_ranks.manoeuvre_xp_destroyed (written by oxp.5's
  // handover reset) must be folded into spend, or a handover's destroyed XP
  // silently reappears as a refund the moment any balance renders — the
  // precise opposite of content/rules/office-powers.md's ruling.
  it('oxp.6: a raw manoeuvreRankDoc with manoeuvre_xp_destroyed adds it to spend', () => {
    expect(officeXpSpentForCategory({}, { rank: 2, manoeuvre_xp_destroyed: 3 })).toBe(5);
    // Merits combine too, at the same 1 XP per dot rate.
    expect(officeXpSpentForCategory({ 'Safe Place': 3 }, { rank: 2, manoeuvre_xp_destroyed: 3 })).toBe(8);
  });

  it('oxp.6: a raw manoeuvreRankDoc with NO manoeuvre_xp_destroyed key at all is unaffected — the shape every document that predates oxp.5 still has', () => {
    // This is the regression case that matters most: it is the shape of every
    // real office_manoeuvre_ranks document in tm_suite today.
    expect(officeXpSpentForCategory({}, { rank: 2 })).toBe(2);
    expect(officeXpSpentForCategory({ _id: 'Enforcer', dots: { 'Safe Place': 4 } }, { _id: 'Enforcer', rank: 1 })).toBe(5);
  });

  it('oxp.6: a bare-number manoeuvreRankDoc is provably unaffected by the destroyed-XP change', () => {
    // A caller passing a bare rank has no way to also supply a destroyed
    // count, so this branch must be untouched by the raw-document change.
    expect(officeXpSpentForCategory({}, 5)).toBe(5);
    expect(officeXpSpentForCategory({ 'Safe Place': 3, Contacts: 3, Resources: 3 }, 5)).toBe(14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4: is spend attributable to an individual seat?
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.2 officeSpendKnownByCategory (AC4)', () => {
  it('is true for a category with exactly one seat, false for two or more', () => {
    const known = officeSpendKnownByCategory(sevenSeats());
    expect(known['Head of State']).toBe(true);
    expect(known.Enforcer).toBe(true);
    expect(known.Administrator).toBe(true);
    expect(known.Primogen).toBe(false);
    expect(known.Socialite).toBe(false);
  });

  it('turns false as soon as a second seat appears in a previously single-seat office', () => {
    const seats = sevenSeats();
    expect(officeSpendKnownByCategory(seats).Enforcer).toBe(true);
    seats.push({ office_category: 'Enforcer', holder_id: null, created_at: '2026-08-01', seat_label: 'Deputy', notes: null });
    expect(officeSpendKnownByCategory(seats).Enforcer).toBe(false);
  });

  it('is about seat COUNT, never about whether the seats are held', () => {
    // A vacant second seat creates exactly the same ambiguity as a filled one:
    // there is still no data saying which seat a shared purchase belongs to.
    const twoVacant = [
      { office_category: 'Socialite', holder_id: null, created_at: '2026-02-21' },
      { office_category: 'Socialite', holder_id: null, created_at: '2026-07-18' },
    ];
    expect(officeSpendKnownByCategory(twoVacant).Socialite).toBe(false);

    const oneVacant = [{ office_category: 'Socialite', holder_id: null, created_at: '2026-02-21' }];
    expect(officeSpendKnownByCategory(oneVacant).Socialite).toBe(true);
  });

  it('reports nothing for a category with no seats at all', () => {
    const known = officeSpendKnownByCategory([]);
    expect(known.Primogen).toBeUndefined();
    expect(Object.keys(known)).toHaveLength(0);
  });

  it('tolerates a missing or non-array argument without throwing', () => {
    expect(officeSpendKnownByCategory(undefined)).toEqual({});
    expect(officeSpendKnownByCategory(null)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5: the combined per-seat balance
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.2 officeSeatXp (AC5)', () => {
  const NOW = '2026-08-13';

  it('returns earned, spent, left and spendKnown for a single-seat office', () => {
    const seats = sevenSeats();
    const enforcer = seats.find(s => s.office_category === 'Enforcer');
    // Live shape: Enforcer is one of the two offices that really has merit
    // dots today.
    const result = officeSeatXp(enforcer, seats, { 'Safe Place': 2, 'Trained Observer': 1 }, undefined, NOW);

    expect(result).toEqual({ earned: 7, spent: 3, left: 4, spendKnown: true });
  });

  it('always returns real numbers, never undefined, even when nothing is purchased', () => {
    const seats = sevenSeats();
    const hos = seats.find(s => s.office_category === 'Head of State');
    const result = officeSeatXp(hos, seats, undefined, undefined, NOW);

    expect(result.earned).toBe(7);
    expect(result.spent).toBe(0);
    expect(result.left).toBe(7);
    expect(Number.isFinite(result.left)).toBe(true);
  });

  it('0 spend on a single-seat office is still spendKnown true — the flag is about seat COUNT, not spend VALUE', () => {
    // The exact confusion the flag exists to prevent. A caller must never infer
    // "we cannot tell whose spend this is" from "the spend happens to be 0".
    const seats = sevenSeats();
    const admin = seats.find(s => s.office_category === 'Administrator');
    const result = officeSeatXp(admin, seats, {}, 0, NOW);

    expect(result.spent).toBe(0);
    expect(result.spendKnown).toBe(true);
  });

  it('reports spendKnown false for each of the two Primogen seats, while still earning correctly', () => {
    const seats = sevenSeats();
    const primogen = seats.filter(s => s.office_category === 'Primogen');
    expect(primogen).toHaveLength(2);

    for (const s of primogen) {
      const result = officeSeatXp(s, seats, { Contacts: 2 }, 1, NOW);
      // Earned is a per-seat fact and stays exact.
      expect(result.earned).toBe(7);
      // Spent/left are the category's shared total, present so nothing crashes
      // on undefined, but NOT attributable to this seat.
      expect(result.spent).toBe(3);
      expect(result.left).toBe(4);
      expect(result.spendKnown).toBe(false);
    }
  });

  it('gives the two Socialite seats DIFFERENT earned totals, so seat identity is never pooled', () => {
    // Brandy's seat is from Game 1, Carver's from Game 6. If earned XP were
    // pooled or looked up by category, these two would wrongly match.
    const seats = sevenSeats();
    const brandy = seats.find(s => s.holder_id === '69d73ea49162ece35897a47e');
    const carver = seats.find(s => s.holder_id === '69d73ea49162ece35897a47f');

    expect(officeSeatXp(brandy, seats, undefined, undefined, NOW).earned).toBe(7);
    expect(officeSeatXp(carver, seats, undefined, undefined, NOW).earned).toBe(2);
    expect(officeSeatXp(brandy, seats, undefined, undefined, NOW).spendKnown).toBe(false);
    expect(officeSeatXp(carver, seats, undefined, undefined, NOW).spendKnown).toBe(false);
  });

  it('lets a balance go negative rather than clamping a genuine overspend to 0', () => {
    // Not hypothetical: office_merit_dots and office_manoeuvre_ranks are direct
    // ST-set state with no budget check anywhere (oxp.9 is the story that would
    // add one), so a young office can already show more purchased than earned.
    // Clamping would hide a real data problem behind a plausible 0.
    const seats = sevenSeats();
    const carver = seats.find(s => s.holder_id === '69d73ea49162ece35897a47f');
    const result = officeSeatXp(carver, seats, { Contacts: 3, Fame: 3 }, 2, NOW);

    expect(result.earned).toBe(2);
    expect(result.spent).toBe(8);
    expect(result.left).toBe(-6);
  });

  it('forces spendKnown false when allSeats omits the seat being evaluated, even though the raw count would say known (Codex review)', () => {
    // A caller that passes a stale or filtered allSeats missing the evaluated
    // seat itself must never come out MORE confident than a well-formed call
    // would. Here Primogen genuinely has two live seats, but allSeats is
    // given only the sibling — an omission bug, not a real single-seat office.
    const seats = sevenSeats();
    const primogen = seats.filter(s => s.office_category === 'Primogen');
    const [yusuf, rene] = primogen;

    const wellFormed = officeSeatXp(yusuf, seats, { Contacts: 2 }, 1, NOW);
    expect(wellFormed.spendKnown).toBe(false);

    const omitted = officeSeatXp(yusuf, [rene], { Contacts: 2 }, 1, NOW);
    expect(omitted.spendKnown).toBe(false);
    // earned/spent/left are still real numbers — the guard only ever tightens
    // spendKnown, never hides the other fields.
    expect(omitted.earned).toBe(7);
    expect(omitted.spent).toBe(3);
    expect(omitted.left).toBe(4);
  });

  it('a genuinely single-seat office is unaffected by the omission guard', () => {
    // The guard must fail toward false, never toward false-negative on a
    // well-formed single-seat call — that would break every ordinary case.
    const seats = sevenSeats();
    const enforcer = seats.find(s => s.office_category === 'Enforcer');
    expect(officeSeatXp(enforcer, seats, undefined, undefined, NOW).spendKnown).toBe(true);
  });

  it('matches the seat by _id when it is a different object with the same identity, not just by reference', () => {
    // A caller that re-fetches seats (a new array of new objects each call)
    // must still be recognised as "the seat is really in this set" as long as
    // the same seat identity is present, not only on exact reference equality.
    const original = { _id: '69d73ea49162ece35897a487', office_category: 'Enforcer', holder_id: 'x', created_at: '2026-02-21' };
    const freshCopy = { ...original };
    expect(freshCopy).not.toBe(original);

    const result = officeSeatXp(freshCopy, [original], undefined, undefined, NOW);
    expect(result.spendKnown).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC8: the real live seven-seat shape, confirmed during this story's scoping
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.2 against the real seven-seat shape (AC8)', () => {
  it('resolves spendKnown false for Primogen and Socialite, true for the other three', () => {
    const seats = sevenSeats();
    const bySeat = seats.map(s => [
      s.office_category,
      officeSeatXp(s, seats, undefined, undefined, '2026-08-13').spendKnown,
    ]);

    expect(bySeat.filter(([cat]) => cat === 'Primogen').every(([, k]) => k === false)).toBe(true);
    expect(bySeat.filter(([cat]) => cat === 'Socialite').every(([, k]) => k === false)).toBe(true);
    for (const cat of ['Head of State', 'Enforcer', 'Administrator']) {
      const rows = bySeat.filter(([c]) => c === cat);
      expect(rows, cat).toHaveLength(1);
      expect(rows.every(([, k]) => k === true), cat).toBe(true);
    }
  });

  it('matches the live purchase state: only Enforcer and Head of State have any spend at all', () => {
    // office_merit_dots had exactly two documents on 2026-08-13 and
    // office_manoeuvre_ranks had none. Everything else must derive 0 spend with
    // a full earned balance, not a blank.
    const seats = sevenSeats();
    const liveMeritDots = {
      Enforcer: { 'Safe Place': 2 },
      'Head of State': { Contacts: 1 },
    };
    const liveRanks = {};

    for (const s of seats) {
      const cat = s.office_category;
      const r = officeSeatXp(s, seats, liveMeritDots[cat], liveRanks[cat], '2026-08-13');
      expect(r.earned, cat).toBeGreaterThan(0);
      if (cat === 'Enforcer') expect(r.spent).toBe(2);
      else if (cat === 'Head of State') expect(r.spent).toBe(1);
      else expect(r.spent, cat).toBe(0);
    }
  });

  it('the two offices that DO have live spend are both single-seat, so both are attributable', () => {
    const known = officeSpendKnownByCategory(sevenSeats());
    expect(known.Enforcer).toBe(true);
    expect(known['Head of State']).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 / AC7: GET /api/office_seats. DB-backed, tm_suite_test only.
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTION = 'office_seats';

let app;

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
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

/** Insert the seven mirrored seats as they are really stored: ObjectId holders. */
async function insertSevenSeats() {
  const docs = sevenSeats().map(s => ({
    ...s,
    holder_id: s.holder_id === null ? null : new ObjectId(s.holder_id),
  }));
  await getCollection(COLLECTION).insertMany(docs);
  return docs;
}

describe.skipIf(!dbAvailable)('oxp.2 GET /api/office_seats (AC6, AC7)', () => {
  it('returns an empty array when the collection is empty', async () => {
    const res = await request(app).get('/api/office_seats').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns every stored seat, field for field, with no aggregation or derivation', async () => {
    const inserted = await insertSevenSeats();
    const res = await request(app).get('/api/office_seats').set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);

    // Codex review, oxp.2: the previous version of this test only deep-checked
    // Carver's created_at/seat_label and never touched notes at all, so a
    // regression corrupting most seats' fields (or any seat's notes) could
    // stay green. Every field of every inserted document is now compared
    // against the matching response entry, keyed by _id (the one field the
    // route itself transforms — ObjectId to string — so it's checked
    // separately rather than via a naive deep-equal on the raw insert).
    for (const doc of inserted) {
      const found = res.body.find(d => d._id === String(doc._id));
      expect(found, `no response entry for seat _id ${doc._id}`).toBeTruthy();
      expect(found.office_category).toBe(doc.office_category);
      expect(found.holder_id).toBe(doc.holder_id === null ? null : String(doc.holder_id));
      expect(found.created_at).toBe(doc.created_at);
      expect(found.seat_label).toBe(doc.seat_label);
      expect(found.notes).toBe(doc.notes);
    }

    const pairs = res.body.map(d => `${d.office_category}|${d.holder_id}`).sort();
    expect(pairs).toEqual([
      'Administrator|69d73ea49162ece35897a48b',
      'Enforcer|69d73ea49162ece35897a487',
      'Head of State|69d73ea49162ece35897a488',
      'Primogen|69d720427fdd1b1f9498b0d4',
      'Primogen|69d73ea49162ece35897a496',
      'Socialite|69d73ea49162ece35897a47e',
      'Socialite|69d73ea49162ece35897a47f',
    ].sort());

    // Exactly the stored fields, nothing computed server-side. The deriving is
    // the client's job (this module), from this data plus the two existing
    // purchase routes.
    for (const d of res.body) {
      expect(Object.keys(d).sort()).toEqual(
        ['_id', 'created_at', 'holder_id', 'notes', 'office_category', 'seat_label'].sort()
      );
      expect(d.earned).toBeUndefined();
      expect(d.spent).toBeUndefined();
    }

    // created_at and seat_label survive verbatim, so the derivation upstream of
    // them is working from real stored values.
    const carver = res.body.find(d => d.holder_id === '69d73ea49162ece35897a47f');
    expect(carver.created_at).toBe('2026-07-18');
    expect(carver.seat_label).toBe("People's Harpy");
  });

  it('serialises _id and holder_id as strings at the JSON boundary', async () => {
    await insertSevenSeats();
    const res = await request(app).get('/api/office_seats').set('X-Test-User', stUser());

    for (const d of res.body) {
      expect(typeof d._id).toBe('string');
      expect(d._id).toMatch(/^[a-f0-9]{24}$/);
      expect(typeof d.holder_id).toBe('string');
      expect(d.holder_id).toMatch(/^[a-f0-9]{24}$/);
    }
    expect(new Set(res.body.map(d => d._id)).size).toBe(7);
  });

  it('a VACANT seat survives as null, never as the string "null"', async () => {
    await getCollection(COLLECTION).insertMany([
      { office_category: 'Enforcer', holder_id: new ObjectId('69d73ea49162ece35897a487'), created_at: '2026-02-21', seat_label: null, notes: null },
      { office_category: 'Enforcer', holder_id: null, created_at: '2026-02-21', seat_label: 'Deputy', notes: 'Never filled.' },
    ]);

    const res = await request(app).get('/api/office_seats').set('X-Test-User', stUser());
    const vacant = res.body.find(d => d.seat_label === 'Deputy');

    expect(vacant.holder_id).toBeNull();
    expect(vacant.holder_id).not.toBe('null');
    // And the vacant seat still earns, which is the whole point of it being
    // readable at all.
    expect(officeXpEarned(vacant, '2026-08-13')).toBe(7);
  });

  it('feeds the pure functions end to end: the route\'s own output derives the right balances', async () => {
    await insertSevenSeats();
    const res = await request(app).get('/api/office_seats').set('X-Test-User', stUser());
    const seats = res.body;

    const enforcer = seats.find(s => s.office_category === 'Enforcer');
    expect(officeSeatXp(enforcer, seats, { 'Safe Place': 2 }, undefined, '2026-08-13'))
      .toEqual({ earned: 7, spent: 2, left: 5, spendKnown: true });

    for (const s of seats.filter(s => s.office_category === 'Primogen')) {
      expect(officeSeatXp(s, seats, undefined, undefined, '2026-08-13').spendKnown).toBe(false);
    }
  });

  it('is readable by a player, not just an ST — same posture as the sibling office routes', async () => {
    await insertSevenSeats();
    const res = await request(app).get('/api/office_seats')
      .set('X-Test-User', playerUser(['000000000000000000000001']));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });

  it('redacts notes to null for a player, but not for an ST (Codex review)', async () => {
    // office_seat.schema.js documents `notes` explicitly as "Provenance
    // notes, ST caveats" — unlike the two sibling routes, which only ever
    // expose numeric dot/rank data, this collection has a free-text field
    // that could carry something an ST never meant a player to read. Every
    // OTHER field stays open (Angelus's ruling, 2026-08-13): only `notes`
    // is redacted, and only for a non-ST caller.
    const col = getCollection(COLLECTION);
    await col.insertOne({
      office_category: 'Enforcer',
      holder_id: new ObjectId('69d73ea49162ece35897a487'),
      created_at: '2026-02-21',
      seat_label: null,
      notes: 'Watching for a coup attempt, do not let the player see this.',
    });

    const stRes = await request(app).get('/api/office_seats').set('X-Test-User', stUser());
    expect(stRes.body[0].notes).toBe('Watching for a coup attempt, do not let the player see this.');

    const playerRes = await request(app).get('/api/office_seats')
      .set('X-Test-User', playerUser(['000000000000000000000001']));
    expect(playerRes.body[0].notes).toBeNull();
    // Every other field is unaffected by the redaction.
    expect(playerRes.body[0].office_category).toBe('Enforcer');
    expect(playerRes.body[0].holder_id).toBe('69d73ea49162ece35897a487');
    expect(playerRes.body[0].created_at).toBe('2026-02-21');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/office_seats');
    expect(res.status).toBe(401);
  });

  it('touches no other collection', async () => {
    // A read route has no business writing anywhere. Both purchase collections
    // are checked because those are the two this story reads alongside seats.
    await insertSevenSeats();
    const before = {
      merits: await getCollection('office_merit_dots').countDocuments({}),
      ranks: await getCollection('office_manoeuvre_ranks').countDocuments({}),
      seats: await getCollection(COLLECTION).countDocuments({}),
    };

    await request(app).get('/api/office_seats').set('X-Test-User', stUser());

    expect(await getCollection('office_merit_dots').countDocuments({})).toBe(before.merits);
    expect(await getCollection('office_manoeuvre_ranks').countDocuments({})).toBe(before.ranks);
    expect(await getCollection(COLLECTION).countDocuments({})).toBe(before.seats);
  });

  it('the collection ROOT still exposes no write verb, and the seat-scoped route accepts only PUT', async () => {
    // Restated for oxp.5 (2026-08-13). This test used to read "exposes no write
    // verb — this story adds a GET and nothing else", and it would still have
    // PASSED mechanically after oxp.5 landed, because oxp.5's handover route is
    // at /:seatId/holder and a bare write to the collection root still matches
    // nothing. Its TITLE and its comment would have been false, though, which
    // is the kind of quietly-wrong assertion that survives for years. So it is
    // restated as what is genuinely still guaranteed, and strengthened rather
    // than weakened.
    //
    // Still true, and the part that matters: seat CREATION and DELETION are
    // exposed nowhere at all. `office_seats` documents are minted only by
    // oxp.1's manual seed script; oxp.5 changes who HOLDS a seat, never which
    // seats exist. In-app seat CRUD has no story home yet.
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const res = await request(app)[method]('/api/office_seats').set('X-Test-User', stUser()).send({});
      expect(res.status, method).toBe(404);
    }

    // A bare seat id is not addressable either — there is no
    // PUT /api/office_seats/:seatId, only the /holder sub-route.
    const seatId = '69d73ea49162ece35897a487';
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const res = await request(app)[method](`/api/office_seats/${seatId}`).set('X-Test-User', stUser()).send({});
      expect(res.status, `bare seat id, ${method}`).toBe(404);
    }

    // And the handover sub-route answers to PUT alone. A 404 here is the router
    // declining the verb, distinct from the 400/404/409 the PUT handler itself
    // can return.
    for (const method of ['post', 'patch', 'delete']) {
      const res = await request(app)[method](`/api/office_seats/${seatId}/holder`).set('X-Test-User', stUser()).send({});
      expect(res.status, `holder sub-route, ${method}`).toBe(404);
    }

    // The title's other half — "accepts only PUT" — was never actually proved
    // above: every assertion so far shows verbs being REJECTED, none shows PUT
    // being accepted. Codex review finding (Low): prove it directly, or the
    // route could be deleted entirely and this test would still pass. `seatId`
    // is well-formed hex but not a real document, so this reaches the HANDLER's
    // own 404 (a JSON `NOT_FOUND` body) rather than Express's router-level 404
    // for an unmatched verb (no such body shape) — that distinction is what
    // proves the router dispatched to the PUT handler at all.
    const putRes = await request(app).put(`/api/office_seats/${seatId}/holder`).set('X-Test-User', stUser()).send({ holder_id: null });
    expect(putRes.status, 'PUT should reach the handler, not be rejected by the router').toBe(404);
    expect(putRes.body.error, 'a router-level 404 has no such body — this must be the handler\'s own').toBe('NOT_FOUND');
  });
});
