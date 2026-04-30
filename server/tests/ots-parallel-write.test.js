/**
 * Parallel-write contract test — Oath of the Scapegoat grants.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new OTS evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the OTS rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-ots.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — keyed by source name; shared between vi.mock factory and beforeAll
const storeMap = vi.hoisted(() => ({
  'Oath of the Scapegoat': { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
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
import { applyOTSRulesFromDb } from '../../public/js/editor/rule_engine/ots-evaluator.js';
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

function fightingStylesSnapshot(c) {
  return (c.fighting_styles || []).map(fs => ({
    name: fs.name,
    free_ots: fs.free_ots ?? 0,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Run the evaluator path: phase-1 OTS clear + evaluator + final sync.
 * Mirrors what applyDerivedMerits does for the OTS block only.
 */
function runEvaluatorPath(c, otsRules) {
  c._pt_nine_again_skills = new Set();
  c._pt_dot4_bonus_skills = new Set();
  delete c._mci_dot3_skills;
  delete c._ohm_nine_again_skills;
  c._grant_pools = [];
  c._mci_free_specs = [];
  c._bloodline_free_specs = [];

  applyOTSRulesFromDb(c, otsRules);

  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let otsRules;

beforeAll(async () => {
  await setupDb();

  const otsGrants = await getCollection('rule_grant')
    .find({ source: 'Oath of the Scapegoat' })
    .toArray();

  Object.assign(storeMap['Oath of the Scapegoat'], { grants: otsGrants });
  otsRules = { grants: otsGrants };

  if (!otsGrants.length) {
    throw new Error(
      'OTS rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-ots.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertOTSEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, otsRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
    expect(fightingStylesSnapshot(eval_)).toEqual(fightingStylesSnapshot(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.13 story) ──────────────────────────────────

describe('OTS parallel-write contract', () => {

  // Row 1: OTS pact rating 2 → _ots_covenant_bonus: 2, _ots_free_dots: 4
  assertOTSEqual(
    fixture('OTS Bearer').withOTS({ cp: 2 }),
    'OTS rating 2 → _ots_covenant_bonus=2, _ots_free_dots=4',
  );

  // Row 2: OTS pact absent → bonus=0, free_dots=0, free_ots cleared on styles
  assertOTSEqual(
    fixture('No OTS')
      .withPetStyle('K-9', { rating: 1 }),
    'OTS absent → zeros + free_ots cleared on styles',
  );

  // Row 3: OTS rating 0 (pact present but cp=0, xp=0) → same as absent
  assertOTSEqual(
    fixture('OTS Zero')
      .withOTS({ cp: 0, xp: 0 })
      .withPetStyle('K-9', { rating: 1 }),
    'OTS rating 0 → zeros + free_ots cleared',
  );

  // Row 4: OTS rating 1 → _ots_covenant_bonus: 1, _ots_free_dots: 2
  assertOTSEqual(
    fixture('OTS Rating 1').withOTS({ cp: 1 }),
    'OTS rating 1 → _ots_covenant_bonus=1, _ots_free_dots=2',
  );

  // Row 5: OTS rating from xp dots
  assertOTSEqual(
    fixture('OTS XP Only').withOTS({ cp: 0, xp: 3 }),
    'OTS rating from xp only → _ots_covenant_bonus=3, _ots_free_dots=6',
  );

  // Row 6: OTS rating mixed cp+xp
  assertOTSEqual(
    fixture('OTS Mixed').withOTS({ cp: 1, xp: 2 }),
    'OTS rating cp=1 xp=2 → _ots_covenant_bonus=3, _ots_free_dots=6',
  );

  // Row 7: OTS absent, pre-existing free_ots on style → cleared
  assertOTSEqual(
    fixture('Stale OTS')
      .withPetStyle('Two-Weapon Fighting', { rating: 2 }),
    'OTS absent + stale free_ots on style → free_ots zeroed',
  );

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem OTS').withOTS({ cp: 2 }).build();
    const c2 = fixture('Idem OTS').withOTS({ cp: 2 }).build();

    runEvaluatorPath(c1, otsRules);
    runEvaluatorPath(c1, otsRules); // second pass
    runEvaluatorPath(c2, otsRules); // one pass

    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
