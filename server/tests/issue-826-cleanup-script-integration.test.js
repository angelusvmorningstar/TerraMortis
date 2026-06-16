/**
 * Issue #826 — integration test for the cleanup script's main() end-to-end.
 *
 * Background: PR #813 Phase 2 shipped 16 unit tests for the pure
 * `cleanupMerit` helper but ZERO tests calling `main()` end-to-end. Production
 * apply on 2026-06-16 destroyed 13 character documents because main()'s
 * `find({}, {projection: {_id, name, merits}})` + `replaceOne({_id}, doc)`
 * combination overwrote each character with the projected shape, deleting
 * every unprojected field (attributes / skills / disciplines / clan /
 * covenant / status / xp / humanity / blood_potency / aspirations / etc).
 *
 * Same blind-spot class as N-7c (orchestrator dispatch missing) — helpers
 * tested in isolation, integration path not. Memory:
 * `feedback_script_integration_test` pins the discipline: any data-mutating
 * script needs ≥1 test calling main() end-to-end with real DB writes
 * (not just the pure helpers).
 *
 * This test:
 *   1. Seeds a character with attributes + skills + disciplines + clan +
 *      covenant + contaminated merits
 *   2. Sets process.argv to include '--apply' + sets MONGODB_URI to the
 *      test db
 *   3. Calls main() end-to-end
 *   4. Reads the doc back via getCollection
 *   5. Asserts ALL unrelated fields survive AND merits are cleaned
 *
 * The post-#826 fix (updateOne + $set: merits) makes assertions 5a (survival)
 * AND 5b (cleanup) both pass. The pre-#826 shape (replaceOne with projected
 * doc) would have stripped attributes / skills / etc — assertion 5a fails.
 * This test would have caught the bug before deploy.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'dotenv/config';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { main } from '../scripts/cleanup-free-channel-contamination.js';

const TEST_FLAG = '_issue_826_integration_test';

beforeAll(async () => {
  await setupDb();
});

afterAll(async () => {
  // Clean up any test residue.
  const col = getCollection('characters');
  await col.deleteMany({ [TEST_FLAG]: true });
  await teardownDb();
});

beforeEach(async () => {
  // Belt-and-braces — each test starts clean.
  const col = getCollection('characters');
  await col.deleteMany({ [TEST_FLAG]: true });
});

// Fully-formed seed character with EVERY top-level field the editor writes,
// so the integration assertion can confirm none is silently dropped.
function seedDoc() {
  return {
    [TEST_FLAG]: true,
    name: '#826 Integration Test',
    clan: 'Nosferatu',
    covenant: 'Invictus',
    mask: 'Survivor',
    dirge: 'Curmudgeon',
    bloodline: null,
    concept: 'Integration test fixture',
    status: { city: 1, clan: 2, covenant: 3 },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 },
      Wits: { dots: 2, bonus: 0 },
      Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 },
      Dexterity: { dots: 3, bonus: 0 },
      Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 1, bonus: 0 },
      Manipulation: { dots: 2, bonus: 0 },
      Composure: { dots: 3, bonus: 0 },
    },
    skills: {
      Investigation: { dots: 3, bonus: 0, specs: ['Forensics'], nine_again: false },
      Stealth: { dots: 4, bonus: 0, specs: [], nine_again: false },
      Larceny: { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Auspex: 2, Obfuscate: 3, Vigour: 1 },
    powers: [],
    humanity: 6,
    humanity_base: 7,
    blood_potency: 1,
    xp_log: { spent: 0, earned: 10 },
    attr_creation: 5,
    skill_creation: 11,
    disc_creation: 0,
    merit_creation: 0,
    ordeals: [],
    aspirations: ['Survive the night'],
    touchstones: [],
    devotions: [],
    fighting_styles: [],
    rites: [],
    pacts: [],
    equipment: [],
    notes: 'seeded by #826 integration test',
    // Contaminated merits — Pattern A on Catacombs, Pattern B on Allies.
    merits: [
      { name: 'Necropolis Sepulcher', category: 'domain', cp: 3, xp: 0 },
      { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free: 1, free_grants: { necro: 1 } }, // Pattern A
      { name: 'Allies', category: 'influence', cp: 0, xp: 0, free_mci: 3, free_grants: { mci: 3 } }, // Pattern B
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' }, // untouched control
    ],
  };
}

describe('#826 — cleanup script main() integration (write-path safety)', () => {
  it('preserves ALL non-merits fields when --apply runs against a contaminated character', async () => {
    const col = getCollection('characters');
    const seed = seedDoc();
    const ins = await col.insertOne(seed);
    const id = ins.insertedId;

    // Snapshot the seed for post-run comparison (use the inserted doc shape).
    const before = await col.findOne({ _id: id });

    // Toggle APPLY mode for this run; ensure MONGODB_URI is set so main()
    // doesn't exit. setupDb has already established the connection via the
    // shared db.js, so MONGODB_URI is in process.env.
    const origArgv = process.argv;
    process.argv = [...origArgv, '--apply'];
    try {
      await main();
    } finally {
      process.argv = origArgv;
    }

    const after = await col.findOne({ _id: id });

    // ── Survival assertions — the core safety check ──────────────────────
    // Pre-#826: replaceOne overwrote with the projected doc (only _id, name,
    // merits). These assertions would have ALL failed. Post-#826: $set: merits
    // leaves the rest untouched.
    expect(after.clan, 'clan must survive').toBe(before.clan);
    expect(after.covenant, 'covenant must survive').toBe(before.covenant);
    expect(after.mask, 'mask must survive').toBe(before.mask);
    expect(after.dirge, 'dirge must survive').toBe(before.dirge);
    expect(after.concept, 'concept must survive').toBe(before.concept);
    expect(after.status, 'status must survive').toEqual(before.status);
    expect(after.attributes, 'attributes must survive (this is the field the prod incident lost)').toEqual(before.attributes);
    expect(after.skills, 'skills must survive').toEqual(before.skills);
    expect(after.disciplines, 'disciplines must survive').toEqual(before.disciplines);
    expect(after.humanity, 'humanity must survive').toBe(before.humanity);
    expect(after.humanity_base, 'humanity_base must survive').toBe(before.humanity_base);
    expect(after.blood_potency, 'blood_potency must survive').toBe(before.blood_potency);
    expect(after.xp_log, 'xp_log must survive').toEqual(before.xp_log);
    expect(after.attr_creation, 'attr_creation must survive').toBe(before.attr_creation);
    expect(after.skill_creation, 'skill_creation must survive').toBe(before.skill_creation);
    expect(after.aspirations, 'aspirations must survive').toEqual(before.aspirations);
    expect(after.notes, 'notes must survive').toBe(before.notes);

    // ── Cleanup assertions — merits ARE modified per the script's purpose ──
    const cat = after.merits.find(m => m.name === 'Catacombs');
    expect(cat, 'Catacombs row must remain').toBeTruthy();
    expect(cat.free, 'Pattern A: m.free zeroed').toBe(0);
    expect(cat.free_grants.necro, 'Catacombs map.necro preserved').toBe(1);

    const allies = after.merits.find(m => m.name === 'Allies');
    expect(allies, 'Allies row must remain').toBeTruthy();
    expect(allies.free_mci, 'Pattern B: legacy free_mci zeroed').toBe(0);
    expect(allies.free_grants.mci, 'Allies map.mci preserved').toBe(3);

    const sepulcher = after.merits.find(m => m.name === 'Necropolis Sepulcher');
    expect(sepulcher, 'Sepulcher (untouched control) must remain').toBeTruthy();
    expect(sepulcher.cp, 'Sepulcher cp preserved').toBe(3);

    const safePlace = after.merits.find(m => m.name === 'Safe Place');
    expect(safePlace, 'Safe Place (untouched control) must remain').toBeTruthy();
    expect(safePlace.qualifier, 'Safe Place qualifier preserved').toBe('Apt');
  });

  it('dry-run mode does not modify the document (no --apply flag)', async () => {
    const col = getCollection('characters');
    const seed = seedDoc();
    const ins = await col.insertOne(seed);
    const id = ins.insertedId;
    const before = await col.findOne({ _id: id });

    // No --apply flag → dry run.
    const origArgv = process.argv;
    process.argv = origArgv.filter(a => a !== '--apply');
    try {
      await main();
    } finally {
      process.argv = origArgv;
    }

    const after = await col.findOne({ _id: id });
    // Whole doc unchanged.
    expect(after).toEqual(before);
  });

  it('idempotent: running main() twice with --apply leaves the doc unchanged on the second run', async () => {
    const col = getCollection('characters');
    const seed = seedDoc();
    const ins = await col.insertOne(seed);
    const id = ins.insertedId;

    const origArgv = process.argv;
    process.argv = [...origArgv, '--apply'];
    try {
      await main();
      const afterFirst = await col.findOne({ _id: id });
      await main();
      const afterSecond = await col.findOne({ _id: id });
      // Second run finds no contamination, makes no writes — docs identical.
      expect(afterSecond).toEqual(afterFirst);
      // And the survival assertions still hold across both runs.
      expect(afterSecond.attributes).toBeTruthy();
      expect(afterSecond.skills).toBeTruthy();
      expect(afterSecond.disciplines).toBeTruthy();
    } finally {
      process.argv = origArgv;
    }
  });
});
