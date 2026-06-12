/**
 * Integration tests — /api/chapters (CYCLE epic #708 story 1).
 * Covers CRUD, role gating, and the in-use cycle deletion guard.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const cleanupIds = { chapters: [], downtime_cycles: [] };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  for (const [colName, ids] of Object.entries(cleanupIds)) {
    const col = getCollection(colName);
    for (const id of ids) await col.deleteOne({ _id: id });
    cleanupIds[colName] = [];
  }
});

afterAll(async () => {
  await teardownDb();
});

// ── GET /api/chapters ──────────────────────────────────────────────────────

describe('GET /api/chapters', () => {
  it('returns 200 and an array for authenticated users', async () => {
    const res = await request(app)
      .get('/api/chapters')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 200 for player role (public read)', async () => {
    const res = await request(app)
      .get('/api/chapters')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 with no auth header', async () => {
    const res = await request(app).get('/api/chapters');
    expect(res.status).toBe(401);
  });

  it('sorts chapters by number ascending', async () => {
    const col = getCollection('chapters');
    const [a, b] = await Promise.all([
      col.insertOne({ number: 3, label: 'Chapter Three', created_at: new Date().toISOString() }),
      col.insertOne({ number: 1, label: 'Chapter One',   created_at: new Date().toISOString() }),
    ]);
    cleanupIds.chapters.push(a.insertedId, b.insertedId);

    const res = await request(app)
      .get('/api/chapters')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);

    const returned = res.body.filter(c =>
      [String(a.insertedId), String(b.insertedId)].includes(String(c._id))
    );
    expect(returned.length).toBe(2);
    expect(returned[0].number).toBeLessThan(returned[1].number);
  });
});

// ── GET /api/chapters/:id ──────────────────────────────────────────────────

describe('GET /api/chapters/:id', () => {
  it('returns the chapter by id', async () => {
    const col = getCollection('chapters');
    const ins = await col.insertOne({ number: 2, label: 'Chapter Two', created_at: new Date().toISOString() });
    cleanupIds.chapters.push(ins.insertedId);

    const res = await request(app)
      .get(`/api/chapters/${ins.insertedId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Chapter Two');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get(`/api/chapters/${new ObjectId()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed id', async () => {
    const res = await request(app)
      .get('/api/chapters/not-an-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });
});

// ── POST /api/chapters ─────────────────────────────────────────────────────

describe('POST /api/chapters', () => {
  it('ST can create a chapter and receives 201', async () => {
    const res = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 2, label: 'Chapter Two: The Price of Power' });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(2);
    expect(res.body.label).toBe('Chapter Two: The Price of Power');
    expect(res.body._id).toBeTruthy();
    cleanupIds.chapters.push(new ObjectId(res.body._id));
  });

  it('player cannot create a chapter (403)', async () => {
    const res = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', playerUser([]))
      .send({ number: 1, label: 'Chapter One' });
    expect(res.status).toBe(403);
  });

  it('rejects missing number (400)', async () => {
    const res = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ label: 'No Number' });
    expect(res.status).toBe(400);
  });

  it('rejects missing label (400)', async () => {
    const res = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects non-integer number (400)', async () => {
    const res = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 1.5, label: 'Bad Number' });
    expect(res.status).toBe(400);
  });

  it('trims whitespace from label', async () => {
    const res = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 99, label: '  Trimmed  ' });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Trimmed');
    cleanupIds.chapters.push(new ObjectId(res.body._id));
  });
});

// ── PATCH /api/chapters/:id ────────────────────────────────────────────────

describe('PATCH /api/chapters/:id', () => {
  it('ST can update label', async () => {
    const create = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 3, label: 'Original Label' });
    cleanupIds.chapters.push(new ObjectId(create.body._id));

    const res = await request(app)
      .patch(`/api/chapters/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ label: 'Updated Label' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Label');
  });

  it('ST can update number', async () => {
    const create = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 5, label: 'Will Change Number' });
    cleanupIds.chapters.push(new ObjectId(create.body._id));

    const res = await request(app)
      .patch(`/api/chapters/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ number: 6 });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(6);
  });

  it('player cannot patch (403)', async () => {
    const col = getCollection('chapters');
    const ins = await col.insertOne({ number: 1, label: 'Read Only', created_at: new Date().toISOString() });
    cleanupIds.chapters.push(ins.insertedId);

    const res = await request(app)
      .patch(`/api/chapters/${ins.insertedId}`)
      .set('X-Test-User', playerUser([]))
      .send({ label: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch(`/api/chapters/${new ObjectId()}`)
      .set('X-Test-User', stUser())
      .send({ label: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 400 with empty body', async () => {
    const col = getCollection('chapters');
    const ins = await col.insertOne({ number: 1, label: 'Empty Patch', created_at: new Date().toISOString() });
    cleanupIds.chapters.push(ins.insertedId);

    const res = await request(app)
      .patch(`/api/chapters/${ins.insertedId}`)
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/chapters/:id ───────────────────────────────────────────────

describe('DELETE /api/chapters/:id', () => {
  it('ST can delete an unlinked chapter', async () => {
    const create = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 10, label: 'To Be Deleted' });
    const id = create.body._id;

    const res = await request(app)
      .delete(`/api/chapters/${id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('player cannot delete (403)', async () => {
    const col = getCollection('chapters');
    const ins = await col.insertOne({ number: 1, label: 'No Delete', created_at: new Date().toISOString() });
    cleanupIds.chapters.push(ins.insertedId);

    const res = await request(app)
      .delete(`/api/chapters/${ins.insertedId}`)
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('returns 409 CHAPTER_IN_USE when a cycle is linked', async () => {
    const create = await request(app)
      .post('/api/chapters')
      .set('X-Test-User', stUser())
      .send({ number: 11, label: 'In Use' });
    const chapterId = create.body._id;
    cleanupIds.chapters.push(new ObjectId(chapterId));

    // Insert a cycle referencing this chapter
    const cycleCol = getCollection('downtime_cycles');
    const cycleIns = await cycleCol.insertOne({
      label: 'DT 5', game_number: 5, status: 'prep',
      chapter_id: chapterId, created_at: new Date().toISOString(),
    });
    cleanupIds.downtime_cycles.push(cycleIns.insertedId);

    const res = await request(app)
      .delete(`/api/chapters/${chapterId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CHAPTER_IN_USE');
    expect(res.body.linked_cycles).toBe(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete(`/api/chapters/${new ObjectId()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});
