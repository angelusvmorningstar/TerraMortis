/**
 * API tests — DELETE /api/game_sessions/:id
 * Covers the delete route added for orphan session cleanup.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
let createdSessionId;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  if (createdSessionId) {
    await getCollection('game_sessions').deleteOne({ _id: new ObjectId(createdSessionId) });
  }
  await teardownDb();
});

async function seedSession() {
  const col = getCollection('game_sessions');
  const result = await col.insertOne({
    session_date: '2099-12-01',
    title: 'Test Session for Deletion',
    status: 'upcoming',
    created_at: new Date().toISOString(),
  });
  createdSessionId = result.insertedId.toString();
  return createdSessionId;
}

describe('DELETE /api/game_sessions/:id', () => {
  it('ST can delete an existing session', async () => {
    const id = await seedSession();
    const res = await request(app)
      .delete(`/api/game_sessions/${id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    createdSessionId = null;

    // Verify it's gone
    const check = await getCollection('game_sessions').findOne({ _id: new ObjectId(id) });
    expect(check).toBeNull();
  });

  it('returns 404 for non-existent session', async () => {
    const fakeId = new ObjectId().toString();
    const res = await request(app)
      .delete(`/api/game_sessions/${fakeId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('blocks player from deleting sessions', async () => {
    const id = await seedSession();
    const res = await request(app)
      .delete(`/api/game_sessions/${id}`)
      .set('X-Test-User', playerUser());
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).delete(`/api/game_sessions/${new ObjectId()}`);
    expect(res.status).toBe(401);
  });
});
