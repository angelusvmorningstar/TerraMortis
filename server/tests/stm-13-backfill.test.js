/**
 * STM-13 (issue #441) — idempotent active:true backfill script.
 *
 * Exercises the exported `backfill()` helper from
 * server/scripts/stm-13-backfill-active.js against the test DB. Filters are
 * scoped to a per-test character_id so the assertions stay deterministic even
 * when other test files run in parallel and mutate the shared st_mods /
 * st_mod_audit collections.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { backfill } from '../scripts/stm-13-backfill-active.js';

const CHAR = new ObjectId().toHexString();
const MISSING = { character_id: CHAR, active: { $exists: false } };

beforeAll(async () => {
  await setupDb();
  await getCollection('st_mods').deleteMany({ character_id: CHAR });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR });
});

afterAll(async () => {
  await getCollection('st_mods').deleteMany({ character_id: CHAR });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR });
  await teardownDb();
});

describe('STM-13 — st_mods active backfill', () => {
  it('sets active:true on missing-field docs, leaves explicit active untouched', async () => {
    const mods = getCollection('st_mods');
    await mods.insertMany([
      // pre-Rev 4: no active field
      { character_id: CHAR, stat_path: 'attributes.Strength.dots', delta: 1 },
      { character_id: CHAR, stat_path: 'attributes.Wits.dots', delta: 1 },
      // already migrated
      { character_id: CHAR, stat_path: 'attributes.Stamina.dots', delta: 1, active: true },
      // explicitly deactivated — must NOT be flipped to true
      { character_id: CHAR, stat_path: 'attributes.Resolve.dots', delta: 1, active: false },
    ]);

    const res = await backfill('st_mods', MISSING, { active: true }, { log: false });
    expect(res.updated).toBe(2);

    // The two legacy docs are now active:true; the explicit false survives.
    const missingAfter = await mods.countDocuments(MISSING);
    expect(missingAfter).toBe(0);
    const stillFalse = await mods.countDocuments({ character_id: CHAR, active: false });
    expect(stillFalse).toBe(1);
    const nowTrue = await mods.countDocuments({ character_id: CHAR, active: true });
    expect(nowTrue).toBe(3); // 2 backfilled + 1 pre-existing
  });

  it('is idempotent — a second run updates zero', async () => {
    const res = await backfill('st_mods', MISSING, { active: true }, { log: false });
    expect(res.updated).toBe(0);
  });

  it('--dry-run reports the would-update count without writing', async () => {
    const mods = getCollection('st_mods');
    await mods.insertOne({ character_id: CHAR, stat_path: 'attributes.Dexterity.dots', delta: 1 });

    const res = await backfill('st_mods', MISSING, { active: true }, { dryRun: true, log: false });
    expect(res.updated).toBe(1);            // would update the one new legacy doc
    expect(await mods.countDocuments(MISSING)).toBe(1); // but it was NOT written

    // a real run then clears it
    const live = await backfill('st_mods', MISSING, { active: true }, { log: false });
    expect(live.updated).toBe(1);
    expect(await mods.countDocuments(MISSING)).toBe(0);
  });
});

describe('STM-13 — st_mod_audit event backfill (--audit)', () => {
  const AUDIT_MISSING = { character_id: CHAR, event: { $exists: false } };

  it('sets event:created on legacy rows lacking the field', async () => {
    const audit = getCollection('st_mod_audit');
    await audit.insertMany([
      { character_id: CHAR, stat_path: 'attributes.Strength.dots', delta: 1, created_at: '2026-01-01T00:00:00.000Z' },
      { character_id: CHAR, stat_path: 'attributes.Wits.dots', delta: 1, event: 'created' }, // already has event
    ]);

    const res = await backfill('st_mod_audit', AUDIT_MISSING, { event: 'created' }, { log: false });
    expect(res.updated).toBe(1);
    expect(await audit.countDocuments(AUDIT_MISSING)).toBe(0);
    expect(await audit.countDocuments({ character_id: CHAR, event: 'created' })).toBe(2);
  });

  it('is idempotent — a second audit run updates zero', async () => {
    const res = await backfill('st_mod_audit', AUDIT_MISSING, { event: 'created' }, { log: false });
    expect(res.updated).toBe(0);
  });
});
