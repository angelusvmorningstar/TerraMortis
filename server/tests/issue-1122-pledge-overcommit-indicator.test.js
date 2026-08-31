/**
 * #1122 — the STANDING pledge-overcommitment indicator.
 *
 * The other half of OATH-A (#1111). `_pledgeFloorNote` is edit-time feedback
 * ("the change you just made was overridden"), so it renders only after an
 * edit set it, and only in the edit-mode renderer. Both of those are correct
 * for an override notice. What was missing is the render-time fact: a
 * character CAN sit at `pledged > owned` on a fresh load with zero edits,
 * because `_applyPledgeFloor` gates exactly one of the seven merit-write
 * paths (#1128's own finding). Nothing rendered anything about that, ever,
 * until someone happened to re-edit that exact merit.
 *
 * Two things this suite exists to prevent:
 *
 *  1. **The single-renderer blind spot.** `shRenderGeneralMerits` has an
 *     edit-mode branch and a view-mode branch computing the same rows. Every
 *     assertion below is made against BOTH rendered HTML strings, per the
 *     `renderBoth()` pattern `oath-a-render-and-gate.test.js` established.
 *  2. **Tone drift.** Angelus's ruling (settled before the story was written):
 *     an over-committed pool is a WARNING, not an error — the data is legal.
 *     The indicator must stay on `.dom-cap-warn`/`--warn-dk` and must never
 *     reach for the `--err`/`.rel-error` family.
 *
 * Assertions are made against RENDERED HTML, not a source regex — the
 * discipline #1128 set for exactly this renderer.
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
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let shRenderGeneralMerits;
let meritRating;
let buildSwornBy;
let stateMod;
let loadRulesMod;

beforeAll(async () => {
  const helpers = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'rules-helpers.js')).href);
  ({ buildSwornBy } = helpers);
  ({ shRenderGeneralMerits } = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href));
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
    _id: 'c-1122',
    name: 'Testudo',
    clan: 'Ventrue',
    covenant: 'Invictus',
    blood_potency: 2,
    status: { city: 0, clan: 1, covenant: { Invictus: 3 } },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

/**
 * The AC6 control from `oath-a-render-and-gate.test.js`, verbatim in shape:
 * every pledge is fully covered by the merit's own dots. Nothing here is
 * over-committed, so the indicator must stay silent.
 */
function swornFixture() {
  return mkChar([
    { category: 'general', name: 'Resources', cp: 3, xp: 0 },
    { category: 'general', name: 'Contacts', qualifier: 'Police', cp: 2, xp: 0 },
    { category: 'general', name: 'Striking Looks', cp: 2, xp: 0 },
    {
      category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
      sworn_by: buildSwornBy(3, [
        { name: 'Resources', dots: 2 },
        { name: 'Contacts', qualifier: 'Police', dots: 1 },
      ], { chapter_number: 4, iso: '2026-08-07' }),
    },
  ]);
}

/**
 * AC3's fixture: an over-committed character built by DIRECT CONSTRUCTION,
 * with `shEditMeritPt`/`_applyPledgeFloor` never invoked. This models one of
 * the six ungated merit-write paths #1128 named — Resources holds 1 dot while
 * a standing oath pledges 3 against it. This is not a test-only shape; it is
 * exactly the state those paths produce on a real character today.
 */
function overcommittedFixture() {
  return mkChar([
    { category: 'general', name: 'Resources', cp: 1, xp: 0 },
    { category: 'general', name: 'Striking Looks', cp: 2, xp: 0 },
    {
      category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
      sworn_by: buildSwornBy(3, [{ name: 'Resources', dots: 3 }], { chapter_number: 4, iso: '2026-08-07' }),
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

// The phrase that identifies the new indicator specifically. Deliberately NOT
// "Pledged N" — `_pledgeBadge` already emits that on every pledged merit in
// both renderers, so a substring match on it would not discriminate.
const MARKER = /pool funds/g;

// ─────────────────────────────────────────────────────────────────────────────
// AC 2 / AC 3 — the indicator, render-time, in BOTH renderers
// ─────────────────────────────────────────────────────────────────────────────

describe('#1122 AC3 — a freshly loaded, never-edited over-committed character shows it', () => {
  it('EDIT MODE renders the indicator with zero prior edits', () => {
    const { edit } = renderBoth(overcommittedFixture());
    expect(edit).toMatch(MARKER);
    expect(edit).toContain('Pledged 3, pool funds 1');
    expect(edit).toContain('2 dots short against Oath Of Fealty');
  });

  it('VIEW MODE renders the same indicator — not just edit mode', () => {
    const { view } = renderBoth(overcommittedFixture());
    expect(view).toMatch(MARKER);
    expect(view).toContain('Pledged 3, pool funds 1');
    expect(view).toContain('2 dots short against Oath Of Fealty');
  });

  it('no edit has been run, so _pledgeFloorNote is absent — the two are independent', () => {
    // Proves the indicator is render-time derived rather than riding on the
    // edit-time note. If it were the latter, this fixture would show nothing.
    const c = overcommittedFixture();
    expect(c.merits[0]._pledgeFloorNote).toBeUndefined();
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) expect(html).toMatch(MARKER);
  });

  it('singularises correctly when exactly one dot short', () => {
    const c = overcommittedFixture();
    c.merits[0].cp = 2; // owned 2, pledged 3
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) {
      expect(html).toContain('1 dot short against');
      expect(html).not.toContain('1 dots short');
    }
  });

  it('fires on a granted merit sub-branch too, in both renderers', () => {
    // The edit-mode and view-mode branches EACH fork again on `granted_by`.
    // Four call sites, not two — wiring the plain sub-branch and missing the
    // granted one is the same blind spot one level down.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 1, xp: 0, granted_by: 'Mystery Cult Initiation' },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(3, [{ name: 'Resources', dots: 3 }], null),
      },
    ]);
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) {
      expect(html).toMatch(MARKER);
      expect(html).toContain('Pledged 3, pool funds 1');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — only `pledged > owned` trips it
// ─────────────────────────────────────────────────────────────────────────────

describe('#1122 AC6 — a fully covered pledge renders nothing new', () => {
  it('the OATH-A control fixture stays silent in BOTH renderers', () => {
    const c = swornFixture();
    // Sanity: the fixture really is covered, so the silence means something.
    expect(meritRating(c, c.merits[0])).toBe(3); // Resources, 2 pledged
    expect(meritRating(c, c.merits[1])).toBe(2); // Contacts, 1 pledged
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) expect(html).not.toMatch(MARKER);
  });

  it('pledged === owned is NOT over-committed (boundary, both renderers)', () => {
    const c = overcommittedFixture();
    c.merits[0].cp = 3; // owned 3, pledged 3
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) expect(html).not.toMatch(MARKER);
  });

  it('a character with no oath at all renders nothing, in both renderers', () => {
    const { edit, view } = renderBoth(mkChar([
      { category: 'general', name: 'Resources', cp: 1, xp: 0 },
    ]));
    expect(edit).not.toMatch(MARKER);
    expect(view).not.toMatch(MARKER);
  });

  it('an UNPLEDGED merit on an over-committed character carries no indicator', () => {
    // Counted, not checked for absence: the character as a whole DOES show the
    // indicator, so a global `not.toContain` would prove nothing about which
    // merit row it landed on. Exactly one occurrence means exactly one row.
    const { edit, view } = renderBoth(overcommittedFixture());
    for (const html of [edit, view]) {
      expect((html.match(MARKER) || []).length).toBe(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 1 — the summed pledge, across oaths
// ─────────────────────────────────────────────────────────────────────────────

describe('#1122 AC1 — multiple oaths against one merit sum, per buildPledgeIndex', () => {
  it('reports the SUMMED pledge, once, not one notice per oath', () => {
    const c = overcommittedFixture();
    c.merits[0].cp = 2; // owned 2
    c.merits.push({
      category: 'general', name: 'Oath Of Abstinence', cp: 0,
      sworn_by: buildSwornBy(2, [{ name: 'Resources', dots: 2 }], null),
    });
    // 3 (Fealty) + 2 (Abstinence) = 5 pledged against 2 owned.
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) {
      expect(html).toContain('Pledged 5, pool funds 2');
      expect(html).toContain('3 dots short against Oath Of Fealty, Oath Of Abstinence');
      expect((html.match(MARKER) || []).length).toBe(1);
    }
  });

  it('counts free_grants channels as owned, the same way meritRating does', () => {
    // ADR-010 D1b: the pledge family measures OWNED dots via meritRating,
    // which sums ten free_* channels. An indicator that only read cp + xp
    // would cry over-commitment on a perfectly funded MCI-granted merit.
    const c = mkChar([
      { category: 'general', name: 'Resources', cp: 1, xp: 0, free_grants: { mci: 2 } },
      {
        category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
        sworn_by: buildSwornBy(3, [{ name: 'Resources', dots: 3 }], null),
      },
    ]);
    expect(meritRating(c, c.merits[0])).toBe(3);
    const { edit, view } = renderBoth(c);
    for (const html of [edit, view]) expect(html).not.toMatch(MARKER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 4 — warning tone, not error tone (Angelus's ruling)
// ─────────────────────────────────────────────────────────────────────────────

describe('#1122 AC4 — warning tone, never error tone', () => {
  it('renders on .dom-cap-warn and introduces no --err-family class', () => {
    const { edit, view } = renderBoth(overcommittedFixture());
    for (const html of [edit, view]) {
      expect(html).toContain('<div class="dom-cap-warn">');
      expect(html).not.toContain('rel-error');
      expect(html).not.toContain('sh-touchstones-error');
      expect(html).not.toContain('rel-disp');
      expect(html).not.toContain('var(--err)');
    }
  });

  it('carries the same warning glyph _pledgeFloorNote uses', () => {
    const { edit, view } = renderBoth(overcommittedFixture());
    for (const html of [edit, view]) expect(html).toContain('⚠ Pledged 3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 7 — nothing is persisted
// ─────────────────────────────────────────────────────────────────────────────

describe('#1122 AC7 — the indicator writes nothing onto the merit', () => {
  it('a render leaves the merit rows byte-identical to what went in', () => {
    // Unlike `_pledgeFloorNote` (which sets `m._pledgeFloorNote` and relies on
    // both save paths stripping it), this indicator is pure. There is nothing
    // for a save path to strip, and that is asserted rather than asserted-of.
    const c = overcommittedFixture();
    const before = JSON.stringify(c.merits);
    renderBoth(c);
    expect(JSON.stringify(c.merits)).toBe(before);
  });

  it('adds no underscore-prefixed key to the pledged merit', () => {
    const c = overcommittedFixture();
    const keysBefore = Object.keys(c.merits[0]).sort();
    renderBoth(c);
    expect(Object.keys(c.merits[0]).sort()).toEqual(keysBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 5 — distinguishable from _pledgeFloorNote, and able to co-render with it
// ─────────────────────────────────────────────────────────────────────────────

describe('#1122 AC5 — separate from _pledgeFloorNote, not merged with it', () => {
  it('the two notices say different things and can co-render on one row', () => {
    // Not mutually exclusive — see the story's Dev Notes. `_pledgeFloorNote`
    // is set by the most recent edit and lives in memory until the next edit
    // on that merit's fields or a fresh load; the over-commitment indicator is
    // independently derived from current state on every render. A floor note
    // left over from an earlier edit plus a LATER ungated write dropping the
    // merit below its pledge produces both at once, legitimately.
    const c = overcommittedFixture();
    c.merits[0]._pledgeFloorNote = 'Held at 3 dots - 3 pledged to Oath Of Fealty. The pool cannot fund what is already sworn.';
    const { edit } = renderBoth(c);
    expect(edit).toContain('Held at 3 dots');          // the edit-time note
    expect(edit).toContain('Pledged 3, pool funds 1'); // the standing indicator
    expect((edit.match(/dom-cap-warn/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('the edit-time note alone does NOT produce the standing indicator', () => {
    // Proves they are genuinely separate functions rather than one reused.
    const c = swornFixture(); // fully covered: no over-commitment
    c.merits[0]._pledgeFloorNote = 'Held at 2 dots - 2 pledged to Oath Of Fealty.';
    const { edit } = renderBoth(c);
    expect(edit).toContain('Held at 2 dots');
    expect(edit).not.toMatch(MARKER);
  });
});
