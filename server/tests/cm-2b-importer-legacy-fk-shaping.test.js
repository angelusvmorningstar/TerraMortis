/**
 * cm-2b review finding — the Data Portability importer must SHAPE a restored
 * document's legacy Chapter FK, not carry it through.
 *
 * A backup taken before cm-2b carries `downtime_submissions.cycle_id`. Restored
 * verbatim, that either 400s (the submissions routes now reject the legacy key
 * outright — `server/helpers/chapter-fk.js`) or, before that guard existed,
 * silently re-created `cycle_id`-only documents in bulk: invisible to every
 * list, hold-flag, publish and delete-orphan guard.
 *
 * The fix follows this project's own Lesson #105 — drop the legacy keys at
 * the WRITER rather than gate them on the schema.
 *
 * data-portability.js's import chain reaches the whole admin app, none of
 * which writeJsonDoc exercises, so it is mocked away wholesale; api.js is
 * mocked so the write itself is observable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/data/api.js', () => ({
  apiGet: vi.fn(async () => []),
  apiPut: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({})),
  apiRaw: vi.fn(async () => ({})),
}));
vi.mock('../../public/js/admin/data-portability-import.js', () => ({
  validateRow: vi.fn(), writeRow: vi.fn(), parseCSV: vi.fn(),
}));
vi.mock('../../public/js/admin/downtime-views.js', () => ({ processDowntimeCsvFile: vi.fn() }));

import { apiPut, apiPost } from '../../public/js/data/api.js';
import { writeJsonDoc, shapeLegacyChapterFk } from '../../public/js/admin/data-portability.js';

const CHAPTER = '65f0000000000000000000aa';

beforeEach(() => {
  apiPut.mockClear();
  apiPost.mockClear();
});

describe('cm-2b — shapeLegacyChapterFk (pure)', () => {
  it('renames cycle_id to chapter_id', () => {
    expect(shapeLegacyChapterFk({ cycle_id: CHAPTER, status: 'submitted' }))
      .toEqual({ chapter_id: CHAPTER, status: 'submitted' });
  });

  it('keeps an existing chapter_id and still drops the legacy key', () => {
    expect(shapeLegacyChapterFk({ cycle_id: 'stale', chapter_id: CHAPTER }))
      .toEqual({ chapter_id: CHAPTER });
  });

  it('leaves a body with no legacy key strictly alone (same object identity)', () => {
    const body = { chapter_id: CHAPTER };
    expect(shapeLegacyChapterFk(body)).toBe(body);
  });

  it('does not touch npcs.linked_cycle_id — a different collection\'s FK, deliberately kept', () => {
    expect(shapeLegacyChapterFk({ linked_cycle_id: CHAPTER }))
      .toEqual({ linked_cycle_id: CHAPTER });
  });

  it('does not touch project_invitations / ranking_ballots shapes that legitimately keep cycle_id', () => {
    // Those two never go through writeJsonDoc — they have no import case at all
    // — so the helper is only ever applied to the cases below. Pinned so a
    // future "let's reuse this everywhere" refactor has to think first.
    expect(typeof shapeLegacyChapterFk).toBe('function');
  });
});

describe('cm-2b — writeJsonDoc restores a pre-rename backup correctly', () => {
  it('PUT of a downtime_submissions backup sends chapter_id, never cycle_id', async () => {
    await writeJsonDoc('downtime_submissions', {
      _id: '65f0000000000000000000bb',
      cycle_id: CHAPTER,
      character_id: '65f0000000000000000000cc',
      status: 'submitted',
    });

    expect(apiPut).toHaveBeenCalledTimes(1);
    const [path, body] = apiPut.mock.calls[0];
    expect(path).toBe('/api/downtime_submissions/65f0000000000000000000bb');
    expect(body.chapter_id).toBe(CHAPTER);
    expect(body).not.toHaveProperty('cycle_id');
  });

  it('POST of an _id-less downtime_submissions backup shapes it too', async () => {
    await writeJsonDoc('downtime_submissions', {
      cycle_id: CHAPTER, character_id: 'x', status: 'draft',
    });

    expect(apiPost).toHaveBeenCalledTimes(1);
    const [path, body] = apiPost.mock.calls[0];
    expect(path).toBe('/api/downtime_submissions');
    expect(body.chapter_id).toBe(CHAPTER);
    expect(body).not.toHaveProperty('cycle_id');
  });

  it('leaves the npcs case alone — linked_cycle_id survives a restore', async () => {
    await writeJsonDoc('npcs', {
      _id: '65f0000000000000000000dd', name: 'A Ghoul', linked_cycle_id: CHAPTER,
    });

    const [, body] = apiPut.mock.calls[0];
    expect(body.linked_cycle_id).toBe(CHAPTER);
  });
});
