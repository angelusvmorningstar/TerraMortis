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
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let shRenderGeneralMerits;
let shEditMeritPt;
let shSwearOath;
let meritRating;
let buildSwornBy;
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
  ({ buildSwornBy } = helpers);
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
