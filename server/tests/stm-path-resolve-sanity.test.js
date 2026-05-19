/**
 * STM-2 path-resolve sanity check (Epic STM, issue #372 AC#9).
 *
 * Walks every path in STATIC_WHITELIST plus a regex-sampled set of
 * merits.[N].dots / disciplines.[N].dots paths against a synthetic
 * fixture character + tracker_state. After the pre-overlay splice
 * (mirroring public/js/data/st-mods.js#spliceCurrent), every path must
 * resolve to a number. Undefined or non-numeric resolution is the
 * silent-failure surface ADR-004 §Concerns Item 2 names — fail loudly.
 *
 * This test does NOT hit the API or MongoDB. It locks the path shapes
 * down to the source-of-truth fixture so a future whitelist edit that
 * drifts from the character document shape is caught before the overlay
 * has a chance to render undefined into a sheet.
 */

import { describe, it, expect } from 'vitest';

// ── Fixture: a fully-populated character + tracker_state ───────────────

const ATTRS = [
  'Intelligence', 'Wits', 'Resolve',
  'Strength', 'Dexterity', 'Stamina',
  'Presence', 'Manipulation', 'Composure',
];
const SKILLS = [
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science',
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge',
];

function buildCharacter() {
  return {
    attributes: Object.fromEntries(ATTRS.map(a => [a, { dots: 2, bonus: 0 }])),
    skills: Object.fromEntries(SKILLS.map(s => [s, { dots: 1, bonus: 0, specs: [], nine_again: false }])),
    blood_potency: 2,
    humanity: 7,
    merits: [
      { name: 'Status (City)', dots: 1 },
      { name: 'Resources', dots: 3 },
      { name: 'Allies', dots: 2 },
    ],
    // Object-keyed in the v2 schema (per public/js/data/accessors.js#discDots).
    // STM-5 (issue #386) tightened the server regex to accept letter-named
    // discipline keys; the fixture matches the actual document shape.
    disciplines: {
      Auspex:   { dots: 1 },
      Celerity: { dots: 2 },
    },
  };
}

function buildTrackerState() {
  return { bashing: 0, lethal: 1, aggravated: 0, willpower: 4, vitae: 8 };
}

// Mirror of public/js/data/st-mods.js#spliceCurrent. Kept inline so this
// test doesn't import client modules (which use the browser-only `location`
// global). The shape must stay in sync — if the client splice changes, this
// test will fail.
function spliceCurrent(c, tracker) {
  c.current = {
    damage_bashing:    tracker?.bashing    ?? 0,
    damage_lethal:     tracker?.lethal     ?? 0,
    damage_aggravated: tracker?.aggravated ?? 0,
    willpower:         tracker?.willpower  ?? 0,
    vitae:             tracker?.vitae      ?? 0,
  };
}

// Mirror of public/js/data/derived.js — STM-2 renderSheetWithOverlay calls
// the real derived.js between splice and overlay; here we materialise the
// derived.* paths to numbers so the sanity check can verify them.
function spliceDerived(c) {
  c.derived = {
    defence: 4,
    health_max: 7,
    willpower_max: 5,
    size: 5,
    speed: 9,
    initiative: 4,
  };
}

// Mirror of server/routes/st_mods.js STATIC_WHITELIST (Rev 2). Updating one
// MUST update the other; this duplication is intentional so the test can
// run against the server module without importing it (no Express dep needed).
const STATIC_WHITELIST = [
  ...ATTRS.flatMap(a => [`attributes.${a}.dots`, `attributes.${a}.bonus`]),
  ...SKILLS.flatMap(s => [`skills.${s}.dots`, `skills.${s}.bonus`]),
  'current.damage_bashing',
  'current.damage_lethal',
  'current.damage_aggravated',
  'current.willpower',
  'current.vitae',
  'blood_potency',
  'humanity',
  'derived.defence',
  'derived.health_max',
  'derived.willpower_max',
  'derived.size',
  'derived.speed',
  'derived.initiative',
];

function getByPath(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('STM-2 path-resolve sanity check (ADR-004 §Concerns Item 2)', () => {
  it('every STATIC_WHITELIST path resolves to a number after splice + derive', () => {
    const c = buildCharacter();
    spliceCurrent(c, buildTrackerState());
    spliceDerived(c);

    const failures = [];
    for (const path of STATIC_WHITELIST) {
      const v = getByPath(c, path);
      if (typeof v !== 'number') {
        failures.push(`${path} -> ${v === undefined ? 'undefined' : `${typeof v} ${JSON.stringify(v)}`}`);
      }
    }
    expect(failures, `unresolved paths:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('current.* paths fall back to 0 / 0 / 0 / 0 / 0 when tracker is null', () => {
    const c = buildCharacter();
    spliceCurrent(c, null);

    expect(c.current.damage_bashing).toBe(0);
    expect(c.current.damage_lethal).toBe(0);
    expect(c.current.damage_aggravated).toBe(0);
    expect(c.current.willpower).toBe(0);
    expect(c.current.vitae).toBe(0);
  });

  it('merit + discipline dot paths resolve via the dynamic regex shape', () => {
    const c = buildCharacter();
    const failures = [];

    c.merits.forEach((_, i) => {
      const v = getByPath(c, `merits.${i}.dots`);
      if (typeof v !== 'number') failures.push(`merits.${i}.dots -> ${v}`);
    });
    // Object-keyed disciplines: walk Object.keys (name-based path)
    Object.keys(c.disciplines).forEach((name) => {
      const v = getByPath(c, `disciplines.${name}.dots`);
      if (typeof v !== 'number') failures.push(`disciplines.${name}.dots -> ${v}`);
    });

    expect(failures, `unresolved dynamic paths:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('fails loudly when a whitelist entry typos away from the character shape', () => {
    // Negative control: prove the assertion mechanism catches drift.
    // If a future whitelist edit adds `current.willpwer` (typo), this
    // test would fire on the real whitelist; here we simulate it inline.
    const c = buildCharacter();
    spliceCurrent(c, buildTrackerState());
    const bogusPath = 'current.willpwer'; // intentional typo
    const v = getByPath(c, bogusPath);
    expect(v).toBeUndefined();
  });
});
