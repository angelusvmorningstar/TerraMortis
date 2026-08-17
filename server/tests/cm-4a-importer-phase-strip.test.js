/**
 * CM-4a review finding P1 (2026-08-16) — the Data Portability importer must not
 * re-drive a phase transition.
 *
 * CM-4a made PUT /api/chapters/:id destructive: a body carrying an own
 * `phase` key fires the tracker slate-wipe when the transition resets. The
 * story's own reasoning held that a same-phase round-trip import was therefore
 * safe "by construction, since resetOnTransition(x, x) is false for every x".
 * That is FALSE for exactly one row: resetOnTransition('game', 'game') is TRUE,
 * because entering game from anywhere except prep is the legacy reset.
 *
 * The consequence was a NEW destructive path this story introduced: restoring a
 * backup of a cycle that happens to be in game phase - the phase a cycle sits in
 * on a game night - silently wiped every character's live tracker_state, with no
 * confirmation dialog anywhere on the importer's path. Before CM-4a the importer
 * never touched tracker_state at all.
 *
 * The fix strips the mirror trio (phase/game_phase/status) from the restore PUT.
 * A restore is identity, label and deadline data being put back; phase is live
 * game-night state and is driven from the Cycle tab, which is the surface that
 * warns the ST.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

// data-portability.js's import chain reaches the whole admin app (excel
// parsing, downtime views, the character exporter). None of it is exercised by
// writeJsonDoc, so it is mocked away wholesale; api.js is mocked so the write
// itself is observable. Same technique as dt-form-territory-fresh-fetch.test.js.
vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(async () => []),
  apiPut: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({})),
  apiRaw: vi.fn(async () => ({})),
}));
vi.mock('../../public/js/editor/export.js', () => ({ downloadCSV: vi.fn() }));
vi.mock('../../public/js/admin/data-portability-import.js', () => ({
  validateRow: vi.fn(), writeRow: vi.fn(), parseCSV: vi.fn(),
}));
vi.mock('../../public/js/admin/excel-parser.js', () => ({ parseExcelWorkbook: vi.fn() }));
vi.mock('../../public/js/admin/excel-merge.js', () => ({ mergeExcelOntoCharacter: vi.fn() }));
vi.mock('../../public/js/admin/downtime-views.js', () => ({ processDowntimeCsvFile: vi.fn() }));

import { apiPut, apiPost } from '../../public/js/data/api.js';
import { writeJsonDoc } from '../../public/js/admin/data-portability.js';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// A realistic exported cycle document: everything the ST would want restored,
// plus the live-state trio that must not ride along.
const EXPORTED_CYCLE = Object.freeze({
  _id: '65f0000000000000000000aa',
  label: 'Chapter 7',
  game_number: 7,
  deadline: '2026-08-14',
  phase: 'game',
  game_phase: 'game',
  status: 'game',
  phase_signoff: { prep: true, city: false },
});

describe('cm-4a P1 — the importer strips live phase state from a cycle restore', () => {
  beforeEach(() => {
    vi.mocked(apiPut).mockClear();
    vi.mocked(apiPost).mockClear();
  });

  it('PUTs the identity/label/deadline data but no phase, game_phase or status', async () => {
    await writeJsonDoc('chapters', { ...EXPORTED_CYCLE });

    expect(vi.mocked(apiPut)).toHaveBeenCalledTimes(1);
    const [path, body] = vi.mocked(apiPut).mock.calls[0];
    expect(path).toBe(`/api/chapters/${EXPORTED_CYCLE._id}`);

    // The restore still restores.
    expect(body).toMatchObject({
      label: 'Chapter 7',
      game_number: 7,
      deadline: '2026-08-14',
      phase_signoff: { prep: true, city: false },
    });
    // The live game-night trio does not ride along.
    expect(body).not.toHaveProperty('phase');
    expect(body).not.toHaveProperty('game_phase');
    expect(body).not.toHaveProperty('status');
    // And _id is still stripped, as it always was.
    expect(body).not.toHaveProperty('_id');
  });

  it('leaves the create path alone — a POST is not a transition and reaches no wipe', async () => {
    const { _id, ...noId } = EXPORTED_CYCLE;
    await writeJsonDoc('chapters', noId);
    expect(vi.mocked(apiPut)).not.toHaveBeenCalled();
    expect(vi.mocked(apiPost)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiPost).mock.calls[0][1]).toMatchObject({ phase: 'game', status: 'game' });
  });

  it('does not disturb other collections', async () => {
    await writeJsonDoc('game_sessions', { _id: 'g1', status: 'done' });
    expect(vi.mocked(apiPut).mock.calls[0][1]).toMatchObject({ status: 'done' });
  });
});

// ── The same thing end to end: the shaped body meets the real route ──────────
//
// The unit test above pins what the importer sends. This one pins what that
// body DOES at the route CM-4a hardened, and carries its own control: the
// unstripped body wipes, the shaped one does not. Without the control the test
// could pass against a route that had simply stopped enforcing anything.
const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('cm-4a P1 — re-importing a game-phase cycle (real DB)', () => {
  let app;
  const LABEL_PREFIX = 'CM-4a P1 Probe';
  const cycles = () => getCollection('chapters');
  const tracker = () => getCollection('tracker_state');

  async function cleanup() {
    await cycles().deleteMany({ label: { $regex: `^${LABEL_PREFIX}` } });
    await tracker().deleteMany({});
  }

  beforeEach(async () => { await cleanup(); });

  beforeAll(async () => {
    await setupDb();
    app = createTestApp();
    await cleanup();
  });
  afterAll(async () => { await cleanup(); await teardownDb(); });

  /** A live cycle sitting in game phase, with real tracker state behind it. */
  async function seedLiveGameNight() {
    const { insertedId } = await cycles().insertOne({
      label: `${LABEL_PREFIX} ${Math.random().toString(36).slice(2, 8)}`,
      game_number: 7,
      phase: 'game',
      game_phase: 'game',
      status: 'game',
    });
    await tracker().insertMany([
      { character_id: 'p1-a', vitae: 7, willpower: 5 },
      { character_id: 'p1-b', vitae: 3, willpower: 2 },
    ]);
    return insertedId;
  }

  const put = (id, body) =>
    request(app).put(`/api/chapters/${id}`).set('X-Test-User', stUser()).send(body);

  it('CONTROL: the unstripped export body DOES wipe the live tracker', async () => {
    const id = await seedLiveGameNight();
    const { _id, ...body } = EXPORTED_CYCLE;
    const res = await put(id, body);
    expect(res.status).toBe(200);
    // resetOnTransition('game', 'game') is true. This is the hazard.
    expect(await tracker().countDocuments({})).toBe(0);
  });

  it('the importer body does NOT wipe the live tracker, and still restores the data', async () => {
    const id = await seedLiveGameNight();
    vi.mocked(apiPut).mockClear();
    await writeJsonDoc('chapters', { ...EXPORTED_CYCLE });
    const body = vi.mocked(apiPut).mock.calls[0][1];

    const res = await put(id, body);
    expect(res.status).toBe(200);
    expect(await tracker().countDocuments({})).toBe(2);

    const after = await cycles().findOne({ _id: id });
    expect(after.label).toBe('Chapter 7');
    expect(after.deadline).toBe('2026-08-14');
    // The live phase is untouched by a restore.
    expect(after.phase).toBe('game');
    expect(after.status).toBe('game');
  });
});
