/**
 * #1137 — the Collective Compound pool PRODUCER runs for every seeded pool
 * source, not a hardcoded list.
 *
 * This suite exists because `collective-2-compound-generalisation.test.js`
 * exercises Blood and Sacrifice heavily and PASSES while its pool was never
 * produced at all. That suite asserts on RENDERING; nothing asserted that
 * `_grant_pools` was ever filled. #1110's own record drew the wrong conclusion
 * from the same gap: "the pool evaluator was already fully generic ... Crone and
 * Sanctified owners have had correct pool capacity all along". The evaluator is
 * generic. Nothing called it for those sources, so capacity was always zero.
 *
 * Every assertion here is therefore on `_grant_pools` — what was PRODUCED —
 * never on markup.
 *
 * Fixture grants are copied verbatim from live `tm_suite.rule_grant`
 * (verified 2026-08-11), minus `_id`.
 */

// Browser shims — mci.js pulls the api.js location reference transitively.
// Same pattern as COLLECTIVE-1/2 and N-7a/b/c.
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

let applyDerivedMerits;
let loadRulesMod;

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — live rule_grant pool docs, verbatim
// ─────────────────────────────────────────────────────────────────────────────

const NECRO_GRANT = {
  source: 'Necropolis Sepulcher', source_slug: 'necro', category: 'necro',
  grant_type: 'pool', condition: 'merit_present', amount_basis: 'rating_of_source',
  pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 },
};

const DARKTEMPLE_GRANT = {
  source: 'Blood and Sacrifice', source_slug: 'darktemple', category: 'darktemple',
  grant_type: 'pool', condition: 'merit_present', amount_basis: 'rating_of_source',
  pool_targets: ["Dark Temple (Mother's Fane)", 'Accursed Armory', 'Font of Corruption', "The Mother's Altar", 'Primal Mandragora', 'Occult Collection'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Blood and Sacrifice', min_dots: 1 },
};

const BLACKCATHEDRAL_GRANT = {
  source: 'Prayer and Penance', source_slug: 'blackcathedral', category: 'blackcathedral',
  grant_type: 'pool', condition: 'merit_present', amount_basis: 'rating_of_source',
  pool_targets: ['Black Cathedral', "Crusader's Cache", 'Black Sanctuary', 'Holy Relic', 'Midnight Mass', 'Cathedral of Damnation'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Prayer and Penance', min_dots: 1 },
};

// A compound that exists ONLY in this fixture — AC6. If it produces a pool,
// the producer is genuinely data-driven, because no production file names it.
const SYNTHETIC_GRANT = {
  source: 'Rite of the Drowned Choir', source_slug: 'drownedchoir', category: 'drownedchoir',
  grant_type: 'pool', condition: 'merit_present', amount_basis: 'rating_of_source',
  pool_targets: ['Tidal Reliquary', 'Salt Vault'],
  partner_shareable: true,
  sharing_scope: { type: 'collective_owners_of_merit', merit: 'Rite of the Drowned Choir', min_dots: 1 },
};

// Non-compound pool sources that must not change. These two use
// `rating_of_partner_merit`, so the field name matters: _computeAmount reads
// `partner_merit_names` (array) or `partner_merit_name` (singular). An earlier
// draft of this file invented `partner_merits`, which silently computed 0 —
// caught in external review. Copied verbatim from live rule_grant, minus _id,
// notes and timestamps.
const INVESTED_GRANT = {
  source: 'Invested', source_slug: 'inv', category: 'inv',
  grant_type: 'pool', condition: 'merit_present', amount_basis: 'rating_of_partner_merit',
  partner_merit_names: ['Invictus Status'],
  pool_targets: ['Herd', 'Mentor', 'Resources', 'Retainer'],
  partner_shareable: false,
};

const LOREKEEPER_GRANT = {
  source: 'Lorekeeper', source_slug: 'lk', category: 'lk',
  grant_type: 'pool', condition: 'merit_present', amount_basis: 'rating_of_partner_merit',
  partner_merit_names: ['Library', 'Esoteric Armoury'],
  pool_targets: ['Herd', 'Retainer'],
  partner_shareable: false,
};

const ALL_GRANTS = [
  NECRO_GRANT, DARKTEMPLE_GRANT, BLACKCATHEDRAL_GRANT,
  INVESTED_GRANT, LOREKEEPER_GRANT,
];

function ruleCache(grants) {
  return {
    rule_grant: grants,
    rule_nine_again: [], rule_skill_bonus: [], rule_speciality_grant: [],
    rule_tier_budget: [], rule_disc_attr: [], rule_derived_stat_modifier: [],
  };
}

/**
 * BOTH accessors must be mocked from the same fixture set, and getting this
 * wrong silently weakens the suite.
 *
 * `getRulesBySource` reads load-rules.js's module-internal `_cache` directly,
 * which a spy on `getRulesCache` does not touch. Mocking only `getRulesCache`
 * leaves the pre-fix hardcoded path (which calls `getRulesBySource`) with no
 * data at all — so Necropolis appears broken too, and the suite loses its
 * ability to prove the already-working sources are unaffected. Mocking both
 * from one array means pre-fix behaviour is faithful: Necropolis/Invested/
 * Lorekeeper produce pools, the two new compounds do not.
 */
function primeCache(grants) {
  loadRulesMod.getRulesCache.mockReturnValue(ruleCache(grants));
  loadRulesMod.getRulesBySource.mockImplementation((source) => ({
    grants: grants.filter(r => r.source === source),
    nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null,
  }));
}

beforeAll(async () => {
  loadRulesMod = await import(pathToFileURL(path.resolve(REPO_ROOT, 'public', 'js', 'editor', 'rule_engine', 'load-rules.js')).href);
  vi.spyOn(loadRulesMod, 'getRulesCache');
  vi.spyOn(loadRulesMod, 'getRulesBySource');
  primeCache(ALL_GRANTS);
  ({ applyDerivedMerits } = await import(pathToFileURL(path.resolve(REPO_ROOT, 'server', 'lib', 'rule_engine', '_legacy-bridge.js')).href));
});

function mkChar(merits) {
  return {
    _id: 'c-1137',
    name: 'Pool Fixture',
    clan: 'Nosferatu',
    covenant: 'Circle of the Crone',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, powers: [], ordeals: [],
    merits,
  };
}

const gate = (name, dots) => ({ name, category: 'domain', rating: dots, cp: 0, xp: dots });

/** All pool entries for one slug. */
function poolsFor(c, slug) {
  return (c._grant_pools || []).filter(p => p.category === slug);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('#1137 — every seeded pool source is produced', () => {
  it('AC1: Blood and Sacrifice 3 produces a darktemple pool of 3', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([gate('Blood and Sacrifice', 3)]);
    applyDerivedMerits(c);

    const pools = poolsFor(c, 'darktemple');
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ source: 'Blood and Sacrifice', category: 'darktemple', amount: 3 });
    expect(pools[0].names).toContain("Dark Temple (Mother's Fane)");
  });

  it('AC3: Prayer and Penance 2 produces a blackcathedral pool of 2', () => {
    primeCache(ALL_GRANTS.concat([BLACKCATHEDRAL_GRANT]).filter((g, i, a) => a.indexOf(g) === i));
    const c = mkChar([gate('Prayer and Penance', 2)]);
    applyDerivedMerits(c);

    const pools = poolsFor(c, 'blackcathedral');
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ source: 'Prayer and Penance', category: 'blackcathedral', amount: 2 });
  });

  it('AC4: Necropolis Sepulcher 5 still produces a necro pool of exactly 5', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([
      gate('Necropolis Sepulcher', 5),
      { name: 'Caldarium',   category: 'domain', rating: 1, cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Catacombs',   category: 'domain', rating: 1, cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'Garbage Pit', category: 'domain', rating: 1, cp: 0, xp: 0, free_grants: { necro: 1 } },
      { name: 'White Ants',  category: 'domain', rating: 2, cp: 0, xp: 0, free_grants: { necro: 2 } },
    ]);
    applyDerivedMerits(c);

    const pools = poolsFor(c, 'necro');
    expect(pools).toHaveLength(1);
    expect(pools[0].amount).toBe(5);
    // Yusuf and Xavier are both allocated to exactly 5/5 live, so any capacity
    // drift in either direction would surface here as under/over allocation.
    const allocated = c.merits.reduce((s, m) => s + (m.free_grants?.necro || 0), 0);
    expect(allocated).toBe(5);
  });

  it('AC5: a character holding no compound gets no compound pool', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([{ name: 'Resources', category: 'influence', rating: 2, cp: 2, xp: 0 }]);
    applyDerivedMerits(c);

    expect(poolsFor(c, 'darktemple')).toHaveLength(0);
    expect(poolsFor(c, 'necro')).toHaveLength(0);
    expect(poolsFor(c, 'blackcathedral')).toHaveLength(0);
  });

  // AC5 proper: the two old non-compound dispatches this sweep replaced. Without
  // these the suite claimed "no behaviour change" for four sources while only
  // exercising two of them (external review, Pass 1).
  it('AC5: Invested still produces a pool from Invictus Status', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([{ name: 'Invested', category: 'standing', rating: 1, cp: 1, xp: 0 }]);
    c.covenant = 'Invictus';
    c.status.covenant = { Invictus: 4 };   // _effectiveInvictusStatus reads this
    applyDerivedMerits(c);

    const pools = poolsFor(c, 'inv');
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ source: 'Invested', amount: 4 });
    expect(pools[0].names).toEqual(['Herd', 'Mentor', 'Resources', 'Retainer']);
  });

  it('AC5: Lorekeeper still produces a pool summed across BOTH partner merits', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([
      { name: 'Lorekeeper',       category: 'general', rating: 1, cp: 1, xp: 0 },
      { name: 'Library',          category: 'general', rating: 2, cp: 2, xp: 0 },
      { name: 'Esoteric Armoury', category: 'general', rating: 1, cp: 0, xp: 1 },
    ]);
    applyDerivedMerits(c);

    const pools = poolsFor(c, 'lk');
    expect(pools).toHaveLength(1);
    // partner_merit_names is an ARRAY and _computeAmount sums across it: 2 + 1.
    expect(pools[0].amount).toBe(3);
  });

  it('AC5: a non-Invictus character gets no Invested pool even holding the merit', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([{ name: 'Invested', category: 'standing', rating: 1, cp: 1, xp: 0 }]);
    c.covenant = 'Circle of the Crone';
    c.status.covenant = { Invictus: 4 };
    applyDerivedMerits(c);

    // _effectiveInvictusStatus returns 0 off-covenant, and a zero pool is not pushed.
    expect(poolsFor(c, 'inv')).toHaveLength(0);
  });

  it('AC5: two compounds on one character each produce their own pool', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([gate('Blood and Sacrifice', 3), gate('Necropolis Sepulcher', 2)]);
    applyDerivedMerits(c);

    expect(poolsFor(c, 'darktemple')[0].amount).toBe(3);
    expect(poolsFor(c, 'necro')[0].amount).toBe(2);
  });

  it('AC6: a compound present ONLY in fixture data produces a pool — no production file names it', () => {
    primeCache(ALL_GRANTS.concat([SYNTHETIC_GRANT]));
    const c = mkChar([gate('Rite of the Drowned Choir', 4)]);
    applyDerivedMerits(c);

    const pools = poolsFor(c, 'drownedchoir');
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ source: 'Rite of the Drowned Choir', amount: 4 });
  });

  it('pool amount is purchased dots only — free grants never inflate it', () => {
    primeCache(ALL_GRANTS);
    const c = mkChar([
      { name: 'Blood and Sacrifice', category: 'domain', rating: 3, cp: 1, xp: 2, free_mci: 2, free_vm: 1 },
    ]);
    applyDerivedMerits(c);

    // cp 1 + xp 2 = 3. The free_* channels must contribute nothing
    // (pool-evaluator.js:110 "pool basis is purchased dots only").
    expect(poolsFor(c, 'darktemple')[0].amount).toBe(3);
  });

  it('AC7: a null rules cache is a no-op, not a throw and not a partial mutation', () => {
    loadRulesMod.getRulesCache.mockReturnValue(null);
    const c = mkChar([gate('Blood and Sacrifice', 3)]);
    const before = JSON.stringify(c);

    expect(() => applyDerivedMerits(c)).not.toThrow();

    // issue #249: applyDerivedMerits bails BEFORE clearing anything, so the
    // character must come back untouched — no _grant_pools, no cleared merits.
    expect(c._grant_pools).toBeUndefined();
    expect(JSON.stringify(c)).toBe(before);

    primeCache(ALL_GRANTS); // restore for any later test
  });
});
