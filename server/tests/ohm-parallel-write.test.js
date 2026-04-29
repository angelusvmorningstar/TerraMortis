/**
 * Parallel-write contract test — Oath of the Hard Motherfucker.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new OHM evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the OHM rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-ohm.js --apply`).
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
// getRulesBySource returns the DB-seeded OHM rules populated in beforeAll.
vi.mock('../../public/js/editor/rule_engine/load-rules.js', () => ({
  preloadRules: async () => {},
  invalidateRulesCache: () => {},
  getRulesCache: () => null,
  getRulesBySource: () => store,
}));

import { applyDerivedMerits } from '../lib/rule_engine/_legacy-bridge.js';
import { snapshotCharacter, fixture } from './helpers/apply-derived-merits-snapshot.js';
import { applyOHMRulesFromDb } from '../../public/js/editor/rule_engine/ohm-evaluator.js';
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
 * Run the evaluator path: phase-1 clear + OHM evaluator + phase-5 sync.
 * Mirrors what applyDerivedMerits does, but replaces the OHM block with applyOHMRulesFromDb.
 */
function runEvaluatorPath(c, ohmRules) {
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

  // Run OHM evaluator (replaces legacy OHM block)
  applyOHMRulesFromDb(c, ohmRules);

  // Phase 5: final sync
  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let ohmRules;

beforeAll(async () => {
  await setupDb();
  const SOURCE = 'Oath of the Hard Motherfucker';
  const [grants, nineAgain] = await Promise.all([
    getCollection('rule_grant').find({ source: SOURCE }).toArray(),
    getCollection('rule_nine_again').find({ source: SOURCE }).toArray(),
  ]);

  // Populate hoisted store so the mocked getRulesBySource feeds applyDerivedMerits
  Object.assign(store, { grants, nineAgain, skillBonus: [], specialityGrants: [], tierBudget: null });
  ohmRules = { grants, nineAgain };

  if (!grants.length || !nineAgain.length) {
    throw new Error(
      'OHM rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-ohm.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertOHMEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, ohmRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (I/O Matrix from rde.6 story) ───────────────────────────────────

describe('OHM parallel-write contract', () => {
  // Row 1: no pact, no stale FHP — nothing fires
  assertOHMEqual(
    fixture('No pact no FHP')
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, rating: 1 }),
    'no OHM pact, no stale FHP — no grants fire',
  );

  // Row 1 variant: no pact but stale FHP-via-OHM exists → FHP removed
  assertOHMEqual(
    fixture('No pact stale FHP')
      .merit({ name: 'Friends in High Places', category: 'general', granted_by: 'OHM', free_ohm: 1, rating: 1 }),
    'no OHM pact, stale FHP with granted_by=OHM — FHP removed',
  );

  // Row 2: pact present, full set — Contacts/Resources/Allies(Police) + FHP + 9-again
  assertOHMEqual(
    fixture('Full OHM')
      .withOHM({ sphere: 'Police', skills: ['Brawl', 'Investigation'] })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Resources', category: 'influence', cp: 2, xp: 0, rating: 2 })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 2, xp: 0, rating: 2 }),
    'OHM pact — Contacts+Resources+Allies(Police)+FHP+9-again all fire',
  );

  // Row 3: pact present, empty skills and sphere — FHP+Contacts+Resources only, no 9-again, no Allies
  assertOHMEqual(
    fixture('OHM no sphere no skills')
      .withOHM({ sphere: '', skills: [] })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Resources', category: 'influence', cp: 1, xp: 0, rating: 1 }),
    'OHM pact, empty sphere + skills — FHP+Contacts+Resources; no Allies grant, no 9-again',
  );

  // Row 4: pact present, Allies (Police) absent — Allies grant skipped silently
  assertOHMEqual(
    fixture('OHM Allies absent')
      .withOHM({ sphere: 'Police', skills: ['Brawl'] })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Resources', category: 'influence', cp: 1, xp: 0, rating: 1 }),
    'OHM pact, Allies(Police) absent — Allies grant skipped; rest applies',
  );

  // Existing FHP-via-OHM is refreshed (not duplicated) on re-apply
  assertOHMEqual(
    fixture('OHM FHP already exists')
      .withOHM({ sphere: '', skills: [] })
      .merit({ name: 'Friends in High Places', category: 'general', granted_by: 'OHM', free_ohm: 0, rating: 0 }),
    'OHM pact, FHP already present — free_ohm refreshed, not duplicated',
  );

  // Allies sphere case-insensitive match
  assertOHMEqual(
    fixture('OHM sphere case insensitive')
      .withOHM({ sphere: 'police', skills: [] })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 1, xp: 0, rating: 1 }),
    'OHM pact — sphere matching is case-insensitive',
  );

  // No Contacts or Resources merits — grant silently skipped; pool still 3
  assertOHMEqual(
    fixture('OHM no influence merits')
      .withOHM({ sphere: '', skills: [] }),
    'OHM pact, no Contacts or Resources merits — grants skipped, pool still 3',
  );

  // Idempotency: running evaluator twice produces same snapshot
  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem OHM')
      .withOHM({ sphere: 'Police', skills: ['Brawl'] })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Resources', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 1, xp: 0, rating: 1 })
      .build();
    const c2 = fixture('Idem OHM')
      .withOHM({ sphere: 'Police', skills: ['Brawl'] })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Resources', category: 'influence', cp: 1, xp: 0, rating: 1 })
      .merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 1, xp: 0, rating: 1 })
      .build();
    runEvaluatorPath(c1, ohmRules);
    runEvaluatorPath(c1, ohmRules); // second pass on same object
    runEvaluatorPath(c2, ohmRules); // one pass
    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });
});
