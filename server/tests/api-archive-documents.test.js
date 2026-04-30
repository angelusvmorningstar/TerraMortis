/**
 * API tests — /api/archive_documents endpoint.
 * Covers player ownership gating, primer access, and ST-only routes.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
let testCharId;
let otherCharId;
let cleanCharId;
const insertedIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  const chars = await getCollection('characters')
    .find({ retired: { $ne: true } }, { projection: { _id: 1 } })
    .limit(3)
    .toArray();
  testCharId  = chars[0]._id;
  otherCharId = chars[1]._id;
  cleanCharId = chars[2]._id;

  // Seed two archive documents
  const col = getCollection('archive_documents');
  const r1 = await col.insertOne({
    character_id: testCharId, type: 'dossier', cycle: null,
    title: 'Test Dossier', content_html: '<p>Test content</p>', visible_to_player: true,
  });
  const r2 = await col.insertOne({
    character_id: otherCharId, type: 'dossier', cycle: null,
    title: 'Other Dossier', content_html: '<p>Other content</p>', visible_to_player: true,
  });
  insertedIds.push(r1.insertedId, r2.insertedId);
});

afterAll(async () => {
  try {
    await getCollection('archive_documents').deleteMany({ _id: { $in: insertedIds } });
  } catch (err) {
    console.error('[afterAll] cleanup failed (DB may not have connected):', err.message);
  }
  await teardownDb();
});

// ── GET / ─────────────────────────────────────────────────────────────────────

describe('GET /api/archive_documents — player ownership', () => {
  it('player can fetch docs for their own character', async () => {
    const res = await request(app)
      .get(`/api/archive_documents?character_id=${testCharId}`)
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('player cannot fetch docs for another character', async () => {
    const res = await request(app)
      .get(`/api/archive_documents?character_id=${otherCharId}`)
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(403);
  });

  it('ST can fetch docs for any character', async () => {
    const res = await request(app)
      .get(`/api/archive_documents?character_id=${otherCharId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });

  it('returns 400 if character_id missing', async () => {
    const res = await request(app)
      .get('/api/archive_documents')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid character_id', async () => {
    const res = await request(app)
      .get('/api/archive_documents?character_id=not-valid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('does not return content_html in list', async () => {
    const res = await request(app)
      .get(`/api/archive_documents?character_id=${testCharId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    res.body.forEach(doc => expect(doc.content_html).toBeUndefined());
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/archive_documents?character_id=${testCharId}`);
    expect(res.status).toBe(401);
  });
});

// ── GET /all ──────────────────────────────────────────────────────────────────

describe('GET /api/archive_documents/all', () => {
  it('ST can list all documents', async () => {
    const res = await request(app)
      .get('/api/archive_documents/all')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(doc => expect(doc.content_html).toBeUndefined());
  });

  it('blocks player from /all', async () => {
    const res = await request(app)
      .get('/api/archive_documents/all')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(403);
  });
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

describe('GET /api/archive_documents/:id', () => {
  it('player can fetch their own document by ID', async () => {
    const res = await request(app)
      .get(`/api/archive_documents/${insertedIds[0]}`)
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Test Dossier');
  });

  it('player cannot fetch another character\'s document', async () => {
    const res = await request(app)
      .get(`/api/archive_documents/${insertedIds[1]}`)
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(403);
  });

  it('ST can fetch any document', async () => {
    const res = await request(app)
      .get(`/api/archive_documents/${insertedIds[1]}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .get(`/api/archive_documents/${new ObjectId()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid ID', async () => {
    const res = await request(app)
      .get('/api/archive_documents/not-an-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });
});

// ── POST / ────────────────────────────────────────────────────────────────────

describe('POST /api/archive_documents', () => {
  const createdIds = [];

  afterAll(async () => {
    if (createdIds.length) {
      await getCollection('archive_documents').deleteMany({ _id: { $in: createdIds } });
    }
  });

  it('ST creates a blank dossier', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', stUser())
      .send({ character_id: cleanCharId.toString(), type: 'dossier', title: 'Test New Dossier' });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('dossier');
    expect(res.body.content_html).toBe('');
    createdIds.push(new ObjectId(res.body._id));
  });

  it('ST creates a blank history_submission', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', stUser())
      .send({ character_id: cleanCharId.toString(), type: 'history_submission' });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('history_submission');
    expect(res.body.title).toBe('Character History');
    createdIds.push(new ObjectId(res.body._id));
  });

  it('409 when creating a duplicate dossier for same character', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', stUser())
      .send({ character_id: cleanCharId.toString(), type: 'dossier', title: 'Duplicate Dossier' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already has a dossier/);
  });

  it('player gets 403', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', playerUser([cleanCharId.toString()]))
      .send({ character_id: cleanCharId.toString(), type: 'history_submission' });
    expect(res.status).toBe(403);
  });

  it('400 on missing type', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', stUser())
      .send({ character_id: cleanCharId.toString() });
    expect(res.status).toBe(400);
  });

  it('400 on missing character_id for non-primer', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', stUser())
      .send({ type: 'dossier' });
    expect(res.status).toBe(400);
  });

  it('400 on invalid character_id', async () => {
    const res = await request(app)
      .post('/api/archive_documents')
      .set('X-Test-User', stUser())
      .send({ character_id: 'bad-id', type: 'dossier' });
    expect(res.status).toBe(400);
  });
});
