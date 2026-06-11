/**
 * N-3 (issue #692, MNEC epic) — Necropolis merit family seed + evaluator extension.
 *
 * Four acceptance gates from the dispatch:
 *   1. MERITS_DB entry presence + shape — all 9 docs present in purchasable_powers
 *      after --apply, with correct rating_range / xp_fixed / prereq.
 *   2. rule_grant seed idempotency + shape — Necropolis Sepulcher pool doc has
 *      partner_shareable + sharing_scope + amount_basis='rating_of_source';
 *      re-running the seed touches zero docs.
 *   3. pool-evaluator rating_of_source math — character with Necropolis
 *      Sepulcher 3 → emits a `_grant_pools` entry of amount 3 across the six
 *      target merits.
 *   4. End-to-end Collective Compound (Necropolis-flavoured) — two chars with
 *      Sepulcher dots + Catacombs allocations see each other in the synthesised
 *      `_collective_shared_with` on Catacombs.
 *
 * Plus: verbatim-typo presence assertion (the three preserved typos).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { resolveSharingScope } from '../../public/js/data/rules-helpers.js';
import { applyPoolRulesFromDb } from '../../public/js/editor/rule_engine/pool-evaluator.js';

let app;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, '..', 'scripts', 'seed-rules-necropolis.js');

const MERIT_KEYS = [
  'necropolis-sepulcher', 'catacombs', 'caldarium', 'garbage-pit',
  'labyrinth-guardians', 'dark-temple', 'white-ants', 'trap-door', 'true-worm',
];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Clean any prior residue then apply the seed exactly once for this test
  // suite. The script is keyed by `key` / `{source, grant_type}` so re-running
  // it after this round mid-suite is also safe.
  await getCollection('purchasable_powers').deleteMany({ key: { $in: MERIT_KEYS } });
  await getCollection('rule_grant').deleteMany({ source: 'Necropolis Sepulcher' });
  await getCollection('characters').deleteMany({ _test_n3: true });

  const r = spawnSync('node', [SEED_PATH, '--apply'], {
    env: { ...process.env, MONGODB_DB: process.env.MONGODB_DB || 'tm_suite_test' },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`seed --apply failed: ${r.stdout}\n${r.stderr}`);
  }
});

afterAll(async () => {
  await getCollection('purchasable_powers').deleteMany({ key: { $in: MERIT_KEYS } });
  await getCollection('rule_grant').deleteMany({ source: 'Necropolis Sepulcher' });
  await getCollection('characters').deleteMany({ _test_n3: true });
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate 1 — all 9 MERITS_DB entries present with correct shape
// ─────────────────────────────────────────────────────────────────────────────

describe('N-3 — purchasable_powers seed (9 Necropolis merits)', () => {
  it('all 9 merit docs exist with parent="Kindred" and category="merit"', async () => {
    const docs = await getCollection('purchasable_powers').find({ key: { $in: MERIT_KEYS } }).toArray();
    expect(docs).toHaveLength(9);
    expect(docs.every(d => d.parent === 'Kindred')).toBe(true);
    expect(docs.every(d => d.category === 'merit')).toBe(true);
    expect(docs.every(d => typeof d.description === 'string' && d.description.length > 0)).toBe(true);
  });

  it('rating_range matches the MNEC epic table', async () => {
    const m = Object.fromEntries(
      (await getCollection('purchasable_powers').find({ key: { $in: MERIT_KEYS } }).toArray())
        .map(d => [d.key, d])
    );
    expect(m['necropolis-sepulcher'].rating_range).toEqual([1, 5]);
    expect(m['catacombs'].rating_range).toEqual([1, 5]);
    expect(m['caldarium'].rating_range).toEqual([1, 3]);
    expect(m['garbage-pit'].rating_range).toEqual([1, 3]);
    expect(m['labyrinth-guardians'].rating_range).toEqual([1, 5]);
    expect(m['white-ants'].rating_range).toEqual([1, 5]);
    expect(m['dark-temple'].rating_range).toEqual([2, 2]);
    expect(m['true-worm'].rating_range).toEqual([2, 2]);
    expect(m['trap-door'].rating_range).toEqual([1, 1]);
  });

  it('xp_fixed set on the three flat-cost merits, null elsewhere', async () => {
    const m = Object.fromEntries(
      (await getCollection('purchasable_powers').find({ key: { $in: MERIT_KEYS } }).toArray())
        .map(d => [d.key, d])
    );
    expect(m['true-worm'].xp_fixed).toBe(2);
    expect(m['dark-temple'].xp_fixed).toBe(2);
    expect(m['trap-door'].xp_fixed).toBe(1);
    // The remaining six use the standard rated-merit formula.
    for (const key of ['necropolis-sepulcher', 'catacombs', 'caldarium', 'garbage-pit', 'labyrinth-guardians', 'white-ants']) {
      expect(m[key].xp_fixed).toBeNull();
    }
  });

  it('prereqs match the MNEC family/standalone split', async () => {
    const m = Object.fromEntries(
      (await getCollection('purchasable_powers').find({ key: { $in: MERIT_KEYS } }).toArray())
        .map(d => [d.key, d])
    );
    // Standalone clan-only: Sepulcher (the gate itself) and True Worm.
    expect(m['necropolis-sepulcher'].prereq).toEqual({ type: 'clan', name: 'Nosferatu' });
    expect(m['true-worm'].prereq).toEqual({ type: 'clan', name: 'Nosferatu' });
    // The six family-bound + Trap Door: compound clan + Sepulcher ≥ 1.
    const FAMILY = { all: [{ type: 'clan', name: 'Nosferatu' }, { type: 'merit', name: 'Necropolis Sepulcher', dots: 1 }] };
    for (const key of ['catacombs', 'caldarium', 'garbage-pit', 'labyrinth-guardians', 'dark-temple', 'white-ants', 'trap-door']) {
      expect(m[key].prereq).toEqual(FAMILY);
    }
  });

  it('preserves the three CSV-verbatim typos per Peter 2026-06-10 ack', async () => {
    const wa = await getCollection('purchasable_powers').findOne({ key: 'white-ants' });
    const td = await getCollection('purchasable_powers').findOne({ key: 'trap-door' });
    // White Ants: "to detects" — NOT "to detect".
    expect(wa.description).toContain('to detects their personal actions');
    // Trap Door: "a entrance" — NOT "an entrance".
    expect(td.description).toContain('a entrance to the Necropolis');
    // Trap Door: "above group" — NOT "above ground".
    expect(td.description).toContain('above group in a Territory');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2 — rule_grant shape + idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('N-3 — Necropolis Sepulcher rule_grant', () => {
  it('exists with Collective Compound shape', async () => {
    const rule = await getCollection('rule_grant').findOne({ source: 'Necropolis Sepulcher', grant_type: 'pool' });
    expect(rule).toBeTruthy();
    expect(rule.source_slug).toBe('necro');
    expect(rule.amount_basis).toBe('rating_of_source');
    expect(rule.partner_shareable).toBe(true);
    expect(rule.sharing_scope).toEqual({
      type: 'collective_owners_of_merit',
      merit: 'Necropolis Sepulcher',
      min_dots: 1,
    });
    expect(rule.pool_targets).toEqual([
      'Catacombs', 'Caldarium', 'Garbage Pit',
      'Labyrinth Guardians', 'Dark Temple', 'White Ants',
    ]);
  });

  it('re-running the seed --apply is idempotent (zero further writes)', async () => {
    const r = spawnSync('node', [SEED_PATH, '--apply'], {
      env: { ...process.env, MONGODB_DB: process.env.MONGODB_DB || 'tm_suite_test' },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    // After the beforeAll apply, a second --apply finds every doc unchanged
    // and reports "Touched 0 doc(s)".
    expect(r.stdout).toMatch(/Touched 0 doc\(s\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate 3 — pool-evaluator `rating_of_source` math
// ─────────────────────────────────────────────────────────────────────────────

describe('N-3 — pool-evaluator amount_basis=rating_of_source', () => {
  it('emits _grant_pools entry of amount = source merit rating', () => {
    const c = {
      _grant_pools: [],
      merits: [
        // Necropolis Sepulcher 3 (cp=2, xp=1 → rating 3).
        { name: 'Necropolis Sepulcher', cp: 2, xp: 1 },
      ],
    };
    const rule = {
      source: 'Necropolis Sepulcher',
      source_slug: 'necro',
      grant_type: 'pool',
      condition: 'merit_present',
      amount_basis: 'rating_of_source',
      pool_targets: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
      category: 'necro',
    };
    applyPoolRulesFromDb(c, { grants: [rule] });
    expect(c._grant_pools).toHaveLength(1);
    expect(c._grant_pools[0]).toMatchObject({
      source: 'Necropolis Sepulcher',
      category: 'necro',
      amount: 3,
      names: ['Catacombs', 'Caldarium', 'Garbage Pit', 'Labyrinth Guardians', 'Dark Temple', 'White Ants'],
    });
  });

  it('does NOT emit when the source merit is absent (condition: merit_present)', () => {
    const c = { _grant_pools: [], merits: [{ name: 'Some Other Merit', cp: 5 }] };
    const rule = {
      source: 'Necropolis Sepulcher',
      grant_type: 'pool',
      condition: 'merit_present',
      amount_basis: 'rating_of_source',
      pool_targets: ['Catacombs'],
      category: 'necro',
    };
    applyPoolRulesFromDb(c, { grants: [rule] });
    expect(c._grant_pools).toHaveLength(0);
  });

  it('rating_of_source uses purchased dots only (cp+xp) — free grants don\'t feedback', () => {
    // Anti-loop guard: if the engine counted free_<slug> dots, a Necropolis
    // Sepulcher grant could amplify itself. Confirm purchased-only.
    const c = {
      _grant_pools: [],
      merits: [
        { name: 'Necropolis Sepulcher', cp: 1, xp: 0, free_grants: { necro: 99 }, free_mci: 99 },
      ],
    };
    const rule = {
      source: 'Necropolis Sepulcher',
      grant_type: 'pool',
      condition: 'merit_present',
      amount_basis: 'rating_of_source',
      pool_targets: ['Catacombs'],
      category: 'necro',
    };
    applyPoolRulesFromDb(c, { grants: [rule] });
    expect(c._grant_pools[0].amount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate 4 — end-to-end Collective Compound (Necropolis-flavoured)
//   Pins the general-case test from N-1 to the actual Necropolis instance.
// ─────────────────────────────────────────────────────────────────────────────

describe('N-3 — end-to-end Collective Compound (Necropolis fixture)', () => {
  let aliceId, bobId, carlId;

  beforeAll(async () => {
    const mk = (name, sepulcherDots, catacombsDots) => ({
      _test_n3: true,
      name,
      merits: [
        ...(sepulcherDots > 0
          ? [{ name: 'Necropolis Sepulcher', category: 'general', cp: sepulcherDots, xp: 0 }]
          : []),
        ...(catacombsDots > 0
          ? [{ name: 'Catacombs', category: 'domain', cp: catacombsDots, xp: 0 }]
          : []),
      ],
    });
    const ins = await getCollection('characters').insertMany([
      mk('N3_Alice', 3, 2),
      mk('N3_Bob',   2, 1),
      mk('N3_Carl',  0, 0),
    ]);
    aliceId = ins.insertedIds[0];
    bobId = ins.insertedIds[1];
    carlId = ins.insertedIds[2];
  });

  it('GET /api/characters synthesises _collective_shared_with on Catacombs for both Sepulcher owners', async () => {
    const res = await request(app).get('/api/characters').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const find = (name) => res.body.find(c => c.name === name);

    const alice = find('N3_Alice');
    const bob = find('N3_Bob');
    const carl = find('N3_Carl');

    const aliceCatacombs = alice.merits.find(m => m.name === 'Catacombs');
    const bobCatacombs = bob.merits.find(m => m.name === 'Catacombs');
    expect(aliceCatacombs._collective_shared_with).toEqual(['N3_Bob']);
    expect(bobCatacombs._collective_shared_with).toEqual(['N3_Alice']);

    // Carl has no Catacombs merit at all (and no Sepulcher) — nothing to assert
    // beyond the absence of the field on any of his merits.
    expect((carl.merits || []).every(m => !('_collective_shared_with' in m))).toBe(true);
  });

  it('pure-function resolver matches the API behaviour for the same fixture', async () => {
    // Sanity: the helper and the server enrichment must agree, otherwise the
    // synthesis writeup vs the resolveSharingScope contract has drifted.
    const chars = await getCollection('characters').find({ _test_n3: true }).toArray();
    const scope = { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 };
    const alice = chars.find(c => c.name === 'N3_Alice');
    const carl = chars.find(c => c.name === 'N3_Carl');
    expect(resolveSharingScope(scope, alice, chars)).toEqual(['N3_Bob']);
    expect(resolveSharingScope(scope, carl, chars)).toBeNull();
  });
});
