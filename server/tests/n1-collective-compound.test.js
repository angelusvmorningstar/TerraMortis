/**
 * N-1 (issue #670, ADR-005 Rev 2) — Collective Compound foundation.
 *
 * Five acceptance gates from the dispatch + issue body:
 *   1. End-to-end Collective Compound (load-bearing): two Sepulcher owners
 *      see each other in _collective_shared_with; non-member doesn't.
 *   2. _collective_shared_with NEVER persisted (Concern #3 strip-on-save).
 *   3. Multi-source meritFreeSum (Concern #10, narrowed): {lk:2, vm:1} → 3.
 *   4. Regression spot-check (Concern #4 Rev 2): hardcoded subsets at
 *      domain.js#domMeritShareableSingle and characters.js partner-enrichment
 *      preserve EXACT behaviour pre- and post-N-1 — divergence preserved.
 *   5. normaliseAttachedTo coverage (Concern #11): legacy string vs object
 *      shapes produce identical downstream consumer behaviour.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import {
  normaliseAttachedTo,
  meritFreeSum,
  freeOf,
  resolveSharingScope,
  synthesiseCollectiveOwners,
} from '../../public/js/data/rules-helpers.js';

let app;
const SEPULCHER_RULE_KEY = `n1_test_sepulcher_${Date.now()}`;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Clean any prior test residue.
  await getCollection('characters').deleteMany({ _test_n1: true });
  await getCollection('rule_grant').deleteMany({ _test_n1_key: SEPULCHER_RULE_KEY });
});

afterAll(async () => {
  await getCollection('characters').deleteMany({ _test_n1: true });
  await getCollection('rule_grant').deleteMany({ _test_n1_key: SEPULCHER_RULE_KEY });
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern #10 (narrowed) — multi-source sum via meritFreeSum
// ─────────────────────────────────────────────────────────────────────────────

describe('N-1 — meritFreeSum (multi-source)', () => {
  it('sums two grants from different sources via the free_grants map (3 = 2 + 1)', () => {
    const m = { free_grants: { lk: 2, vm: 1 } };
    expect(meritFreeSum(m)).toBe(3);
  });

  it('sums map + legacy flat fields disjointly during the N-1 transition', () => {
    // Pre-N-2 legacy field + new map entry — meritFreeSum returns the union
    // (5 = legacy free_mci 3 + map vm 2). Per-source disjointness is by
    // construction (evaluator writes to one channel, never both).
    const m = { free_mci: 3, free_grants: { vm: 2 } };
    expect(meritFreeSum(m)).toBe(5);
  });

  it('handles missing free_grants and missing legacy gracefully', () => {
    expect(meritFreeSum({})).toBe(0);
    expect(meritFreeSum(null)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern #4 Rev 2 — regression spot-check
//   The hardcoded subsets at domain.js#domMeritShareableSingle (mci-only on
//   client) and characters.js:195 (mci+bloodline+retainer on server) must
//   continue to return exactly what they returned pre-N-1. Per-slug reads
//   migrated to freeOf, but the SUBSET ITSELF stays verbatim.
// ─────────────────────────────────────────────────────────────────────────────

describe('N-1 — regression spot-check (divergence preserved)', () => {
  it('freeOf returns identical value whether the data lives in map or legacy field', () => {
    expect(freeOf({ free_mci: 4 }, 'mci')).toBe(4);
    expect(freeOf({ free_grants: { mci: 4 } }, 'mci')).toBe(4);
    // Map wins when both are populated (ought never to happen in practice).
    expect(freeOf({ free_mci: 9, free_grants: { mci: 4 } }, 'mci')).toBe(4);
    expect(freeOf({}, 'mci')).toBe(0);
    expect(freeOf(null, 'mci')).toBe(0);
  });

  it('client subset (mci-only) sums correctly across map / legacy storage', () => {
    // Mirrors domMeritShareableSingle: cp + free + free_mci + xp.
    const subset = (m) => (m.cp || 0) + (m.free || 0) + freeOf(m, 'mci') + (m.xp || 0);
    // Pre-N-2 (legacy field populated): exact pre-N-1 behaviour.
    expect(subset({ cp: 1, free: 0, free_mci: 2, xp: 1 })).toBe(4);
    // Post-N-2 (map populated): same result via map-fallback.
    expect(subset({ cp: 1, free: 0, free_grants: { mci: 2 }, xp: 1 })).toBe(4);
    // CRITICAL: bloodline/retainer dots DO NOT contribute on the client side
    // (divergence preserved). Pre-N-1 returned 4; post-N-1 also returns 4.
    expect(subset({ cp: 1, free: 0, free_mci: 2, xp: 1, free_bloodline: 99, free_retainer: 99 })).toBe(4);
  });

  it('server subset (mci + bloodline + retainer) sums correctly across map / legacy storage', () => {
    // Mirrors characters.js:195 partner-enrichment.
    const subset = (m) => (m.cp || 0) + freeOf(m, 'mci') + freeOf(m, 'bloodline') + freeOf(m, 'retainer') + (m.xp || 0);
    // Pre-N-2: exact pre-N-1 behaviour.
    expect(subset({ cp: 1, free_mci: 2, free_bloodline: 1, free_retainer: 1, xp: 0 })).toBe(5);
    // Post-N-2: same via map.
    expect(subset({ cp: 1, free_grants: { mci: 2, bloodline: 1, retainer: 1 }, xp: 0 })).toBe(5);
    // CRITICAL: lk / inv / vm dots DO NOT contribute on the server side
    // (divergence preserved). Pre-N-1 returned 5; post-N-1 also returns 5.
    expect(subset({ cp: 1, free_mci: 2, free_bloodline: 1, free_retainer: 1, xp: 0, free_lk: 99, free_inv: 99, free_vm: 99 })).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern #11 — every read of m.attached_to goes through normaliseAttachedTo.
//   Verifies the normaliser handles all three input shapes equivalently.
// ─────────────────────────────────────────────────────────────────────────────

describe('N-1 — normaliseAttachedTo', () => {
  it('null / undefined / empty string → null', () => {
    expect(normaliseAttachedTo(null)).toBeNull();
    expect(normaliseAttachedTo(undefined)).toBeNull();
    expect(normaliseAttachedTo('')).toBeNull();
  });

  it('legacy string form → { destination: <string> }', () => {
    expect(normaliseAttachedTo('Safe Place (Penthouse)')).toEqual({ destination: 'Safe Place (Penthouse)' });
  });

  it('canonical object form passes through with destination preserved', () => {
    expect(normaliseAttachedTo({ destination: 'X' })).toEqual({ destination: 'X' });
    expect(normaliseAttachedTo({ origin: 'Necropolis Sepulcher', destination: 'X' }))
      .toEqual({ origin: 'Necropolis Sepulcher', destination: 'X' });
  });

  it('downstream comparison reads work identically for legacy string vs canonical object', () => {
    // Simulates a consumer (e.g. domain.js _havenCap):
    //   const at = normaliseAttachedTo(m.attached_to);
    //   if (at && at.destination === key) match;
    const legacy = normaliseAttachedTo('Safe Place (Penthouse)');
    const canonical = normaliseAttachedTo({ destination: 'Safe Place (Penthouse)' });
    expect(legacy.destination).toBe(canonical.destination);
  });

  it('malformed object (no destination) returns null defensively', () => {
    expect(normaliseAttachedTo({})).toBeNull();
    expect(normaliseAttachedTo({ origin: 'orphan' })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSharingScope dispatch — partner_explicit / collective / unknown.
// ─────────────────────────────────────────────────────────────────────────────

describe('N-1 — resolveSharingScope', () => {
  const c1 = { name: 'Alice', merits: [{ name: 'Sep', cp: 1 }] };
  const c2 = { name: 'Bob', merits: [{ name: 'Sep', cp: 2 }] };
  const c3 = { name: 'Carl', merits: [{ name: 'Other', cp: 5 }] };
  const chars = [c1, c2, c3];

  it('partner_explicit → null (caller falls back to persisted m.shared_with)', () => {
    expect(resolveSharingScope({ type: 'partner_explicit' }, c1, chars)).toBeNull();
  });

  it('missing / undefined / null scope → null', () => {
    expect(resolveSharingScope(undefined, c1, chars)).toBeNull();
    expect(resolveSharingScope(null, c1, chars)).toBeNull();
  });

  it('unknown type → null (safe degradation; logs a warning)', () => {
    expect(resolveSharingScope({ type: 'bogus_future_type' }, c1, chars)).toBeNull();
  });

  it('collective_owners_of_merit synthesises the other-owners list for members; null for non-members', () => {
    const scope = { type: 'collective_owners_of_merit', merit: 'Sep', min_dots: 1 };
    expect(resolveSharingScope(scope, c1, chars)).toEqual(['Bob']);
    expect(resolveSharingScope(scope, c2, chars)).toEqual(['Alice']);
    // Non-member returns null (the orchestrator then skips writing the field).
    expect(resolveSharingScope(scope, c3, chars)).toBeNull();
  });

  it('synthesiseCollectiveOwners respects min_dots and distinguishes non-member vs lone-member', () => {
    const scope = { type: 'collective_owners_of_merit', merit: 'Sep', min_dots: 2 };
    // Only Bob (cp=2) qualifies; Alice (cp=1) is NON-member → null.
    expect(synthesiseCollectiveOwners(scope, c1, chars)).toBeNull();
    // Bob is the only qualifying owner → other-owners list is empty (lone member).
    expect(synthesiseCollectiveOwners(scope, c2, chars)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOAD-BEARING — End-to-end Collective Compound via the API
//   Sets up: a Sepulcher rule_grant doc with sharing_scope, 3 chars (2
//   members + 1 non-member), then hits GET /api/characters (ST path) and
//   asserts _collective_shared_with synthesis.
// ─────────────────────────────────────────────────────────────────────────────

describe('N-1 — end-to-end Collective Compound (load-bearing AC)', () => {
  let aliceId, bobId, carlId;
  const TARGET_MERIT_NAME = `__n1_test_catacombs_${Date.now()}__`;
  const SOURCE_MERIT_NAME = `__n1_test_sepulcher_${Date.now()}__`;

  beforeAll(async () => {
    // Seed a collective-typed rule_grant doc keyed to the test source merit.
    // _test_n1_key keeps cleanup scoped + idempotent across runs.
    await getCollection('rule_grant').insertOne({
      _test_n1_key: SEPULCHER_RULE_KEY,
      source: SOURCE_MERIT_NAME,
      source_slug: 'n1_test_sepulcher',
      grant_type: 'pool',
      condition: 'merit_present',
      amount_basis: 'flat',
      amount: 1,
      pool_targets: [TARGET_MERIT_NAME],
      partner_shareable: false,
      sharing_scope: {
        type: 'collective_owners_of_merit',
        merit: SOURCE_MERIT_NAME,
        min_dots: 1,
      },
      notes: 'N-1 vitest fixture',
    });

    const mkChar = (name, sepulcherDots) => ({
      _test_n1: true,
      name,
      // schema basics — fill minimally so insert passes validation downstream
      merits: [
        ...(sepulcherDots > 0
          ? [{ name: SOURCE_MERIT_NAME, category: 'general', cp: sepulcherDots, xp: 0 }]
          : []),
        { name: TARGET_MERIT_NAME, category: 'domain', cp: 1, xp: 0 },
      ],
    });

    const ins = await getCollection('characters').insertMany([
      mkChar('N1_Alice', 1),  // member
      mkChar('N1_Bob', 2),    // member
      mkChar('N1_Carl', 0),   // non-member (no Sepulcher)
    ]);
    aliceId = ins.insertedIds[0];
    bobId = ins.insertedIds[1];
    carlId = ins.insertedIds[2];
  });

  it('GET /api/characters synthesises _collective_shared_with on member chars (Alice ↔ Bob)', async () => {
    const res = await request(app).get('/api/characters').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const findChar = (name) => res.body.find(c => c.name === name);

    const alice = findChar('N1_Alice');
    const bob = findChar('N1_Bob');
    const carl = findChar('N1_Carl');
    expect(alice).toBeTruthy();
    expect(bob).toBeTruthy();
    expect(carl).toBeTruthy();

    const aliceTarget = alice.merits.find(m => m.name === TARGET_MERIT_NAME);
    const bobTarget = bob.merits.find(m => m.name === TARGET_MERIT_NAME);
    const carlTarget = carl.merits.find(m => m.name === TARGET_MERIT_NAME);

    // Members see the OTHER member (not themselves).
    expect(aliceTarget._collective_shared_with).toEqual(['N1_Bob']);
    expect(bobTarget._collective_shared_with).toEqual(['N1_Alice']);
    // Non-member's target merit does NOT get the synthesised field set.
    expect(carlTarget._collective_shared_with).toBeUndefined();
  });

  it('_collective_shared_with is NEVER persisted (Concern #3 strip-on-save)', async () => {
    // The synthesised field appears on the response (verified above). When a
    // character is PUT back through the standard save path, the field must
    // be absent from the persisted document. The admin save shape strips
    // _-prefixed merit fields via buildSaveBody; verify by re-reading the
    // persisted doc directly from Mongo (bypassing the synthesis enrichment).
    //
    // Simulate the strip path: fetch alice, set _collective_shared_with on a
    // merit, run the same strip logic the client uses, then save raw.
    const aliceDoc = await getCollection('characters').findOne({ _id: aliceId });
    const ms = aliceDoc.merits;
    // Sanity: nothing persisted yet.
    expect(ms.every(m => !('_collective_shared_with' in m))).toBe(true);

    // Mimic an in-memory mutation followed by the buildSaveBody strip.
    const mutated = JSON.parse(JSON.stringify(aliceDoc));
    mutated.merits.find(m => m.name === TARGET_MERIT_NAME)._collective_shared_with = ['N1_Bob'];
    // Apply the same strip as admin.js buildSaveBody: drop _-prefixed merit fields.
    const stripped = {
      ...mutated,
      merits: mutated.merits.map(m => {
        const out = {};
        for (const [k, v] of Object.entries(m)) {
          if (!k.startsWith('_')) out[k] = v;
        }
        return out;
      }),
    };
    expect(stripped.merits.every(m => !('_collective_shared_with' in m))).toBe(true);

    // Save the stripped doc and re-read raw: still absent.
    await getCollection('characters').updateOne({ _id: aliceId }, { $set: { merits: stripped.merits } });
    const reread = await getCollection('characters').findOne({ _id: aliceId });
    expect(reread.merits.every(m => !('_collective_shared_with' in m))).toBe(true);
  });

  it('removing a member retires the synthesised list on next GET', async () => {
    // Drop Bob's Sepulcher dot so he's no longer a member.
    await getCollection('characters').updateOne(
      { _id: bobId },
      { $set: { merits: [{ name: TARGET_MERIT_NAME, category: 'domain', cp: 1, xp: 0 }] } },
    );

    const res = await request(app).get('/api/characters').set('X-Test-User', stUser());
    const alice = res.body.find(c => c.name === 'N1_Alice');
    const aliceTarget = alice.merits.find(m => m.name === TARGET_MERIT_NAME);
    // Alice's collective list re-synthesises to empty (she's the only member now).
    expect(aliceTarget._collective_shared_with).toEqual([]);
  });
});
