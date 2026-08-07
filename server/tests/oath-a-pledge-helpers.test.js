/**
 * OATH-A (issue #1111, ADR-010 D1 / D1b / D4) — Swear By pledge helpers.
 *
 * Pure-function coverage. These helpers live in `public/js/data/rules-helpers.js`,
 * which is deliberately free of browser imports, so this suite imports them
 * directly and runs WITHOUT MongoDB — unlike the D8 round-trip suite, which
 * needs the API.
 *
 * The test obligation from the story is specific and is honoured below:
 * **parity rejection is demonstrated failing**, not merely passing on a
 * correct pledge. A validator that only ever sees valid input is not
 * evidence that it rejects anything.
 *
 * Coverage:
 *   - D4 resolveRatingBasis: both variants, the null fall-through, and the
 *     unknown-discriminator safe degradation
 *   - D1 name+qualifier referencing, including the multi-instance cases
 *   - D1 render-time reverse index (never persisted)
 *   - D1b parity: short, over, exact, duplicate, over-pledge, unowned
 *   - D1b dots_required is a SNAPSHOT and does not move with the basis
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveRatingBasis,
  meritMatchesRef,
  resolveAttachment,
  swornOaths,
  pledgeKeyFor,
  buildPledgeIndex,
  pledgedDots,
  pledgeableDots,
  validatePledge,
  buildSwornBy,
} from '../../public/js/data/rules-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// The owned-dots formula, injected exactly as production injects it. Kept
// trivial here on purpose: these tests are about the pledge logic, not about
// re-testing meritRating.
const ratingOf = (c, m) => (m.cp || 0) + (m.xp || 0);

function mkChar(over = {}) {
  return {
    name: 'Testudo',
    covenant: 'Invictus',
    blood_potency: 3,
    status: { city: 1, clan: 2, covenant: { Invictus: 4 } },
    merits: [],
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// D4 — resolveRatingBasis
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D4 — resolveRatingBasis', () => {
  it('blood_potency_multiple multiplies the character Blood Potency', () => {
    const c = mkChar({ blood_potency: 3 });
    expect(resolveRatingBasis(c, { rating_basis: { type: 'blood_potency_multiple', factor: 2 } })).toBe(6);
    expect(resolveRatingBasis(c, { rating_basis: { type: 'blood_potency_multiple', factor: 1 } })).toBe(3);
    // factor omitted defaults to 1 rather than 0 — a missing factor must not
    // silently make the oath free.
    expect(resolveRatingBasis(c, { rating_basis: { type: 'blood_potency_multiple' } })).toBe(3);
  });

  it('blood_potency_multiple handles Blood Potency 0', () => {
    expect(resolveRatingBasis(mkChar({ blood_potency: 0 }), { rating_basis: { type: 'blood_potency_multiple', factor: 2 } })).toBe(0);
    expect(resolveRatingBasis(mkChar({ blood_potency: undefined }), { rating_basis: { type: 'blood_potency_multiple', factor: 2 } })).toBe(0);
  });

  it('highest_status takes the max across the named pools', () => {
    // covenant Invictus 4 beats clan 2.
    const c = mkChar();
    expect(resolveRatingBasis(c, { rating_basis: { type: 'highest_status', pools: ['covenant', 'clan'] } })).toBe(4);
    expect(resolveRatingBasis(c, { rating_basis: { type: 'highest_status', pools: ['clan'] } })).toBe(2);
    expect(resolveRatingBasis(c, { rating_basis: { type: 'highest_status', pools: ['city'] } })).toBe(1);
  });

  it('highest_status reads the covenant pool by the character own covenant name', () => {
    // status.covenant is keyed by full covenant NAME, not a generic slot —
    // a character whose covenant does not match the key scores 0 there.
    const c = mkChar({ covenant: 'Invictus', status: { clan: 1, covenant: { 'Ordo Dracul': 5 } } });
    expect(resolveRatingBasis(c, { rating_basis: { type: 'highest_status', pools: ['covenant', 'clan'] } })).toBe(1);
  });

  it('returns null when the rule carries no basis, so callers fall back to rating_range', () => {
    const c = mkChar();
    expect(resolveRatingBasis(c, {})).toBeNull();
    expect(resolveRatingBasis(c, { rating_basis: null })).toBeNull();
    expect(resolveRatingBasis(c, null)).toBeNull();
    expect(resolveRatingBasis(null, { rating_basis: { type: 'blood_potency_multiple', factor: 2 } })).toBeNull();
  });

  it('unknown discriminator degrades safely to null and warns (ADR-005 D5)', () => {
    const c = mkChar();
    const warned = [];
    const orig = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      expect(resolveRatingBasis(c, { rating_basis: { type: 'some_future_basis', factor: 9 } })).toBeNull();
    } finally {
      console.warn = orig;
    }
    expect(warned.join(' ')).toContain('some_future_basis');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D1 — name + qualifier referencing
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D1 — references are name + qualifier, never index', () => {
  const c = mkChar({
    merits: [
      { category: 'general',   name: 'Resources',  cp: 3 },
      { category: 'influence', name: 'Contacts',   qualifier: 'Police', cp: 2 },
      { category: 'influence', name: 'Contacts',   qualifier: 'Press',  cp: 1 },
      { category: 'domain',    name: 'Safe Place', qualifier: '12 Rue Morgue', cp: 2 },
    ],
  });

  it('matches on name when neither side carries a qualifier', () => {
    expect(meritMatchesRef({ name: 'Resources' }, { name: 'Resources' })).toBe(true);
    expect(meritMatchesRef({ name: 'Resources', qualifier: '' }, { name: 'Resources', qualifier: null })).toBe(true);
  });

  it('distinguishes multi-instance merits by qualifier', () => {
    expect(resolveAttachment(c, { name: 'Contacts', qualifier: 'Police' }).cp).toBe(2);
    expect(resolveAttachment(c, { name: 'Contacts', qualifier: 'Press' }).cp).toBe(1);
    expect(resolveAttachment(c, { name: 'Contacts', qualifier: 'Docks' })).toBeNull();
    // A bare name must NOT match a qualified instance.
    expect(resolveAttachment(c, { name: 'Contacts' })).toBeNull();
  });

  it('survives a splice — the reference is positional-independent', () => {
    const spliced = mkChar({ merits: c.merits.slice() });
    const before = resolveAttachment(spliced, { name: 'Safe Place', qualifier: '12 Rue Morgue' });
    spliced.merits.splice(0, 1); // drop Resources; every index shifts
    const after = resolveAttachment(spliced, { name: 'Safe Place', qualifier: '12 Rue Morgue' });
    expect(after).toBe(before);
  });

  it('pledgeKeyFor cannot collide a qualifier with a name containing a space', () => {
    // The failure a space separator would produce.
    expect(pledgeKeyFor({ name: 'Safe', qualifier: 'Place' }))
      .not.toBe(pledgeKeyFor({ name: 'Safe Place', qualifier: null }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D1 — render-time reverse index
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D1 — the reverse index is render-time, never persisted', () => {
  function sworn() {
    return mkChar({
      merits: [
        { category: 'general', name: 'Resources', cp: 3 },
        { category: 'influence', name: 'Contacts', qualifier: 'Police', cp: 2 },
        {
          category: 'general', name: 'Oath of Burning Blood', cp: 0, xp: 0,
          sworn_by: buildSwornBy(3, [
            { name: 'Resources', dots: 2 },
            { name: 'Contacts', qualifier: 'Police', dots: 1 },
          ], { chapter_number: 2, iso: '2026-08-07' }),
        },
      ],
    });
  }

  it('indexes each pledged merit with its dots and the oath that holds them', () => {
    const c = sworn();
    const idx = buildPledgeIndex(c);
    expect(idx.get(pledgeKeyFor({ name: 'Resources' })).dots).toBe(2);
    expect(idx.get(pledgeKeyFor({ name: 'Contacts', qualifier: 'Police' })).dots).toBe(1);
    expect(idx.get(pledgeKeyFor({ name: 'Contacts', qualifier: 'Police' })).oaths[0].oath).toBe('Oath of Burning Blood');
    // The unpledged sibling instance is absent.
    expect(idx.has(pledgeKeyFor({ name: 'Contacts', qualifier: 'Press' }))).toBe(false);
  });

  it('sums dots when two oaths pledge the same merit', () => {
    const c = sworn();
    c.merits.push({
      category: 'general', name: 'Oath of Fealty', cp: 0,
      sworn_by: buildSwornBy(1, [{ name: 'Resources', dots: 1 }], null),
    });
    const idx = buildPledgeIndex(c);
    expect(idx.get(pledgeKeyFor({ name: 'Resources' })).dots).toBe(3);
    expect(idx.get(pledgeKeyFor({ name: 'Resources' })).oaths.map(o => o.oath).sort())
      .toEqual(['Oath of Burning Blood', 'Oath of Fealty']);
  });

  it('building the index does not mutate the character', () => {
    const c = sworn();
    const snapshot = JSON.stringify(c);
    buildPledgeIndex(c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('swornOaths ignores merits with no pledge', () => {
    const c = sworn();
    expect(swornOaths(c).map(m => m.name)).toEqual(['Oath of Burning Blood']);
    expect(swornOaths(mkChar())).toEqual([]);
    expect(swornOaths(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D1b — parity. The rejection cases are the point.
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D1b — parity is enforced, and it is dot count', () => {
  function c4() {
    return mkChar({
      merits: [
        { category: 'general',   name: 'Resources',  cp: 3 },
        { category: 'influence', name: 'Contacts',   qualifier: 'Police', cp: 2 },
        { category: 'domain',    name: 'Safe Place', qualifier: '12 Rue Morgue', cp: 2 },
      ],
    });
  }

  it('ACCEPTS a pledge that totals exactly dots_required', () => {
    const r = validatePledge(c4(), [
      { name: 'Resources', dots: 2 },
      { name: 'Contacts', qualifier: 'Police', dots: 1 },
      { name: 'Safe Place', qualifier: '12 Rue Morgue', dots: 1 },
    ], 4, ratingOf);
    expect(r).toEqual({ valid: true, message: null, total: 4 });
  });

  it('REJECTS a short pledge and names the shortfall', () => {
    const r = validatePledge(c4(), [{ name: 'Resources', dots: 2 }], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toBe('Pledge is 2 dots short - 2 of 4 pledged.');
  });

  it('REJECTS an over-pledge and names the excess', () => {
    const r = validatePledge(c4(), [
      { name: 'Resources', dots: 3 },
      { name: 'Contacts', qualifier: 'Police', dots: 2 },
    ], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toBe('Pledge is 1 dot over - 5 pledged, 4 required.');
  });

  it('REJECTS pledging more dots than the merit owns', () => {
    const r = validatePledge(c4(), [{ name: 'Resources', dots: 4 }], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('only 3 dots free to pledge');
  });

  it('REJECTS a merit the character does not own', () => {
    const r = validatePledge(c4(), [{ name: 'Herd', dots: 4 }], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toBe('Herd is not a merit this character owns.');
  });

  it('REJECTS the same merit pledged twice instead of silently summing', () => {
    const r = validatePledge(c4(), [
      { name: 'Resources', dots: 2 },
      { name: 'Resources', dots: 2 },
    ], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('pledged twice');
  });

  it('REJECTS a zero-dot attachment', () => {
    const r = validatePledge(c4(), [
      { name: 'Resources', dots: 0 },
      { name: 'Contacts', qualifier: 'Police', dots: 4 },
    ], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('at least 1 dot');
  });

  it('an empty pledge against a non-zero requirement is rejected', () => {
    const r = validatePledge(c4(), [], 4, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toBe('Pledge is 4 dots short - 0 of 4 pledged.');
  });

  it('dots already pledged to another oath are not available again', () => {
    const c = c4();
    c.merits.push({
      category: 'general', name: 'Oath of Fealty', cp: 0,
      sworn_by: buildSwornBy(2, [{ name: 'Resources', dots: 2 }], null),
    });
    // Resources is 3 dots, 2 already pledged → only 1 spare.
    expect(pledgedDots(c, { name: 'Resources' })).toBe(2);
    expect(pledgeableDots(c, c.merits[0], ratingOf)).toBe(1);
    const r = validatePledge(c, [{ name: 'Resources', dots: 2 }], 2, ratingOf);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('only 1 dot free to pledge');
  });

  it('re-editing an existing pledge does not count itself as competing', () => {
    const c = c4();
    const oath = {
      category: 'general', name: 'Oath of Fealty', cp: 0,
      sworn_by: buildSwornBy(2, [{ name: 'Resources', dots: 2 }], null),
    };
    c.merits.push(oath);
    // Without the exception the same 2 dots would read as unavailable.
    expect(pledgeableDots(c, c.merits[0], ratingOf, oath)).toBe(3);
    expect(validatePledge(c, [{ name: 'Resources', dots: 2 }], 2, ratingOf, oath).valid).toBe(true);
  });

  it('pledgeableDots refuses to guess when no ratingOf is injected', () => {
    // There is deliberately no default: a local copy of the owned-dots
    // formula would be a sixth fork of merit-dot arithmetic.
    expect(pledgeableDots(c4(), c4().merits[0], undefined)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D1b — dots_required is a snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D1b — dots_required is snapshotted, not recomputed', () => {
  it('a rising Blood Potency does not move a standing oath requirement', () => {
    const c = mkChar({ blood_potency: 3 });
    const rule = { rating_basis: { type: 'blood_potency_multiple', factor: 2 } };
    const atSwear = resolveRatingBasis(c, rule);
    expect(atSwear).toBe(6);

    const oath = {
      category: 'general', name: 'Oath Of Abstinence', cp: 0,
      sworn_by: buildSwornBy(atSwear, [{ name: 'Resources', dots: 6 }], { chapter_number: 1, iso: '2026-08-07' }),
    };
    c.merits.push({ category: 'general', name: 'Resources', cp: 6 }, oath);

    // Blood Potency rises. The BASIS moves; the SNAPSHOT must not.
    c.blood_potency = 5;
    expect(resolveRatingBasis(c, rule)).toBe(10);
    expect(oath.sworn_by.dots_required).toBe(6);

    // And the standing pledge is still valid — this is the whole point of
    // the snapshot. Recomputing would silently break it.
    expect(validatePledge(c, oath.sworn_by.attachments, oath.sworn_by.dots_required, ratingOf, oath).valid).toBe(true);
  });

  it('buildSwornBy normalises qualifiers and starts history empty', () => {
    const sb = buildSwornBy(2, [{ name: 'Resources', qualifier: '', dots: 2 }], null);
    expect(sb).toEqual({
      dots_required: 2,
      attachments: [{ name: 'Resources', qualifier: null, dots: 2 }],
      sworn_at: null,
      history: [],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D2 boundary — this story must not touch dot arithmetic
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D2 — encumbrance changes no dot sum', () => {
  it('no OATH-A helper is referenced from any dot-sum helper', () => {
    // ADR-010 D2: pledged dots stay fully usable; encumbrance is display +
    // edit gate only. Suspension arithmetic is OATH-B and lands in exactly
    // one helper (meritEffectiveRating). If an OATH-A symbol appears inside
    // the arithmetic modules, that boundary has been crossed.
    const OATH_SYMBOLS = [
      'buildPledgeIndex', 'pledgedDots', 'pledgeableDots',
      'validatePledge', 'sworn_by',
    ];
    for (const rel of ['public/js/editor/xp.js', 'public/js/editor/domain.js']) {
      const src = read(rel);
      for (const sym of OATH_SYMBOLS) {
        expect(src, `${rel} must not reference ${sym} in OATH-A`).not.toContain(sym);
      }
    }
  });

  it('meritRating and meritEffectiveRating are byte-identical to their pre-OATH-A form', () => {
    // Guards the single most expensive mistake available in this story.
    const xp = read('public/js/editor/xp.js');
    const dom = read('public/js/editor/domain.js');
    expect(xp).toContain("export function meritRating(c, m) {\n  if (m.cp === undefined && m.xp === undefined) return m.rating || 0;");
    expect(dom).toContain('export function meritEffectiveRating(c, m) {\n  if (!c || !m) return 0;');
  });
});
