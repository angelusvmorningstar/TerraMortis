/**
 * Parallel-write contract test — Viral Mythology Allies pool grant.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new pool evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the VM rule doc to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-vm.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — keyed by source name; shared between vi.mock factory and beforeAll
const storeMap = vi.hoisted(() => ({
  'Viral Mythology': { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
}));

vi.mock('../../public/js/data/loader.js', () => ({
  getRulesByCategory: () => [],
  getRuleByKey: () => null,
  getRulesDB: () => [],
  sanitiseChar: c => c,
  loadCharsFromApi: async () => null,
}));

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

const FREE_FIELDS = [
  'free_bloodline', 'free_pet', 'free_mci', 'free_vm', 'free_lk',
  'free_ohm', 'free_inv', 'free_pt', 'free_mdb', 'free_sw',
];
const SKIP_FINAL_SYNC = new Set(['Mystery Cult Initiation', 'Professional Training', 'Mandragora Garden']);

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
 * Run the evaluator path: phase-1 clear + VM pool evaluator + final sync.
 * Mirrors what applyDerivedMerits does for the VM block only.
 */
function runEvaluatorPath(c, vmRules) {
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

  applyPoolRulesFromDb(c, vmRules);

  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let vmRules;

beforeAll(async () => {
  await setupDb();

  const vmGrants = await getCollection('rule_grant')
    .find({ source: 'Viral Mythology', grant_type: 'pool' })
    .toArray();

  Object.assign(storeMap['Viral Mythology'], { grants: vmGrants });
  vmRules = { grants: vmGrants };

  if (!vmGrants.length) {
    throw new Error(
      'VM rule doc not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-vm.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertVMEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, vmRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.10 story) ─────────────────────────────────

describe('VM pool parallel-write contract', () => {

  // Row 1: VM rating 2, Allies (Police) rating 2 → pool entry with amount 2
  assertVMEqual(
    fixture('VM + Allies 2').withViralMythology(2),
    'VM present + Allies (Police) cp=2 → pool entry amount 2',
  );

  // Row 2: VM absent → no pool entry
  assertVMEqual(
    fixture('No VM')
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 2, xp: 0, free_mci: 0 }),
    'VM absent, Allies present → no pool entry',
  );

  // Row 3: VM present, no Allies → pool size 0, no entry
  assertVMEqual(
    fixture('VM no Allies')
      .merit({ name: 'Viral Mythology', category: 'general', cp: 1, xp: 0, free: 0 }),
    'VM present, no Allies → no pool entry',
  );

  // Row 4: VM + multiple Allies merits → pool aggregates all non-VM-granted Allies
  assertVMEqual(
    fixture('VM multiple Allies')
      .merit({ name: 'Viral Mythology', category: 'general', cp: 1, xp: 0, free: 0 })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 3, xp: 0, free_mci: 0 })
      .merit({ name: 'Allies', category: 'influence', area: 'Criminal', cp: 2, xp: 1, free_mci: 0 }),
    'VM + multiple Allies merits → pool amount = sum of all non-VM Allies dots (6)',
  );

  // Row 5: VM + Allies with free_mci dots → free_mci included in pool basis
  assertVMEqual(
    fixture('VM Allies with MCI dots')
      .merit({ name: 'Viral Mythology', category: 'general', cp: 1, xp: 0, free: 0 })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 2, xp: 0, free_mci: 1 }),
    'VM + Allies with 2cp + 1 free_mci → pool amount 3',
  );

  // Row 6: VM + VM-granted Allies excluded from pool basis (no feedback loop)
  assertVMEqual(
    fixture('VM with VM-granted Allies excluded')
      .merit({ name: 'Viral Mythology', category: 'general', cp: 1, xp: 0, free: 0 })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 2, xp: 0, free_mci: 0 })
      .merit({ name: 'Allies', category: 'influence', area: 'Media', cp: 0, xp: 0, free_mci: 0, granted_by: 'VM', free_vm: 2 }),
    'VM + Allies cp=2 + VM-granted Allies → pool amount 2 (VM-granted excluded)',
  );

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem VM').withViralMythology(3).build();
    const c2 = fixture('Idem VM').withViralMythology(3).build();

    runEvaluatorPath(c1, vmRules);
    runEvaluatorPath(c1, vmRules); // second pass
    runEvaluatorPath(c2, vmRules); // one pass

    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
