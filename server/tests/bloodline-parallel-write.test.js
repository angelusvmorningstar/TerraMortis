/**
 * Parallel-write contract test — Bloodline grants.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new bloodline evaluator on deep-cloned copies of the
 * same fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires bloodline rule docs in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-bloodlines.js --apply`).
 *
 * Normalisation: snapshotCharacter() handles Sets→arrays, merit sorting,
 * and grant-pool sorting.
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

vi.mock('../../public/js/data/loader.js', () => ({
  getRulesByCategory: () => [],
  getRuleByKey: () => null,
  getRulesDB: () => [],
  sanitiseChar: c => c,
  loadCharsFromApi: async () => null,
}));

// Stub load-rules.js — getRulesBySource returns the DB-seeded bloodline rules.
vi.mock('../../public/js/editor/rule_engine/load-rules.js', () => ({
  preloadRules: async () => {},
  invalidateRulesCache: () => {},
  getRulesCache: () => null,
  getRulesBySource: () => store,
}));

import { applyDerivedMerits } from '../lib/rule_engine/_legacy-bridge.js';
import { snapshotCharacter, fixture } from './helpers/apply-derived-merits-snapshot.js';
import { applyBloodlineRulesFromDb } from '../../public/js/editor/rule_engine/bloodline-evaluator.js';
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
 * Run the evaluator path: phase-1 clear + bloodline evaluator + phase-5 sync.
 * Mirrors what applyDerivedMerits does, but replaces the bloodline block with
 * applyBloodlineRulesFromDb.
 */
function runEvaluatorPath(c, bloodlineRules) {
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

  // Run bloodline evaluator (replaces legacy bloodline block)
  applyBloodlineRulesFromDb(c, bloodlineRules);

  // Phase 5: final sync
  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let bloodlineRules;

beforeAll(async () => {
  await setupDb();
  const SOURCE = 'Bloodline';
  const grants = await getCollection('rule_grant').find({ source: SOURCE }).toArray();

  // Populate hoisted store so the mocked getRulesBySource feeds applyDerivedMerits
  Object.assign(store, { grants, nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null });
  bloodlineRules = { grants };

  if (!grants.length) {
    throw new Error(
      'Bloodline rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-bloodlines.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertBloodlineEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, bloodlineRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.7 story) ───────────────────────────────────

describe('Bloodline parallel-write contract', () => {
  // Row 1: no bloodline — no grants, no specs
  assertBloodlineEqual(
    fixture('No bloodline'),
    'no bloodline — no merits created, no specs pushed',
  );

  // Row 1 variant: null bloodline explicitly set
  assertBloodlineEqual(
    fixture('Null bloodline').withBloodline(null),
    'bloodline=null — no grants fire',
  );

  // Row 2: Gorgons — both merits auto-created, Animal Ken gets snakes spec
  assertBloodlineEqual(
    fixture('Gorgons fresh').withBloodline('Gorgons'),
    'Gorgons bloodline — Area of Expertise(snakes) + Interdisciplinary Specialty(snakes) created; Animal Ken spec pushed',
  );

  // Row 2 variant: Gorgons with Animal Ken already present — spec pushed if absent
  assertBloodlineEqual(
    fixture('Gorgons with Animal Ken')
      .withBloodline('Gorgons')
      .skill('Animal Ken', { dots: 2, bonus: 0, specs: [], nine_again: false }),
    'Gorgons — Animal Ken exists with no specs; snakes pushed',
  );

  // Row 2 variant: Gorgons with Animal Ken that already has snakes spec — no duplicate
  assertBloodlineEqual(
    fixture('Gorgons snakes already present')
      .withBloodline('Gorgons')
      .skill('Animal Ken', { dots: 2, bonus: 0, specs: ['snakes'], nine_again: false }),
    'Gorgons — snakes already in Animal Ken.specs; not duplicated',
  );

  // Row 2 variant: Gorgons merits already exist — free_bloodline refreshed, not duplicated
  assertBloodlineEqual(
    fixture('Gorgons merits already exist')
      .withBloodline('Gorgons')
      .merit({ name: 'Area of Expertise', category: 'general', qualifier: 'snakes', granted_by: 'Bloodline', free_bloodline: 0, cp: 0, xp: 0 })
      .merit({ name: 'Interdisciplinary Specialty', category: 'general', qualifier: 'snakes', granted_by: 'Bloodline', free_bloodline: 0, cp: 0, xp: 0 }),
    'Gorgons merits already present — free_bloodline refreshed to 1, not duplicated',
  );

  // Row 3: non-Gorgons bloodline — no grants (no rules defined for them)
  assertBloodlineEqual(
    fixture('Zelani no grants').withBloodline('Zelani'),
    'Zelani bloodline — no bloodline grant rules defined; nothing fires',
  );

  // Row 3 variant: bloodline name case-insensitive match
  assertBloodlineEqual(
    fixture('Gorgons lowercase').withBloodline('gorgons'),
    'bloodline name "gorgons" matches rule bloodline_name "Gorgons" case-insensitively',
  );

  // Row 4: bloodline change — stale free_bloodline cleared on old merits
  assertBloodlineEqual(
    fixture('Bloodline change stale merits')
      .withBloodline('Zelani')
      .merit({ name: 'Area of Expertise', category: 'general', qualifier: 'snakes', granted_by: 'Bloodline', free_bloodline: 1, cp: 0, xp: 0 })
      .merit({ name: 'Interdisciplinary Specialty', category: 'general', qualifier: 'snakes', granted_by: 'Bloodline', free_bloodline: 1, cp: 0, xp: 0 }),
    'bloodline changed to Zelani — stale free_bloodline cleared on orphaned Gorgons merits',
  );

  // Qualifier case normalisation — existing merit with uppercase Snakes gets normalised
  assertBloodlineEqual(
    fixture('Gorgons qualifier case normalise')
      .withBloodline('Gorgons')
      .merit({ name: 'Area of Expertise', category: 'general', qualifier: 'Snakes', granted_by: 'Bloodline', free_bloodline: 0, cp: 0, xp: 0 }),
    'Gorgons — existing merit with qualifier "Snakes" normalised to "snakes" and refreshed',
  );

  // Idempotency: running evaluator twice produces same snapshot
  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem Gorgons')
      .withBloodline('Gorgons')
      .skill('Animal Ken', { dots: 1, bonus: 0, specs: [], nine_again: false })
      .build();
    const c2 = fixture('Idem Gorgons')
      .withBloodline('Gorgons')
      .skill('Animal Ken', { dots: 1, bonus: 0, specs: [], nine_again: false })
      .build();
    runEvaluatorPath(c1, bloodlineRules);
    runEvaluatorPath(c1, bloodlineRules); // second pass on same object
    runEvaluatorPath(c2, bloodlineRules); // one pass
    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
