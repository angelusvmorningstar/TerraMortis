/**
 * Parallel-write contract test — Invested + Lorekeeper pool grants.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new pool evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the pool rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-invested-lorekeeper.js --apply`).
 *
 * Normalisation: snapshotCharacter() handles Sets→arrays, merit sorting,
 * and grant-pool sorting.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — keyed by source name; shared between vi.mock factory and beforeAll
const storeMap = vi.hoisted(() => ({
  Invested:   { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
  Lorekeeper: { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
}));

// Stub loader.js — prevents api.js (browser-only) from evaluating
vi.mock('../../public/js/data/loader.js', () => ({
  getRulesByCategory: () => [],
  getRuleByKey: () => null,
  getRulesDB: () => [],
  sanitiseChar: c => c,
  loadCharsFromApi: async () => null,
}));

// Stub load-rules.js — post-flip mci.js imports this (→ api.js, browser-only).
// getRulesBySource returns the DB-seeded pool rules populated in beforeAll.
vi.mock('../../public/js/editor/rule_engine/load-rules.js', () => ({
  preloadRules: async () => {},
  invalidateRulesCache: () => {},
  getRulesCache: () => null,
  getRulesBySource: (source) =>
    storeMap[source] || { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
}));

import { applyDerivedMerits } from '../lib/rule_engine/_legacy-bridge.js';
import { snapshotCharacter, fixture } from './helpers/apply-derived-merits-snapshot.js';
import { applyPoolRulesFromDb } from '../../public/js/editor/rule_engine/pool-evaluator.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKIP_FINAL_SYNC = new Set(['Mystery Cult Initiation', 'Professional Training', 'Mandragora Garden']);
const FREE_FIELDS = [
  'free_bloodline', 'free_pet', 'free_mci', 'free_vm', 'free_lk',
  'free_ohm', 'free_inv', 'free_pt', 'free_mdb', 'free_sw',
];

function applyFinalSync(c) {
  (c.merits || []).forEach(m => {
    FREE_FIELDS.forEach(f => { if (m[f] === undefined) m[f] = 0; });
    if (m.cp === undefined) m.cp = 0;
    if (m.xp === undefined) m.xp = 0;
  });
  (c.merits || []).forEach(m => {
    if (SKIP_FINAL_SYNC.has(m.name)) return;
    const total = FREE_FIELDS.reduce((s, f) => s + (m[f] || 0), 0) + (m.cp || 0) + (m.xp || 0);
    if (total > 0) m.rating = total;
  });
}

/**
 * Run the evaluator path: phase-1 clear + pool evaluators + phase-5 sync.
 * Mirrors what applyDerivedMerits does, but replaces the inline Invested /
 * Lorekeeper blocks with applyPoolRulesFromDb calls.
 */
function runEvaluatorPath(c, investedRules, lorekeeperRules) {
  // Phase 1: clear ephemerals (mirrors applyDerivedMerits top)
  c._pt_nine_again_skills = new Set();
  c._pt_dot4_bonus_skills = new Set();
  delete c._mci_dot3_skills;
  delete c._ohm_nine_again_skills;
  c._grant_pools = [];
  c._mci_free_specs = [];
  c._bloodline_free_specs = [];
  c._ots_covenant_bonus = 0;
  c._ots_free_dots = 0;
  (c.merits || []).forEach(m => {
    m.free_pt  = 0;
    m.free_mdb = 0;
    m.free_ohm = 0;
    m.free_sw  = 0;
  });

  // Run pool evaluators (replace legacy Invested + Lorekeeper inline blocks)
  applyPoolRulesFromDb(c, investedRules);
  applyPoolRulesFromDb(c, lorekeeperRules);

  // Phase 5: final sync
  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let investedRules;
let lorekeeperRules;

beforeAll(async () => {
  await setupDb();

  const [investedGrants, lorekeeperGrants] = await Promise.all([
    getCollection('rule_grant').find({ source: 'Invested', grant_type: 'pool' }).toArray(),
    getCollection('rule_grant').find({ source: 'Lorekeeper', grant_type: 'pool' }).toArray(),
  ]);

  // Populate hoisted storeMap so the mocked getRulesBySource feeds applyDerivedMerits
  Object.assign(storeMap.Invested, { grants: investedGrants });
  Object.assign(storeMap.Lorekeeper, { grants: lorekeeperGrants });

  investedRules  = { grants: investedGrants };
  lorekeeperRules = { grants: lorekeeperGrants };

  if (!investedGrants.length || !lorekeeperGrants.length) {
    throw new Error(
      'Pool rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-invested-lorekeeper.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertPoolEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, investedRules, lorekeeperRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.8 story) ───────────────────────────────────

describe('Pool grant parallel-write contract', () => {

  // ── Invested ──────────────────────────────────────────────────────────────

  // Row 1: Invested + Invictus Status 4 → pool entry with amount 4
  assertPoolEqual(
    fixture('Invested Status 4').withInvested(4),
    'Invested + Invictus Status 4 → pool amount 4',
  );

  // Row 2: Invested with Status 0 → pool size 0, no pool entry
  assertPoolEqual(
    fixture('Invested Status 0').withInvested(0),
    'Invested with Invictus Status 0 → no pool entry',
  );

  // Row 3: No Invested merit → no pool entry
  assertPoolEqual(
    fixture('No Invested')
      .withCovenant('Invictus', 3),
    'No Invested merit (covenant Invictus Status 3) → no pool entry',
  );

  // Row 4: Invested, non-Invictus covenant → pool 0 (effectiveInvictusStatus returns 0)
  assertPoolEqual(
    fixture('Invested Wrong Covenant')
      .merit({ name: 'Invested', category: 'general', cp: 1, xp: 0, free: 0 })
      .withCovenant('Lancea et Sanctum', 3),
    'Invested merit but non-Invictus covenant → pool 0, no entry',
  );

  // Row 5: Invested Status 1 → minimal pool
  assertPoolEqual(
    fixture('Invested Status 1').withInvested(1),
    'Invested + Invictus Status 1 → pool amount 1',
  );

  // ── Lorekeeper ─────────────────────────────────────────────────────────────

  // Row 6: Lorekeeper + Library 3 → pool size 3
  assertPoolEqual(
    fixture('Lorekeeper Library 3').withLorekeeper(3),
    'Lorekeeper + Library 3 CP → pool amount 3',
  );

  // Row 7: Lorekeeper + Library 2 CP + 1 XP → pool size 3 (sum of purchased dots)
  assertPoolEqual(
    fixture('Lorekeeper Library cp2 xp1')
      .merit({ name: 'Lorekeeper', category: 'general', cp: 1, xp: 0, free: 0 })
      .merit({ name: 'Library', category: 'general', cp: 2, xp: 1, free: 0 }),
    'Lorekeeper + Library (2cp + 1xp) → pool amount 3',
  );

  // Row 8: Lorekeeper, no Library merit → pool 0, no entry
  assertPoolEqual(
    fixture('Lorekeeper No Library')
      .merit({ name: 'Lorekeeper', category: 'general', cp: 1, xp: 0, free: 0 }),
    'Lorekeeper with no Library merit → no pool entry',
  );

  // Row 9: No Lorekeeper merit → no pool entry
  assertPoolEqual(
    fixture('No Lorekeeper')
      .merit({ name: 'Library', category: 'general', cp: 3, xp: 0, free: 0 }),
    'Library present but no Lorekeeper → no pool entry',
  );

  // ── Combined ───────────────────────────────────────────────────────────────

  // Row 10: Both Invested (Status 3) + Lorekeeper (Library 2) → two pool entries
  assertPoolEqual(
    fixture('Both Invested and Lorekeeper')
      .withInvested(3)
      .withLorekeeper(2),
    'Invested (Status 3) + Lorekeeper (Library 2) → two pool entries',
  );

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem Pool').withInvested(2).withLorekeeper(3).build();
    const c2 = fixture('Idem Pool').withInvested(2).withLorekeeper(3).build();

    runEvaluatorPath(c1, investedRules, lorekeeperRules);
    runEvaluatorPath(c1, investedRules, lorekeeperRules); // second pass
    runEvaluatorPath(c2, investedRules, lorekeeperRules); // one pass

    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
