/**
 * N-7b (issue #768) — Necropolis target merit input suppression.
 *
 * Pool-funded-only contract per Peter's 2026-06-16 option 3: rows whose merit
 * is in `_necroTargets` (Catacombs / Caldarium / Garbage Pit / Labyrinth
 * Guardians / Dark Temple / White Ants) hide CP / XP / MCI / Bonus inputs
 * categorically — by merit name, regardless of Sepulcher ownership. The
 * NECRO stepper is the only allocation surface.
 *
 * Tests are behavioural per `feedback_render_wiring_placement` — actually
 * call `shRenderDomainMerits` and assert what the HTML contains / lacks.
 * Static-analysis sanity guards at the bottom catch reverts of the call-site
 * shape; the behavioural cases catch placement / regression.
 */

// Browser shims — sheet.js transitively pulls api.js's `location` reference.
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

let shRenderDomainMerits;
let stateMod;
let loadRulesMod;

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);

  const ruleCache = {
    rule_grant: [{
      source: 'Necropolis Sepulcher',
      source_slug: 'necro',
      grant_type: 'pool',
      pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
      category: 'necro',
    }],
    rule_nine_again: [],
    rule_skill_bonus: [],
    rule_speciality_grant: [],
    rule_tier_budget: [],
    rule_disc_attr: [],
    rule_derived_stat_modifier: [],
  };
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue(ruleCache);
});

function mkChar(overrides = {}) {
  return {
    _id: 'n7b-test',
    name: 'N7b Test',
    clan: 'Nosferatu',
    covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits: [],
    _grant_pools: [],
    ...overrides,
  };
}

// Markers for what we want present / absent in the row's bd-row block. The
// merit-bd-row container is one HTML chunk per merit so we can slice the
// returned HTML by the row's data signal (the onchange writing `shEditMeritPt(
// ${rIdx},` etc.) and assert against just that row.
function sliceRowFor(html, realIdx) {
  // The bd-row block for a given realIdx contains onchange="shEditMeritPt(<realIdx>,...".
  // Anchor on the first occurrence and capture until the closing </div> after
  // the bd-eq span. Cheap-and-cheerful — sufficient for assertion granularity.
  const start = html.indexOf('class="merit-bd-row"');
  if (start === -1) return '';
  // Use the next `<div class="merit-list">` or `<div class="dom-edit-block"` as the loose end-marker.
  // For our purposes the row will always include the bd-row + the bd-eq closer.
  // To keep the implementation simple, scope on the FIRST bd-row in the
  // returned HTML — tests construct chars with one Necropolis target each,
  // so there's no ambiguity.
  void realIdx;
  const endHint = html.indexOf('attr-derived-row', start);
  const stop = endHint === -1 ? html.indexOf('</div></div>', start) : endHint;
  return html.slice(start, stop + 'attr-derived-row'.length);
}

describe('N-7b — Necropolis target input suppression (behavioural)', () => {
  it('Catacombs row hides CP / XP / MCI / Bonus and keeps only NECRO', () => {
    const c = mkChar({
      merits: [
        { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
        { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      ],
      _grant_pools: [{ source: 'Necropolis Sepulcher', category: 'necro', amount: 3, names: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'] }],
    });
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);

    // Positive — NECRO stepper present + writes to the map.
    expect(html).toContain('NECRO');
    expect(html).toContain('free_grants.necro');

    // Negative — CP / XP inputs and Bonus row are absent on the Catacombs
    // row. shEditMeritPt(0,'cp',...) and shEditMeritPt(0,'xp',...) would
    // appear if the inputs rendered (realIdx 1 is Catacombs; we check the
    // row's specific input strings).
    expect(html).not.toContain("shEditMeritPt(1,'cp'");
    expect(html).not.toContain("shEditMeritPt(1,'xp'");
    // The Bonus row's onchange string identifies it uniquely.
    expect(html).not.toContain("shAdjMeritBonus(1,");
    // MCI input on this row is suppressed too. The MCI onchange uses
    // free_grants.mci as the write path — that string must NOT appear
    // alongside the Catacombs row's idx. Since shRenderDomainMerits returns
    // only domain merits and the only one here is Catacombs, the entire
    // returned HTML must not contain a free_grants.mci.
    expect(html).not.toContain('free_grants.mci');
  });

  it('regression — Haven row still shows CP / XP / Bonus (suppression only fires on Necropolis targets)', () => {
    const c = mkChar({
      merits: [
        { name: 'Safe Place', category: 'domain', cp: 1, xp: 0, qualifier: 'Penthouse' },
        { name: 'Haven', category: 'domain', cp: 1, xp: 0, attached_to: 'Safe Place (Penthouse)' },
      ],
    });
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);
    // Haven is NOT a Necropolis target — CP / XP / Bonus must still render.
    expect(html).toContain("shEditMeritPt(1,'cp'");
    expect(html).toContain("shEditMeritPt(1,'xp'");
    expect(html).toContain('shAdjMeritBonus(1');
    // And no NECRO stepper on Haven (it's a non-Necropolis domain merit
    // even if the character lacked Sepulcher entirely).
    expect(html).not.toContain('NECRO');
  });

  it('non-Sepulcher character with a stray Catacombs merit STILL hides CP / XP (option 3 categorical)', () => {
    // Edge: an ST somehow ended up with a Catacombs row on a character with
    // no Sepulcher (e.g. legacy import). Suppression is by merit name, not
    // gated on Sepulcher ownership — per Peter's option 3.
    const c = mkChar({
      merits: [
        { name: 'Catacombs', category: 'domain', cp: 0, xp: 0 },
      ],
      _grant_pools: [],
    });
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);
    expect(html).not.toContain("shEditMeritPt(0,'cp'");
    expect(html).not.toContain("shEditMeritPt(0,'xp'");
    // No NECRO stepper either (no Sepulcher → showNECRO is false).
    expect(html).not.toContain('NECRO');
  });

  it('all six Necropolis target names trigger suppression', () => {
    // Spot-check: every name in pool_targets gets the hide treatment.
    const targets = ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'];
    for (const name of targets) {
      const c = mkChar({
        merits: [
          { name: 'Necropolis Sepulcher', category: 'general', cp: 3, xp: 0 },
          { name, category: 'domain', cp: 0, xp: 0 },
        ],
        _grant_pools: [{ source: 'Necropolis Sepulcher', category: 'necro', amount: 3 }],
      });
      stateMod.chars = [c];
      stateMod.editIdx = 0;
      stateMod.editMode = true;
      const html = shRenderDomainMerits(c, true);
      expect(html, `${name} should hide cp`).not.toContain("shEditMeritPt(1,'cp'");
      expect(html, `${name} should hide xp`).not.toContain("shEditMeritPt(1,'xp'");
      expect(html, `${name} should show NECRO`).toContain('NECRO');
    }
  });
});

describe('N-7b — meritBdRow hide-flag plumbing (static-analysis sanity)', () => {
  it('meritBdRow gates CP / XP renders on opts.hideCP / opts.hideXP', () => {
    const src = read('public/js/editor/xp.js');
    // Class attributes in the source are backslash-escaped inside the JS
    // string literal — match a narrower window of `opts.hideCP` near the
    // label "CP" rather than the full quoted attribute.
    expect(src).toMatch(/if \(!opts\.hideCP\)[\s\S]{0,200}>CP</);
    expect(src).toMatch(/if \(!opts\.hideXP\)[\s\S]{0,200}>XP</);
  });

  it('meritBdRow AND-s opts.showMCI with !opts.hideMCI', () => {
    const src = read('public/js/editor/xp.js');
    expect(src).toMatch(/if \(opts\.showMCI && !opts\.hideMCI\)/);
  });

  it('domain-renderer call site computes _isNecroTarget and threads all four hide-flags + AND-s showMCI', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/_isNecroTarget\s*=\s*_necroTargets\.includes\(m\.name\)/);
    expect(src).toMatch(/showMCI:\s*_domMciPool > 0 && !_isNecroTarget/);
    expect(src).toMatch(/hideCP:\s*_isNecroTarget/);
    expect(src).toMatch(/hideXP:\s*_isNecroTarget/);
    expect(src).toMatch(/hideMCI:\s*_isNecroTarget/);
    expect(src).toMatch(/hideBonus:\s*_isNecroTarget/);
  });

  it('_necroTargets is populated UNCONDITIONALLY (option 3 categorical) in shRenderDomainMerits', () => {
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    // The pre-N-7b shape was `_necroTargets = _hasNecroSep ? getNecropolisTargets(...) : []`.
    // Option 3 requires this to NOT be Sepulcher-gated — must be unconditional.
    expect(body).toMatch(/_necroTargets\s*=\s*getNecropolisTargets\(getRulesCache\(\)\)/);
    expect(body).not.toMatch(/_necroTargets\s*=\s*_hasNecroSep\s*\?/);
  });
});
