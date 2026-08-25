/**
 * server/lib/ordeal-cascade.js — the shared atomic ordeals[] upsert that replaced four
 * near-identical, non-atomic inline implementations in history.js, questionnaire.js,
 * ordeal-responses.js, and ordeal-submissions.js (2026-08-25).
 *
 * The core claim under test: concurrent calls for the SAME new ordeal name on the SAME
 * character cannot produce duplicate entries. The prior match-then-push shape (two separate
 * updateOne calls) had a check-then-act window where this was possible; this module closes it
 * with one atomic aggregation-pipeline update.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { upsertOrdeal } from '../lib/ordeal-cascade.js';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('ordeal-cascade: upsertOrdeal', () => {
  let charId;

  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await getCollection('characters').deleteOne({ _id: charId });
    await teardownDb();
  });

  beforeEach(async () => {
    charId = new ObjectId();
    await getCollection('characters').insertOne({
      _id: charId,
      name: 'Ordeal Cascade Test Char',
      retired: false,
      ordeals: [],
    });
  });

  it('appends a new entry when none exists for that ordeal name', async () => {
    const chars = getCollection('characters');
    const matched = await upsertOrdeal(chars, charId, 'history', '2026-08-25T00:00:00.000Z');
    expect(matched).toBe(true);

    const doc = await chars.findOne({ _id: charId });
    expect(doc.ordeals).toHaveLength(1);
    expect(doc.ordeals[0]).toMatchObject({ name: 'history', complete: true });
  });

  it('updates an existing entry in place rather than duplicating it', async () => {
    const chars = getCollection('characters');
    await chars.updateOne({ _id: charId }, { $set: { ordeals: [{ name: 'history', complete: false }] } });

    await upsertOrdeal(chars, charId, 'history', '2026-08-25T00:00:00.000Z');

    const doc = await chars.findOne({ _id: charId });
    expect(doc.ordeals).toHaveLength(1);
    expect(doc.ordeals[0].complete).toBe(true);
  });

  it('leaves other ordeal entries untouched', async () => {
    const chars = getCollection('characters');
    await chars.updateOne(
      { _id: charId },
      { $set: { ordeals: [{ name: 'lore', complete: true, approved_at: 'earlier' }] } }
    );

    await upsertOrdeal(chars, charId, 'history', '2026-08-25T00:00:00.000Z');

    const doc = await chars.findOne({ _id: charId });
    expect(doc.ordeals).toHaveLength(2);
    const lore = doc.ordeals.find(o => o.name === 'lore');
    expect(lore.approved_at).toBe('earlier');
  });

  it('does not write an xp field — this port only closes the race, it does not adopt TM Admin\'s xp:3 decision', async () => {
    const chars = getCollection('characters');
    await upsertOrdeal(chars, charId, 'history', '2026-08-25T00:00:00.000Z');
    const doc = await chars.findOne({ _id: charId });
    expect(doc.ordeals[0].xp).toBeUndefined();
  });

  it('returns false when the character id matches no document', async () => {
    const chars = getCollection('characters');
    const matched = await upsertOrdeal(chars, new ObjectId(), 'history', '2026-08-25T00:00:00.000Z');
    expect(matched).toBe(false);
  });

  // The regression this whole module exists to prevent: N concurrent upserts for the SAME
  // new ordeal name on the SAME character must converge on exactly ONE entry, not N. The old
  // match-then-push shape (two separate updateOne calls) could let every concurrent caller see
  // matchedCount === 0 before any of them pushed, each then pushing its own duplicate.
  it('concurrent calls for the same new ordeal name never produce duplicate entries', async () => {
    const chars = getCollection('characters');
    const CONCURRENCY = 20;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        upsertOrdeal(chars, charId, 'history', new Date().toISOString())
      )
    );

    const doc = await chars.findOne({ _id: charId });
    const historyEntries = doc.ordeals.filter(o => o.name === 'history');
    expect(historyEntries).toHaveLength(1);
  });
});
