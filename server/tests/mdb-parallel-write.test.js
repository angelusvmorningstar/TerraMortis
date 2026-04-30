/**
 * Parallel-write contract test — Mother-Daughter Bond free_mdb grant.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new MDB evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the MDB rule doc to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-mdb.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — keyed by source name; shared between vi.mock factory and beforeAll
const storeMap = vi.hoisted(() => ({
  'The Mother-Daughter Bond': { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
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
import { applyMDBRulesFromDb } from '../../public/js/editor/rule_engine/mdb-evaluator.js';
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
 * Run the evaluator path: phase-1 clear + MDB evaluator + final sync.
 * Mirrors what applyDerivedMerits does for the MDB block only.
 */
function runEvaluatorPath(c, mdbRules) {
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

  applyMDBRulesFromDb(c, mdbRules);

  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let mdbRules;

beforeAll(async () => {
  await setupDb();

  const mdbGrants = await getCollection('rule_grant')
    .find({ source: 'The Mother-Daughter Bond', grant_type: 'merit' })
    .toArray();

  Object.assign(storeMap['The Mother-Daughter Bond'], { grants: mdbGrants });
  mdbRules = { grants: mdbGrants };

  if (!mdbGrants.length) {
    throw new Error(
      'MDB rule doc not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-mdb.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertMDBEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, mdbRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.11 story) ─────────────────────────────────

describe('MDB parallel-write contract', () => {

  // Row 1: MDB present, qualifier set, Mentor 3, style exists → free_mdb = 3
  assertMDBEqual(
    fixture('MDB Mentor 3 style present').withMDB({ mentorCp: 3 }),
    'MDB + Mentor cp=3 + style present → free_mdb=3',
  );

  // Row 2: MDB present, qualifier set, style merit absent → free_mdb stays 0
  assertMDBEqual(
    fixture('MDB style absent').withMDB({ mentorCp: 2, addStyle: false }),
    'MDB + Mentor cp=2 + style absent → no grant',
  );

  // Row 3: MDB absent → all free_mdb cleared, no grant
  assertMDBEqual(
    fixture('No MDB')
      .merit({ name: 'Mentor', category: 'influence', cp: 3, xp: 0, free: 0 })
      .merit({ name: 'Opening the Void', category: 'general', cp: 0, xp: 0, free: 0, free_mdb: 0 }),
    'MDB absent → no grant',
  );

  // Row 4: MDB present, qualifier blank → no grant
  assertMDBEqual(
    fixture('MDB no qualifier')
      .merit({ name: 'The Mother-Daughter Bond', category: 'general', qualifier: '', cp: 1, xp: 0, free: 0, free_mdb: 0 })
      .merit({ name: 'Mentor', category: 'influence', cp: 3, xp: 0, free: 0 }),
    'MDB present but qualifier blank → no grant',
  );

  // Row 5: Mentor absent → no grant
  assertMDBEqual(
    fixture('MDB no Mentor')
      .merit({ name: 'The Mother-Daughter Bond', category: 'general', qualifier: 'Opening the Void', cp: 1, xp: 0, free: 0, free_mdb: 0 })
      .merit({ name: 'Opening the Void', category: 'general', cp: 0, xp: 0, free: 0, free_mdb: 0 }),
    'MDB present but Mentor absent → no grant',
  );

  // Row 6: Mentor with free_mci dots → free_mci included in effective rating
  assertMDBEqual(
    fixture('MDB Mentor with MCI dots')
      .merit({ name: 'The Mother-Daughter Bond', category: 'general', qualifier: 'Opening the Void', cp: 1, xp: 0, free: 0, free_mdb: 0 })
      .merit({ name: 'Mentor', category: 'influence', cp: 2, xp: 0, free: 0, free_mci: 1 })
      .merit({ name: 'Opening the Void', category: 'general', cp: 0, xp: 0, free: 0, free_mdb: 0 }),
    'MDB + Mentor 2cp + 1 free_mci → free_mdb=3',
  );

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem MDB').withMDB({ mentorCp: 3 }).build();
    const c2 = fixture('Idem MDB').withMDB({ mentorCp: 3 }).build();

    runEvaluatorPath(c1, mdbRules);
    runEvaluatorPath(c1, mdbRules); // second pass
    runEvaluatorPath(c2, mdbRules); // one pass

    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
