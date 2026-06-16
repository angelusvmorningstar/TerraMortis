/**
 * N-7a hotfix (issue #766) — behavioural test for showNECRO at the correct
 * renderer.
 *
 * N-7 PR #765 wired showNECRO into shRenderGeneralMerits but Necropolis target
 * merits are sub_category='domain' and render through shRenderDomainMerits —
 * the wiring never fired. The 25-case static-analysis suite in PR #765 caught
 * the wiring's existence via regex but couldn't catch its placement. Per the
 * listener-routing memory: "static review cannot catch this, only browser
 * smoke can" — applies equally to render-site placement.
 *
 * This file calls shRenderDomainMerits with a constructed character + a seeded
 * `_grant_pools` Necropolis entry, then asserts the returned HTML actually
 * contains the NECRO label + the free_grants.necro onchange string. That's
 * the contract the regex tests can't establish; only a real render-and-assert
 * can.
 */

// Browser shims — sheet.js transitively imports api.js (location reference).
// Pattern mirrored from N-8's n8-mandragora-prereq.test.js.
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

// Dynamic imports so the shims above are in place when the editor module
// graph evaluates (static imports hoist past the shim block).
let shRenderDomainMerits;
let stateMod;
let loadRulesMod;

beforeAll(async () => {
  const sheetUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  stateMod = (await import(pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(__dirname, '..', '..', 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);

  // Prime the rules cache with a Necropolis Sepulcher pool rule so
  // getNecropolisTargets resolves to the six target merits. ES module exports
  // aren't writable; vi.spyOn replaces the getter on the live module ref so
  // the same getRulesCache import inside sheet.js returns this fixture.
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

// ─────────────────────────────────────────────────────────────────────────────
// Load-bearing behavioural test
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7a — showNECRO renders in the domain renderer', () => {
  function mkChar(sepulcherDots, hasTarget = true) {
    return {
      _id: 'n7a-test',
      name: 'N7a Test',
      clan: 'Nosferatu',
      covenant: 'Invictus',
      status: { city: 0, clan: 0, covenant: {} },
      attributes: {}, skills: {}, disciplines: {}, powers: [],
      merits: [
        { name: 'Necropolis Sepulcher', category: 'general', cp: sepulcherDots, xp: 0 },
        ...(hasTarget
          ? [{ name: 'Catacombs', category: 'domain', cp: 1, xp: 0 }]
          : []),
      ],
      _grant_pools: [
        { source: 'Necropolis Sepulcher', category: 'necro', amount: sepulcherDots, names: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'] },
      ],
    };
  }

  it('renders the NECRO stepper on a Catacombs row when Sepulcher is owned', () => {
    const c = mkChar(3);
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);

    // Behavioural contract — not regex-on-source. The returned HTML must
    // contain both the NECRO label and the free_grants.necro onchange string
    // for the Catacombs row's allocator stepper.
    expect(html).toContain('NECRO');
    expect(html).toContain('free_grants.necro');
  });

  it('does NOT render the NECRO stepper when Sepulcher is absent (or 0 dots purchased)', () => {
    const c = mkChar(0); // cp+xp = 0 → hasNecropolisSepulcher is false
    stateMod.chars = [c];
    stateMod.editIdx = 0;
    stateMod.editMode = true;

    const html = shRenderDomainMerits(c, true);
    expect(html).not.toContain('NECRO');
    expect(html).not.toContain('free_grants.necro');
  });

  // Note: the necro pool counter itself is rendered by `_renderPoolCounters`,
  // which is called from inside `shRenderGeneralMerits` (one call per
  // category section). The N-7a fix corrects the section gate from
  // `category === 'general'` to `category === 'domain'` so the necro pool
  // surfaces in the right row of the general renderer's pool-counters block.
  // The static-analysis sanity guard below covers that gate; the behavioural
  // proof here focuses on the steppers, which is where the production
  // breakage manifested.
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards (catch reverts of the placement)
// ─────────────────────────────────────────────────────────────────────────────

describe('N-7a — placement sanity guards', () => {
  it('shRenderDomainMerits computes the Necropolis flags', () => {
    const src = read('public/js/editor/sheet.js');
    // The string `_hasNecroSep = hasNecropolisSepulcher(c)` must appear
    // AFTER `export function shRenderDomainMerits` and BEFORE the next
    // exported function — i.e. inside shRenderDomainMerits's body.
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    expect(fnStart).toBeGreaterThan(0);
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const fnBody = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(fnBody).toMatch(/_hasNecroSep\s*=\s*hasNecropolisSepulcher\(c\)/);
    expect(fnBody).toMatch(/_necroTargets/);
    // N-7b (issue #768) introduced `_isNecroTarget = _necroTargets.includes(m.name)`
    // as a local intermediate so the same boolean threads into hideCP/XP/MCI/
    // Bonus alongside showNECRO. Semantic check stays the same: showNECRO is
    // gated on Sepulcher ownership AND target-name membership.
    expect(fnBody).toMatch(/showNECRO:\s*_hasNecroSep\s*&&\s*(_necroTargets\.includes\(m\.name\)|_isNecroTarget)/);
  });

  it('_renderPoolCounters surfaces necro in domain section, not general', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/necroPools\s*=\s*category === 'domain'/);
  });
});
