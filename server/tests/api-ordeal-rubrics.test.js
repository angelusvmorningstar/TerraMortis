/**
 * API tests — /api/ordeal_rubrics endpoint.
 * Confirms rubric content is ST-only (players cannot read expected answers).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
let seededRubricId;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  // Seed a minimal rubric so GET /api/ordeal_rubrics has something to return
  const col = getCollection('ordeal_rubrics');
  const inserted = await col.insertOne({
    ordeal_type: 'lore_mastery',
    title: 'Lore Mastery Test Rubric',
    questions: [
      { index: 0, question: 'What is Kindred?', expected_answer: 'Vampire.', marking_notes: '' },
    ],
    _test_seeded: true,
  });
  seededRubricId = inserted.insertedId.toString();
});

afterAll(async () => {
  if (seededRubricId) {
    await getCollection('ordeal_rubrics').deleteOne({ _id: new ObjectId(seededRubricId) });
  }
});

// ── GET / — ST only ───────────────────────────────────────────────────────────

describe('GET /api/ordeal_rubrics — confidentiality', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/ordeal_rubrics');
    expect(res.status).toBe(401);
  });

  it('player cannot read rubrics (403)', async () => {
    const res = await request(app)
      .get('/api/ordeal_rubrics')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('ST can read rubrics', async () => {
    const res = await request(app)
      .get('/api/ordeal_rubrics')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Confirm expected_answer is present in the response (ST sees full rubric)
    const rubric = res.body.find(r => r._id === seededRubricId);
    expect(rubric).toBeTruthy();
    expect(rubric.questions[0].expected_answer).toBe('Vampire.');
  });

  it('ST can filter rubrics by type', async () => {
    const res = await request(app)
      .get('/api/ordeal_rubrics?type=lore_mastery')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    res.body.forEach(r => expect(r.ordeal_type).toBe('lore_mastery'));
  });
});

// ── PUT /:id — ST only ────────────────────────────────────────────────────────

describe('PUT /api/ordeal_rubrics/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .put(`/api/ordeal_rubrics/${seededRubricId}`)
      .send({ questions: [] });
    expect(res.status).toBe(401);
  });

  it('player cannot update rubric (403)', async () => {
    const res = await request(app)
      .put(`/api/ordeal_rubrics/${seededRubricId}`)
      .set('X-Test-User', playerUser([]))
      .send({ questions: [] });
    expect(res.status).toBe(403);
  });

  it('ST can update rubric expected answers', async () => {
    const updatedQuestions = [
      { index: 0, question: 'What is Kindred?', expected_answer: 'A vampire, also called Kindred.', marking_notes: 'Either answer accepted.' },
    ];

    const res = await request(app)
      .put(`/api/ordeal_rubrics/${seededRubricId}`)
      .set('X-Test-User', stUser())
      .send({ questions: updatedQuestions });

    expect(res.status).toBe(200);
    expect(res.body.questions[0].expected_answer).toBe('A vampire, also called Kindred.');
    expect(res.body.questions[0].marking_notes).toBe('Either answer accepted.');
  });

  it('returns 404 for non-existent rubric', async () => {
    const fakeId = new ObjectId().toString();
    const res = await request(app)
      .put(`/api/ordeal_rubrics/${fakeId}`)
      .set('X-Test-User', stUser())
      .send({ questions: [] });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid ID format', async () => {
    const res = await request(app)
      .put('/api/ordeal_rubrics/not-an-id')
      .set('X-Test-User', stUser())
      .send({ questions: [] });
    expect(res.status).toBe(400);
  });
});
