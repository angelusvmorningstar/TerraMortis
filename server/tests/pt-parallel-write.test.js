/**
 * Parallel-write contract test — Professional Training.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new PT evaluator on deep-cloned copies of the same
 * fixture, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the PT rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-pt.js --apply`).
 *
 * Normalisation: snapshotCharacter() (from RDE-1) handles Sets→arrays,
 * merit sorting, and grant-pool sorting. We apply the same post-phase-5
 * rating sync in both paths so Contacts.rating matches.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — shared between vi.mock factory (hoisted) and beforeAll (runtime)
const store = vi.hoisted(() => ({ grants: [], nineAgain: [], skillBonus: [] }));

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
import { snapshotCharacter, fixture, buildFixturePair } from './helpers/apply-derived-merits-snapshot.js';
import { applyPTRulesFromDb } from '../../public/js/editor/rule_engine/pt-evaluator.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKIP_FINAL_SYNC = new Set(['Mystery Cult Initiation', 'Professional Training', 'Mandragora Garden']);
const FREE_FIELDS = [
  'free_bloodline', 'free_pet', 'free_mci', 'free_vm', 'free_lk',
  'free_ohm', 'free_inv', 'free_pt', 'free_mdb', 'free_sw',
];

/** Mirror the final rating sync from applyDerivedMerits (lines 319-326 post-RDE-0). */
function applyFinalSync(c) {
  (c.merits || []).forEach(m => {
    // inherent-intentional: default-filling undefined free_* mirrors ensureMeritSync
    FREE_FIELDS.forEach(f => { if (m[f] === undefined) m[f] = 0; });
    if (m.cp === undefined) m.cp = 0;
    if (m.xp === undefined) m.xp = 0;
  });
  (c.merits || []).forEach(m => {
    if (SKIP_FINAL_SYNC.has(m.name)) return;
    // inherent-intentional: summing cp+xp+free_* mirrors legacy final-sync; not evaluation
    const total = FREE_FIELDS.reduce((s, f) => s + (m[f] || 0), 0) + (m.cp || 0) + (m.xp || 0);
    if (total > 0) m.rating = total;
  });
}

/**
 * Run the evaluator path: mirrors what applyDerivedMerits does, but replaces
 * the PT block with applyPTRulesFromDb. Phase-1 clear + PT evaluator + phase-5 sync.
 */
function runEvaluatorPath(c, ptRules) {
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

  // Run PT evaluator (replaces legacy PT block)
  applyPTRulesFromDb(c, ptRules);

  // Phase 5: final sync
  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let ptRules;

beforeAll(async () => {
  await setupDb();
  const [grants, nineAgain, skillBonus] = await Promise.all([
    getCollection('rule_grant').find({ source: 'Professional Training' }).toArray(),
    getCollection('rule_nine_again').find({ source: 'Professional Training' }).toArray(),
    getCollection('rule_skill_bonus').find({ source: 'Professional Training' }).toArray(),
  ]);
  // Populate hoisted store so the mocked getRulesBySource returns DB rules to applyDerivedMerits
  Object.assign(store, { grants, nineAgain, skillBonus });
  ptRules = store;

  if (!grants.length || !nineAgain.length || !skillBonus.length) {
    throw new Error(
      'PT rule docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-pt.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

function assertPTEqual(fixtureBuilder, label) {
  it(label, () => {
    const legacy = fixtureBuilder.build();
    const eval_ = fixtureBuilder.build();

    applyDerivedMerits(legacy, []);
    runEvaluatorPath(eval_, ptRules);

    expect(snapshotCharacter(eval_)).toEqual(snapshotCharacter(legacy));
  });
}

// ── Scenarios (from I/O Matrix in rde.3 story) ────────────────────────────────

describe('PT parallel-write contract', () => {
  assertPTEqual(
    fixture('No PT').merit({ name: 'Allies', category: 'influence', cp: 2, xp: 0, free: 0, rating: 2 }),
    'no PT merit — no grants fire',
  );

  assertPTEqual(
    fixture('PT rating 0').withPT({ rating: 0 }),
    'PT rating 0 — no grants fire',
  );

  assertPTEqual(
    fixture('PT rating 1').withPT({ rating: 1 }),
    'PT rating 1 — free_pt:2 on Contacts (auto-created)',
  );

  assertPTEqual(
    fixture('PT rating 1 + existing Contacts').withPT({ rating: 1 }).merit({
      name: 'Contacts', category: 'influence', cp: 1, xp: 0, free: 0, rating: 1,
    }),
    'PT rating 1 with existing Contacts — free_pt:2 added, not duplicated',
  );

  assertPTEqual(
    fixture('PT rating 2').withPT({ rating: 2, assetSkills: ['Brawl', 'Stealth'] }),
    'PT rating 2 — Brawl + Stealth in _pt_nine_again_skills',
  );

  assertPTEqual(
    fixture('PT rating 2 no assets').withPT({ rating: 2, assetSkills: [] }),
    'PT rating 2 with no asset skills — nine-again set empty',
  );

  assertPTEqual(
    fixture('PT rating 4').withPT({ rating: 4, assetSkills: ['Brawl'], dot4Skill: 'Brawl' }),
    'PT rating 4 — dot4 Brawl in _pt_dot4_bonus_skills',
  );

  assertPTEqual(
    fixture('PT rating 4 no dot4_skill').withPT({ rating: 4, assetSkills: ['Brawl'] }),
    'PT rating 4 without dot4_skill — _pt_dot4_bonus_skills empty',
  );

  assertPTEqual(
    fixture('PT rating 5').withPT({ rating: 5, assetSkills: ['Drive', 'Firearms'], dot4Skill: 'Drive' }),
    'PT rating 5 — dot4 and nine-again both fire',
  );

  // Multi-purchase: two PT merits
  assertPTEqual(
    fixture('Two PTs')
      .withPT({ rating: 2, assetSkills: ['Brawl', 'Stealth'] })
      .withPT({ rating: 2, assetSkills: ['Occult', 'Investigation'] }),
    'two PT merits — each contributes its own asset skills',
  );

  // Dot4 cap: Brawl dots:4, bonus:1 → skTotal returns 5 (cap), not 6
  assertPTEqual(
    fixture('PT dot4 cap check')
      .withPT({ rating: 4, assetSkills: ['Brawl'], dot4Skill: 'Brawl' })
      .skill('Brawl', { dots: 4, bonus: 1 }),
    'PT dot4 cap — Brawl with dots:4 bonus:1 fires grant (skTotal enforces cap at 5)',
  );

  // Idempotency: same fixture built fresh each time (build() deep-clones)
  it('idempotency — running evaluator twice produces same snapshot', () => {
    const c1 = fixture('Idem PT').withPT({ rating: 1 }).build();
    const c2 = fixture('Idem PT').withPT({ rating: 1 }).build();
    runEvaluatorPath(c1, ptRules);
    runEvaluatorPath(c1, ptRules); // second pass on same object
    runEvaluatorPath(c2, ptRules); // one pass
    expect(snapshotCharacter(c1)).toEqual(snapshotCharacter(c2));
  });

  // Bonus dots on Contacts (cp:1, free_pt:2) → rating = 3
  assertPTEqual(
    fixture('PT with existing Contacts+cp')
      .withPT({ rating: 1 })
      .merit({ name: 'Contacts', category: 'influence', cp: 1, xp: 0, free: 0, rating: 1 }),
    'Contacts cp:1 + free_pt:2 → rating:3 after sync',
  );
});
