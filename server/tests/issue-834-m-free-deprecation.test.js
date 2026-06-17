/**
 * Issue #834 — m.free deprecation tests.
 *
 * Three slices:
 *   1. Normalizer behavioural: any path that would have written m.free to a
 *      positive value now triggers the warn-and-return branch instead.
 *   2. cleanupMerit pure unit: Pattern D (m.free + other channel) zeros m.free
 *      preserving the other channel; Pattern C (m.free alone) zeros m.free and
 *      drops the rating per Peter Option B.
 *   3. Integration test calling main() end-to-end with --apply against the
 *      test MongoDB — seeds a fully-formed character with attributes +
 *      skills + m.free contamination + control, asserts attributes/skills
 *      SURVIVE (the prod-incident assertion from #828) and merits cleaned.
 *      MUST fail against replaceOne, pass against updateOne+$set.
 *   4. Static-analysis sanity guards.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { normalizeMerit } from '../lib/normalize-character.js';
import { cleanupMerit, main } from '../scripts/cleanup-m-free-deprecation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const TEST_FLAG = '_issue_834_integration_test';

beforeAll(async () => {
  await setupDb();
});

afterAll(async () => {
  const col = getCollection('characters');
  await col.deleteMany({ [TEST_FLAG]: true });
  await teardownDb();
});

beforeEach(async () => {
  const col = getCollection('characters');
  await col.deleteMany({ [TEST_FLAG]: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Normalizer behavioural — backfill no longer writes m.free
// ─────────────────────────────────────────────────────────────────────────────

describe('#834 — normalizer no longer writes m.free on backfill', () => {
  it('merit with rating > 0 + no granted_by + sum === 0 → warn-and-return, m.free stays 0', () => {
    const warnSpy = (() => {
      const calls = [];
      const orig = console.warn;
      console.warn = (...args) => { calls.push(args); };
      return { calls, restore: () => { console.warn = orig; } };
    })();
    try {
      const m = { name: 'Resources', category: 'influence', cp: 0, xp: 0, rating: 2 }; // no granted_by, no channels
      const r = normalizeMerit(m);
      // Pre-#834: would have written m.free = 2 via the 'free' fallback.
      // Post-#834: returns 'no-channel' reason, m.free stays 0.
      expect(m.free || 0).toBe(0);
      expect(r.reason).toBe('no-channel');
      expect(r.rating).toBe(2);
      // Warn fired so server logs surface the orphan-rating case.
      expect(warnSpy.calls.length).toBeGreaterThan(0);
      const msg = warnSpy.calls[0][0];
      expect(msg).toContain('Resources');
      expect(msg).toContain('rating=2');
      expect(msg).toContain('m.free is deprecated');
    } finally {
      warnSpy.restore();
    }
  });

  it('merit with rating > 0 + granted_by=PT → backfills to free_pt (NOT m.free)', () => {
    const m = { name: 'Allies', category: 'influence', granted_by: 'PT', cp: 0, xp: 0, rating: 2 };
    const r = normalizeMerit(m);
    expect(m.free || 0).toBe(0);
    expect(m.free_pt).toBe(2);
    expect(r.reason).toBe('backfilled');
    expect(r.channel).toBe('free_pt');
  });

  it('merit with rating === sum and m.free already populated → rating-sync only, no extra m.free write', () => {
    // Pre-existing contamination shape: m.free already set (legacy data).
    // The rating-sync branch fires (rating may need updating) but normalizer
    // does NOT touch m.free.
    const m = { name: 'Feeding Grounds', category: 'domain', cp: 0, xp: 0, free: 10, rating: 99 };
    normalizeMerit(m);
    expect(m.free).toBe(10); // unchanged
    expect(m.rating).toBe(10); // synced to sum of all channels including legacy m.free
  });

  it('merit with rating > 0 + granted_by unmapped tag → warn, no backfill', () => {
    const warnSpy = (() => {
      const calls = []; const orig = console.warn;
      console.warn = (...args) => calls.push(args);
      return { calls, restore: () => { console.warn = orig; } };
    })();
    try {
      const m = { name: 'X', category: 'general', granted_by: 'NonexistentSource', cp: 0, xp: 0, rating: 1 };
      const r = normalizeMerit(m);
      expect(m.free || 0).toBe(0);
      expect(r.reason).toBe('no-channel');
      expect(warnSpy.calls.length).toBeGreaterThan(0);
    } finally {
      warnSpy.restore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanupMerit unit — Pattern C + D
// ─────────────────────────────────────────────────────────────────────────────

describe('#834 — cleanupMerit zeros m.free, classifies pattern correctly', () => {
  it('Pattern D: m.free + other channel populated → zeros m.free, preserves other', () => {
    const m = { name: 'Feeding Grounds', category: 'domain', cp: 0, xp: 0, free: 10, free_fwb: 10 };
    const r = cleanupMerit(m);
    expect(r).not.toBeNull();
    expect(m.free).toBe(0);
    expect(m.free_fwb).toBe(10);
    expect(r.pattern).toBe('D');
    expect(r.before).toBe(10);
    expect(r.after).toBe(0);
  });

  it('Pattern C: m.free alone → zeros m.free (rating drops on next normalize)', () => {
    // Wan Yelong's Professional Training shape — per Peter Option B drops 3 dots.
    const m = { name: 'Professional Training', category: 'standing', cp: 0, xp: 0, free: 3 };
    const r = cleanupMerit(m);
    expect(r).not.toBeNull();
    expect(m.free).toBe(0);
    expect(r.pattern).toBe('C');
    expect(r.before).toBe(3);
  });

  it('Pattern D with map: m.free + free_grants.necro → zeros m.free, preserves map', () => {
    const m = { name: 'Catacombs', category: 'domain', cp: 0, xp: 0, free: 1, free_grants: { necro: 1 } };
    const r = cleanupMerit(m);
    expect(m.free).toBe(0);
    expect(m.free_grants.necro).toBe(1);
    expect(r.pattern).toBe('D');
  });

  it('merit with m.free = 0 → no-op', () => {
    const m = { name: 'X', category: 'general', cp: 1 };
    expect(cleanupMerit(m)).toBeNull();
  });

  it('idempotent: re-cleaning a cleaned merit yields no further changes', () => {
    const m = { name: 'Feeding Grounds', category: 'domain', cp: 0, xp: 0, free: 5, free_fwb: 5 };
    const r1 = cleanupMerit(m);
    expect(r1).not.toBeNull();
    const r2 = cleanupMerit(m);
    expect(r2).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration test — main() end-to-end with --apply, prod-incident assertions
// ─────────────────────────────────────────────────────────────────────────────

function seedDoc() {
  return {
    [TEST_FLAG]: true,
    name: '#834 Integration Test',
    clan: 'Nosferatu', covenant: 'Invictus', mask: 'Survivor', dirge: 'Curmudgeon',
    concept: 'Integration test fixture for #834',
    status: { city: 1, clan: 2, covenant: 3 },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 1, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 3, bonus: 0 },
    },
    skills: {
      Investigation: { dots: 3, bonus: 0, specs: ['Forensics'], nine_again: false },
      Stealth: { dots: 4, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Auspex: 2, Obfuscate: 3 },
    powers: [],
    humanity: 6, humanity_base: 7, blood_potency: 1,
    xp_log: { spent: 0, earned: 10 },
    attr_creation: 5, skill_creation: 11, disc_creation: 0, merit_creation: 0,
    aspirations: ['Survive'],
    merits: [
      // Pattern D contamination — Feeding Grounds with m.free=5 + free_fwb=5
      { name: 'Feeding Grounds', category: 'domain', cp: 0, xp: 0, free: 5, free_fwb: 5, qualifier: 'Docks' },
      // Pattern C contamination — Professional Training with m.free=3 alone (Wan shape)
      { name: 'Professional Training', category: 'standing', cp: 0, xp: 0, free: 3 },
      // Untouched control — Safe Place
      { name: 'Safe Place', category: 'domain', cp: 2, xp: 0, qualifier: 'Apt' },
    ],
  };
}

describe('#834 — cleanup script main() integration (write-path safety)', () => {
  it('preserves ALL non-merits fields when --apply runs (the prod-incident assertion)', async () => {
    const col = getCollection('characters');
    const seed = seedDoc();
    const ins = await col.insertOne(seed);
    const id = ins.insertedId;
    const before = await col.findOne({ _id: id });

    const origArgv = process.argv;
    process.argv = [...origArgv, '--apply'];
    try {
      await main();
    } finally {
      process.argv = origArgv;
    }

    const after = await col.findOne({ _id: id });
    // Survival assertions (would all fail against pre-#826 replaceOne).
    expect(after.clan).toBe(before.clan);
    expect(after.covenant).toBe(before.covenant);
    expect(after.status).toEqual(before.status);
    expect(after.attributes, 'attributes must survive — the field the prod incident lost').toEqual(before.attributes);
    expect(after.skills).toEqual(before.skills);
    expect(after.disciplines).toEqual(before.disciplines);
    expect(after.humanity).toBe(before.humanity);
    expect(after.blood_potency).toBe(before.blood_potency);
    expect(after.aspirations).toEqual(before.aspirations);

    // Cleanup assertions: Pattern D + C merits modified, control unchanged.
    const fg = after.merits.find(m => m.name === 'Feeding Grounds');
    expect(fg.free).toBe(0);
    expect(fg.free_fwb).toBe(5); // preserved

    const pt = after.merits.find(m => m.name === 'Professional Training');
    expect(pt.free).toBe(0);

    const sp = after.merits.find(m => m.name === 'Safe Place');
    expect(sp.cp).toBe(2);
    expect(sp.qualifier).toBe('Apt');
  });

  it('dry-run does not modify the document', async () => {
    const col = getCollection('characters');
    const seed = seedDoc();
    const ins = await col.insertOne(seed);
    const id = ins.insertedId;
    const before = await col.findOne({ _id: id });

    const origArgv = process.argv;
    process.argv = origArgv.filter(a => a !== '--apply');
    try { await main(); } finally { process.argv = origArgv; }

    const after = await col.findOne({ _id: id });
    expect(after).toEqual(before);
  });

  it('idempotent: second --apply run leaves doc unchanged', async () => {
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
      expect(afterSecond).toEqual(afterFirst);
      expect(afterSecond.attributes).toBeTruthy();
      expect(afterSecond.skills).toBeTruthy();
    } finally {
      process.argv = origArgv;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis sanity guards
// ─────────────────────────────────────────────────────────────────────────────

describe('#834 — placement sanity guards', () => {
  it('normalize-character.js backfillChannel returns null on unmapped (no `free` fallback)', () => {
    const src = read('server/lib/normalize-character.js');
    // The pre-#834 shape `GRANTED_BY_CHANNEL[gb] || 'free'` is gone.
    expect(src).not.toMatch(/GRANTED_BY_CHANNEL\[gb\]\s*\|\|\s*'free'/);
    expect(src).toMatch(/GRANTED_BY_CHANNEL\[gb\]\s*\|\|\s*null/);
  });

  it('normalize-character.js refuses to backfill when channel is null + warns', () => {
    const src = read('server/lib/normalize-character.js');
    expect(src).toMatch(/refusing to backfill/);
    expect(src).toMatch(/no-channel/);
    // Must NOT write m.free anywhere in normalizeMerit's body.
    const fnStart = src.indexOf('export function normalizeMerit');
    const fnEnd = src.indexOf('\n}\n', fnStart);
    const body = src.slice(fnStart, fnEnd);
    // No assignment to merit.free or merit['free']
    expect(body).not.toMatch(/merit\[\s*['"]free['"]\s*\]\s*=/);
    expect(body).not.toMatch(/merit\.free\s*=/);
  });

  it('domain.js meritFreeSum no longer adds (m.free || 0)', () => {
    const src = read('public/js/editor/domain.js');
    const fnStart = src.indexOf('export function meritFreeSum');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(body).not.toMatch(/\(m\.free \|\| 0\)\s*\+\s*_meritFreeSumHelper/);
    expect(body).toMatch(/return\s+_meritFreeSumHelper\(m\)\s*;/);
  });

  it('domain.js domMeritContribSingle no longer reads m.free', () => {
    const src = read('public/js/editor/domain.js');
    const fnStart = src.indexOf('export function domMeritContribSingle');
    const nextExport = src.indexOf('export function ', fnStart + 1);
    const body = src.slice(fnStart, nextExport > 0 ? nextExport : src.length);
    expect(body).not.toMatch(/\(m\.free\s*\|\|\s*0\)/);
  });

  it('domain.js domMeritShareableSingle no longer reads m.free', () => {
    const src = read('public/js/editor/domain.js');
    const fnStart = src.indexOf('function domMeritShareableSingle');
    const nextFn = src.indexOf('\nfunction ', fnStart + 1);
    const body = src.slice(fnStart, nextFn > 0 ? nextFn : src.length);
    expect(body).not.toMatch(/\(m\.free\s*\|\|\s*0\)/);
  });

  it('admin/rules-data-view.js no longer reads m.free in the bonus rollup', () => {
    const src = read('public/js/admin/rules-data-view.js');
    // The specific bonus-rollup expression no longer contains (m.free || 0).
    expect(src).not.toMatch(/freeOf\(m, 'pt'\)[^\n]*\(m\.free \|\| 0\)/);
  });

  it('admin/excel-merge.js applyMeritPoints no longer reads merit.free for the diff message', () => {
    const src = read('public/js/admin/excel-merge.js');
    const fnStart = src.indexOf('function applyMeritPoints');
    const nextFn = src.indexOf('\nfunction ', fnStart + 1);
    const body = src.slice(fnStart, nextFn > 0 ? nextFn : src.length);
    // The READ `merit.free || 0` is gone. The IMPORT `pts.free` folding into
    // cp is preserved (legitimate upstream column).
    expect(body).not.toMatch(/oldFree\s*=\s*merit\.free/);
    expect(body).toMatch(/pts\.cp\s*\+\s*\(pts\.free\s*\|\|\s*0\)/);
  });

  it('cleanup script main() uses updateOne with $set on merits only (NOT replaceOne)', () => {
    const src = read('server/scripts/cleanup-m-free-deprecation.js');
    expect(src).toMatch(/updateOne\(\s*\{\s*_id:\s*doc\._id\s*\}/);
    expect(src).toMatch(/\$set:\s*\{\s*merits:\s*doc\.merits\s*\}/);
    expect(src).not.toMatch(/replaceOne\(/);
  });

  it('cleanup script main() exported + direct-invocation guarded', () => {
    const src = read('server/scripts/cleanup-m-free-deprecation.js');
    expect(src).toMatch(/export async function main/);
    expect(src).toMatch(/import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/);
  });
});
