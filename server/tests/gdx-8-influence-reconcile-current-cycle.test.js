/**
 * 2026-08-15 (live, recurring incident) — reconcileInfluenceDT() used to key off "the last CLOSED
 * cycle" instead of the cycle actually governing tonight's game, so it kept pulling a stale
 * cycle's Influence spend forward over whatever was correct. Two live symptoms: Brandy LaRoux
 * (spent 0 in DT6) briefly showed 13/20 — infMax(20) minus a closed Game 4's spend(7) — and Conrad
 * Sondergaard (also spent 0 in DT6) was left stuck at 0/7 by the same formula. Fixed to resolve
 * through getFeedingCycle() (db.js) instead, and to write every active character on each run
 * (not just spenders — a zero-spend character needs restoring to full max too, which the old
 * `spent === 0` skip could never do).
 *
 * This suite mocks fetch and drives reconcileInfluenceDT() directly (exported for this purpose),
 * asserting on the PUT bodies sent to /api/tracker_state/:id rather than on real Mongo state.
 */
import { describe, it, expect, beforeEach } from 'vitest';

async function importTracker({ cycles, subsByCycleId, trackerByCharId }) {
  globalThis.location = { origin: 'http://localhost', hostname: 'localhost', href: 'http://localhost/' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = globalThis;

  const puts = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (opts?.method === 'PUT' && u.includes('/api/tracker_state/')) {
      const charId = u.split('/api/tracker_state/')[1];
      puts.push({ charId, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.includes('/api/tracker_state/')) {
      const charId = u.split('/api/tracker_state/')[1];
      return { ok: true, status: 200, json: async () => (trackerByCharId[charId] || null) };
    }
    if (u.includes('/api/downtime_submissions')) {
      const m = u.match(/chapter_id=([^&]+)/);
      const cid = m ? decodeURIComponent(m[1]) : null;
      return { ok: true, status: 200, json: async () => (subsByCycleId[cid] || []) };
    }
    if (u.includes('/api/chapters')) {
      return { ok: true, status: 200, json: async () => cycles };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const trackerMod = await import('../../public/js/game/tracker.js');
  const stateMod = await import('../../public/js/suite/data.js');
  return { trackerMod, suiteState: stateMod.default, puts };
}

// infMax comes purely from status.clan here — no merit-calc plumbing needed for these cases.
function fakeChar(id, clanStatus) {
  return { _id: id, retired: false, status: { clan: clanStatus }, merits: [] };
}

describe('gdx-8 — reconcileInfluenceDT keys off the live cycle, not the last closed one', () => {
  it('a zero-spend character in the live cycle is written to full max, not a stale closed-cycle number', async () => {
    // Cycle ids are unique per test — reconcileInfluenceDT's own _reconciledCycles guard is
    // module-level and persists across dynamic imports of the same specifier in this file.
    const dt6 = { _id: 'dt6-t1', game_number: 6, phase: 'prep' };
    const game4closed = { _id: 'game4-t1', game_number: 4, status: 'closed' };
    const brandy = fakeChar('brandy', 20);

    const { trackerMod, suiteState, puts } = await importTracker({
      cycles: [game4closed, dt6],
      subsByCycleId: {
        'dt6-t1': [{ character_id: 'brandy', responses: { influence_spend: JSON.stringify({ a: 0 }) } }],
        'game4-t1': [{ character_id: 'brandy', responses: { influence_spend: JSON.stringify({ a: 7 }) } }],
      },
      trackerByCharId: { brandy: { influence: 13 } }, // the wrong number the incident showed
    });
    suiteState.chars = [brandy];

    await trackerMod.ensureLoaded(brandy);
    expect(trackerMod.trackerRead('brandy').inf).toBe(13); // seeded wrong, as observed live

    await trackerMod.reconcileInfluenceDT();

    const write = puts.find((p) => p.charId === 'brandy');
    expect(write.body.influence).toBe(20); // infMax(20) - DT6 spend(0), not infMax - Game4 spend(7)=13
  });

  it('a character stuck at a wrong value from a prior bad reconcile is restored, not skipped', async () => {
    const dt6 = { _id: 'dt6-t2', game_number: 6, phase: 'prep' };
    const conrad = fakeChar('conrad', 7);

    const { trackerMod, suiteState, puts } = await importTracker({
      cycles: [dt6],
      subsByCycleId: {
        'dt6-t2': [{ character_id: 'conrad', responses: { influence_spend: JSON.stringify({ a: 0 }) } }],
      },
      trackerByCharId: { conrad: { influence: 0 } }, // the incident's actual stuck DB value
    });
    suiteState.chars = [conrad];

    await trackerMod.ensureLoaded(conrad);
    await trackerMod.reconcileInfluenceDT();

    const write = puts.find((p) => p.charId === 'conrad');
    expect(write.body.influence).toBe(7); // restored to full max — old `spent === 0` skip left this at 0 forever
  });

  it('a character who genuinely spent in the live cycle still gets max minus that spend', async () => {
    const dt6 = { _id: 'dt6-t3', game_number: 6, phase: 'prep' };
    const spender = fakeChar('spender', 10);

    const { trackerMod, suiteState, puts } = await importTracker({
      cycles: [dt6],
      subsByCycleId: {
        'dt6-t3': [{ character_id: 'spender', responses: { influence_spend: JSON.stringify({ a: 4 }) } }],
      },
      trackerByCharId: { spender: { influence: 10 } },
    });
    suiteState.chars = [spender];

    await trackerMod.ensureLoaded(spender);
    await trackerMod.reconcileInfluenceDT();

    const write = puts.find((p) => p.charId === 'spender');
    expect(write.body.influence).toBe(6); // 10 - 4
  });

  it('no feeding-open cycle at all: reconcile is a no-op (no writes)', async () => {
    const closedOnly = { _id: 'g1', game_number: 1, status: 'closed' };
    const char = fakeChar('someone', 10);

    const { trackerMod, suiteState, puts } = await importTracker({
      cycles: [closedOnly],
      subsByCycleId: {},
      trackerByCharId: { someone: { influence: 10 } },
    });
    suiteState.chars = [char];

    await trackerMod.ensureLoaded(char);
    await trackerMod.reconcileInfluenceDT();

    expect(puts.length).toBe(0);
  });
});
