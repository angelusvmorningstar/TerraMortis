/**
 * Integration tests — /api/story_cycles (CYCLE epic #708 story 1; renamed from
 * /api/chapters by cm-2, which corrected the collection's name to match what it
 * has always held: Stories, not Chapters).
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
const cleanupIds = { story_cycles: [], downtime_cycles: [] };

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

// ── GET /api/story_cycles ──────────────────────────────────────────────────────

describe('GET /api/story_cycles', () => {
  it('returns 200 and an array for authenticated users', async () => {
    const res = await request(app)
      .get('/api/story_cycles')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 200 for player role (public read)', async () => {
    const res = await request(app)
      .get('/api/story_cycles')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 with no auth header', async () => {
    const res = await request(app).get('/api/story_cycles');
    expect(res.status).toBe(401);
  });

  it('sorts story cycles by number ascending', async () => {
    const col = getCollection('story_cycles');
    const [a, b] = await Promise.all([
      col.insertOne({ number: 3, label: 'Story Three', created_at: new Date().toISOString() }),
      col.insertOne({ number: 1, label: 'Story One',   created_at: new Date().toISOString() }),
    ]);
    cleanupIds.story_cycles.push(a.insertedId, b.insertedId);

    const res = await request(app)
      .get('/api/story_cycles')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);

    const returned = res.body.filter(c =>
      [String(a.insertedId), String(b.insertedId)].includes(String(c._id))
    );
    expect(returned.length).toBe(2);
    expect(returned[0].number).toBeLessThan(returned[1].number);
  });
});

// ── GET /api/story_cycles/:id ──────────────────────────────────────────────────

describe('GET /api/story_cycles/:id', () => {
  it('returns the story cycle by id', async () => {
    const col = getCollection('story_cycles');
    const ins = await col.insertOne({ number: 2, label: 'Story Two', created_at: new Date().toISOString() });
    cleanupIds.story_cycles.push(ins.insertedId);

    const res = await request(app)
      .get(`/api/story_cycles/${ins.insertedId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Story Two');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get(`/api/story_cycles/${new ObjectId()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed id', async () => {
    const res = await request(app)
      .get('/api/story_cycles/not-an-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });
});

// ── POST /api/story_cycles ─────────────────────────────────────────────────────

describe('POST /api/story_cycles', () => {
  it('ST can create a story cycle and receives 201', async () => {
    const res = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 2, label: 'Story Two: The Price of Power' });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(2);
    expect(res.body.label).toBe('Story Two: The Price of Power');
    expect(res.body._id).toBeTruthy();
    cleanupIds.story_cycles.push(new ObjectId(res.body._id));
  });

  it('player cannot create a story cycle (403)', async () => {
    const res = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', playerUser([]))
      .send({ number: 1, label: 'Story One' });
    expect(res.status).toBe(403);
  });

  it('rejects missing number (400)', async () => {
    const res = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ label: 'No Number' });
    expect(res.status).toBe(400);
  });

  it('rejects missing label (400)', async () => {
    const res = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects non-integer number (400)', async () => {
    const res = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 1.5, label: 'Bad Number' });
    expect(res.status).toBe(400);
  });

  it('trims whitespace from label', async () => {
    const res = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 99, label: '  Trimmed  ' });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Trimmed');
    cleanupIds.story_cycles.push(new ObjectId(res.body._id));
  });
});

// ── PATCH /api/story_cycles/:id ────────────────────────────────────────────────

describe('PATCH /api/story_cycles/:id', () => {
  it('ST can update label', async () => {
    const create = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 3, label: 'Original Label' });
    cleanupIds.story_cycles.push(new ObjectId(create.body._id));

    const res = await request(app)
      .patch(`/api/story_cycles/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ label: 'Updated Label' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Label');
  });

  it('ST can update number', async () => {
    const create = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 5, label: 'Will Change Number' });
    cleanupIds.story_cycles.push(new ObjectId(create.body._id));

    const res = await request(app)
      .patch(`/api/story_cycles/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ number: 6 });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(6);
  });

  it('player cannot patch (403)', async () => {
    const col = getCollection('story_cycles');
    const ins = await col.insertOne({ number: 1, label: 'Read Only', created_at: new Date().toISOString() });
    cleanupIds.story_cycles.push(ins.insertedId);

    const res = await request(app)
      .patch(`/api/story_cycles/${ins.insertedId}`)
      .set('X-Test-User', playerUser([]))
      .send({ label: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch(`/api/story_cycles/${new ObjectId()}`)
      .set('X-Test-User', stUser())
      .send({ label: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 400 with empty body', async () => {
    const col = getCollection('story_cycles');
    const ins = await col.insertOne({ number: 1, label: 'Empty Patch', created_at: new Date().toISOString() });
    cleanupIds.story_cycles.push(ins.insertedId);

    const res = await request(app)
      .patch(`/api/story_cycles/${ins.insertedId}`)
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(400);
  });

  // ── cm-3: the `final_chapter_id` pointer (AC1) ───────────────────────────
  // The ST names ONE of this Story's own member cycles as its final chapter.
  // Setting it is what closes a Story; there is no separate boolean. It
  // replaces the per-chapter `downtime_cycles.is_chapter_finale` checkbox
  // rather than adding to it.
  //
  // This is the one place a bad pointer could be written, so the referential
  // rules are enforced HERE, not just in the client that offers the choice.

  /** A Story plus one member cycle, both registered for cleanup. */
  async function storyWithCycle(number, label, cycleFields = {}) {
    const create = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number, label });
    const storyId = create.body._id;
    cleanupIds.story_cycles.push(new ObjectId(storyId));

    const ins = await getCollection('downtime_cycles').insertOne({
      game_number: 1, label: `${label} — Game 1`, status: 'closed',
      story_cycle_id: String(storyId), ...cycleFields,
    });
    cleanupIds.downtime_cycles.push(ins.insertedId);
    return { storyId, cycleId: String(ins.insertedId) };
  }

  it('cm-3: ST can name one of the Story\'s own cycles as its final chapter', async () => {
    const { storyId, cycleId } = await storyWithCycle(20, 'Closable Story');

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: cycleId });
    expect(res.status).toBe(200);
    expect(res.body.final_chapter_id).toBe(cycleId);
  });

  it('cm-3: null clears it unconditionally — closing a Story is freely reversible', async () => {
    const { storyId, cycleId } = await storyWithCycle(21, 'Reopenable Story');

    await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: cycleId });

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: null });
    expect(res.status).toBe(200);
    expect(res.body.final_chapter_id).toBe(null);
  });

  it('cm-3: final_chapter_id can be combined with number and label in one PATCH', async () => {
    const { storyId, cycleId } = await storyWithCycle(22, 'Combined Patch');

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ number: 23, label: 'Combined Patch Updated', final_chapter_id: cycleId });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(23);
    expect(res.body.label).toBe('Combined Patch Updated');
    expect(res.body.final_chapter_id).toBe(cycleId);
  });

  it('cm-3: rejects a non-string, non-null final_chapter_id (400)', async () => {
    const { storyId } = await storyWithCycle(24, 'Bad Pointer');

    for (const bad of [true, 1, {}, [], '', '   ']) {
      const res = await request(app)
        .patch(`/api/story_cycles/${storyId}`)
        .set('X-Test-User', stUser())
        .send({ final_chapter_id: bad });
      expect(res.status).toBe(400);
    }
  });

  it('cm-3: rejects a malformed cycle id (400, named reason)', async () => {
    const { storyId } = await storyWithCycle(27, 'Malformed Pointer');

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: 'not-an-object-id' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid cycle ID format/i);
  });

  it('cm-3: rejects an id that matches no downtime cycle (400, named reason)', async () => {
    const { storyId } = await storyWithCycle(28, 'Dangling Pointer');

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: String(new ObjectId()) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not match any downtime cycle/i);
  });

  it('cm-3: rejects a cycle belonging to a DIFFERENT Story (400, named reason)', async () => {
    const a = await storyWithCycle(29, 'Story A');
    const b = await storyWithCycle(30, 'Story B');

    const res = await request(app)
      .patch(`/api/story_cycles/${a.storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: b.cycleId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong to this Story/i);
  });

  it('cm-3: rejects a cycle with no Story at all (400)', async () => {
    const { storyId } = await storyWithCycle(31, 'Orphan Pointer');
    const ins = await getCollection('downtime_cycles').insertOne({ game_number: 99, label: 'Orphan' });
    cleanupIds.downtime_cycles.push(ins.insertedId);

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: String(ins.insertedId) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong to this Story/i);
  });

  it('cm-3: GET returns final_chapter_id unchanged on both list and single reads', async () => {
    const { storyId, cycleId } = await storyWithCycle(25, 'Readback Story');

    await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser())
      .send({ final_chapter_id: cycleId });

    const single = await request(app)
      .get(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', stUser());
    expect(single.status).toBe(200);
    expect(single.body.final_chapter_id).toBe(cycleId);

    const list = await request(app)
      .get('/api/story_cycles')
      .set('X-Test-User', stUser());
    expect(list.status).toBe(200);
    expect(list.body.find(s => String(s._id) === String(storyId)).final_chapter_id).toBe(cycleId);
  });

  it('cm-3: player cannot set final_chapter_id (403)', async () => {
    const { storyId, cycleId } = await storyWithCycle(26, 'No Close');

    const res = await request(app)
      .patch(`/api/story_cycles/${storyId}`)
      .set('X-Test-User', playerUser([]))
      .send({ final_chapter_id: cycleId });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/story_cycles/:id ───────────────────────────────────────────────

describe('DELETE /api/story_cycles/:id', () => {
  it('ST can delete an unlinked story cycle', async () => {
    const create = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 10, label: 'To Be Deleted' });
    const id = create.body._id;

    const res = await request(app)
      .delete(`/api/story_cycles/${id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('player cannot delete (403)', async () => {
    const col = getCollection('story_cycles');
    const ins = await col.insertOne({ number: 1, label: 'No Delete', created_at: new Date().toISOString() });
    cleanupIds.story_cycles.push(ins.insertedId);

    const res = await request(app)
      .delete(`/api/story_cycles/${ins.insertedId}`)
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('returns 409 STORY_CYCLE_IN_USE when a cycle is linked', async () => {
    const create = await request(app)
      .post('/api/story_cycles')
      .set('X-Test-User', stUser())
      .send({ number: 11, label: 'In Use' });
    const storyCycleId = create.body._id;
    cleanupIds.story_cycles.push(new ObjectId(storyCycleId));

    // Insert a downtime cycle referencing this story cycle
    const cycleCol = getCollection('downtime_cycles');
    const cycleIns = await cycleCol.insertOne({
      label: 'DT 5', game_number: 5, status: 'prep',
      story_cycle_id: storyCycleId, created_at: new Date().toISOString(),
    });
    cleanupIds.downtime_cycles.push(cycleIns.insertedId);

    const res = await request(app)
      .delete(`/api/story_cycles/${storyCycleId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STORY_CYCLE_IN_USE');
    expect(res.body.linked_cycles).toBe(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete(`/api/story_cycles/${new ObjectId()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});
