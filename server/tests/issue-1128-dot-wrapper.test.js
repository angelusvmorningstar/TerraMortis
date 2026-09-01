/**
 * issue #1128 — the `trait-dots` wrapper leaked into six small-type dot
 * containers.
 *
 * OATH-B (#1111) funnelled every merit-dot display through `shDotsSuspended`,
 * which delegates to `shDotsMixed`, which wraps its glyphs in
 * `<span class="trait-dots">` (`components.css:838`, `font-size:15px;
 * letter-spacing:2.5px`). Six call sites sit inside containers that style
 * their OWN dots — `.infl-dots-derived` (a fixed 60px column),
 * `.contacts-edit-hdr`, `.dom-contrib-lbl` — and silently inherited full-size
 * trait-row styling. Dot COUNTS were correct everywhere; only presentation
 * broke, which is exactly why OATH-B's AC7 sweep missed it: that sweep
 * asserted rendered output by COUNTING `●` and `○` characters, and a wrapper
 * change is invisible to a glyph count.
 *
 * So this suite deliberately does NOT count glyphs. It asserts:
 *   1. the CONTENTS of each container, byte-for-byte, against strings
 *      captured from `origin/main` (which never carried the regression);
 *   2. that no `class="trait-dots"` appears inside any of the three
 *      small-type containers;
 *   3. that a suspension still reaches all six of them;
 *   4. a source-level CENSUS of every `shDotsSuspended` / `shDotsSuspendedPlain`
 *      call site, so a thirteenth site cannot be added without a decision.
 */

// Browser shims — sheet.js transitively pulls api.js's `location` reference.
// Must be set BEFORE the vitest import. Same pattern as
// `oath-b-suspension.test.js` / `collective-2-compound-generalisation.test.js`.
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

let H;
let shRenderInfluenceMerits, shRenderDomainMerits, shRenderStandingMerits, shRenderGeneralMerits;
let stateMod, loadRulesMod;

function ruleCache(grants) {
  return {
    rule_grant: grants,
    rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  };
}

beforeAll(async () => {
  const u = (...p) => pathToFileURL(path.resolve(REPO_ROOT, ...p)).href;
  H = await import(u('public', 'js', 'data', 'rules-helpers.js'));
  ({ shRenderInfluenceMerits, shRenderDomainMerits, shRenderStandingMerits, shRenderGeneralMerits } =
    await import(u('public', 'js', 'editor', 'sheet.js')));
  stateMod = (await import(u('public', 'js', 'data', 'state.js'))).default;
  loadRulesMod = await import(u('public', 'js', 'editor', 'rule_engine', 'load-rules.js'));
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue(ruleCache([]));
});

// ─────────────────────────────────────────────────────────────────────────────
// Container extraction — tag-balanced, because the DEFECT is a nested span
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inner HTML of every `<tag class="cls">…</tag>` block, counting nesting.
 *
 * A non-greedy `/<span class="x">(.*?)<\/span>/` would stop at the INNER
 * `</span>` of the very wrapper this suite exists to detect, silently
 * truncating the thing under test. Hence the depth counter.
 */
function grab(html, tag, cls) {
  const out = [];
  const open = `<${tag} class="${cls}"`;
  let i = 0;
  while ((i = html.indexOf(open, i)) !== -1) {
    const start = html.indexOf('>', i) + 1;
    let depth = 1, j = start;
    const reOpen = new RegExp(`<${tag}\\b`, 'g');
    const reClose = new RegExp(`</${tag}>`, 'g');
    while (depth > 0) {
      reOpen.lastIndex = j; reClose.lastIndex = j;
      const mo = reOpen.exec(html), mc = reClose.exec(html);
      if (!mc) break;
      if (mo && mo.index < mc.index) { depth++; j = mo.index + 1; }
      else { depth--; j = mc.index + `</${tag}>`.length; if (depth === 0) out.push(html.slice(start, mc.index)); }
    }
    i = start;
  }
  return out;
}

function mkChar(merits) {
  return {
    _id: 'c-1128', name: 'Baseline Bella', clan: 'Ventrue', covenant: 'Invictus',
    blood_potency: 2, status: { city: 0, clan: 1, covenant: { Invictus: 3 } },
    attributes: {}, skills: {}, disciplines: {}, powers: [], merits,
  };
}

/** Put `c` in state in edit mode and return the four merit-section renders. */
function renderEdit(c) {
  stateMod.chars = [c];
  stateMod.editIdx = 0;
  stateMod.editMode = true;
  return {
    infl: shRenderInfluenceMerits(c, true),
    dom: shRenderDomainMerits(c, true),
    stand: shRenderStandingMerits(c, true),
    gen: shRenderGeneralMerits(c, true),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The golden baseline (AC1 / AC8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The no-oath fixture. One character reaching all six regressed sites:
 *
 *   Allies                  influence, non-Contacts  -> `.infl-dots-derived`
 *   Contacts                influence aggregate hdr  -> `.contacts-edit-hdr`
 *   Herd                    domain, normal branch    -> `.dom-contrib-lbl`
 *   Oath of the Scapegoat   standing, plain branch   -> `.infl-dots-derived`
 *   Danger Sense            general, granted_by      -> `.infl-dots-derived`
 *   Resources               general, plain branch    -> `.infl-dots-derived`
 */
function noOathChar() {
  return mkChar([
    { category: 'influence', name: 'Allies', area: 'Police', cp: 3, xp: 0, bonus: 0, free_grants: { mci: 2 } },
    { category: 'influence', name: 'Contacts', cp: 2, xp: 0, rating: 4, spheres: ['Police', 'Press', 'Legal', 'Medical'] },
    { category: 'domain', name: 'Herd', cp: 3, xp: 0, bonus: 1 },
    { category: 'standing', name: 'Oath of the Scapegoat', cp: 2, xp: 0, free_mci: 1 },
    { category: 'general', name: 'Danger Sense', cp: 0, xp: 0, granted_by: 'Mystery Cult Initiation', free_grants: { mci: 2 } },
    { category: 'general', name: 'Resources', cp: 5, xp: 0, bonus: 0 },
  ]);
}

/**
 * Captured ONCE from `git archive origin/main public`, rendered through
 * `origin/main`'s own module tree with the fixture above (story T2,
 * 2026-08-11). `main` has never carried #1111, so this IS the pre-regression
 * output.
 *
 * Committed as constants deliberately: a `git show origin/main` at test time
 * would rot the moment `main` moves, and would quietly start comparing the
 * fix against itself once this branch merges.
 */
const MAIN_GOLDEN = {
  'infl .infl-dots-derived':  ['●●●○○'],
  'infl .contacts-edit-hdr':  ['Contacts ●●○○'],
  'dom .dom-contrib-lbl':     ['My dots: ●●●○'],
  'stand .infl-dots-derived': ['●●○'],
  'gen .infl-dots-derived':   ['○○', '●●●●●'],
};

function capture(c) {
  const r = renderEdit(c);
  return {
    'infl .infl-dots-derived':  grab(r.infl, 'span', 'infl-dots-derived'),
    'infl .contacts-edit-hdr':  grab(r.infl, 'div', 'contacts-edit-hdr'),
    'dom .dom-contrib-lbl':     grab(r.dom, 'span', 'dom-contrib-lbl'),
    'stand .infl-dots-derived': grab(r.stand, 'span', 'infl-dots-derived'),
    'gen .infl-dots-derived':   grab(r.gen, 'span', 'infl-dots-derived'),
  };
}

describe('#1128 AC1 — the six containers are byte-identical to origin/main', () => {
  it('every container matches its main-captured golden string exactly', () => {
    expect(capture(noOathChar())).toEqual(MAIN_GOLDEN);
  });

  for (const key of Object.keys(MAIN_GOLDEN)) {
    it(`${key} carries no element wrapper of any kind`, () => {
      for (const contents of capture(noOathChar())[key]) {
        expect(contents).not.toContain('<');
        expect(contents).not.toContain('trait-dots');
      }
    });
  }

  it('no .trait-dots span survives anywhere inside the three small-type containers', () => {
    // The property, stated once over the whole render rather than per site,
    // so a SEVENTH small-type row added later is covered without editing
    // this test.
    const r = renderEdit(noOathChar());
    const all = [
      ...grab(r.infl, 'span', 'infl-dots-derived'), ...grab(r.infl, 'div', 'contacts-edit-hdr'),
      ...grab(r.dom, 'span', 'dom-contrib-lbl'),
      ...grab(r.stand, 'span', 'infl-dots-derived'),
      ...grab(r.gen, 'span', 'infl-dots-derived'),
    ];
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const contents of all) expect(contents).not.toContain('trait-dots');
  });

  it('a merit with zero effective dots still renders the empty string, as main does', () => {
    // `shDotsMixed` returns '' for 0/0 and main's bare `repeat(0)+repeat(0)`
    // is also ''. The plain variant must preserve that or every zero-dot row
    // gains a stray glyph run.
    const c = mkChar([{ category: 'general', name: 'Resources', cp: 0, xp: 0 }]);
    expect(grab(renderEdit(c).gen, 'span', 'infl-dots-derived')).toEqual(['']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — the 60px column fits five dots
// ─────────────────────────────────────────────────────────────────────────────

describe('#1128 AC4 — .infl-dots-derived holds five dots at its own type size', () => {
  it('five effective dots are five bare glyphs, no wider than main', () => {
    // The overflow was caused by 15px/2.5px-tracked glyphs from .trait-dots
    // inside a 60px column. The measurable proxy in a non-DOM test is that
    // the column's content is the bare glyph run main emitted, with nothing
    // imposing a font-size on it.
    const c = mkChar([{ category: 'influence', name: 'Resources', cp: 5, xp: 0 }]);
    const [dots] = grab(renderEdit(c).infl, 'span', 'infl-dots-derived');
    expect(dots).toBe('●●●●●');
    expect(dots).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — a suspension still reaches all six containers
// ─────────────────────────────────────────────────────────────────────────────

/** An oath merit pledging `dots` against `target`, already broken. */
function brokenOath(target, dots, qualifier = null) {
  return {
    category: 'general', name: 'Oath Of Fealty', cp: 0, xp: 0,
    sworn_by: {
      dots_required: dots,
      attachments: [{ name: target, qualifier, dots }],
      sworn_at: { chapter_number: 1, iso: '2026-08-07' },
      history: [{ event: 'exited', reason: 'broken', chapter_number: 4, at: '2026-08-07' }],
    },
  };
}

/**
 * The dot run inside a container's contents. Containers legitimately carry
 * other text — the Contacts header appends " — <span class='inf-val'>N</span>
 * inf", the domain label prefixes "My dots: " — and AC2 is about the BANDS,
 * not about the surrounding copy. Byte-identity of the whole container is
 * AC1's job, asserted above against the main-captured goldens.
 */
function dotRun(contents) {
  const m = contents.match(/[●○]+/);
  return m ? m[0] : '';
}

describe('#1128 AC2 — suspension reaches every one of the six repointed sites', () => {
  // Solid shrinks by exactly the suspended count; the hollow band does not
  // move. Asserted per CONTAINER rather than as a whole-render glyph tally,
  // because a tally over a whole section cannot tell which row lost the dots.
  const CASES = [
    {
      label: 'influence edit row (.infl-dots-derived)',
      merit: { category: 'influence', name: 'Allies', area: 'Police', cp: 4, xp: 0, free_grants: { mci: 2 } },
      section: 'infl', tag: 'span', cls: 'infl-dots-derived',
      unsuspended: '●●●●○○', suspended: '●●○○', pledge: 2,
    },
    {
      label: 'Contacts edit header (.contacts-edit-hdr)',
      merit: { category: 'influence', name: 'Contacts', cp: 3, xp: 0, rating: 5, spheres: ['Police', 'Press', 'Legal', 'Medical', 'Street'] },
      section: 'infl', tag: 'div', cls: 'contacts-edit-hdr',
      unsuspended: '●●●○○', suspended: '●○○', pledge: 2,
    },
    {
      label: 'domain "My dots:" (.dom-contrib-lbl)',
      merit: { category: 'domain', name: 'Herd', cp: 4, xp: 0, bonus: 1 },
      section: 'dom', tag: 'span', cls: 'dom-contrib-lbl',
      unsuspended: '●●●●○', suspended: '●●○', pledge: 2,
    },
    {
      label: 'standing edit row (.infl-dots-derived)',
      merit: { category: 'standing', name: 'Oath of the Scapegoat', cp: 4, xp: 0, free_mci: 1 },
      section: 'stand', tag: 'span', cls: 'infl-dots-derived',
      unsuspended: '●●●●○', suspended: '●●○', pledge: 2,
    },
    {
      label: 'general granted row (.infl-dots-derived)',
      merit: { category: 'general', name: 'Danger Sense', cp: 4, xp: 0, granted_by: 'Mystery Cult Initiation', free_grants: { mci: 1 } },
      section: 'gen', tag: 'span', cls: 'infl-dots-derived',
      unsuspended: '●●●●○', suspended: '●●○', pledge: 2,
    },
    {
      label: 'general edit row (.infl-dots-derived)',
      merit: { category: 'general', name: 'Resources', cp: 4, xp: 0, bonus: 1 },
      section: 'gen', tag: 'span', cls: 'infl-dots-derived',
      unsuspended: '●●●●○', suspended: '●●○', pledge: 2,
    },
  ];

  for (const t of CASES) {
    it(`${t.label}: the solid band shrinks by the pledge, the hollow band does not`, () => {
      const clean = mkChar([{ ...t.merit }]);
      const before = grab(renderEdit(clean)[t.section], t.tag, t.cls).map(dotRun).filter(Boolean);
      expect(before).toContain(t.unsuspended);

      const pledged = mkChar([{ ...t.merit }, brokenOath(t.merit.name, t.pledge, t.merit.qualifier || null)]);
      H.applySuspensions(pledged);
      expect(pledged.merits[0]._suspended_dots).toBe(t.pledge);

      const rendered = grab(renderEdit(pledged)[t.section], t.tag, t.cls);
      const after = rendered.map(dotRun).filter(Boolean);
      expect(after).toContain(t.suspended);
      // Still bare — a suspension must not reintroduce the wrapper.
      for (const contents of rendered) expect(contents).not.toContain('trait-dots');

      // The hollow band is identical before and after; only solids were lost.
      const hollows = s => (s.match(/○/g) || []).length;
      expect(hollows(t.suspended)).toBe(hollows(t.unsuspended));
      const solids = s => (s.match(/●/g) || []).length;
      expect(solids(t.unsuspended) - solids(t.suspended)).toBe(t.pledge);
    });
  }

  it('the suspension arithmetic exists in exactly ONE place', () => {
    // OATH-B's whole design is one seam deciding what a suspension looks
    // like. Two copies of the floor-and-subtract is the regression this fix
    // must not introduce while adding a second OUTPUT shape.
    const src = codeLines();   // comment prose must not inflate the count
    const copies = (src.match(/Math\.max\(0,\s*purchased\s*-\s*n\)/g) || []).length;
    expect(copies, 'the purchased-minus-suspended floor must appear once').toBe(1);
    expect(src).toContain('function _shSuspendBands(');
    expect(src).toContain('function _shDotGlyphs(');
    // And the glyph run is generated in one place, so wrapped and plain can
    // never disagree about what a dot is.
    // sheet.js writes the glyphs as \u escapes; accept either spelling.
    const glyphRuns = (src.match(/(?:'●'|'\\u25CF')\.repeat\(purchased\)/g) || []).length;
    expect(glyphRuns, 'the solid-band glyph run must be generated once').toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — the domain table's two adjacent branches agree
// ─────────────────────────────────────────────────────────────────────────────

const NECRO_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  category: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 },
};

describe('#1128 AC3 — both domain "My dots:" branches render bare', () => {
  it('compound-target and normal rows agree on the shape of .dom-contrib-lbl', () => {
    // sheet.js has two adjacent branches emitting `.dom-contrib-lbl`: the
    // compound-target branch always emitted a bare `'●'.repeat(_cmpOwn)`,
    // while the normal branch went through the wrapper. Side by side in the
    // same table, that rendered two different dot sizes one row apart.
    loadRulesMod.getRulesCache.mockReturnValue(ruleCache([NECRO_GRANT]));
    try {
      const c = mkChar([
        { category: 'domain', name: 'Necropolis Sepulcher', cp: 2, xp: 0 },
        { category: 'domain', name: 'Catacombs', cp: 0, xp: 0, free_grants: { necro: 2 } },
        { category: 'domain', name: 'Herd', cp: 2, xp: 0 },
      ]);
      const labels = grab(renderEdit(c).dom, 'span', 'dom-contrib-lbl');
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const l of labels) {
        expect(l).toMatch(/^My dots: [●○]*$/);
        expect(l).not.toContain('<');
      }
    } finally {
      loadRulesMod.getRulesCache.mockReturnValue(ruleCache([]));
    }
  });

  it('.dom-total-lbl keeps its .trait-dots span — pre-existing on main, out of scope', () => {
    // AC7's boundary, asserted so a later tidy-up does not "finish the job"
    // and change a row this story deliberately left alone. main:1107 already
    // built `_totalDots` with shDotsMixed.
    const src = read('public/js/editor/sheet.js');
    expect(src).toContain('const _totalDots = shDotsMixed(');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — the call-site census
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WHY THIS TEST EXISTS — do not delete it as a tautology.
 *
 * The GitHub issue's own table listed ELEVEN call sites and never named the
 * twelfth (`shDotsSuspended(purch, bon, …)` in the general VIEW branch). An
 * audit done by hand missed a site; the fix would then have been declared
 * complete with one row still wrong. This census is the cheapest guard that
 * survives the next person adding a seventh small-type row: it fails on a
 * thirteenth site, and it fails if a site changes bucket.
 *
 * Bucket A = containers that style their own dots -> MUST be the plain variant.
 * Bucket B = `.trait-right` / `.dom-total-lbl` -> MUST stay wrapped.
 */
const BUCKET_A = [
  'shDotsSuspendedPlain(_iPurch, Math.max(0, dd + (m.bonus || 0) - _iPurch), shSuspendedOf(m))',
  'shDotsSuspendedPlain(baseDots, Math.max(0, rating - baseDots), shSuspendedOf(contactsEntry))',
  'shDotsSuspendedPlain(_dPurch, Math.max(0, dd + (m.bonus || 0) - _dPurch), shSuspendedOf(m))',
  'shDotsSuspendedPlain(_stPurch, Math.max(0, dd - _stPurch), shSuspendedOf(m))',
  'shDotsSuspendedPlain(_gPurch, Math.max(0, dd - _gPurch), shSuspendedOf(m))',
  'shDotsSuspendedPlain(_gPurch, Math.max(0, dd + _mBonus - _gPurch), shSuspendedOf(m))',
];

const BUCKET_B = [
  // 2026-09-01 general audit fix: these two gained a 4th (opts) argument so
  // an active st_mod on merits.N.bonus recolours the specific modded dot
  // in place instead of baking silently into the hollow-dot count (same
  // #408 shape as attributes/skills, previously missing for these two
  // categories). Still Bucket B — still wrapped, still unchanged shape
  // otherwise, so this census entry is updated, not removed.
  'shDotsSuspended(iPurch, iBon, shSuspendedOf(m), _inflOpts)',
  'shDotsSuspended(cPurch, cBon, totalSusp)',
  'shDotsSuspended(_cmpOwn, _cmpPartner, shSuspendedOf(m))',
  'shDotsSuspended(_own, _partner, shSuspendedOf(m))',
  'shDotsSuspended(_stPurch, Math.max(0, (m.rating || 0) - _stPurch), shSuspendedOf(m))',
  'shDotsSuspended(purch, bon, shSuspendedOf(m), _genOpts)',
];

/** sheet.js source with comment-only lines removed, so prose cannot inflate a count. */
function codeLines() {
  return read('public/js/editor/sheet.js')
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
    })
    .join('\n');
}

describe('#1128 AC5 — every call site is accounted for, by name', () => {
  it('the census is exactly 12: 6 plain, 6 wrapped', () => {
    const code = codeLines();
    const plainCalls = (code.match(/shDotsSuspendedPlain\(/g) || []).length - 1;   // less the declaration
    const wrappedCalls = (code.match(/shDotsSuspended\(/g) || []).length - 1;      // less the declaration
    expect(code).toContain('function shDotsSuspendedPlain(');
    expect(code).toContain('function shDotsSuspended(');
    expect(plainCalls, 'Bucket A call sites').toBe(6);
    expect(wrappedCalls, 'Bucket B call sites').toBe(6);
    expect(plainCalls + wrappedCalls, 'total shDotsSuspended* call sites').toBe(12);
  });

  for (const site of BUCKET_A) {
    it(`Bucket A (bare glyphs): ${site.slice(0, 58)}…`, () => {
      expect(codeLines()).toContain(site);
    });
  }

  for (const site of BUCKET_B) {
    it(`Bucket B (wrapped, unchanged): ${site.slice(0, 58)}…`, () => {
      expect(codeLines()).toContain(site);
    });
  }

  it('no Bucket A site is still routed through the wrapped entry point', () => {
    const code = codeLines();
    for (const site of BUCKET_A) {
      expect(code, 'a Bucket A site regressed to the wrapped variant')
        .not.toContain(site.replace('shDotsSuspendedPlain(', 'shDotsSuspended('));
    }
  });

  it('AC6 — the fix added no CSS: .trait-dots is still declared exactly once', () => {
    // Route (b) (a nested `.infl-dots-derived .trait-dots` override) was
    // rejected: it has no precedent anywhere in the CSS tree, and it could
    // not satisfy AC1 because the wrapper element would still be in the DOM.
    const css = read('public/css/components.css');
    expect((css.match(/^\.trait-dots\b/gm) || []).length).toBe(1);
    expect(css).not.toContain('.infl-dots-derived .trait-dots');
    expect(css).not.toContain('.contacts-edit-hdr .trait-dots');
    expect(css).not.toContain('.dom-contrib-lbl .trait-dots');
  });
});
