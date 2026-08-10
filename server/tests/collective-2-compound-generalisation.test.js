/**
 * COLLECTIVE-2 (issue #1110) — Collective Compound rendering generalised
 * beyond the Necropolis.
 *
 * The COLLECTIVE-1 primitives hardcoded the gate merit ('Necropolis
 * Sepulcher') and the allocation slug ('necro'), so the two seeded compounds
 * that arrived after it — Mother's Fane (Circle of the Crone, gate 'Blood
 * and Sacrifice', slug `darktemple`) and the Black Cathedral (Lancea et
 * Sanctum, gate 'Prayer and Penance', slug `blackcathedral`) — had live data
 * but could not render. Both now derive gate merit, min_dots and slug from
 * their own `rule_grant` doc.
 *
 * Fixture shapes are copied from live `tm_suite` (story Task 0, verified
 * 2026-08-06): all three compounds carry
 * `sharing_scope: { type: 'collective_owners_of_merit', merit, min_dots }`.
 *
 * Coverage:
 *   - AC 1/2: Crone + Sanctified compounds render, EDIT MODE and VIEW MODE.
 *     Both renderers are asserted for every compound — wiring one and not
 *     the other is the silent failure this story exists to prevent
 *     (feedback_render_wiring_placement / the LK-Inv-VM precedent).
 *   - AC 4: no merit-name or slug literal in the synthesis path.
 *   - AC 5: a synthetic FOURTH compound renders with zero production-code
 *     change in this test's diff — it is fixture data only.
 *   - AC 6: a character owning two compounds sees the union of both, and a
 *     target name claimed by both sums across both slugs.
 */

// Browser shims — sheet.js + state imports transitively pull api.js's
// location reference. Same pattern as COLLECTIVE-1 / N-7a/b/c.
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

let getCollectiveCompounds;
let collectiveCompoundDots;
let synthesiseCollectiveCompoundNames;
let ownsCompound;
let shRenderDomainMerits;
let meritBdRow;
let stateMod;
let loadRulesMod;

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — live rule_grant shapes (story Task 0)
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

const CRONE_GRANT = {
  source: 'Blood and Sacrifice',
  source_slug: 'darktemple',
  category: 'darktemple',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ["Dark Temple (Mother's Fane)", 'Accursed Armory', 'Font of Corruption', "The Mother's Altar", 'Primal Mandragora', 'Occult Collection'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Blood and Sacrifice', min_dots: 1 },
};

const SANCTIFIED_GRANT = {
  source: 'Prayer and Penance',
  source_slug: 'blackcathedral',
  category: 'blackcathedral',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ['Black Cathedral', "Crusader's Cache", 'Black Sanctuary', 'Holy Relic', 'Midnight Mass', 'Cathedral of Damnation'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Prayer and Penance', min_dots: 1 },
};

// AC 5 — the fourth compound. Invented here, seeded nowhere, referenced by no
// production code. If this renders, adding a real fourth compound is a seed
// script plus catalogue rows.
//
// AC 5b (#1110 QA): this compound's `sharing_scope.merit` deliberately DIFFERS
// from its `source`. All three live compounds set the two to the same string,
// so a fixture that copies them leaves `scope.merit` indistinguishable from
// `r.source` and the `gateMerit` read is untestable — mutating
// `scope.merit || r.source` to plain `r.source` passed every test in the first
// version of this suite. Splitting them here separates the two roles:
//   source    — funds the pool, names the inherited card ("Inherited from …")
//   scope.merit — gates collective MEMBERSHIP
const FOURTH_GATE = 'Keeper of the Ossuary';
const FOURTH_GRANT = {
  source: 'Silent Vigil',
  source_slug: 'ossuary',
  category: 'ossuary',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: ['Reliquary Vault', 'Bone Choir'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: FOURTH_GATE, min_dots: 2 },
};

// Non-compound pool grants — present in live rule_grant, must NOT be
// discovered as compounds (they have no sharing_scope).
const NON_COMPOUND_GRANTS = [
  { source: 'Lorekeeper', source_slug: 'lk', grant_type: 'pool', pool_targets: ['Herd', 'Retainer'] },
  { source: 'Invested', source_slug: 'inv', grant_type: 'pool', pool_targets: ['Herd', 'Mentor', 'Resources', 'Retainer'] },
  { source: 'Bloodline', source_slug: 'bloodline', grant_type: 'merit' },
];

function ruleCache(grants) {
  return {
    rule_grant: grants,
    rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  };
}

function primeCache(grants) {
  loadRulesMod.getRulesCache.mockReturnValue(ruleCache(grants));
}

beforeAll(async () => {
  const helpersUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'rules-helpers.js')).href;
  ({ getCollectiveCompounds, collectiveCompoundDots, synthesiseCollectiveCompoundNames, ownsCompound } = await import(helpersUrl));
  const sheetUrl = pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'sheet.js')).href;
  ({ shRenderDomainMerits } = await import(sheetUrl));
  ({ meritBdRow } = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'xp.js')).href));
  stateMod = (await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'data', 'state.js')).href)).default;
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
  vi.spyOn(loadRulesMod, 'getRulesCache').mockReturnValue(ruleCache([NECRO_GRANT]));
});

function mkChar(name, merits) {
  return {
    _id: 'c-' + name.toLowerCase().replace(/\s+/g, '-'),
    name,
    clan: 'Nosferatu',
    covenant: 'Circle of the Crone',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [],
    merits,
  };
}

/** Render `c` in both modes with `chars` in state. Returns { edit, view }. */
function renderBoth(c, chars) {
  stateMod.chars = chars;
  stateMod.editIdx = chars.indexOf(c);
  stateMod.editMode = true;
  const edit = shRenderDomainMerits(c, true);
  stateMod.editMode = false;
  const view = shRenderDomainMerits(c, false);
  return { edit, view };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery (AC 4, AC 5)
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — getCollectiveCompounds discovery', () => {
  it('discovers every compound by sharing_scope.type, and only compounds', () => {
    const found = getCollectiveCompounds(ruleCache([
      ...NON_COMPOUND_GRANTS, NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT,
    ]));
    expect(found.map(c => c.source)).toEqual([
      'Necropolis Sepulcher', 'Blood and Sacrifice', 'Prayer and Penance',
    ]);
    // The Necropolis must NOT be dropped — the story's Task 0 hazard.
    expect(found.find(c => c.slug === 'necro')).toBeTruthy();
    // Pool grants without sharing_scope (LK / Invested) are not compounds.
    expect(found.some(c => c.source === 'Lorekeeper')).toBe(false);
    expect(found.some(c => c.source === 'Invested')).toBe(false);
  });

  it('descriptor carries gate merit, slug, minDots and targets', () => {
    const [crone] = getCollectiveCompounds(ruleCache([CRONE_GRANT]));
    expect(crone).toEqual({
      source: 'Blood and Sacrifice',
      slug: 'darktemple',
      gateMerit: 'Blood and Sacrifice',
      minDots: 1,
      targets: CRONE_GRANT.pool_targets,
    });
  });

  it('minDots defaults to 1 when sharing_scope.min_dots is absent', () => {
    const grant = { ...NECRO_GRANT, sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher' } };
    expect(getCollectiveCompounds(ruleCache([grant]))[0].minDots).toBe(1);
  });

  it('honours a non-default min_dots', () => {
    expect(getCollectiveCompounds(ruleCache([FOURTH_GRANT]))[0].minDots).toBe(2);
  });

  it('gateMerit comes from sharing_scope.merit, NOT from source, when they differ', () => {
    // AC 5b: the discriminating case. If gateMerit were read off `source`
    // this would be 'Silent Vigil'.
    const [cmp] = getCollectiveCompounds(ruleCache([FOURTH_GRANT]));
    expect(cmp.source).toBe('Silent Vigil');
    expect(cmp.gateMerit).toBe('Keeper of the Ossuary');
    expect(cmp.gateMerit).not.toBe(cmp.source);
  });

  it('gateMerit falls back to source only when sharing_scope.merit is absent', () => {
    const grant = { ...FOURTH_GRANT, sharing_scope: { type: 'collective_owners_of_merit', min_dots: 2 } };
    expect(getCollectiveCompounds(ruleCache([grant]))[0].gateMerit).toBe('Silent Vigil');
  });

  it('falls back to category when source_slug is absent', () => {
    const grant = { ...NECRO_GRANT };
    delete grant.source_slug;
    expect(getCollectiveCompounds(ruleCache([grant]))[0].slug).toBe('necro');
  });

  it('collapses duplicate seeds of the same compound', () => {
    const found = getCollectiveCompounds(ruleCache([NECRO_GRANT, { ...NECRO_GRANT }, CRONE_GRANT]));
    expect(found).toHaveLength(2);
  });

  it('empty for a missing / empty cache', () => {
    expect(getCollectiveCompounds(null)).toEqual([]);
    expect(getCollectiveCompounds({})).toEqual([]);
    expect(getCollectiveCompounds(ruleCache([]))).toEqual([]);
  });

  it('ignores an unknown sharing_scope.type (forward compatibility)', () => {
    const grant = { ...NECRO_GRANT, sharing_scope: { type: 'some_future_scope', merit: 'X' } };
    expect(getCollectiveCompounds(ruleCache([grant]))).toEqual([]);
  });
});

describe('COLLECTIVE-2 — ownsCompound membership gate', () => {
  it('purchased dots only (cp + xp), free grants excluded', () => {
    const [cmp] = getCollectiveCompounds(ruleCache([CRONE_GRANT]));
    expect(ownsCompound(mkChar('A', [{ name: 'Blood and Sacrifice', cp: 1, xp: 0 }]), cmp)).toBe(true);
    expect(ownsCompound(mkChar('B', [{ name: 'Blood and Sacrifice', cp: 0, xp: 1 }]), cmp)).toBe(true);
    // A grant the collective itself confers must not create membership.
    expect(ownsCompound(mkChar('C', [{ name: 'Blood and Sacrifice', cp: 0, xp: 0, free_grants: { darktemple: 5 } }]), cmp)).toBe(false);
    expect(ownsCompound(mkChar('D', [{ name: 'Necropolis Sepulcher', cp: 5 }]), cmp)).toBe(false);
    expect(ownsCompound(null, cmp)).toBe(false);
    expect(ownsCompound(mkChar('E', []), null)).toBe(false);
  });

  it('respects a compound min_dots above 1', () => {
    const [cmp] = getCollectiveCompounds(ruleCache([FOURTH_GRANT]));
    expect(ownsCompound(mkChar('A', [{ name: FOURTH_GATE, cp: 1 }]), cmp)).toBe(false);
    expect(ownsCompound(mkChar('B', [{ name: FOURTH_GATE, cp: 2 }]), cmp)).toBe(true);
  });

  it('AC 5b: membership follows sharing_scope.merit, and owning the SOURCE merit confers none', () => {
    const [cmp] = getCollectiveCompounds(ruleCache([FOURTH_GRANT]));
    // Owns the gate merit only → member.
    expect(ownsCompound(mkChar('Gate', [{ name: FOURTH_GATE, cp: 3 }]), cmp)).toBe(true);
    // Owns the SOURCE merit lavishly but not the gate → NOT a member.
    // This is the assertion that fails if gateMerit is read off `source`.
    expect(ownsCompound(mkChar('Source', [{ name: 'Silent Vigil', cp: 5 }]), cmp)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 1 — Crone compound renders (both renderers)
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — AC1 Crone compound (Mother’s Fane) renders', () => {
  function croneFixture() {
    const morgana = mkChar('Morgana', [
      { name: 'Blood and Sacrifice', category: 'domain', cp: 3, xp: 0 },
      { name: "Dark Temple (Mother's Fane)", category: 'domain', cp: 0, xp: 0, free_grants: { darktemple: 2 } },
      { name: 'Font of Corruption', category: 'domain', cp: 0, xp: 0, free_grants: { darktemple: 1 } },
    ]);
    const seren = mkChar('Seren', [
      { name: 'Blood and Sacrifice', category: 'domain', cp: 2, xp: 0 },
      { name: "Dark Temple (Mother's Fane)", category: 'domain', cp: 0, xp: 0, free_grants: { darktemple: 1 } },
      { name: 'Accursed Armory', category: 'domain', cp: 0, xp: 0, free_grants: { darktemple: 2 } },
    ]);
    return { morgana, seren };
  }

  it('cumulative dots sum across Crone members via the darktemple slug', () => {
    const { morgana, seren } = croneFixture();
    const [cmp] = getCollectiveCompounds(ruleCache([CRONE_GRANT]));
    expect(collectiveCompoundDots([morgana, seren], "Dark Temple (Mother's Fane)", cmp)).toBe(3); // 2 + 1
    expect(collectiveCompoundDots([morgana, seren], 'Accursed Armory', cmp)).toBe(2); // Seren only
    expect(collectiveCompoundDots([morgana, seren], 'Holy Relic', cmp)).toBe(0); // other compound
    expect(synthesiseCollectiveCompoundNames(morgana, [morgana, seren], cmp).sort())
      .toEqual(['Accursed Armory', "Dark Temple (Mother's Fane)", 'Font of Corruption']);
  });

  it('EDIT MODE: own-solid / partner-hollow split + inherited card + darktemple stepper', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { morgana, seren } = croneFixture();
    const { edit } = renderBoth(morgana, [morgana, seren]);
    // The card is anchored on the Crone source merit, not the Necropolis.
    expect(edit).toContain('Inherited from Blood and Sacrifice');
    expect(edit).not.toContain('Inherited from Necropolis Sepulcher');
    // Own solid (2) + partner hollow (1) on the shared Dark Temple row.
    expect(edit).toContain('Cumulative across all Blood and Sacrifice owners');
    expect(edit).toContain('My dots: ●●</span><span class="dom-total-lbl" title="Cumulative across all Blood and Sacrifice owners (● own, ○ partners)">Total: ');
    // The allocation stepper writes the compound's OWN slug.
    expect(edit).toContain('free_grants.darktemple');
    expect(edit).not.toContain('free_grants.necro');
    expect(edit).toMatch(/id="bd-darktemple-\d+"/);
    expect(edit).toContain('aria-label="Blood and Sacrifice pool allocation"');
    expect(edit).toContain('>DARKTEMPLE<');
  });

  it('EDIT MODE: partner-only target renders as a virtual row wired to darktemple', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { morgana, seren } = croneFixture();
    const { edit } = renderBoth(morgana, [morgana, seren]);
    // Morgana does not own Accursed Armory; Seren does.
    expect(edit).toContain('dom-edit-block--virtual');
    expect(edit).toContain('Accursed Armory');
    expect(edit).toContain('id="bd-darktemple-v-accursed-armory"');
    expect(edit).toContain("shAllocateCompoundVirtual('Accursed Armory','darktemple'");
  });

  it('VIEW MODE: the same rows, same card, same split — not just edit mode', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { morgana, seren } = croneFixture();
    const { view } = renderBoth(morgana, [morgana, seren]);
    expect(view).toContain('Inherited from Blood and Sacrifice');
    expect(view).toContain("Dark Temple (Mother's Fane)");
    // Partner-only row synthesises in the read-only renderer too.
    expect(view).toContain('merit-plain--virtual');
    expect(view).toContain('Accursed Armory');
    // No editor controls leak into the read-only path.
    expect(view).not.toContain('shAllocateCompoundVirtual');
    expect(view).not.toContain('free_grants.darktemple');
  });

  it('non-member sees no Crone virtual rows in either renderer', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { morgana, seren } = croneFixture();
    const tourist = mkChar('Tourist', [{ name: 'Safe Place', category: 'domain', cp: 2, qualifier: 'Flat' }]);
    const { edit, view } = renderBoth(tourist, [morgana, seren, tourist]);
    expect(edit).not.toContain('dom-edit-block--virtual');
    expect(edit).not.toContain('Inherited from Blood and Sacrifice');
    expect(view).not.toContain('merit-plain--virtual');
    expect(view).not.toContain('Inherited from Blood and Sacrifice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 2 — Sanctified compound renders (both renderers)
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — AC2 Sanctified compound (Black Cathedral) renders', () => {
  function sanctifiedFixture() {
    const augustus = mkChar('Augustus', [
      { name: 'Prayer and Penance', category: 'domain', cp: 4, xp: 0 },
      { name: 'Black Cathedral', category: 'domain', cp: 0, xp: 0, free_grants: { blackcathedral: 3 } },
    ]);
    const dominic = mkChar('Dominic', [
      { name: 'Prayer and Penance', category: 'domain', cp: 1, xp: 0 },
      { name: 'Black Cathedral', category: 'domain', cp: 0, xp: 0, free_grants: { blackcathedral: 1 } },
      { name: 'Holy Relic', category: 'domain', cp: 0, xp: 0, free_grants: { blackcathedral: 2 } },
    ]);
    return { augustus, dominic };
  }

  it('EDIT MODE: card, cumulative split and blackcathedral stepper', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { augustus, dominic } = sanctifiedFixture();
    const { edit } = renderBoth(augustus, [augustus, dominic]);
    expect(edit).toContain('Inherited from Prayer and Penance');
    // Black Cathedral: own 3 solid, partner 1 hollow.
    expect(edit).toContain('My dots: ●●●</span><span class="dom-total-lbl" title="Cumulative across all Prayer and Penance owners (● own, ○ partners)">Total: ');
    expect(edit).toContain('free_grants.blackcathedral');
    expect(edit).toContain('aria-label="Prayer and Penance pool allocation"');
    // Holy Relic is partner-only for Augustus.
    expect(edit).toContain("shAllocateCompoundVirtual('Holy Relic','blackcathedral'");
  });

  it('VIEW MODE: the same synthesis in the read-only renderer', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { augustus, dominic } = sanctifiedFixture();
    const { view } = renderBoth(augustus, [augustus, dominic]);
    expect(view).toContain('Inherited from Prayer and Penance');
    expect(view).toContain('Black Cathedral');
    expect(view).toContain('merit-plain--virtual');
    expect(view).toContain('Holy Relic');
  });

  it('compounds do not bleed: a Sanctified member sees no Crone rows', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { augustus, dominic } = sanctifiedFixture();
    const morgana = mkChar('Morgana', [
      { name: 'Blood and Sacrifice', category: 'domain', cp: 3 },
      { name: 'Font of Corruption', category: 'domain', free_grants: { darktemple: 2 } },
    ]);
    const { edit, view } = renderBoth(augustus, [augustus, dominic, morgana]);
    expect(edit).not.toContain('Font of Corruption');
    expect(edit).not.toContain('Inherited from Blood and Sacrifice');
    expect(view).not.toContain('Font of Corruption');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 5 — the fourth compound is data-only
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — AC5 a fourth compound needs no production-code change', () => {
  // FOURTH_GRANT is invented in this file. No production module names
  // 'Silent Vigil', 'Keeper of the Ossuary', 'ossuary', 'Reliquary Vault' or
  // 'Bone Choir'.
  //
  // AC 5b: members hold the GATE merit ('Keeper of the Ossuary') and NOT the
  // source ('Silent Vigil'), so every render assertion below fails if
  // membership is resolved against `source` instead of `sharing_scope.merit`.
  function vigilFixture() {
    const brother = mkChar('Brother Anselm', [
      { name: FOURTH_GATE, category: 'domain', cp: 2, xp: 0 },
      { name: 'Reliquary Vault', category: 'domain', cp: 0, xp: 0, free_grants: { ossuary: 2 } },
    ]);
    const sister = mkChar('Sister Perpetua', [
      { name: FOURTH_GATE, category: 'domain', cp: 3, xp: 0 },
      { name: 'Reliquary Vault', category: 'domain', cp: 0, xp: 0, free_grants: { ossuary: 1 } },
      { name: 'Bone Choir', category: 'domain', cp: 0, xp: 0, free_grants: { ossuary: 3 } },
    ]);
    return { brother, sister };
  }

  it('renders in EDIT MODE from fixture data alone', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT, FOURTH_GRANT]);
    const { brother, sister } = vigilFixture();
    const { edit } = renderBoth(brother, [brother, sister]);
    // AC 5b — the two roles are visibly distinct in the output:
    // the inherited card is named after the SOURCE merit …
    expect(edit).toContain('Inherited from Silent Vigil');
    // … while the cumulative-dots title names the GATE merit, because that is
    // who the dots are cumulative ACROSS. Reading gateMerit off `source`
    // would make this read 'Silent Vigil' instead.
    expect(edit).toContain('Cumulative across all Keeper of the Ossuary owners');
    expect(edit).not.toContain('Cumulative across all Silent Vigil owners');
    // The pool stepper is named after the source merit that funds it.
    expect(edit).toContain('aria-label="Silent Vigil pool allocation"');
    expect(edit).toContain('free_grants.ossuary');
    expect(edit).toContain('>OSSUARY<');
    expect(edit).toContain("shAllocateCompoundVirtual('Bone Choir','ossuary'");
  });

  it('renders in VIEW MODE from fixture data alone', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT, FOURTH_GRANT]);
    const { brother, sister } = vigilFixture();
    const { view } = renderBoth(brother, [brother, sister]);
    expect(view).toContain('Inherited from Silent Vigil');
    expect(view).toContain('Reliquary Vault');
    expect(view).toContain('merit-plain--virtual');
    expect(view).toContain('Bone Choir');
  });

  it("honours the fourth compound's min_dots: 2 membership threshold", () => {
    primeCache([FOURTH_GRANT]);
    const { sister } = vigilFixture();
    const novice = mkChar('Novice', [
      { name: FOURTH_GATE, category: 'domain', cp: 1, xp: 0 }, // below min_dots
    ]);
    const { edit, view } = renderBoth(novice, [novice, sister]);
    expect(edit).not.toContain('Inherited from Silent Vigil');
    expect(edit).not.toContain('dom-edit-block--virtual');
    expect(view).not.toContain('merit-plain--virtual');
  });

  it('none of the fourth compound’s identifiers appear in production code', () => {
    const sources = [
      'public/js/data/rules-helpers.js',
      'public/js/editor/sheet.js',
      'public/js/editor/xp.js',
      'public/js/editor/edit-domain.js',
    ].map(read).join('\n');
    for (const token of ['Silent Vigil', FOURTH_GATE, 'ossuary', 'Reliquary Vault', 'Bone Choir']) {
      expect(sources).not.toContain(token);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — multi-compound characters
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — AC6 a character owning two compounds', () => {
  function dualFixture() {
    // Owns BOTH the Necropolis and the Crone compound.
    const hecate = mkChar('Hecate', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'Blood and Sacrifice', category: 'domain', cp: 2, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 2 } },
      { name: 'Font of Corruption', category: 'domain', cp: 0, xp: 0, free_grants: { darktemple: 1 } },
    ]);
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Garbage Pit', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    const seren = mkChar('Seren', [
      { name: 'Blood and Sacrifice', category: 'domain', cp: 2, xp: 0 },
      { name: 'Accursed Armory', category: 'domain', cp: 0, xp: 0, free_grants: { darktemple: 2 } },
    ]);
    return { hecate, yusuf, seren };
  }

  it('EDIT MODE: sees the union of both compounds, in two separate cards', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { hecate, yusuf, seren } = dualFixture();
    const { edit } = renderBoth(hecate, [hecate, yusuf, seren]);
    expect(edit).toContain('Inherited from Necropolis Sepulcher');
    expect(edit).toContain('Inherited from Blood and Sacrifice');
    // Owned rows from both compounds. An owned edit-mode row carries its
    // name only inside its <select> options (empty without a merit
    // catalogue in the cache), so the row is identified by its allocation
    // channel — one write path per owned target.
    expect(edit).toContain('free_grants.necro');       // Catacombs
    expect(edit).toContain('free_grants.darktemple');  // Font of Corruption
    // Partner-only rows from both compounds.
    expect(edit).toContain("shAllocateCompoundVirtual('Garbage Pit','necro'");
    expect(edit).toContain("shAllocateCompoundVirtual('Accursed Armory','darktemple'");
  });

  it('VIEW MODE: the same union in the read-only renderer', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { hecate, yusuf, seren } = dualFixture();
    const { view } = renderBoth(hecate, [hecate, yusuf, seren]);
    expect(view).toContain('Inherited from Necropolis Sepulcher');
    expect(view).toContain('Inherited from Blood and Sacrifice');
    expect(view).toContain('Garbage Pit');
    expect(view).toContain('Accursed Armory');
  });

  it('each target row is emitted exactly once, in one card only', () => {
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT]);
    const { hecate, yusuf, seren } = dualFixture();
    const { edit } = renderBoth(hecate, [hecate, yusuf, seren]);
    expect((edit.match(/shAllocateCompoundVirtual\('Garbage Pit'/g) || []).length).toBe(1);
    expect((edit.match(/free_grants\.necro/g) || []).length).toBe(1); // Catacombs only
    expect((edit.match(/free_grants\.darktemple/g) || []).length).toBe(1); // Font of Corruption only
  });

  it('a target name claimed by BOTH owned compounds sums across both slugs', () => {
    // Overlapping compounds: both list 'Shared Crypt'.
    const A = {
      ...NECRO_GRANT, source: 'Compound A', source_slug: 'aslug', category: 'aslug',
      pool_targets: ['Shared Crypt'],
      sharing_scope: { type: 'collective_owners_of_merit', merit: 'Compound A', min_dots: 1 },
    };
    const B = {
      ...NECRO_GRANT, source: 'Compound B', source_slug: 'bslug', category: 'bslug',
      pool_targets: ['Shared Crypt'],
      sharing_scope: { type: 'collective_owners_of_merit', merit: 'Compound B', min_dots: 1 },
    };
    primeCache([A, B]);
    const owner = mkChar('Both', [
      { name: 'Compound A', category: 'domain', cp: 1 },
      { name: 'Compound B', category: 'domain', cp: 1 },
      { name: 'Shared Crypt', category: 'domain', cp: 0, xp: 0, free_grants: { aslug: 2, bslug: 3 } },
    ]);
    const { edit } = renderBoth(owner, [owner]);
    // 5 own dots (2 from A + 3 from B), 0 partner.
    expect(edit).toContain('My dots: ●●●●●</span>');
    // Rendered ONCE, under the first claiming compound, but with BOTH
    // steppers so each channel stays editable.
    expect((edit.match(/My dots: ●●●●●/g) || []).length).toBe(1);
    expect((edit.match(/free_grants\.aslug/g) || []).length).toBe(1);
    expect((edit.match(/free_grants\.bslug/g) || []).length).toBe(1);
    // Only compound A's card exists — B's targets are all claimed by A.
    expect(edit).toContain('Inherited from Compound A');
    expect(edit).not.toContain('Inherited from Compound B');
    // Title names both gates so the player can see where the dots come from.
    expect(edit).toContain('Cumulative across all Compound A + Compound B owners');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 4 — no hardcoding in the synthesis path
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — AC4 no compound literals in the synthesis path', () => {
  const GATE_NAMES = ["'Necropolis Sepulcher'", "'Blood and Sacrifice'", "'Prayer and Penance'"];
  const SLUG_READS = ['free_grants.necro', 'free_grants.darktemple', 'free_grants.blackcathedral'];

  it('rules-helpers COLLECTIVE primitives carry no gate-merit or slug literal', () => {
    const src = read('public/js/data/rules-helpers.js');
    const start = src.indexOf('COLLECTIVE-1 (issue #800) — virtual row synthesis primitives');
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start);
    for (const lit of [...GATE_NAMES, ...SLUG_READS]) {
      expect(block).not.toContain(lit);
    }
  });

  it('getCollectiveCompounds itself carries no gate-merit or slug literal', () => {
    const src = read('public/js/data/rules-helpers.js');
    const start = src.indexOf('export function getCollectiveCompounds');
    const end = src.indexOf('export function ownsCompound');
    const block = src.slice(start, end);
    for (const lit of [...GATE_NAMES, ...SLUG_READS]) {
      expect(block).not.toContain(lit);
    }
  });

  it('the sheet.js domain renderer call sites carry no gate-merit or slug literal', () => {
    const src = read('public/js/editor/sheet.js');
    const fnStart = src.indexOf('export function shRenderDomainMerits');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    // No free_grants slug is ever read by literal — every allocation goes
    // through freeOf(m, compound.slug).
    for (const lit of SLUG_READS) {
      expect(body).not.toContain(lit);
    }
    expect(body).not.toContain("'Blood and Sacrifice'");
    expect(body).not.toContain("'Prayer and Penance'");
    // The ONE surviving 'Necropolis Sepulcher' literal is the N-8 Mandragora
    // Garden attached_to anchor — Necropolis game content, explicitly out of
    // scope per the story Dev Notes ("what is NOT a compound"). Pinning the
    // count means adding a second literal fails this test rather than
    // sliding in unnoticed.
    const necroLits = body.match(/'Necropolis Sepulcher'/g) || [];
    expect(necroLits).toHaveLength(1);
    expect(body).toContain("_isMandragora && sp.name === 'Necropolis Sepulcher'");
    // Necropolis GAME content (White Ants territory union) is deliberately
    // still Necropolis-specific and lives in this renderer — the same scope
    // boundary. Assert it is still wired, so a future "generalise
    // everything" pass has to make a conscious decision.
    expect(body).toContain('getNecropolisInfectedTerritories');
  });

  it('the virtual-row allocator handler carries no slug literal', () => {
    const src = read('public/js/editor/edit-domain.js');
    const start = src.indexOf('export function shAllocateCompoundVirtual');
    const block = src.slice(start, src.indexOf('export function', start + 1));
    for (const lit of SLUG_READS) {
      expect(block).not.toContain(lit);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meritBdRow — behavioural, both the stepper set and the total
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — meritBdRow compound steppers', () => {
  const merit = { cp: 0, xp: 0, free_grants: { necro: 1, darktemple: 2 } };

  it('emits one stepper per compoundPools entry, each writing its own slug', () => {
    const html = meritBdRow(7, merit, null, {
      compoundPools: [
        { slug: 'necro', source: 'Necropolis Sepulcher' },
        { slug: 'darktemple', source: 'Blood and Sacrifice' },
      ],
      compoundSlugs: ['necro', 'darktemple'],
      hideCP: true, hideXP: true, hideBonus: true,
    });
    expect(html).toContain("shEditMeritPt(7,'free_grants.necro'");
    expect(html).toContain("shEditMeritPt(7,'free_grants.darktemple'");
    expect(html).toContain('id="bd-necro-7"');
    expect(html).toContain('id="bd-darktemple-7"');
    expect(html).toContain('aria-label="Necropolis Sepulcher pool allocation"');
    expect(html).toContain('aria-label="Blood and Sacrifice pool allocation"');
    // Each stepper shows ITS OWN current allocation, not a shared number.
    expect(html).toMatch(/id="bd-necro-7"[^>]*value="1"/);
    expect(html).toMatch(/id="bd-darktemple-7"[^>]*value="2"/);
  });

  it('the row total counts every compoundSlugs channel', () => {
    const html = meritBdRow(7, merit, null, {
      compoundSlugs: ['necro', 'darktemple'], hideCP: true, hideXP: true, hideBonus: true,
    });
    expect(html).toContain('>3 dots<'); // 1 necro + 2 darktemple
  });

  it('defaults to the necro channel when compoundSlugs is absent (pre-#1110 call sites)', () => {
    const html = meritBdRow(7, merit, null, { hideCP: true, hideXP: true, hideBonus: true });
    expect(html).toContain('>1 dot<'); // necro only
  });

  it('emits no stepper when compoundPools is empty (non-member)', () => {
    const html = meritBdRow(7, merit, null, { compoundPools: [], compoundSlugs: ['necro'], hideBonus: true });
    expect(html).not.toContain('free_grants.necro');
    expect(html).not.toContain('bd-bonus-lbl');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 3 — Necropolis regression sentinel
// ─────────────────────────────────────────────────────────────────────────────

describe('COLLECTIVE-2 — AC3 Necropolis regression', () => {
  it('the Necropolis renders identically whether or not sibling compounds are seeded', () => {
    const yusuf = mkChar('Yusuf', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 5, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    const xavier = mkChar('Xavier', [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 4, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Labyrinth Guardians', category: 'domain', cp: 0, xp: 0, free_grants: { necro: 1 } },
    ]);
    primeCache([NECRO_GRANT]);
    const alone = renderBoth(yusuf, [yusuf, xavier]);
    primeCache([NECRO_GRANT, CRONE_GRANT, SANCTIFIED_GRANT, FOURTH_GRANT]);
    const withSiblings = renderBoth(yusuf, [yusuf, xavier]);
    // Seeding three more compounds must not perturb a Necropolis-only sheet
    // by a single byte.
    expect(withSiblings.edit).toBe(alone.edit);
    expect(withSiblings.view).toBe(alone.view);
    // And the Necropolis output is still what COLLECTIVE-1 produced.
    expect(alone.edit).toContain('Inherited from Necropolis Sepulcher');
    expect(alone.edit).toContain('free_grants.necro');
    expect(alone.edit).toContain('id="bd-necro-v-labyrinth-guardians"');
    expect(alone.edit).toContain("shAllocateCompoundVirtual('Labyrinth Guardians','necro'");
  });
});
