/**
 * oxp.7 — Codex review follow-up: direct proof of `patchOfficeMerits`'s
 * `if (!meritNames.length) return;` guard (AC3's "the resolved office has
 * zero merits" case).
 *
 * No real `office_content` document actually has an empty `merits` array —
 * the main oxp-7 test file's own AC3 completion notes said this path was
 * covered by its four render-nothing tests, which was an overclaim (Codex
 * review, oxp.7): those four tests exercise no-court_category, unconfirmed
 * seat, Administrator (no office_content entry at all — a DIFFERENT guard),
 * and a failed fetch, never a real office whose merit list is empty. This
 * file closes that gap directly by priming `office-content-cache.js` (oxp.10)
 * with a synthetic zero-merit category alongside the real ones, via the same
 * `loadOfficeContent()` + stubbed-fetch path a real boot uses — exercising
 * the guard through the real accessor code, not a bypass of it.
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('oxp.7 Codex follow-up: patchOfficeMerits zero-merit-office guard (AC3)', () => {
  let patchOfficeMerits;
  let realFetch;
  const hadFetch = 'fetch' in globalThis;

  beforeAll(async () => {
    // Prime office-content-cache.js (oxp.10) BEFORE importing sheet.js, with
    // one synthetic zero-merit category alongside the real ones — the module
    // registry resets per test file (vitest's default isolate:true), so this
    // file's cache load cannot leak into or collide with any other file's.
    const { loadOfficeContent } = await import('../../public/js/data/office-content-cache.js');
    const bootFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/office_content')) {
        return {
          ok: true, status: 200,
          json: async () => [
            { kind: 'office', category: 'Empty Test Office', asset: 'Nothing', style: 'None', merits: [], manoeuvres: [{ name: 'x', effect: 'x' }], statusPower: ['x'] },
          ],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await loadOfficeContent();
    globalThis.fetch = bootFetch;

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
