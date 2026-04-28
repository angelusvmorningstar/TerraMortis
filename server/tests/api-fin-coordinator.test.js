/**
 * API tests — FIN epic: coordinator role + finance schema
 *
 * Covers:
 *   fin.1: coordinator role access to /api/game_sessions; player blocked; st/dev allowed
 *   fin.2: attendance[n].payment object + root finances.expenses/transfers persist via PUT
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser, coordinatorUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededIds = [];

async function seedSession(overrides = {}) {
  const col = getCollection('game_sessions');
  const doc = {
    session_date: '2099-01-01',
    title: 'FIN Test Session',
    attendance: [
      { character_id: 'test-char-a', player: 'Alice', attended: true },
      { character_id: 'test-char-b', player: 'Bob',   attended: false },
    ],
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const col = getCollection('game_sessions');
  await col.deleteMany({ _id: { $in: seededIds } });
});

// ── fin.1 — role access ─────────────────────────────────────────────────────

describe('fin.1 — /api/game_sessions role access', () => {
  it('401 without auth', async () => {
    const res = await request(app).get('/api/game_sessions');
    expect(res.status).toBe(401);
  });

  it('403 for player', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', playerUser());
    expect(res.status).toBe(403);
  });

  it('200 for coordinator (fin.1 tier)', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', coordinatorUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 for ST', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });
});

// ── fin.2 — payment object on attendance ─────────────────────────────────────

describe('fin.2 — attendance payment object', () => {
  it('persists payment.method + amount on PUT', async () => {
    const session = await seedSession();
    const update = {
      ...session,
      attendance: [
        { ...session.attendance[0], payment: { method: 'cash', amount: 15 } },
        { ...session.attendance[1], payment: { method: 'waived', amount: 0 } },
      ],
    };
    delete update._id;

    const res = await request(app)
      .put('/api/game_sessions/' + session._id)
      .set('X-Test-User', coordinatorUser())
      .send(update);
    expect(res.status).toBe(200);

    const fresh = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', coordinatorUser());
    const doc = fresh.body.find(s => String(s._id) === String(session._id));
    expect(doc.attendance[0].payment).toEqual({ method: 'cash', amount: 15 });
    expect(doc.attendance[1].payment.method).toBe('waived');
  });

  it('accepts every valid method from the enum', async () => {
    const session = await seedSession();
    const methods = ['cash', 'payid', 'paypal', 'exiles', 'waived', ''];
    for (const m of methods) {
      const update = {
        ...session,
        attendance: [{ ...session.attendance[0], payment: { method: m, amount: 0 } }],
      };
      delete update._id;
      const res = await request(app)
        .put('/api/game_sessions/' + session._id)
        .set('X-Test-User', coordinatorUser())
        .send(update);
      expect(res.status, `method '${m}' should be accepted`).toBe(200);
    }
  });

});

// ── fin.2 — finances object (expenses + transfers) ──────────────────────────

describe('fin.2 — finances.expenses + transfers', () => {
  it('persists line-item expenses and transfers', async () => {
    const session = await seedSession();
    const update = {
      ...session,
      finances: {
        expenses: [
          { category: 'venue',  amount: 180 },
          { category: 'office', amount: 12, note: 'pens' },
        ],
        transfers: [
          { to: 'conan', amount: 150, date: '2099-01-08' },
        ],
        notes: 'Running balance: $45',
      },
    };
    delete update._id;

    const res = await request(app)
      .put('/api/game_sessions/' + session._id)
      .set('X-Test-User', coordinatorUser())
      .send(update);
    expect(res.status).toBe(200);

    const fresh = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', coordinatorUser());
    const doc = fresh.body.find(s => String(s._id) === String(session._id));
    expect(doc.finances.expenses).toHaveLength(2);
    expect(doc.finances.expenses[0].category).toBe('venue');
    expect(doc.finances.expenses[0].amount).toBe(180);
    expect(doc.finances.transfers).toHaveLength(1);
    expect(doc.finances.transfers[0].to).toBe('conan');
    expect(doc.finances.notes).toBe('Running balance: $45');
  });

  it('accepts empty expenses/transfers arrays', async () => {
    const session = await seedSession();
    const update = {
      ...session,
      finances: { expenses: [], transfers: [], notes: null },
    };
    delete update._id;
    const res = await request(app)
      .put('/api/game_sessions/' + session._id)
      .set('X-Test-User', coordinatorUser())
      .send(update);
    expect(res.status).toBe(200);
  });

});
