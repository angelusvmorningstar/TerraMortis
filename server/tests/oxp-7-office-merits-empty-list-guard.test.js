/**
 * oxp.7 — Codex review follow-up: direct proof of `patchOfficeMerits`'s
 * `if (!meritNames.length) return;` guard (AC3's "the resolved office has
 * zero merits" case).
 *
 * No current `OFFICE_DATA` entry actually has an empty `merits` array — the
 * main oxp-7 test file's own AC3 completion notes said this path was
 * covered by its four render-nothing tests, which was an overclaim (Codex
 * review, oxp.7): those four tests exercise no-court_category, unconfirmed
 * seat, Administrator (no OFFICE_DATA entry at all — a DIFFERENT guard),
 * and a failed fetch, never a real office whose merit list is empty. This
 * file closes that gap directly, mocking `office-data.js` (this codebase's
 * own established convention — see e.g.
 * applyDerivedMerits-null-cache-guard.test.js) rather than waiting for a
 * real zero-merit office to exist.
 */

const hadLocation = 'location' in globalThis;
const hadWindow = 'window' in globalThis;
const hadCSS = 'CSS' in globalThis;
const hadLocalStorage = 'localStorage' in globalThis;
if (!hadLocation) globalThis.location = { hostname: 'test', pathname: '/' };
if (!hadWindow) globalThis.window = globalThis;
if (!hadCSS) globalThis.CSS = { escape: (s) => s };
if (!hadLocalStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Hoisted by vitest ahead of the dynamic import() below. Keeps every real
// office category untouched and adds one synthetic zero-merit category so
// the guard is exercised via the SAME code path a real office would use,
// not a bypass of it.
vi.mock('../../public/js/tabs/office-data.js', async () => {
  const actual = await vi.importActual('../../public/js/tabs/office-data.js');
  return {
    ...actual,
    OFFICE_DATA: {
      ...actual.OFFICE_DATA,
      'Empty Test Office': { asset: 'Nothing', merits: [], style: 'None', manoeuvres: [], statusPower: [] },
    },
  };
});

describe('oxp.7 Codex follow-up: patchOfficeMerits zero-merit-office guard (AC3)', () => {
  let patchOfficeMerits;
  let realFetch;
  const hadFetch = 'fetch' in globalThis;

  beforeAll(async () => {
    ({ patchOfficeMerits } = await import('../../public/js/editor/sheet.js'));
    realFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    if (!hadLocation) delete globalThis.location;
    if (!hadWindow) delete globalThis.window;
    if (!hadCSS) delete globalThis.CSS;
    if (!hadFetch) delete globalThis.fetch;
  });

  const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body });

  it('a confirmed seat in a real-but-empty-merit-list office renders nothing', async () => {
    const HOLDER = { _id: 'empty-holder', court_category: 'Empty Test Office' };
    const SEAT = { _id: 'empty-seat', office_category: 'Empty Test Office', holder_id: 'empty-holder', created_at: '2026-02-21', seat_label: null };

    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/office_seats')) return jsonRes([SEAT]);
      if (u.includes('/api/office_merit_dots')) return jsonRes({ [SEAT._id]: {} });
      return jsonRes({});
    };

    const elements = [];
    const doc = {
      querySelectorAll(sel) {
        const m = sel.match(/^\[data-office-merits-char="([^"]*)"\]$/);
        if (!m) return [];
        return elements.filter(el => el.dataset.officeMeritsChar === m[1]);
      },
    };
    const slot = { dataset: { officeMeritsChar: 'empty-holder' }, innerHTML: '' };
    elements.push(slot);

    const realDocument = globalThis.document;
    globalThis.document = doc;
    try {
      await patchOfficeMerits(HOLDER);
      // AC3: the office is real and the seat is confirmed, but there is
      // nothing to show — the guard must fire before any DOM write happens.
      expect(slot.innerHTML).toBe('');
    } finally {
      globalThis.document = realDocument;
    }
  });
});
