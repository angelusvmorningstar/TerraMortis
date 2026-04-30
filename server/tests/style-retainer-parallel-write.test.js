/**
 * Parallel-write contract test — K-9 + Falconry style-retainer grants.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new style-retainer evaluator on deep-cloned copies of the
 * same fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-style-retainers.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — keyed by source name; shared between vi.mock factory and beforeAll
const storeMap = vi.hoisted(() => ({
  'K-9':      { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
  'Falconry': { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
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
import { applyStyleRetainerRulesFromDb } from '../../public/js/editor/rule_engine/style-retainer-evaluator.js';
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
 * Run the evaluator path: phase-1 clear + style-retainer evaluators + final sync.
 * Mirrors what applyDerivedMerits does for the K-9/Falconry block only.
 */
function runEvaluatorPath(c, k9Rules, falconryRules) {
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

  applyStyleRetainerRulesFromDb(c, k9Rules);
  applyStyleRetainerRulesFromDb(c, falconryRules);

  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let k9Rules;
let falconryRules;

beforeAll(async () => {
  await setupDb();

  const [k9Grants, falconryGrants] = await Promise.all([
    getCollection('rule_grant').find({ source: 'K-9', condition: 'fighting_style_present' }).toArray(),
    getCollection('rule_grant').find({ source: 'Falconry', condition: 'fighting_style_present' }).toArray(),
  ]);

  Object.assign(storeMap['K-9'], { grants: k9Grants });
  Object.assign(storeMap['Falconry'], { grants: falconryGrants });

  k9Rules       = { grants: k9Grants };
  falconryRules = { grants: falconryGrants };

  if (!k9Grants.length || !falconryGrants.length) {
    throw new Error(
      'Style-retainer rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-style-retainers.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertRetainerEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, k9Rules, falconryRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.9 story) ──────────────────────────────────

describe('Style-retainer parallel-write contract', () => {

  // Row 1: K-9 purchased, no existing Retainer (Dog) → Retainer auto-created with free_pet=1
  assertRetainerEqual(
    fixture('K-9 purchased no Retainer').withPetStyle('K-9', { rating: 1 }),
    'K-9 purchased, no Retainer (Dog) → auto-created with free_pet=1',
  );

  // Row 2: K-9 purchased, existing Retainer (Dog) with granted_by:'K-9' → free_pet set to 1
  assertRetainerEqual(
    fixture('K-9 purchased existing Retainer')
      .withPetStyle('K-9', { rating: 1 })
      .merit({ name: 'Retainer', category: 'influence', area: 'Dog', granted_by: 'K-9', cp: 0, xp: 0, free_pet: 0, rating: 0 }),
    'K-9 purchased + existing Retainer (Dog) granted_by K-9 → free_pet=1 (not stacked)',
  );

  // Row 3: Falconry purchased, no Retainer (Falcon) → Retainer auto-created
  assertRetainerEqual(
    fixture('Falconry purchased no Retainer').withPetStyle('Falconry', { rating: 1 }),
    'Falconry purchased → Retainer (Falcon) auto-created with free_pet=1',
  );

  // Row 4: K-9 unpurchased, existing auto-Retainer → free_pet cleared to 0
  assertRetainerEqual(
    fixture('K-9 unpurchased orphan Retainer')
      .merit({ name: 'Retainer', category: 'influence', area: 'Dog', granted_by: 'K-9', cp: 0, xp: 0, free_pet: 1, rating: 1 }),
    'K-9 unpurchased, existing auto-Retainer → free_pet cleared to 0',
  );

  // Row 5: Both K-9 + Falconry purchased → two Retainers auto-created
  assertRetainerEqual(
    fixture('Both K-9 and Falconry')
      .withPetStyle('K-9', { rating: 1 })
      .withPetStyle('Falconry', { rating: 1 }),
    'K-9 + Falconry both purchased → two Retainers auto-created',
  );

  // Idempotency — running evaluator twice produces same snapshot
  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem').withPetStyle('K-9', { rating: 1 }).withPetStyle('Falconry', { rating: 1 }).build();
    const c2 = fixture('Idem').withPetStyle('K-9', { rating: 1 }).withPetStyle('Falconry', { rating: 1 }).build();

    runEvaluatorPath(c1, k9Rules, falconryRules);
    runEvaluatorPath(c1, k9Rules, falconryRules); // second pass
    runEvaluatorPath(c2, k9Rules, falconryRules); // one pass

    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
