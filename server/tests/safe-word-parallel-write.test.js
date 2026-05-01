/**
 * Parallel-write contract test — Oath of the Safe Word free_sw grant.
 *
 * For each scenario in the I/O matrix, runs the legacy applyDerivedMerits
 * code path AND the new Safe Word evaluator on deep-cloned copies of the same
 * fixture pair, then asserts their normalised snapshots are deep-equal.
 *
 * Requires the SW rule doc to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-safe-word.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted store — keyed by source name; shared between vi.mock factory and beforeAll
const storeMap = vi.hoisted(() => ({
  'Oath of the Safe Word': { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null },
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
import { snapshotCharacter, buildFixturePair } from './helpers/apply-derived-merits-snapshot.js';
import { applySafeWordRulesFromDb } from '../../public/js/editor/rule_engine/safe-word-evaluator.js';
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
 * Run the evaluator path: phase-1 clear + SW evaluator + final sync.
 * Mirrors what applyDerivedMerits does for the Safe Word block only.
 */
function runEvaluatorPath(c, swRules, allChars) {
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

  applySafeWordRulesFromDb(c, swRules, allChars);

  applyFinalSync(c);
}

// ── Test setup ────────────────────────────────────────────────────────────────

let swRules;

beforeAll(async () => {
  await setupDb();

  const swGrants = await getCollection('rule_grant')
    .find({ source: 'Oath of the Safe Word', grant_type: 'merit' })
    .toArray();

  Object.assign(storeMap['Oath of the Safe Word'], { grants: swGrants });
  swRules = { grants: swGrants };

  if (!swGrants.length) {
    throw new Error(
      'SW rule doc not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-safe-word.js --apply',
    );
  }
});

afterAll(() => teardownDb());

// ── Scenario runner ───────────────────────────────────────────────────────────

/**
 * buildPair returns a factory: () => [charA, charB].
 * Called twice per test so legacy and evaluator paths get independent deep clones.
 */
function assertSWEqual(buildPair, label) {
  it(label, () => {
    const [legacyA, legacyB] = buildPair();
    const [evalA, evalB] = buildPair();

    applyDerivedMerits(legacyA, [legacyA, legacyB]);
    runEvaluatorPath(evalA, swRules, [evalA, evalB]);

    expect(snapshotCharacter(evalA)).toEqual(snapshotCharacter(legacyA));
  });
}

// ── Scenarios (I/O Matrix from rde.12 story) ──────────────────────────────────

describe('Safe Word parallel-write contract', () => {

  // Row 1: mutual pact, B's Resources cp=4 → A's mirrored Resources free_sw=4
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      bb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
      bb.merit({ name: 'Resources', category: 'influence', cp: 4, xp: 0, free: 0 });
      return [ab.build(), bb.build()];
    },
    'mutual pact + B Resources cp=4 → A mirrored Resources free_sw=4',
  );

  // Row 2: A has OSW pointing at B, B has no OSW → no grant
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      bb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0 });
      return [ab.build(), bb.build()];
    },
    'A has OSW, B has no OSW → no grant on A',
  );

  // Row 3: A has OSW pointing at B, B's OSW points at someone else → no grant
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      bb.withSafeWord({ partner: 'Carol', sharedMerit: 'Resources' }); // B points at Carol, not A
      bb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0 });
      return [ab.build(), bb.build()];
    },
    "B's OSW points at someone else → no grant on A",
  );

  // Row 4: pact present but non-mutual, stale SW merit removed when no own dots
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      // pre-existing stale SW merit on A with no own dots
      ab.merit({ name: 'Resources', category: 'influence', granted_by: 'Safe Word', cp: 0, xp: 0, free_sw: 0 });
      // B has no OSW → isActive=false → removal fires
      return [ab.build(), bb.build()];
    },
    'non-mutual pact + stale SW merit (no own dots) → merit removed',
  );

  // Row 5: area-qualified shared merit e.g. "Allies (Police)" → correctly matched
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      bb.withSafeWord({ partner: 'Alice', sharedMerit: 'Allies (Police)' });
      bb.merit({ name: 'Allies', category: 'influence', area: 'Police', cp: 3, xp: 0, free: 0 });
      return [ab.build(), bb.build()];
    },
    'area-qualified shared merit "Allies (Police)" → free_sw=3 on A',
  );

  // Row 6: partner merit includes free_mci dots → included in effective rating
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      bb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
      bb.merit({ name: 'Resources', category: 'influence', cp: 2, xp: 0, free: 0, free_mci: 1 });
      return [ab.build(), bb.build()];
    },
    'partner Resources 2cp + 1 free_mci → free_sw=3 on A',
  );

  // Row 7: partner has SW merit on themselves (free_sw on their Resources) — excluded from grant
  assertSWEqual(
    () => {
      const [ab, bb] = buildFixturePair('Alice', 'Bob');
      ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
      bb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
      // B's Resources has some free_sw on it (from B's own SW grant from A) — must not feed back
      bb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0, free_sw: 99 });
      return [ab.build(), bb.build()];
    },
    "partner's free_sw excluded from effective rating → no circular inflation",
  );

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('idempotency — running evaluator twice produces same snapshot', () => {
    const [ab, bb] = buildFixturePair('Alice', 'Bob');
    ab.withSafeWord({ partner: 'Bob', sharedMerit: '' });
    bb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
    bb.merit({ name: 'Resources', category: 'influence', cp: 4, xp: 0, free: 0 });

    const [c1a, c1b] = [ab.build(), bb.build()];
    const [c2a, c2b] = [ab.build(), bb.build()];

    runEvaluatorPath(c1a, swRules, [c1a, c1b]);
    runEvaluatorPath(c1a, swRules, [c1a, c1b]); // second pass
    runEvaluatorPath(c2a, swRules, [c2a, c2b]); // one pass

    expect(snapshotCharacter(c1a)).toEqual(snapshotCharacter(c2a));
  });
});
