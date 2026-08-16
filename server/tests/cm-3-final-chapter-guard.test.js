/**
 * cm-3 AC10 — the named-finale guard on /api/downtime_cycles.
 *
 * `story_cycles.final_chapter_id` is a bare string pointer at one cycle's
 * `_id`; nothing in Mongo enforces the reference. Two operations could break
 * it, and both are refused at the route with a 409:
 *
 *   - moving the named cycle to a different Story (or unassigning it) via
 *     PUT /api/downtime_cycles/:id, the per-cycle Story picker's write;
 *   - deleting the named cycle outright.
 *
 * Either would leave `final_chapter_id` dangling, which the client derivation
 * (`isFinalChapterOfStory`) reads as "this Story has no finale at all" — the
 * ST panel and the player at-risk warning would both go dark, silently, with
 * no error anywhere. That silent-relocation class is exactly what the pointer
 * design replaced the `closed`-boolean design to prevent, so it is closed at
 * the write rather than left to the UI to avoid.
 *
 * Mirrors story-cycles.js's own STORY_CYCLE_IN_USE refusal: same 409, same
 * "name the thing holding the reference" message style.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const cleanup = { story_cycles: [], downtime_cycles: [] };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  for (const [colName, ids] of Object.entries(cleanup)) {
    const col = getCollection(colName);
    for (const id of ids) await col.deleteOne({ _id: id });
    cleanup[colName] = [];
  }
});

afterAll(async () => {
  await teardownDb();
});

/** One Story with `n` member cycles, cleaned up afterwards. */
async function seedStory(number, label, n = 2) {
  const sc = await getCollection('story_cycles').insertOne({
    number, label, created_at: new Date().toISOString(),
  });
  cleanup.story_cycles.push(sc.insertedId);

  const cycles = [];
  for (let i = 1; i <= n; i++) {
    const ins = await getCollection('downtime_cycles').insertOne({
      game_number: i, label: `${label} — Game ${i}`, status: 'closed',
      story_cycle_id: String(sc.insertedId),
    });
    cleanup.downtime_cycles.push(ins.insertedId);
    cycles.push(ins.insertedId);
  }
  return { storyId: sc.insertedId, cycles };
}

async function nameFinale(storyId, cycleId) {
  await getCollection('story_cycles').updateOne(
    { _id: storyId },
    { $set: { final_chapter_id: String(cycleId) } },
  );
}

describe('cm-3 AC10 — PUT /api/downtime_cycles/:id refuses to move a named finale', () => {
  it('409s when the named finale is reassigned to another Story', async () => {
    const a = await seedStory(60, 'Guard Story A');
    const b = await seedStory(61, 'Guard Story B');
    await nameFinale(a.storyId, a.cycles[1]);

    const res = await request(app)
      .put(`/api/downtime_cycles/${a.cycles[1]}`)
      .set('X-Test-User', stUser())
      .send({ story_cycle_id: String(b.storyId) });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CYCLE_IS_STORY_FINALE');
    // The refusal must name BOTH ends, or the ST cannot act on it.
    expect(res.body.message).toMatch(/Guard Story A/);
    expect(res.body.message).toMatch(/Game 2/);
    expect(res.body.story_cycle_id).toBe(String(a.storyId));

    // And nothing was written.
    const after = await getCollection('downtime_cycles').findOne({ _id: a.cycles[1] });
    expect(String(after.story_cycle_id)).toBe(String(a.storyId));
  });

  it('409s when the named finale is unassigned to no Story at all', async () => {
    const a = await seedStory(62, 'Guard Story C');
    await nameFinale(a.storyId, a.cycles[0]);

    const res = await request(app)
      .put(`/api/downtime_cycles/${a.cycles[0]}`)
      .set('X-Test-User', stUser())
      .send({ story_cycle_id: null });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CYCLE_IS_STORY_FINALE');
  });

  it('allows moving a NON-finale sibling out of the same Story', async () => {
    const a = await seedStory(63, 'Guard Story D');
    const b = await seedStory(64, 'Guard Story E');
    await nameFinale(a.storyId, a.cycles[1]);   // Game 2 is the finale

    const res = await request(app)
      .put(`/api/downtime_cycles/${a.cycles[0]}`)   // …so Game 1 may move
      .set('X-Test-User', stUser())
      .send({ story_cycle_id: String(b.storyId) });

    expect(res.status).toBe(200);
    expect(String(res.body.story_cycle_id)).toBe(String(b.storyId));
  });

  it('lets an unchanged story_cycle_id through — a full-document restore is not a move', async () => {
    // The Data Portability importer PUTs whole cycle documents back, FK
    // included. Guarding on "the body mentions story_cycle_id" rather than "the
    // value actually changes" would have made every restore of a finale cycle
    // fail.
    const a = await seedStory(65, 'Guard Story F');
    await nameFinale(a.storyId, a.cycles[1]);

    const res = await request(app)
      .put(`/api/downtime_cycles/${a.cycles[1]}`)
      .set('X-Test-User', stUser())
      .send({ story_cycle_id: String(a.storyId), label: 'Restored label' });

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Restored label');
  });

  it('leaves a PUT that never mentions story_cycle_id alone', async () => {
    const a = await seedStory(66, 'Guard Story G');
    await nameFinale(a.storyId, a.cycles[1]);

    const res = await request(app)
      .put(`/api/downtime_cycles/${a.cycles[1]}`)
      .set('X-Test-User', stUser())
      .send({ label: 'Renamed finale' });

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Renamed finale');
  });
});

describe('cm-3 AC10 — DELETE /api/downtime_cycles/:id refuses to delete a named finale', () => {
  it('409s on the cycle a Story names as its final chapter', async () => {
    const a = await seedStory(67, 'Guard Story H');
    await nameFinale(a.storyId, a.cycles[1]);

    const res = await request(app)
      .delete(`/api/downtime_cycles/${a.cycles[1]}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CYCLE_IS_STORY_FINALE');
    expect(res.body.message).toMatch(/Guard Story H/);

    const still = await getCollection('downtime_cycles').findOne({ _id: a.cycles[1] });
    expect(still).not.toBeNull();
  });

  it('still deletes a non-finale sibling', async () => {
    const a = await seedStory(68, 'Guard Story I');
    await nameFinale(a.storyId, a.cycles[1]);

    const res = await request(app)
      .delete(`/api/downtime_cycles/${a.cycles[0]}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('does not fire for a cycle no Story names', async () => {
    const ins = await getCollection('downtime_cycles').insertOne({
      game_number: 90, label: 'Unnamed', status: 'closed',
    });
    cleanup.downtime_cycles.push(ins.insertedId);

    const res = await request(app)
      .delete(`/api/downtime_cycles/${ins.insertedId}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
  });

  it('is not confused by a final_chapter_id pointing somewhere else entirely', async () => {
    const a = await seedStory(69, 'Guard Story J');
    await nameFinale(a.storyId, new ObjectId());   // dangling on purpose

    const res = await request(app)
      .delete(`/api/downtime_cycles/${a.cycles[0]}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
  });
});
