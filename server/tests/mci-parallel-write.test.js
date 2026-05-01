/**
 * Parallel-write contract test — Mystery Cult Initiation.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new MCI evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the MCI rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-mci.js --apply`).
 *
 * Normalisation: snapshotCharacter() (from RDE-1) handles Sets→arrays,
 * merit sorting, and grant-pool sorting.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — shared between vi.mock factory (hoisted) and beforeAll (runtime)
const store = vi.hoisted(() => ({
  grants: [],
  nineAgain: [],
  skillBonus: [],
  specialityGrants: [],
  tierBudget: null,
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
// getRulesBySource returns the DB-seeded rules populated in beforeAll.
vi.mock('../../public/js/editor/rule_engine/load-rules.js', () => ({
  preloadRules: async () => {},
  invalidateRulesCache: () => {},
  getRulesCache: () => null,
  getRulesBySource: () => store,
}));

import { applyDerivedMerits } from '../lib/rule_engine/_legacy-bridge.js';
import { snapshotCharacter, fixture } from './helpers/apply-derived-merits-snapshot.js';
import { applyMCIRulesFromDb } from '../../public/js/editor/rule_engine/mci-evaluator.js';
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
 * Run the evaluator path: phase-1 clear + MCI evaluator + phase-5 sync.
 * Mirrors what applyDerivedMerits does, but replaces the MCI block with applyMCIRulesFromDb.
 */
function runEvaluatorPath(c, mciRules) {
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

  // Run MCI evaluator (replaces legacy MCI block)
  applyMCIRulesFromDb(c, mciRules);

  // Phase 5: final sync
  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let mciRules;

beforeAll(async () => {
  await setupDb();
  const [grants, specialityGrants, skillBonus, tierBudgets] = await Promise.all([
    getCollection('rule_grant').find({ source: 'Mystery Cult Initiation' }).toArray(),
    getCollection('rule_speciality_grant').find({ source: 'Mystery Cult Initiation' }).toArray(),
    getCollection('rule_skill_bonus').find({ source: 'Mystery Cult Initiation' }).toArray(),
    getCollection('rule_tier_budget').find({ source: 'Mystery Cult Initiation' }).toArray(),
  ]);

  // Populate hoisted store so the mocked getRulesBySource returns DB rules to applyDerivedMerits
  Object.assign(store, {
    grants,
    specialityGrants,
    skillBonus,
    tierBudget: tierBudgets[0] || null,
    nineAgain: [],
  });
  mciRules = store;

  if (!grants.length || !specialityGrants.length || !skillBonus.length || !tierBudgets.length) {
    throw new Error(
      'MCI rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-mci.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertMCIEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, mciRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (from I/O Matrix in rde.5 story) ────────────────────────────────

describe('MCI parallel-write contract', () => {
  // No MCI
  assertMCIEqual(
    fixture('No MCI').merit({ name: 'Allies', category: 'influence', cp: 2, xp: 0, rating: 2 }),
    'no MCI merit — no grants fire',
  );

  // MCI rating 0 (purchased at 0, inactive effectively)
  assertMCIEqual(
    fixture('MCI rating 0').withMCI({ rating: 0 }),
    'MCI rating 0 — no grants fire',
  );

  // MCI inactive flag
  assertMCIEqual(
    fixture('MCI inactive').withMCI({ rating: 3, active: false }),
    'MCI active:false — no grants fire regardless of rating',
  );

  // I/O Matrix row 1: rating 1, dot1=merits → pool=1
  assertMCIEqual(
    fixture('MCI 1 merits').withMCI({ rating: 1, dot1Choice: 'merits' }),
    'MCI 1 dot1=merits — pool:1',
  );

  // I/O Matrix row 2: rating 1, dot1=speciality → pool=0, spec populated
  assertMCIEqual(
    fixture('MCI 1 speciality').withMCI({
      rating: 1,
      dot1Choice: 'speciality',
      dot1SpecSkill: 'Occult',
      dot1Spec: 'Hauntings',
    }),
    'MCI 1 dot1=speciality — pool:0, _mci_free_specs populated',
  );

  // Speciality choice with missing spec fields — no spec pushed, pool still 0
  assertMCIEqual(
    fixture('MCI 1 speciality no spec').withMCI({
      rating: 1,
      dot1Choice: 'speciality',
      dot1SpecSkill: null,
      dot1Spec: null,
    }),
    'MCI 1 dot1=speciality with no spec fields — pool:0, _mci_free_specs empty',
  );

  // I/O Matrix row 3: rating 3, merits/skill → pool=1+1+0=2, _mci_dot3_skills populated
  assertMCIEqual(
    fixture('MCI 3 merits+skill').withMCI({
      rating: 3,
      dot1Choice: 'merits',
      dot3Choice: 'skill',
      dot3Skill: 'Occult',
    }),
    'MCI 3 dot1=merits dot3=skill — pool:2, _mci_dot3_skills populated',
  );

  // I/O Matrix row 4: rating 3, merits/merits → pool=1+1+2=4
  assertMCIEqual(
    fixture('MCI 3 merits+merits').withMCI({
      rating: 3,
      dot1Choice: 'merits',
      dot3Choice: 'merits',
    }),
    'MCI 3 dot1=merits dot3=merits — pool:4',
  );

  // I/O Matrix row 5: rating 5, speciality/skill/advantage → pool=0+1+0+3+0=4
  assertMCIEqual(
    fixture('MCI 5 spec+skill+adv').withMCI({
      rating: 5,
      dot1Choice: 'speciality',
      dot1SpecSkill: 'Politics',
      dot1Spec: 'Court Intrigue',
      dot3Choice: 'skill',
      dot3Skill: 'Stealth',
      dot5Choice: 'advantage',
    }),
    'MCI 5 dot1=speciality dot3=skill dot5=advantage — pool:4, spec+skill side-effects',
  );

  // I/O Matrix row 6: rating 5, merits/merits/merits → pool=1+1+2+3+3=10
  assertMCIEqual(
    fixture('MCI 5 all merits').withMCI({
      rating: 5,
      dot1Choice: 'merits',
      dot3Choice: 'merits',
      dot5Choice: 'merits',
    }),
    'MCI 5 all merits — pool:10',
  );

  // Rating 0 via inline fields (cp=0, xp=0, free=0) — no pool
  assertMCIEqual(
    fixture('MCI cp=0').withMCI({ rating: 0, dot1Choice: 'merits' }),
    'MCI with cp:0 xp:0 free:0 — no grants fire',
  );

  // Two MCIs — pools sum
  assertMCIEqual(
    fixture('Two MCIs')
      .withMCI({ rating: 1, dot1Choice: 'merits' })
      .withMCI({ rating: 3, dot1Choice: 'merits', dot3Choice: 'merits' }),
    'two MCI merits — pools sum (1 + 4 = 5)',
  );

  // Two MCIs, one inactive
  assertMCIEqual(
    fixture('Two MCIs one inactive')
      .withMCI({ rating: 3, dot1Choice: 'merits', dot3Choice: 'merits' })
      .withMCI({ rating: 5, dot1Choice: 'merits', dot3Choice: 'merits', dot5Choice: 'merits', active: false }),
    'two MCIs, one inactive — only active one contributes (pool:4)',
  );

  // Idempotency: running evaluator twice produces same snapshot
  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem MCI').withMCI({ rating: 3, dot1Choice: 'merits', dot3Choice: 'merits' }).build();
    const c2 = fixture('Idem MCI').withMCI({ rating: 3, dot1Choice: 'merits', dot3Choice: 'merits' }).build();
    runEvaluatorPath(c1, mciRules);
    runEvaluatorPath(c1, mciRules); // second pass on same object
    runEvaluatorPath(c2, mciRules); // one pass
    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
