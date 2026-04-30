/**
 * Rule Engine integration tests — cross-evaluator behaviour.
 *
 * Three scenarios not covered by the per-evaluator parallel-write suites:
 *
 *   1. Multi-evaluator full-pass idempotency — running applyDerivedMerits twice
 *      on the same character object (K-9 + OTS + SW active) produces the same
 *      snapshot as a single pass. Catches silent merit duplication bugs.
 *
 *   2. Safe Word circular reference — direct value assertion that the partner's
 *      free_sw dots are excluded from the effective rating grant. Tests the
 *      one-hop rule at a specific known value rather than legacy-equiv only.
 *
 *   3. Safe Word lifecycle — merit auto-removed after pact dissolution in a
 *      subsequent render cycle; and merit retained (free_sw zeroed) when it
 *      also has own cp dots. Tests the full create → dissolve → re-render
 *      lifecycle that no per-evaluator parallel-write covers.
 *
 * Requires rule docs in tm_suite_test (run seed scripts with --apply for each
 * evaluator family before running this suite).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

const storeMap = vi.hoisted(() => ({}));

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
import { snapshotCharacter, fixture, buildFixturePair } from './helpers/apply-derived-merits-snapshot.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// ── Test setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await setupDb();

  const grantDocs = await getCollection('rule_grant').find({}).toArray();

  if (!grantDocs.length) {
    throw new Error(
      'No rule_grant docs found in tm_suite_test. ' +
      'Run seed scripts with --apply for each evaluator family.',
    );
  }

  for (const doc of grantDocs) {
    const src = doc.source;
    if (!storeMap[src]) {
      storeMap[src] = { grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null };
    }
    storeMap[src].grants.push(doc);
  }
});

afterAll(() => teardownDb());

// ── 1. Multi-evaluator full-pass idempotency ──────────────────────────────────

describe('multi-evaluator full-pass idempotency', () => {

  it('K-9 + OTS + SW: second applyDerivedMerits produces identical snapshot', () => {
    const [lb, pb] = buildFixturePair('Alice', 'Bob');

    lb.withPetStyle('K-9')
      .withOTS({ cp: 2 })
      .withSafeWord({ partner: 'Bob', sharedMerit: '' });

    pb.merit({ name: 'Resources', category: 'influence', cp: 4, xp: 0, free: 0 })
      .withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });

    const allChars      = [lb.build(), pb.build()];
    const allCharsFresh = [lb.build(), pb.build()];

    applyDerivedMerits(allChars[0], allChars);
    const snapFirst  = snapshotCharacter(allChars[0]);

    applyDerivedMerits(allChars[0], allChars); // second pass on same object
    const snapSecond = snapshotCharacter(allChars[0]);

    applyDerivedMerits(allCharsFresh[0], allCharsFresh);
    const snapFresh  = snapshotCharacter(allCharsFresh[0]);

    expect(snapSecond).toEqual(snapFirst);  // second pass == first pass
    expect(snapFirst).toEqual(snapFresh);   // first pass == fresh single-pass clone
  });

  it('K-9 Retainer merit appears exactly once after second pass (no duplication)', () => {
    const c1 = fixture('K-9 Char').withPetStyle('K-9').build();
    const c2 = fixture('K-9 Char').withPetStyle('K-9').build();

    applyDerivedMerits(c1, []);
    applyDerivedMerits(c1, []); // second pass

    applyDerivedMerits(c2, []); // single pass for comparison

    const retainers1 = c1.merits.filter(m => m.name === 'Retainer' && m.area === 'Dog');
    const retainers2 = c2.merits.filter(m => m.name === 'Retainer' && m.area === 'Dog');

    expect(retainers1).toHaveLength(1);
    expect(retainers1[0].free_pet).toBe(retainers2[0].free_pet);
  });

  it('SW auto-created merit appears exactly once after second pass', () => {
    const [lb, pb] = buildFixturePair('Alice', 'Bob');

    lb.withSafeWord({ partner: 'Bob', sharedMerit: '' });
    pb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
    pb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0 });

    const allChars = [lb.build(), pb.build()];

    applyDerivedMerits(allChars[0], allChars);
    applyDerivedMerits(allChars[0], allChars); // second pass

    const swMerits = allChars[0].merits.filter(
      m => m.name === 'Resources' && m.granted_by === 'Safe Word',
    );
    expect(swMerits).toHaveLength(1);
    expect(swMerits[0].free_sw).toBe(3);
  });

});

// ── 2. Safe Word circular reference — direct value assertions ─────────────────

describe('Safe Word circular reference: free_sw excluded from partner effective rating', () => {

  it("partner Resources free_sw=99 → grant is cp=3 only, not 102", () => {
    const [lb, pb] = buildFixturePair('Alice', 'Bob');

    lb.withSafeWord({ partner: 'Bob', sharedMerit: '' });
    pb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
    pb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0, free_sw: 99 });

    const lead    = lb.build();
    const partner = pb.build();

    applyDerivedMerits(lead, [lead, partner]);

    const swMerit = lead.merits.find(m => m.name === 'Resources' && m.granted_by === 'Safe Word');
    expect(swMerit).toBeTruthy();
    expect(swMerit.free_sw).toBe(3);   // free_sw=99 excluded; only cp=3 counted
    expect(swMerit.rating).toBe(3);    // final sync reflects correct effective rating
  });

  it("partner Allies free_mci=1 + free_sw=5 → grant is cp+free_mci=3 only (free_sw excluded)", () => {
    const [lb, pb] = buildFixturePair('Alice', 'Bob');

    lb.withSafeWord({ partner: 'Bob', sharedMerit: '' });
    pb.withSafeWord({ partner: 'Alice', sharedMerit: 'Allies' });
    pb.merit({ name: 'Allies', category: 'influence', cp: 2, xp: 0, free: 0, free_mci: 1, free_sw: 5 });

    const lead    = lb.build();
    const partner = pb.build();

    applyDerivedMerits(lead, [lead, partner]);

    const swMerit = lead.merits.find(m => m.name === 'Allies' && m.granted_by === 'Safe Word');
    expect(swMerit).toBeTruthy();
    expect(swMerit.free_sw).toBe(3);   // cp=2 + free_mci=1 counted; free_sw=5 excluded
  });

});

// ── 3. Safe Word lifecycle: pact dissolution ──────────────────────────────────

describe('Safe Word lifecycle: pact dissolution removes or retains auto-created merit', () => {

  it('mutual pact → merit created; Bob dissolves pact → merit removed on next render', () => {
    const [lb, pb] = buildFixturePair('Alice', 'Bob');

    lb.withSafeWord({ partner: 'Bob', sharedMerit: '' });
    pb.withSafeWord({ partner: 'Alice', sharedMerit: 'Resources' });
    pb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0 });

    const lead    = lb.build();
    const partner = pb.build();

    // First render: mutual pact active → merit auto-created with free_sw=3
    applyDerivedMerits(lead, [lead, partner]);

    const meritCreated = lead.merits.find(
      m => m.name === 'Resources' && m.granted_by === 'Safe Word',
    );
    expect(meritCreated).toBeTruthy();
    expect(meritCreated.free_sw).toBe(3);

    // Bob dissolves his side of the pact
    partner.powers = partner.powers.filter(
      p => !(p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word'),
    );

    // Second render: non-mutual → phantom merit (no own dots) removed
    applyDerivedMerits(lead, [lead, partner]);

    const meritAfterDissolution = lead.merits.find(
      m => m.name === 'Resources' && m.granted_by === 'Safe Word',
    );
    expect(meritAfterDissolution).toBeUndefined();
  });

  it('SW merit with own cp=2 retained after pact dissolution, only free_sw zeroed', () => {
    const [lb, pb] = buildFixturePair('Alice', 'Bob');

    lb.withSafeWord({ partner: 'Bob', sharedMerit: '' });
    // Pre-existing SW-granted Resources that Alice also purchased into (cp=2)
    lb.merit({ name: 'Resources', category: 'influence', granted_by: 'Safe Word', cp: 2, xp: 0, free: 0, free_sw: 3 });

    // Bob has no SW pact pointing back → non-mutual from the start
    pb.merit({ name: 'Resources', category: 'influence', cp: 3, xp: 0, free: 0 });

    const lead    = lb.build();
    const partner = pb.build();

    applyDerivedMerits(lead, [lead, partner]);

    const retainedMerit = lead.merits.find(
      m => m.name === 'Resources' && m.granted_by === 'Safe Word',
    );
    // Merit kept because cp=2 > 0; _removeStaleSwMerit only removes when all channels zero
    expect(retainedMerit).toBeTruthy();
    expect(retainedMerit.free_sw).toBe(0);
    expect(retainedMerit.cp).toBe(2);
    expect(retainedMerit.rating).toBe(2);
  });

});
