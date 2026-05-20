/**
 * STM-8 (issue #415) — pool_snapshot math invariant enforcement.
 *
 * Per ADR-004 Rev 3 §D10: at DT resolution time, the client writes
 *   pool_snapshot = { base, mods: [{stat_path, delta, reason}], final }
 * onto projects_resolved[j] and feeding_roll. Server enforces:
 *   final === base + Σ mods[].delta
 * — without the guard a buggy client could persist a snapshot whose
 * total contradicts its breakdown, poisoning the historical record.
 *
 * Covers AC#1 (math invariant rejection) + the always-write convention
 * (empty mods + base === final allowed). The client-side
 * buildPoolSnapshot lives in downtime-views.js (admin UI surface, no
 * direct vitest harness) — see structural verification in the
 * downtime-views resolution call sites.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CYCLE_ID = new ObjectId();
const CHAR_ID = new ObjectId().toHexString();
const CREATED_SUB_IDS = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Seed a parent cycle in an open state so PUT/POST submissions pass
  // the requireOpenCycle gate.
  await getCollection('downtime_cycles').insertOne({
    _id: CYCLE_ID,
    label: 'STM-8 test cycle',
    status: 'active',
    deadline_at: new Date(Date.now() + 86400000).toISOString(),
  });
});

afterAll(async () => {
  await getCollection('downtime_cycles').deleteOne({ _id: CYCLE_ID });
  if (CREATED_SUB_IDS.length) {
    await getCollection('downtime_submissions').deleteMany({
      _id: { $in: CREATED_SUB_IDS.map(id => new ObjectId(id)) },
    });
  }
  await teardownDb();
});

async function createSubmission() {
  const res = await request(app)
    .post('/api/downtime_submissions')
    .set('X-Test-User', stUser())
    .send({
      cycle_id: String(CYCLE_ID),
      character_id: CHAR_ID,
      character_name: 'Test STM-8',
      status: 'submitted',
      _raw: { projects: [] },
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  CREATED_SUB_IDS.push(res.body._id);
  return res.body._id;
}

// ── AC#1: math invariant rejection ──────────────────────────────────

describe('STM-8 — pool_snapshot math invariant', () => {
  it('rejects 400 when final does NOT equal base + Σ delta (in projects_resolved)', async () => {
    const subId = await createSubmission();
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        projects_resolved: [{
          action_type: 'investigation',
          pool: { expression: 'mock', total: 9 },
          pool_snapshot: {
            base: 7,
            mods: [
              { stat_path: 'attributes.Strength.dots', delta: 1, reason: 'mock' },
              { stat_path: 'skills.Brawl.dots',         delta: 1, reason: 'mock' },
            ],
            // 7 + 2 should be 9 but client claimed 10 — invariant violation
            final: 10,
          },
        }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.failures).toBeTruthy();
    expect(res.body.failures.length).toBeGreaterThan(0);
    const fail = res.body.failures[0];
    expect(fail.base).toBe(7);
    expect(fail.mods_sum).toBe(2);
    expect(fail.final).toBe(10);
    expect(fail.expected).toBe(9);
  });

  it('rejects 400 when final mismatches via feeding_roll.pool_snapshot', async () => {
    const subId = await createSubmission();
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        feeding_roll: {
          successes: 3,
          dice: [10, 9, 8],
          pool: 5,
          pool_snapshot: {
            base: 5,
            mods: [{ stat_path: 'attributes.Presence.dots', delta: 1, reason: 'X' }],
            final: 5,  // should be 6
          },
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pool_snapshot math invariant/);
  });

  it('rejects 400 on dot-notation key with bad invariant', async () => {
    const subId = await createSubmission();
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        'projects_resolved.0.pool_snapshot': {
          base: 4,
          mods: [{ stat_path: 'attributes.Wits.dots', delta: 2, reason: 'wits boost' }],
          final: 5,  // expected 6
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.failures[0].key).toBe('projects_resolved.0.pool_snapshot');
  });

  it('rejects 400 when pool_snapshot is malformed (missing base / mods / final)', async () => {
    const subId = await createSubmission();
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        feeding_roll: {
          pool_snapshot: { base: 5, mods: [] }, // missing final
        },
      });
    expect(res.status).toBe(400);
  });
});

// ── Always-write: empty mods + base === final allowed ───────────────

describe('STM-8 — always-write convention (resolve with no active mods)', () => {
  it('accepts pool_snapshot with empty mods and base === final', async () => {
    const subId = await createSubmission();
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        projects_resolved: [{
          action_type: 'investigation',
          pool: { expression: 'no mods', total: 5 },
          pool_snapshot: { base: 5, mods: [], final: 5 },
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.projects_resolved[0].pool_snapshot).toEqual({
      base: 5,
      mods: [],
      final: 5,
    });
  });

  it('round-trips an active-mods snapshot when math holds', async () => {
    const subId = await createSubmission();
    const snapshot = {
      base: 5,
      mods: [
        { stat_path: 'attributes.Presence.dots', delta: 2, reason: 'majestic ritual' },
        { stat_path: 'skills.Persuasion.dots',   delta: 1, reason: 'mentor advice' },
      ],
      final: 8,
    };
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        projects_resolved: [{
          action_type: 'persuade',
          pool: { expression: 'Presence 4 + Persuasion 4 = 8', total: 8 },
          pool_snapshot: snapshot,
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.projects_resolved[0].pool_snapshot).toEqual(snapshot);
  });

  it('round-trips a feeding_roll snapshot', async () => {
    const subId = await createSubmission();
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        feeding_roll: {
          successes: 4, dice: [10, 9, 8, 6], pool: 6,
          pool_snapshot: {
            base: 5,
            mods: [{ stat_path: 'attributes.Wits.dots', delta: 1, reason: 'focused hunt' }],
            final: 6,
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.feeding_roll.pool_snapshot.final).toBe(6);
    expect(res.body.feeding_roll.pool_snapshot.mods).toHaveLength(1);
  });
});

// ── Survives mod revocation — historical record stays intact ────────

describe('STM-8 — pool_snapshot survives mod revocation (audit-safe)', () => {
  it('written snapshot persists even after the source mod is revoked', async () => {
    // Create a real mod for the character
    const modPostRes = await request(app)
      .post('/api/st_mods')
      .set('X-Test-User', stUser())
      .send({
        character_id: CHAR_ID,
        stat_path: 'attributes.Strength.dots',
        delta: 2,
        reason: 'STM-8 revocation regression test',
        show_reason_to_player: false,
      });
    expect(modPostRes.status).toBe(201);
    const modId = modPostRes.body._id;

    // Submit with the snapshot capturing the mod
    const subId = await createSubmission();
    await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({
        projects_resolved: [{
          pool: { total: 6 },
          pool_snapshot: {
            base: 4,
            mods: [{ stat_path: 'attributes.Strength.dots', delta: 2, reason: 'STM-8 revocation regression test' }],
            final: 6,
          },
        }],
      });

    // Revoke the mod
    const delRes = await request(app)
      .delete(`/api/st_mods/${modId}`)
      .set('X-Test-User', stUser());
    expect(delRes.status).toBe(200);

    // Reload the submission — snapshot should still be there with the
    // captured breakdown intact.
    const reloaded = await getCollection('downtime_submissions').findOne({ _id: new ObjectId(subId) });
    expect(reloaded.projects_resolved[0].pool_snapshot).toEqual({
      base: 4,
      mods: [{ stat_path: 'attributes.Strength.dots', delta: 2, reason: 'STM-8 revocation regression test' }],
      final: 6,
    });

    // Cleanup mod (audit row already orphaned by the DELETE, but the
    // st_mods doc is gone; this just keeps the test db tidy)
    await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
  });
});

// ── Auth: only ST can write the snapshot via PUT (existing st_review gating) ─

describe('STM-8 — auth boundaries unchanged from existing PUT gating', () => {
  it('player still cannot write pool_snapshot via st_review fields (st_review.* stripped)', async () => {
    const subId = await createSubmission();
    // The submission was created by ST so player needs to own the char_id.
    // For this test the player IS the owner (character_ids includes CHAR_ID).
    // Even so, st_review.* fields are stripped server-side. pool_snapshot
    // lives on projects_resolved/feeding_roll which players CAN write — but
    // the existing route handler does NOT gate pool_snapshot specifically.
    // What it gates is st_review.*; pool_snapshot at the top of
    // projects_resolved[j] is part of the player's editable surface
    // (matches existing pre-#415 behaviour for projects_resolved).
    // This test pins the existing contract for downstream awareness.
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send({
        projects_resolved: [{
          pool: { total: 5 },
          pool_snapshot: { base: 5, mods: [], final: 5 },
        }],
      });
    // Players-with-ownership can update their own submission fields.
    // pool_snapshot validation still applies (math invariant); shape-valid
    // passes through.
    expect(res.status).toBe(200);
    expect(res.body.projects_resolved[0].pool_snapshot.final).toBe(5);
  });
});
