/**
 * OATH-A (issue #1111, ADR-010 D1 / D2) — behavioural coverage for the two
 * things that are NOT pure helper logic: what the sheet renders, and what the
 * editor refuses.
 *
 * Two things this suite exists to prevent:
 *
 *  1. **The single-renderer blind spot.** `shRenderGeneralMerits` has an
 *     edit-mode branch and a view-mode branch computing the same rows.
 *     Wiring one and not the other is silently wrong in the other mode and a
 *     source-regex test cannot catch it. Every badge assertion below is made
 *     against BOTH renderers.
 *  2. **Accessor drift.** ADR-010 D2 is explicit that encumbrance changes no
 *     dot sum. The arithmetic assertions below pin that: a pledged merit's
 *     dots read exactly the same before and after the pledge exists.
 */

globalThis.location = {
  origin: 'http://localhost:8080',
  hostname: 'localhost',
  href: 'http://localhost:8080/admin',
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
};

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

let shRenderGeneralMerits;
let shEditMeritPt;
let shSwearOath;
let meritRating;
let buildSwornBy;
let pledgedDots;
let stateMod;
let loadRulesMod;

// The Swear By oath rule under test, in the live shape (cost_model +
// rating_basis), plus a fixed-rating sibling.
const ABSTINENCE = {
  key: 'oath-of-abstinence',
  name: 'Oath Of Abstinence',
  category: 'merit',
  cost_model: 'swear_by',
  rating_range: null,
  rating_basis: { type: 'blood_potency_multiple', factor: 2 },
};
const FEALTY = {
  key: 'oath-of-fealty',
  name: 'Oath Of Fealty',
  category: 'merit',
  cost_model: 'swear_by',
  rating_range: [1, 1],
};

beforeAll(async () => {
  const helpers = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'rules-helpers.js')).href);
  ({ buildSwornBy, pledgedDots } = helpers);
  ({ shRenderGeneralMerits } = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href));
  const editMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'edit.js')).href);
  ({ shEditMeritPt } = editMod);
  // The handlers call _markDirty / _renderSheet, which main.js injects at
  // boot. Register no-ops so the write paths run headless. registerCallbacks
  // forwards to edit-domain.js too, so shSwearOath is covered as well.
  editMod.registerCallbacks(() => {}, () => {});
  ({ shSwearOath } = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'edit-domain.js')).href));
  ({ meritRating } = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'xp.js')).href));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue({
    rule_grant: [], rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  });
});

function mkChar(merits) {
  return {
    _id: 'c-oath',
    name: 'Testudo',
    clan: 'Ventrue',
    covenant: 'Invictus',
    blood_potency: 2,
    status: { city: 0, clan: 1, covenant: { Invictus: 3 } },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

/** A character with a sworn oath pledging 2 Resources dots + 1 Contacts dot. */
function swornFixture() {
  return mkChar([
    { category: 'general',   name: 'Resources', cp: 3, xp: 0 },
    { category: 'general',   name: 'Contacts',  qualifier: 'Police', cp: 2, xp: 0 },
    { category: 'general',   name: 'Striking Looks', cp: 2, xp: 0 },
    {
      category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
      sworn_by: buildSwornBy(3, [
        { name: 'Resources', dots: 2 },
        { name: 'Contacts', qualifier: 'Police', dots: 1 },
      ], { chapter_number: 4, iso: '2026-08-07' }),
    },
  ]);
}

/** Render both modes. */
function renderBoth(c) {
  stateMod.chars = [c];
  stateMod.editIdx = 0;
  stateMod.editMode = true;
  const edit = shRenderGeneralMerits(c, true);
  stateMod.editMode = false;
  const view = shRenderGeneralMerits(c, false);
  return { edit, view };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — the badge, in BOTH renderers
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A AC6 — pledged merits are badged in BOTH renderers', () => {
  it('EDIT MODE badges each pledged merit with its pledged dot count', () => {
    const { edit } = renderBoth(swornFixture());
    expect(edit).toContain('Pledged 2'); // Resources
    expect(edit).toContain('Pledged 1'); // Contacts (Police)
    expect(edit).toContain('Pledged to Oath Of Fealty (2)');
  });

  it('VIEW MODE badges the same merits — not just edit mode', () => {
    const { view } = renderBoth(swornFixture());
    expect(view).toContain('Pledged 2');
    expect(view).toContain('Pledged 1');
    expect(view).toContain('Pledged to Oath Of Fealty (2)');
  });

  it('the oath row itself reports what was sworn, in both renderers', () => {
    const { edit, view } = renderBoth(swornFixture());
    for (const html of [edit, view]) {
      expect(html).toContain('Sworn 3');
      expect(html).toContain('Resources 2');
      expect(html).toContain('Contacts (Police) 1');
    }
  });

  it('unpledged merits carry NO badge, in both renderers', () => {
    const { edit, view } = renderBoth(swornFixture());
    // Striking Looks is unpledged. Count the badges rather than looking for
    // an absence that a substring match could not distinguish.
    for (const html of [edit, view]) {
      expect((html.match(/Pledged \d/g) || []).length).toBe(2);
    }
  });

  it('a character with no oath renders no badge at all, in both renderers', () => {
    const { edit, view } = renderBoth(mkChar([
      { category: 'general', name: 'Resources', cp: 3 },
    ]));
    expect(edit).not.toContain('Pledged');
    expect(view).not.toContain('Pledged');
    expect(edit).not.toContain('Sworn');
    expect(view).not.toContain('Sworn');
  });

  it('two oaths pledging the same merit sum in the badge, in both renderers', () => {
    const c = swornFixture();
    c.merits.push({
      category: 'general', name: 'Oath Of Abstinence', cp: 0,
      sworn_by: buildSwornBy(1, [{ name: 'Resources', dots: 1 }], null),
    });
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) {
      expect(html).toContain('Pledged 3'); // 2 + 1 on Resources
      expect(html).toContain('Pledged to Oath Of Fealty (2), Oath Of Abstinence (1)');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — zero accessor changes
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A D2 — pledged dots stay fully usable', () => {
  it('meritRating returns exactly the same value with and without a pledge', () => {
    const unsworn = mkChar([{ category: 'general', name: 'Resources', cp: 3, xp: 0 }]);
    const sworn = swornFixture();
    const before = meritRating(unsworn, unsworn.merits[0]);
    const after = meritRating(sworn, sworn.merits[0]);
    expect(after).toBe(before);
    expect(after).toBe(3);
  });

  it('the rendered dot display is unchanged by the pledge', () => {
    // Same character, pledge stripped — the dots column must be identical.
    const sworn = swornFixture();
    const stripped = swornFixture();
    stripped.merits = stripped.merits.filter(m => !m.sworn_by);

    const a = renderBoth(sworn);
    const b = renderBoth(stripped);
    // Strip the badges, which are the only sanctioned difference.
    const scrub = (h) => h.replace(/<span class="gen-granted-tag"[^>]*>[^<]*<\/span>/g, '');
    // The oath row itself only exists in one of them, so compare the
    // Resources row's dot markup specifically.
    const dotsOf = (h) => (scrub(h).match(/●+○*/g) || []).join('|');
    expect(dotsOf(a.edit)).toContain(dotsOf(b.edit).split('|')[0]);
    expect(dotsOf(a.view)).toContain(dotsOf(b.view).split('|')[0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — the edit gate
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A AC6 — the editor refuses to sell pledged dots', () => {
  function setup() {
    const c = swornFixture();
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    return c;
  }

  it('clamps a CP reduction at the pledged floor rather than letting dots vanish', () => {
    const c = setup();
    const resourcesIdx = 0;
    // 3 owned, 2 pledged. Selling down to 0 must stop at 2.
    shEditMeritPt(resourcesIdx, 'cp', 0);
    expect(c.merits[resourcesIdx].cp).toBe(2);
    expect(meritRating(c, c.merits[resourcesIdx])).toBe(2);
  });

  it('allows a reduction that stays at or above the pledge', () => {
    const c = setup();
    shEditMeritPt(0, 'cp', 2); // exactly the pledged floor
    expect(c.merits[0].cp).toBe(2);
  });

  it('allows an increase freely', () => {
    const c = setup();
    shEditMeritPt(0, 'cp', 5);
    expect(c.merits[0].cp).toBe(5);
  });

  it('does not clamp an unpledged merit', () => {
    const c = setup();
    const strikingIdx = 2;
    shEditMeritPt(strikingIdx, 'cp', 0);
    expect(c.merits[strikingIdx].cp).toBe(0);
  });

  it('REGRESSION (#1111 QA): a free_grants.* channel counted by meritRating is ALSO clamped', () => {
    // The bypass Ma'at measured. meritRating sums ten free_grants channels
    // (bloodline, pet, mci, vm, lk, ohm, inv, pt, mdb, sw) and pledgeableDots
    // measures pledges in meritRating terms, so the dots that CAN be pledged
    // were exactly the ones the floor exempted. xp.js emits
    // shEditMeritPt(idx, 'free_grants.mci', ...) straight from the bd-row, so
    // the bypass is reachable from the UI, not theoretical.
    //
    // Direction matters: this is UNDER-clamping, not over-clamping. The
    // original guard skipped every dotted path, so these fields never
    // clamped at all.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 2, xp: 0, free_grants: { mci: 3 } },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(4, [{ name: 'Resources', dots: 4 }], null),
      },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    expect(meritRating(c, c.merits[0])).toBe(5); // 2 cp + 3 mci

    // Selling the MCI channel to 0 would drop owned 5 -> 2 against a
    // standing 4-dot pledge. The floor must stop it at 2 mci (2 + 2 = 4).
    shEditMeritPt(0, 'free_grants.mci', 0);
    expect(meritRating(c, c.merits[0])).toBeGreaterThanOrEqual(4);
    expect(c.merits[0].free_grants.mci).toBe(2);
  });

  it('REGRESSION (#1111 QA): a free_grants.* channel NOT counted by meritRating still never clamps', () => {
    // The property the old prefix guard provided must survive its removal.
    // free_grants.necro is genuinely absent from meritRating's sum, so it
    // contributes 0 and must remain freely editable even under a pledge.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 4, xp: 0, free_grants: { necro: 3 } },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(4, [{ name: 'Resources', dots: 4 }], null),
      },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    shEditMeritPt(0, 'free_grants.necro', 0);
    expect(c.merits[0].free_grants.necro).toBeUndefined();
    expect(c.merits[0].cp).toBe(4); // the pledged dots are untouched
  });

  it('the floor tracks the pledge, not a fixed number', () => {
    const c = setup();
    // Raise the Contacts pledge to 2 by re-swearing, then try to sell it out.
    c.merits[3].sworn_by.attachments = [
      { name: 'Resources', dots: 1 },
      { name: 'Contacts', qualifier: 'Police', dots: 2 },
    ];
    shEditMeritPt(1, 'cp', 0);
    expect(c.merits[1].cp).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 1 / AC 3 / AC 4 — the swear write path
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A AC1 — shSwearOath writes the pledge, or refuses', () => {
  function setup() {
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 3, xp: 0 },
      { category: 'general', name: 'Contacts', qualifier: 'Police', cp: 2, xp: 0 },
      { category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0 },
    ]);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;
    return c;
  }

  it('REFUSES a pledge that does not reach the requirement, and writes nothing', () => {
    // Oath Of Fealty has no rule in the mocked cache, so its requirement is
    // 0 and an over-pledge is the failing direction available here.
    const c = setup();
    const res = shSwearOath(2, [{ name: 'Resources', dots: 2 }]);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('over');
    expect(c.merits[2].sworn_by).toBeUndefined();
  });

  it('REFUSES a merit the character does not own, and writes nothing', () => {
    const c = setup();
    const res = shSwearOath(2, [{ name: 'Herd', dots: 1 }]);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('not a merit this character owns');
    expect(c.merits[2].sworn_by).toBeUndefined();
  });

  it('records references by name + qualifier and never by index', () => {
    const c = setup();
    const res = shSwearOath(2, []);
    expect(res.ok).toBe(true);
    const sb = c.merits[2].sworn_by;
    expect(sb.dots_required).toBe(0);
    expect(sb.attachments).toEqual([]);
    expect(sb.history).toEqual([]);
    // No positional field of any kind on the persisted pledge.
    expect(JSON.stringify(sb)).not.toContain('index');
    expect(JSON.stringify(sb)).not.toContain('idx');
  });

  it('captures sworn_at even though nothing in OATH-A reads it back', () => {
    // ADR-010 Risk 2: chapter_number is unrecoverable after the fact and
    // OATH-B's deferred restoration is uncomputable without it, so its
    // absence must be caught here rather than in the story that needs it.
    const c = setup();
    shSwearOath(2, []);
    const sb = c.merits[2].sworn_by;
    expect(sb.sworn_at).toBeTruthy();
    expect(sb.sworn_at).toHaveProperty('chapter_number');
    expect(sb.sworn_at).toHaveProperty('iso');
    expect(sb.sworn_at.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — the INVARIANT, across every field the UI can emit
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-A AC6 — invariant: after ANY edit, owned dots >= pledged dots', () => {
  // This is a property test, not a mechanism test, and that is the point.
  //
  // Round 1 fixed the MEASUREMENT (the floor was computed from the wrong
  // contribution). Round 2 found the ENFORCEMENT was non-uniform underneath
  // it: the floor ran BEFORE the pool caps, and a cap doing
  // `val = Math.min(val, available)` could push val straight back below the
  // floor that had just been computed. Both rounds the per-case reasoning
  // was sound and the gap sat one layer below where it was aimed.
  //
  // Enumerating every field and asserting the property is what surfaces
  // that: it does not care which mechanism leaks, only that none does.
  // Several channels passed round 2 only BY ACCIDENT of whether their pool's
  // "used" helper counts the merit being edited — so a change to any
  // channel's pool maths could move the failure without touching this code.
  // The invariant catches that class; a per-field test would not.

  const FIELDS = [
    'cp', 'xp',
    'free_mci', 'free_vm', 'free_lk', 'free_inv', 'free_ohm',
    'free_pt', 'free_mdb', 'free_sw',
    'free_grants.mci', 'free_grants.inv', 'free_grants.necro',
  ];

  for (const field of FIELDS) {
    it(`holds when ${field} is driven to 0 on a pledged merit`, () => {
      // A merit whose owned rating is made up of BOTH the field under test
      // and a base, pledged at more than the base alone. Driving the field
      // to 0 must not take owned below the pledge.
      const target = { category: 'general', name: 'Resources', cp: 2, xp: 0 };
      if (field === 'cp') { target.cp = 5; }
      else if (field === 'xp') { target.xp = 3; }
      else if (field.startsWith('free_grants.')) {
        target.free_grants = { [field.slice('free_grants.'.length)]: 3 };
      } else {
        target[field] = 3;
      }

      // The pledge is sized from the merit's ACTUAL owned rating, so the
      // fixture is never already-violating before the edit. Channels
      // meritRating does not count (free_grants.necro) leave owned at the
      // base, and the invariant then holds trivially — which is the correct
      // expectation for them, not a loophole.
      const probe = mkChar([target]);
      const ownedBefore = meritRating(probe, probe.merits[0]);
      const pledge = Math.max(1, ownedBefore - 1);

      const c = mkChar([
        target,
        {
          category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
          sworn_by: buildSwornBy(pledge, [{ name: 'Resources', dots: pledge }], null),
        },
      ]);
      // Give the character generous pools so a cap cannot be the thing that
      // holds the line — the floor has to.
      c._grant_pools = [
        { source: 'X', category: 'mci', amount: 20 },
        { source: 'X', category: 'inv', amount: 20 },
        { source: 'X', category: 'necro', amount: 20 },
      ];
      stateMod.chars = [c];
      stateMod.editIdx = 0;
      stateMod.editMode = true;

      const pledged = pledgedDots(c, c.merits[0]);
      expect(pledged).toBe(pledge);

      shEditMeritPt(0, field, 0);

      const ownedAfter = meritRating(c, c.merits[0]);
      // The invariant. Channels meritRating does not count (free_grants.necro)
      // contribute 0, so owned does not move and the invariant holds
      // trivially — which is correct, not a loophole.
      expect(
        ownedAfter,
        `${field}: owned ${ownedBefore} -> ${ownedAfter}, pledged ${pledged}`
      ).toBeGreaterThanOrEqual(pledged);
    });
  }

  it('a pool cap cannot push the value back below the floor (order, not measurement)', () => {
    // The exact round-2 defect: free_inv, with an Invested pool too small to
    // fund what the merit already holds. The cap says "2", the floor says
    // "4". Floor wins on reductions, per the SM ruling: the merit ALREADY
    // holds more than the pool can fund, that over-commitment predates this
    // edit, and a reduction does not worsen it — whereas letting the cap win
    // silently voids part of a standing pledge.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 2, xp: 0, free_inv: 3 },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(4, [{ name: 'Resources', dots: 4 }], null),
      },
    ]);
    c._grant_pools = [];      // no Invested pool at all: the cap computes 0
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    expect(meritRating(c, c.merits[0])).toBe(5); // 2 cp + 3 inv
    shEditMeritPt(0, 'free_inv', 0);
    expect(meritRating(c, c.merits[0])).toBeGreaterThanOrEqual(4);
    expect(c.merits[0].free_inv).toBe(2);
  });

  it('caps still bind as UPPER bounds, with the floor simultaneously live', () => {
    // Floor is a lower bound, cap an upper bound. Making the floor win on
    // reductions must not turn it into permission to allocate dots a pool
    // does not have.
    //
    // #1111 QA round 3: the first version of this test edited
    // free_grants.necro — a channel meritRating does not sum — so
    // _ownedWithoutField always equalled _ownedNow, _floor was structurally
    // <= 0, and NO FLOOR WAS EVER PRESENT to misbehave. It passed with
    // _applyPledgeFloor disabled entirely: it proved the pool cap works in
    // isolation, which is true and is not what it is named for. I picked the
    // channel that made the test easy to write rather than the one that
    // makes it capable of failing — the same species as the defect it was
    // written to guard, one level up. A vacuous test is worse than a missing
    // one because it reads as coverage.
    //
    // So: a SUMMED channel (free_grants.mci) against a real MCI pool, with
    // the pledge sized so _floor > 0. Both bounds are live at once, and the
    // test asserts each of them separately.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 2, xp: 0, free_grants: { mci: 3 } },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(4, [{ name: 'Resources', dots: 4 }], null),
      },
    ]);
    c._grant_pools = [{ source: 'Mystery Cult Initiation', category: 'mci', amount: 6 }];
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    // owned 5 (2 cp + 3 mci), pledged 4, so clearing mci would leave 2 and
    // the floor sits at 2 — strictly positive, therefore genuinely live.
    expect(meritRating(c, c.merits[0])).toBe(5);
    expect(pledgedDots(c, c.merits[0])).toBe(4);

    // UPPER bound: an absurd request is limited by the pool, not granted.
    shEditMeritPt(0, 'free_grants.mci', 99);
    expect(c.merits[0].free_grants.mci).toBeLessThanOrEqual(6);
    expect(c.merits[0].free_grants.mci).toBeLessThan(99);

    // LOWER bound on the SAME fixture: driving it to 0 stops at the floor.
    // This is the assertion that makes the test bite — disabling
    // _applyPledgeFloor leaves mci at 0 and fails here.
    shEditMeritPt(0, 'free_grants.mci', 0);
    expect(c.merits[0].free_grants.mci).toBe(2);
    expect(meritRating(c, c.merits[0])).toBeGreaterThanOrEqual(4);
  });

  it('reports the override on the edit that triggered it', () => {
    // EDIT-TIME FEEDBACK: "the change you just made was overridden, and here
    // is why". A silent clamp is correct arithmetic and unhelpful at the
    // moment the player's input is quietly changed underneath them.
    //
    // RETRACTED RATIONALE, recorded rather than deleted because this test is
    // the first place a reader looks to learn what the note is for: an
    // earlier version of this comment said "an ST should be told rather than
    // discover it later". That claim is FALSE of this note and was retired
    // from edit.js, sheet.js and the story. The note is set only as a side
    // effect of an edit, so it cannot tell anyone about an over-commitment
    // they would otherwise discover later — a freshly loaded character shows
    // nothing. Its absence on load, and from the read-only renderer, is
    // correct for an override notice and is NOT the dual-renderer blind
    // spot.
    //
    // The standing "this character is over-committed" indicator is a
    // separate feature (render-time, both renderers, no edit required) —
    // filed as #1122, deliberately not built here.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 2, xp: 0, free_inv: 3 },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(4, [{ name: 'Resources', dots: 4 }], null),
      },
    ]);
    c._grant_pools = [];
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    shEditMeritPt(0, 'free_inv', 0);
    expect(c.merits[0]._pledgeFloorNote).toBeTruthy();
    expect(c.merits[0]._pledgeFloorNote).toContain('Oath Of Fealty');
    expect(c.merits[0]._pledgeFloorNote).toContain('4');
  });

  it('the warning is transient — underscore-prefixed so it never persists', () => {
    // Same discipline as _pledge_draft: both existing save paths strip
    // `_`-prefixed keys, so a UI note cannot reach a persisted document.
    const src = read('public/js/editor/edit.js');
    expect(src).toContain('_pledgeFloorNote');
    expect(src).not.toMatch(/\bpledgeFloorNote\b(?<!_pledgeFloorNote)/);
  });
});
