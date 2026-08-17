/**
 * cm-3 — Derived Story-finale classification for PT/MCI maintenance.
 *
 * Ruling documents: D:/Terra Mortis/cycle-model.md §3 ("the maintenance clock
 * stays tied to the Story, always" — the warning, the drop and the
 * classification all become derived, not toggled) and §8 (the seam assertion
 * `derived(isFinalChapterOfStory && !maintained) === ST_dropped`).
 *
 * What replaced what: `chapters.is_chapter_finale` was a per-chapter
 * checkbox the ST had to remember to tick on exactly the right cycle. It is
 * now a dead field. The classification is derived from ONE Story-level ST
 * signal, `story_cycles.final_chapter_id` — a pointer naming the specific
 * cycle that ends the Story.
 *
 * REWRITTEN 2026-08-17 (Task 10). cm-3's first pass used a `closed` boolean
 * plus "highest game_number among the Story's members". Review found that a
 * COMPUTED finale silently relocates when Story membership changes afterwards,
 * and that two cycles sharing a game_number both classify as the finale (this
 * project has a live duplicate-"Game 7" precedent). The pointer design closes
 * both by construction, and the tests below prove it rather than assuming it.
 *
 * §8's "golden set of past Stories with the ST's actual historical toggles"
 * DOES NOT EXIST as literally worded: a live read-only query on 2026-08-17
 * (`characters.merits` with name in {Professional Training, Mystery Cult
 * Initiation} and `active: false`) returned ZERO documents, so there is no
 * historical ST_dropped signal on record at all. Per this project's
 * "narrow the citation, log the real gap" convention (cm-7 precedent), the
 * seam assertion below is therefore driven by fixtures modelled on the real
 * live shapes (Story 1's three-chapter span, Story 3's single-chapter span,
 * and Story 1 / Game 3's real 21-character maintenance_audit shape) rather
 * than by a real historical drop.
 *
 * db.js imports public/js/data/api.js, which touches `location` at module
 * load. The repo convention for that (issue-1003-zero-submission-flip-guard,
 * gdx-8, issue-1001) is to stub the browser globals and dynamic-import the
 * REAL module, which is what this suite does — no mirror copy to keep in
 * lockstep. The stubs are TORN DOWN in afterAll (review finding: this repo has
 * a documented leaked-stub-across-suites hazard, and the first pass left all
 * three installed for the rest of the run).
 *
 * public/js/downtime/maintenance.js has no browser coupling at all — it is
 * imported statically and driven directly, which is what closes the review's
 * "AC8 tests its own mirror, not the real rule" finding.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import {
  maintenanceHoldings,
  maintenanceEligibleChars,
  maintenanceAtRisk,
} from '../../public/js/downtime/maintenance.js';

let isFinalChapterOfStory, storyCycleForCycle, getStoryCycles;
const HAD = {};

beforeAll(async () => {
  for (const k of ['location', 'localStorage', 'fetch']) {
    HAD[k] = Object.prototype.hasOwnProperty.call(globalThis, k)
      ? { present: true, value: globalThis[k] }
      : { present: false };
  }
  globalThis.location = { hostname: 'test-host' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => [] });
  const mod = await import('../../public/js/downtime/db.js');
  isFinalChapterOfStory = mod.isFinalChapterOfStory;
  storyCycleForCycle = mod.storyCycleForCycle;
  getStoryCycles = mod.getStoryCycles;
});

afterAll(() => {
  for (const [k, had] of Object.entries(HAD)) {
    if (had.present) globalThis[k] = had.value;
    else delete globalThis[k];
  }
});

const read = p => fs.readFileSync('../' + p, 'utf8');

// ── Fixtures modelled on the real live shapes (2026-08-17) ─────────────────

// Live Story 1 (_id 6a2a8760…): Games 1-3, the only Story with a real
// finale. The ST has named Game 3.
const STORY_1_CYCLES = [
  { _id: 'cyc-1', game_number: 1, story_cycle_id: 'story-1' },
  { _id: 'cyc-2', game_number: 2, story_cycle_id: 'story-1' },
  { _id: 'cyc-3', game_number: 3, story_cycle_id: 'story-1' },
];
const STORY_1 = { _id: 'story-1', number: 1, label: 'Story One', final_chapter_id: 'cyc-3' };

// Live Story 2 (_id 6a35cb3d…): Games 4-6, still open — nothing named.
const STORY_2 = { _id: 'story-2', number: 2, label: 'Story Two' };
const STORY_2_CYCLES = [
  { _id: 'cyc-4', game_number: 4, story_cycle_id: 'story-2' },
  { _id: 'cyc-5', game_number: 5, story_cycle_id: 'story-2' },
  { _id: 'cyc-6', game_number: 6, story_cycle_id: 'story-2' },
];

// Live Story 3 (_id 6a7ff93d…, created 2026-08-15): exactly ONE member,
// Game 7, with more chapters expected. THE regression case cm-3 exists for.
const STORY_3_OPEN  = { _id: 'story-3', number: 3, label: 'Story Three' };
const STORY_3_NAMED = { _id: 'story-3', number: 3, label: 'Story Three', final_chapter_id: 'cyc-7' };
const STORY_3_CYCLES = [{ _id: 'cyc-7', game_number: 7, story_cycle_id: 'story-3' }];

const ALL_CYCLES = [
  ...STORY_1_CYCLES,
  ...STORY_2_CYCLES,
  ...STORY_3_CYCLES,
  // A real live shape too: a cycle that belongs to no Story at all.
  { _id: 'cyc-orphan', game_number: 8, story_cycle_id: null },
];

const cyc = id => ALL_CYCLES.find(c => c._id === id);

// ── AC6 — the Story-3 edge case ────────────────────────────────────────────

describe('cm-3 AC6 — a single-chapter Story is not its own finale until named', () => {
  it('returns false for the sole member of a Story with no final_chapter_id', () => {
    // Live Story 3's exact shape. Under a "highest game_number in the Story"
    // derivation this would read true the moment the Story was created —
    // trivially, since a single member is its own maximum. That is precisely
    // the bug the explicit pointer exists to prevent.
    expect(isFinalChapterOfStory(cyc('cyc-7'), STORY_3_OPEN)).toBe(false);
  });

  it('returns true for the same sole member once the ST names it', () => {
    expect(isFinalChapterOfStory(cyc('cyc-7'), STORY_3_NAMED)).toBe(true);
  });
});

// ── AC7 — the pointer is exact, not positional ─────────────────────────────

describe('cm-3 AC7 — only the cycle the Story NAMES is its finale', () => {
  it('is true for Game 3 (Story 1\'s real finale)', () => {
    expect(isFinalChapterOfStory(cyc('cyc-3'), STORY_1)).toBe(true);
  });

  it('is false for Games 1 and 2, which are members but not the named chapter', () => {
    expect(isFinalChapterOfStory(cyc('cyc-1'), STORY_1)).toBe(false);
    expect(isFinalChapterOfStory(cyc('cyc-2'), STORY_1)).toBe(false);
  });

  it('honours a MIDDLE chapter as the finale — proving this is a real pointer, not a disguised max-game_number check', () => {
    // AC7's own wording: the named chapter is deliberately NOT the highest
    // game_number. A max-based derivation would call cyc-3 the finale here and
    // cyc-2 a non-finale, i.e. the exact opposite of both assertions below.
    const midNamed = { ...STORY_1, final_chapter_id: 'cyc-2' };
    expect(isFinalChapterOfStory(cyc('cyc-2'), midNamed)).toBe(true);
    expect(isFinalChapterOfStory(cyc('cyc-3'), midNamed)).toBe(false);
    expect(isFinalChapterOfStory(cyc('cyc-1'), midNamed)).toBe(false);
  });

  it('is false for every member of a Story with no final chapter named', () => {
    for (const c of STORY_2_CYCLES) {
      expect(isFinalChapterOfStory(c, STORY_2)).toBe(false);
    }
  });
});

// ── AC7a — the tied-game_number case, closed by construction ───────────────

describe('cm-3 AC7a — a tied game_number cannot produce a double-finale', () => {
  // This project has a live precedent: a duplicate "Game 7" downtime_cycles
  // document, on record in sprint-status.yaml. Under the first pass's
  // max-game_number derivation BOTH documents classified as the Story's
  // finale, with no tiebreak — two audit panels, two warning strips, one real
  // chapter. There is nothing left to tie on now.
  const TWIN_A = { _id: 'cyc-7a', game_number: 7, story_cycle_id: 'story-t' };
  const TWIN_B = { _id: 'cyc-7b', game_number: 7, story_cycle_id: 'story-t' };
  const STORY_T = { _id: 'story-t', number: 4, label: 'Twin Story', final_chapter_id: 'cyc-7b' };

  it('is true for the named twin only', () => {
    expect(isFinalChapterOfStory(TWIN_B, STORY_T)).toBe(true);
  });

  it('is false for its game_number-identical sibling', () => {
    expect(isFinalChapterOfStory(TWIN_A, STORY_T)).toBe(false);
  });

  it('reads no game_number at all — stripping it changes nothing', () => {
    const { game_number: _a, ...noNumA } = TWIN_A;
    const { game_number: _b, ...noNumB } = TWIN_B;
    expect(isFinalChapterOfStory(noNumB, STORY_T)).toBe(true);
    expect(isFinalChapterOfStory(noNumA, STORY_T)).toBe(false);
  });

  it('is unaffected by a non-numeric game_number (the old Number() coercion gap)', () => {
    // Number(null) / Number('') / Number(false) all coerce to 0 and slipped
    // past the first pass's Number.isFinite guard. No coercion path exists now.
    for (const junk of [null, '', false, 'seven', undefined, NaN]) {
      expect(isFinalChapterOfStory({ ...TWIN_B, game_number: junk }, STORY_T)).toBe(true);
      expect(isFinalChapterOfStory({ ...TWIN_A, game_number: junk }, STORY_T)).toBe(false);
    }
  });
});

// ── AC2 — the contract, including the negative / defensive cases ───────────

describe('cm-3 AC2 — isFinalChapterOfStory is a pure, total, two-argument predicate', () => {
  it('takes exactly two declared parameters', () => {
    expect(isFinalChapterOfStory.length).toBe(2);
  });

  it('is false for a cycle with no story_cycle_id at all', () => {
    expect(isFinalChapterOfStory(cyc('cyc-orphan'), null)).toBe(false);
    // …even if some Story somehow names it.
    expect(isFinalChapterOfStory(cyc('cyc-orphan'), { _id: 'story-x', final_chapter_id: 'cyc-orphan' })).toBe(false);
  });

  it('is false (not a throw) when the Story was deleted out from under the cycle', () => {
    expect(() => isFinalChapterOfStory(cyc('cyc-3'), undefined)).not.toThrow();
    expect(isFinalChapterOfStory(cyc('cyc-3'), undefined)).toBe(false);
    expect(isFinalChapterOfStory(cyc('cyc-3'), null)).toBe(false);
  });

  it('is false for a missing cycle', () => {
    expect(isFinalChapterOfStory(null, STORY_1)).toBe(false);
    expect(isFinalChapterOfStory(undefined, undefined)).toBe(false);
    expect(isFinalChapterOfStory({}, STORY_1)).toBe(false);
  });

  it('treats an unset, null or empty final_chapter_id as "not closed"', () => {
    for (const v of [undefined, null, '']) {
      expect(isFinalChapterOfStory(cyc('cyc-3'), { ...STORY_1, final_chapter_id: v })).toBe(false);
    }
  });

  it('rejects a storyCycle that is not this cycle\'s own Story', () => {
    // Contract guard: both real call sites resolve through storyCycleForCycle
    // first, so this cannot happen today — but AC2 documents the relationship,
    // so the predicate enforces it instead of trusting the caller.
    const foreign = { _id: 'story-2', number: 2, final_chapter_id: 'cyc-3' };
    expect(isFinalChapterOfStory(cyc('cyc-3'), foreign)).toBe(false);
  });

  it('compares ids by string, so ObjectId-vs-string never diverges', () => {
    const objectIdish = s => ({ toString: () => s });
    const cycle = { _id: objectIdish('cyc-z'), story_cycle_id: objectIdish('story-z') };
    const story = { _id: 'story-z', final_chapter_id: objectIdish('cyc-z') };
    expect(isFinalChapterOfStory(cycle, story)).toBe(true);
  });

  it('mutates neither the cycle nor the Story document', () => {
    const cycle = JSON.parse(JSON.stringify(cyc('cyc-3')));
    const story = JSON.parse(JSON.stringify(STORY_1));
    const before = JSON.stringify({ cycle, story });
    isFinalChapterOfStory(cycle, story);
    expect(JSON.stringify({ cycle, story })).toBe(before);
  });

  it('needs no sibling-cycle list — the whole allCycles argument is gone', () => {
    const src = read('public/js/downtime/db.js');
    const fn = src.slice(src.indexOf('export function isFinalChapterOfStory'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toMatch(/game_number/);
    expect(body).not.toMatch(/allCycles/);
  });
});

// ── AC2/AC5 — the ONE shared Story resolver ────────────────────────────────

describe('cm-3 AC5 — storyCycleForCycle is the single shared resolver', () => {
  const LIST = [STORY_1, STORY_2, STORY_3_OPEN];

  it('resolves a cycle to its own Story document', () => {
    expect(storyCycleForCycle(cyc('cyc-3'), LIST)).toBe(STORY_1);
    expect(storyCycleForCycle(cyc('cyc-7'), LIST)).toBe(STORY_3_OPEN);
  });

  it('returns null for no FK, an empty list, or an unresolvable FK', () => {
    expect(storyCycleForCycle(cyc('cyc-orphan'), LIST)).toBe(null);
    expect(storyCycleForCycle(cyc('cyc-3'), [])).toBe(null);
    expect(storyCycleForCycle(cyc('cyc-3'), null)).toBe(null);
    expect(storyCycleForCycle(null, LIST)).toBe(null);
    expect(storyCycleForCycle({ _id: 'x', story_cycle_id: 'story-nope' }, LIST)).toBe(null);
  });

  it('neither consumer keeps its own copy of the lookup', () => {
    // The first pass had `String(s._id) === String(cycle.story_cycle_id)`
    // duplicated verbatim in the admin panel and the player form — the exact
    // "two surfaces can silently disagree" class this story exists to close.
    for (const p of ['public/js/admin/downtime-views.js', 'public/js/tabs/downtime-form.js']) {
      const src = read(p);
      expect(src).toMatch(/storyCycleForCycle/);
      expect(src).not.toMatch(/String\(s\._id\) === String\(cycle\.story_cycle_id\)/);
    }
  });
});

// ── getStoryCycles ─────────────────────────────────────────────────────────

describe('cm-3 — getStoryCycles mirrors getCycles', () => {
  it('is exported from db.js and reads GET /api/story_cycles', () => {
    expect(typeof getStoryCycles).toBe('function');
    const src = read('public/js/downtime/db.js');
    expect(src).toMatch(/export async function getStoryCycles\(\)\s*\{\s*return apiGet\('\/api\/story_cycles'\);/);
  });
});

// ── AC8 — the historical-audit-shaped seam assertion ───────────────────────
//
// Shape taken from live Story 1 / Game 3's real `maintenance_audit`: 21
// characters, per-character {pt, mci} booleans, some explicitly false, and
// characters who hold a maintenance merit but are absent from the audit
// entirely. Character ids are anonymised — the real ones are not reproduced.
//
// REWORKED (review finding): the first pass compared two invocations of its
// OWN local mirror of the at-risk rule against the same boolean, which is
// tautological on the gate branch and never touched production code. The rule
// now lives in public/js/downtime/maintenance.js and is imported and driven
// directly here — the same functions the ST audit panel and the player warning
// strip call — including the admin panel's `!c.retired` eligibility filter and
// the real (asymmetric) PT branch.
//
// The point of the assertion is cycle-model.md §8's seam and stays narrow:
// changing WHAT GATES the panel must not change WHICH CHARACTERS it reports.

const PT  = { name: 'Professional Training', category: 'standing' };
const MCI = cult => ({ name: 'Mystery Cult Initiation', category: 'standing', cult_name: cult });

const AUDIT_CHARS = [
  { _id: 'ch-01', merits: [PT] },
  { _id: 'ch-02', merits: [PT] },
  { _id: 'ch-03', merits: [MCI('The Gilded Chain')] },
  { _id: 'ch-04', merits: [MCI('The Gilded Chain')] },
  { _id: 'ch-05', merits: [PT, MCI('Ashen Choir')] },
  { _id: 'ch-06', merits: [PT, MCI('Ashen Choir')] },
  { _id: 'ch-07', merits: [MCI('Ashen Choir'), MCI('The Gilded Chain')] },
  { _id: 'ch-08', merits: [PT] },
  { _id: 'ch-09', merits: [MCI('Ashen Choir')] },
  { _id: 'ch-10', merits: [PT] },
  { _id: 'ch-11', merits: [MCI('The Gilded Chain')] },
  { _id: 'ch-12', merits: [PT, MCI('Ashen Choir')] },
  { _id: 'ch-13', merits: [PT] },
  { _id: 'ch-14', merits: [MCI('Ashen Choir')] },
  { _id: 'ch-15', merits: [PT] },
  { _id: 'ch-16', merits: [MCI('The Gilded Chain')] },
  { _id: 'ch-17', merits: [PT, MCI('Ashen Choir')] },
  { _id: 'ch-18', merits: [PT] },
  { _id: 'ch-19', merits: [MCI('Ashen Choir')] },
  { _id: 'ch-20', merits: [PT] },
  // An inactive MCI (the ~15 `m.active !== false` read sites cm-3 leaves
  // untouched): holds the merit, but it must not raise a warning.
  { _id: 'ch-21', merits: [{ ...MCI('Ashen Choir'), active: false }] },
];

const HISTORICAL_AUDIT = {
  'ch-01': { pt: true,  mci: false },
  'ch-02': { pt: false, mci: false },
  'ch-03': { pt: false, mci: true  },
  'ch-04': { pt: false, mci: false },
  'ch-05': { pt: true,  mci: true  },
  'ch-06': { pt: true,  mci: false },
  'ch-07': { pt: false, mci: true  },
  'ch-09': { mci: true },
  'ch-10': { pt: true },
  'ch-12': { pt: false, mci: true },
  'ch-13': { pt: true,  mci: false },
  'ch-17': { pt: true,  mci: true  },
  'ch-21': { pt: false, mci: false },
  // ch-08, ch-11, ch-14, ch-15, ch-16, ch-18, ch-19, ch-20 are absent from
  // the audit entirely — the real record has that shape too.
};

/**
 * The whole read, end to end, exactly as both consumers perform it: gate on
 * the derivation, filter to eligible characters, then apply the shared
 * per-character rule. Every non-gate step is the REAL production function.
 */
function atRiskSet(chars, audit, gateOpen) {
  const out = new Set();
  if (!gateOpen) return out;
  for (const char of maintenanceEligibleChars(chars)) {
    const risk = maintenanceAtRisk(char, audit[String(char._id)]);
    if (risk.pt) out.add(`${char._id}:pt`);
    if (risk.mci) out.add(`${char._id}:mci`);
  }
  return out;
}

// Hand-computed from AUDIT_CHARS x HISTORICAL_AUDIT above. Twelve entries:
// four "explicitly false in the audit", eight "absent from the audit".
// Deliberately written out rather than derived, so a change to the production
// rule cannot quietly redefine what the test expects.
const EXPECTED_AT_RISK = [
  'ch-02:pt',   // PT, audit says pt: false
  'ch-04:mci',  // MCI, audit says mci: false
  'ch-06:mci',  // PT ticked, MCI not
  'ch-08:pt',   // absent from the audit entirely
  'ch-11:mci',  // absent
  'ch-12:pt',   // MCI ticked, PT not
  'ch-14:mci',  // absent
  'ch-15:pt',   // absent
  'ch-16:mci',  // absent
  'ch-18:pt',   // absent
  'ch-19:mci',  // absent
  'ch-20:pt',   // absent
].sort();

describe('cm-3 AC8 — the at-risk set survives the classification-source change', () => {
  // Game 3 under the OLD model: is_chapter_finale was manually ticked true.
  // Game 3 under the NEW model: derived from Story 1 naming cyc-3.
  const OLD_MANUAL_GATE = true;

  it('derives the same gate the manual flag carried on live Game 3', () => {
    expect(isFinalChapterOfStory(cyc('cyc-3'), STORY_1)).toBe(OLD_MANUAL_GATE);
  });

  it('names the expected at-risk entries from the real audit shape', () => {
    const derivedGate = isFinalChapterOfStory(cyc('cyc-3'), STORY_1);
    expect([...atRiskSet(AUDIT_CHARS, HISTORICAL_AUDIT, derivedGate)].sort())
      .toEqual(EXPECTED_AT_RISK);
  });

  it('excludes characters whose merits are all ticked, and inactive MCI holders', () => {
    const risk = atRiskSet(AUDIT_CHARS, HISTORICAL_AUDIT, true);
    expect(risk.has('ch-05:pt')).toBe(false);   // both ticked
    expect(risk.has('ch-05:mci')).toBe(false);
    expect(risk.has('ch-17:pt')).toBe(false);
    expect(risk.has('ch-17:mci')).toBe(false);
    expect(risk.has('ch-09:pt')).toBe(false);   // holds no PT
    expect(risk.has('ch-13:mci')).toBe(false);  // holds no MCI
    // ch-21 holds ONLY an inactive MCI: cm-3 leaves the ~15 `m.active !==
    // false` read sites untouched, so it must never raise a warning.
    expect(risk.has('ch-21:mci')).toBe(false);
    expect(risk.has('ch-21:pt')).toBe(false);
  });

  it('applies the admin panel\'s own !retired eligibility filter', () => {
    // The first pass's mirror modelled no retirement rule at all. A retired
    // character holding an unticked PT must not appear in the ST audit table,
    // and must not appear here either.
    const withRetired = [...AUDIT_CHARS, { _id: 'ch-99', retired: true, merits: [PT] }];
    const risk = atRiskSet(withRetired, HISTORICAL_AUDIT, true);
    expect(risk.has('ch-99:pt')).toBe(false);
    expect([...risk].sort()).toEqual(EXPECTED_AT_RISK);
  });

  it('a Story with no final chapter named yields an empty at-risk set', () => {
    // Live Story 2's shape: three chapters, none named, nothing at risk yet.
    const gate = isFinalChapterOfStory(cyc('cyc-6'), STORY_2);
    expect(atRiskSet(AUDIT_CHARS, HISTORICAL_AUDIT, gate).size).toBe(0);
  });

  it('live Story 3 (one chapter, not yet named) shows nobody at risk', () => {
    const gate = isFinalChapterOfStory(cyc('cyc-7'), STORY_3_OPEN);
    expect(atRiskSet(AUDIT_CHARS, HISTORICAL_AUDIT, gate).size).toBe(0);
    // …and the moment the ST names it, the same audit produces the same
    // twelve at-risk entries Story 1's named finale produced.
    const namedGate = isFinalChapterOfStory(cyc('cyc-7'), STORY_3_NAMED);
    expect([...atRiskSet(AUDIT_CHARS, HISTORICAL_AUDIT, namedGate)].sort())
      .toEqual(EXPECTED_AT_RISK);
  });
});

// ── AC8 — the shared rule itself ───────────────────────────────────────────

describe('cm-3 AC8 — the shared per-character maintenance rule', () => {
  it('detects PT with no active guard, and MCI with one', () => {
    expect(maintenanceHoldings({ merits: [{ ...PT, active: false }] }).pt).toBe(true);
    expect(maintenanceHoldings({ merits: [{ ...MCI('X'), active: false }] }).mci).toBe(false);
    expect(maintenanceHoldings({ merits: [MCI('X'), MCI('Y')] }).mciCults).toEqual(['X', 'Y']);
  });

  it('is total over missing characters, merits and audit rows', () => {
    expect(maintenanceHoldings(null)).toEqual({ pt: false, mci: false, mciCults: [] });
    expect(maintenanceEligibleChars(null)).toEqual([]);
    expect(maintenanceAtRisk({ merits: [PT] }, undefined).pt).toBe(true);
  });

  it('treats an absent row and an explicit false identically — only true clears', () => {
    const c = { _id: 'x', merits: [PT, MCI('X')] };
    expect(maintenanceAtRisk(c, {})).toMatchObject({ pt: true, mci: true });
    expect(maintenanceAtRisk(c, { pt: false, mci: false })).toMatchObject({ pt: true, mci: true });
    expect(maintenanceAtRisk(c, { pt: true, mci: true })).toMatchObject({ pt: false, mci: false });
    // Not a truthy check: 'yes' is not a tick.
    expect(maintenanceAtRisk(c, { pt: 'yes', mci: 1 })).toMatchObject({ pt: true, mci: true });
  });

  it('excludes retired characters and characters holding neither merit', () => {
    const chars = [
      { _id: 'a', merits: [PT] },
      { _id: 'b', retired: true, merits: [PT] },
      { _id: 'c', merits: [{ name: 'Haven' }] },
      { _id: 'd', merits: [MCI('X')] },
    ];
    expect(maintenanceEligibleChars(chars).map(c => c._id)).toEqual(['a', 'd']);
  });
});

// ── AC3 / AC4 / AC5 — the wiring, asserted against the real sources ────────
//
// These call sites live in browser-coupled render functions (no jsdom in this
// repo), so they are pinned by source contract — the convention established by
// epic.708.1-cycle-schema-api.test.js and used for downtime-form.js internals
// by dbo-3-standing-merit-filter.test.js. The per-character RULE they apply is
// no longer pinned this way: it is imported and driven directly above.

describe('cm-3 AC3/AC4/AC5 — consumers gate on the derivation, not the dead field', () => {
  const ADMIN  = () => read('public/js/admin/downtime-views.js');
  const FORM   = () => read('public/js/tabs/downtime-form.js');
  const CYCLES = () => read('public/js/admin/cycle-views.js');

  it('the admin Prep panel no longer renders or writes the manual checkbox', () => {
    const src = ADMIN();
    expect(src).not.toMatch(/dt-chapter-finale-input/);
    expect(src).not.toMatch(/is_chapter_finale:\s*val/);
  });

  it('no production file reads cycle.is_chapter_finale any more', () => {
    for (const src of [ADMIN(), FORM(), CYCLES()]) {
      expect(src).not.toMatch(/\.is_chapter_finale\s*!==\s*true/);
      expect(src).not.toMatch(/cycle\.is_chapter_finale\s*\?/);
    }
  });

  it('both gates call isFinalChapterOfStory with two arguments', () => {
    expect(ADMIN()).toMatch(/isFinalChapterOfStory\(cycle,\s*story\)/);
    expect(FORM()).toMatch(/isFinalChapterOfStory\(cycle,\s*storyCycleForCycle\(cycle,\s*_storyCycles\)\)/);
  });

  it('the admin Prep panel renders a read-only derived badge instead', () => {
    expect(ADMIN()).toMatch(/Chapter Finale/);
    expect(ADMIN()).toMatch(/derived-note/);
  });

  it('the Stories table carries a Final chapter select wired to PATCH', () => {
    const src = CYCLES();
    expect(src).toMatch(/cy-story-final/);
    expect(src).toMatch(/not closed/);
    expect(src).toMatch(/apiPatch\(`\/api\/story_cycles\/\$\{[^}]+\}`,\s*\{\s*final_chapter_id/);
  });

  it('the Stories-table control guards against overlapping writes and detached reverts', () => {
    const src = CYCLES();
    const fn = src.slice(src.indexOf('function buildFinalChapterSelect'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/sel\.disabled = true/);
    expect(body).toMatch(/isConnected/);
  });

  it('both consumers apply the SHARED maintenance rule, not their own copy', () => {
    expect(ADMIN()).toMatch(/from '\.\.\/downtime\/maintenance\.js'/);
    expect(FORM()).toMatch(/from '\.\.\/downtime\/maintenance\.js'/);
    // The old inline predicates must be gone from both, or the shared module
    // is decorative.
    expect(FORM()).not.toMatch(/merits\.some\(m => m\.name === 'Professional Training'\)/);
    expect(ADMIN()).not.toMatch(/const pt = merits\.some/);
  });

  it('a failed story_cycles fetch is surfaced, not swallowed', () => {
    // Both consumers previously used a bare `.catch(() => [])`, which made a
    // fetch failure indistinguishable from "this Story has no finale".
    expect(ADMIN()).toMatch(/storyCyclesLoadFailed/);
    expect(ADMIN()).toMatch(/Unavailable/);
    expect(FORM()).toMatch(/_storyCyclesFailed/);
    expect(FORM()).toMatch(/Maintenance status unavailable/);
    for (const src of [ADMIN(), FORM()]) {
      expect(src).not.toMatch(/getStoryCycles\(\)\.catch\(\(\) => \[\]\)/);
    }
  });

  it('shToggleMCI / shTogglePT are untouched — enforcement stays manual', () => {
    const src = read('public/js/editor/edit-domain.js');
    expect(src).toMatch(/function shToggleMCI/);
    expect(src).toMatch(/function shTogglePT/);
    expect(src).not.toMatch(/isFinalChapterOfStory/);
  });
});

// ── AC10 / AC11 — the guard and the deploy note are recorded ───────────────

describe('cm-3 AC10/AC11 — server guard and the deploy note', () => {
  it('the reassignment/deletion guard exists on the chapters router', () => {
    // cm-2b: cyclesRouter moved out of downtime.js into its own chapters.js.
    const src = read('server/routes/chapters.js');
    expect(src).toMatch(/CYCLE_IS_STORY_FINALE/);
    expect(src).toMatch(/namedFinaleRefusal/);
  });

  it('the story_cycles PATCH validates the pointer referentially', () => {
    const src = read('server/routes/story-cycles.js');
    expect(src).toMatch(/final_chapter_id/);
    expect(src).toMatch(/does not belong to this Story/);
    expect(src).not.toMatch(/closed must be a boolean/);
  });

  it('AC11: the deploy note for live Story 1 is written down', () => {
    // Satisfied by documentation existing, not by a script — cm-3 runs no
    // migration and writes no live data.
    const ssot = read('specs/reference-data-ssot.md');
    expect(ssot).toMatch(/DEPLOY NOTE/);
    expect(ssot).toMatch(/Story 1/);
    expect(ssot).toMatch(/final_chapter_id/);
  });
});
