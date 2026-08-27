/**
 * oxp.7 — Sheet Office Merits section (read-only).
 *
 * Two halves:
 *
 *   1. `resolveHeldSeat` (AC2) — pure, DOM-free, exported from
 *      `public/js/data/office-seat-resolve.js`. Extracted from `office-tab.js`'s
 *      own `_wirePurchaseState`, which now calls this SAME function for its own
 *      `held` computation (proven below by re-running that file's existing
 *      wired-integration suite unchanged after the extraction, not just by
 *      asserting the two look similar).
 *
 *   2. `shRenderOfficeMerits`/the async patcher (AC1, 3-8) — this story's own
 *      new render logic in `public/js/editor/sheet.js`, tested with the same
 *      browser-shim + fake-DOM technique `issue-1141-office-tab-render.test.js`
 *      established for `office-tab.js` (no jsdom in this project).
 *
 * DB-backed: none. All of this is pure client-side logic; no MongoDB
 * connection is used or required by this file.
 */

// Browser shims — editor/sheet.js's import chain reaches for `location`
// (api.js's API_BASE) and `window` (sheet-helpers.js assigns onto it at
// module scope). Same minimal-shim technique already established for
// office-tab.js in issue-1141-office-tab-render.test.js. `CSS.escape` is a
// real browser API `patchOfficeMerits` calls (matching the existing
// `status.js` precedent) — stubbed here as a pass-through since no test id
// in this file needs real CSS-selector escaping. `localStorage` is read by
// api.js's own `headers()` on EVERY request (the auth token) — its absence
// throws synchronously inside `apiGet`, before `fetch` is ever reached,
// which a bare `try/catch` swallows silently; this was found the hard way
// (empty test result, `fetch` mock never invoked) before being traced to
// this missing shim, not assumed from the start.
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
import { resolveHeldSeat } from '../../public/js/data/office-seat-resolve.js';
import { OFFICE_DATA, MERIT_DOT_CAPS, buildSeedDocs } from '../scripts/seed-office-content.js';

const SEAT_A = { _id: 'seat-a', office_category: 'Primogen', holder_id: 'yusuf', created_at: '2026-02-21', seat_label: null };
const SEAT_B = { _id: 'seat-b', office_category: 'Primogen', holder_id: 'rene', created_at: '2026-02-21', seat_label: null };
const SEAT_C = { _id: 'seat-c', office_category: 'Enforcer', holder_id: null, created_at: '2026-02-21', seat_label: null };
const SEATS = [SEAT_A, SEAT_B, SEAT_C];

describe('oxp.7 resolveHeldSeat (AC2)', () => {
  it('returns the seat whose holder_id matches this character, in a multi-seat category', () => {
    const yusuf = { _id: 'yusuf', court_category: 'Primogen' };
    expect(resolveHeldSeat(yusuf, SEATS)).toBe(SEAT_A);
  });

  it('returns null when court_category is set but no seat\'s holder_id matches — never guesses a fallback', () => {
    // The exact ambiguous case oxp.6's own Codex review found a real leak
    // from: a stale/never-written holder_id. This function must refuse to
    // guess, unlike office-tab.js's own _fallbackSeat path.
    const staleHolder = { _id: 'someone-else', court_category: 'Primogen' };
    expect(resolveHeldSeat(staleHolder, SEATS)).toBeNull();
  });

  it('returns null when court_category is not set at all', () => {
    const bystander = { _id: 'yusuf', court_category: null };
    expect(resolveHeldSeat(bystander, SEATS)).toBeNull();
  });

  it('returns null when court_category is an empty string', () => {
    const bystander = { _id: 'yusuf', court_category: '' };
    expect(resolveHeldSeat(bystander, SEATS)).toBeNull();
  });

  it('returns null for a malformed or missing seats array, rather than throwing', () => {
    const yusuf = { _id: 'yusuf', court_category: 'Primogen' };
    expect(() => resolveHeldSeat(yusuf, null)).not.toThrow();
    expect(resolveHeldSeat(yusuf, null)).toBeNull();
    expect(resolveHeldSeat(yusuf, undefined)).toBeNull();
    expect(resolveHeldSeat(yusuf, 'not an array')).toBeNull();
  });

  it('resolves correctly in a single-seat category too', () => {
    const holder = { _id: 'holder-of-c', court_category: 'Enforcer' };
    const seatCWithHolder = { ...SEAT_C, holder_id: 'holder-of-c' };
    expect(resolveHeldSeat(holder, [...SEATS.slice(0, 2), seatCWithHolder])).toBe(seatCWithHolder);
  });

  it('a vacant seat in the character\'s own category never matches (holder_id null)', () => {
    const someone = { _id: 'anyone', court_category: 'Enforcer' };
    expect(resolveHeldSeat(someone, SEATS)).toBeNull(); // SEAT_C has holder_id: null
  });
});

describe('oxp.7 shRenderOfficeMerits + patchOfficeMerits (AC1, 3-8)', () => {
  let shRenderOfficeMerits, patchOfficeMerits;
  let realFetch;
  const hadFetch = 'fetch' in globalThis;

  beforeAll(async () => {
    // oxp.10: editor/sheet.js now reads office content from
    // office-content-cache.js's synchronous accessors, not a static import —
    // prime it (real fixtures, via the seed script's own frozen literals)
    // BEFORE importing sheet.js, same technique as
    // issue-1141-office-tab-render.test.js. localStorage is already stubbed
    // above at file scope, so apiGet's headers() read is safe here.
    const { loadOfficeContent } = await import('../../public/js/data/office-content-cache.js');
    const seedDocs = buildSeedDocs({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS, now: '2026-08-27T00:00:00.000Z' });
    const bootFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/office_content')) return { ok: true, status: 200, json: async () => seedDocs };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await loadOfficeContent();
    globalThis.fetch = bootFetch;

    ({ shRenderOfficeMerits, patchOfficeMerits } = await import('../../public/js/editor/sheet.js'));
    realFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    if (!hadLocation) delete globalThis.location;
    if (!hadWindow) delete globalThis.window;
    if (!hadCSS) delete globalThis.CSS;
    if (!hadFetch) delete globalThis.fetch;
  });

  const jsonRes = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

  const YUSUF = { _id: 'yusuf', court_category: 'Primogen' };
  const SEAT_P1 = { _id: 'seat-p1', office_category: 'Primogen', holder_id: 'yusuf', created_at: '2026-02-21', seat_label: null };
  const SEAT_P2 = { _id: 'seat-p2', office_category: 'Primogen', holder_id: 'rene', created_at: '2026-02-21', seat_label: null };
  const OFFICE_SEATS = [SEAT_P1, SEAT_P2];

  /** Hand-rolled `document` stub — no jsdom in this project. Only supports the
   *  exact query shape `patchOfficeMerits` actually issues
   *  (`[data-office-merits-char="ID"]`), and a helper to create a fake slot
   *  node matching what `shRenderOfficeMerits`'s own placeholder HTML would
   *  become once parsed into a real DOM (not simulated here — this suite
   *  tests the two functions' CONTRACT, not HTML parsing). */
  function fakeDocument() {
    const elements = [];
    return {
      querySelectorAll(sel) {
        const m = sel.match(/^\[data-office-merits-char="([^"]*)"\]$/);
        if (!m) return [];
        return elements.filter(el => el.dataset.officeMeritsChar === m[1]);
      },
      _addSlot(charId) {
        const el = { dataset: { officeMeritsChar: charId }, innerHTML: '' };
        elements.push(el);
        return el;
      },
    };
  }

  /** Drain queued microtasks/timers — the wiring is fire-and-forget. */
  async function flush(turns = 10) {
    for (let i = 0; i < turns; i++) await new Promise(r => setTimeout(r, 0));
  }

  describe('shRenderOfficeMerits (synchronous shell)', () => {
    it('reserves a placeholder for a character who could plausibly hold an office merit suite', () => {
      const html = shRenderOfficeMerits(YUSUF);
      expect(html).toContain('data-office-merits-char="yusuf"');
      // AC1/AC6: no visible section chrome yet — that only appears once
      // patchOfficeMerits confirms a real seat.
      expect(html).not.toContain('sh-sec-title');
      expect(html).not.toContain('Office Merits');
    });

    it('renders nothing for a character with no court_category', () => {
      expect(shRenderOfficeMerits({ _id: 'x', court_category: null })).toBe('');
      expect(shRenderOfficeMerits({ _id: 'x', court_category: '' })).toBe('');
    });

    it('renders nothing for Administrator — no OFFICE_DATA entry exists yet (oxp.8)', () => {
      expect(shRenderOfficeMerits({ _id: 'ivana', court_category: 'Administrator' })).toBe('');
    });

    it('renders nothing for a missing/malformed character, rather than throwing', () => {
      expect(() => shRenderOfficeMerits(null)).not.toThrow();
      expect(shRenderOfficeMerits(null)).toBe('');
      expect(shRenderOfficeMerits(undefined)).toBe('');
    });
  });

  describe('patchOfficeMerits (async fill — AC3, AC4, AC5)', () => {
    it('fills the placeholder with purchased-only dots for a confirmed holder', async () => {
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(OFFICE_SEATS);
        if (u.includes('/api/office_merit_dots')) return jsonRes({ [SEAT_P1._id]: { Contacts: 3 } });
        return jsonRes({});
      };
      const doc = fakeDocument();
      const realDocument = globalThis.document;
      globalThis.document = doc;
      try {
        const slot = doc._addSlot('yusuf');
        await patchOfficeMerits(YUSUF);
        await flush();

        expect(slot.innerHTML).toContain('sh-sec-title');
        expect(slot.innerHTML).toContain('Office Merits');
        expect(slot.innerHTML).toContain('Contacts');
        // AC5: shDots(n) only — 3 filled dots, NO hollow-to-cap filler. A
        // literal '<span class="pointed hollow">' anywhere would mean this
        // picked up office-tab.js's editable-interface convention instead of
        // Domain Merits' own read-only one.
        expect(slot.innerHTML).not.toContain('pointed hollow');
        expect((slot.innerHTML.match(/class="pointed"/g) || []).length).toBeGreaterThanOrEqual(3);
      } finally {
        globalThis.document = realDocument;
      }
    });

    it('AC3: leaves the placeholder empty for an unconfirmed match — never guesses', async () => {
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(OFFICE_SEATS);
        if (u.includes('/api/office_merit_dots')) return jsonRes({ [SEAT_P2._id]: { Contacts: 5 } });
        return jsonRes({});
      };
      const doc = fakeDocument();
      const realDocument = globalThis.document;
      globalThis.document = doc;
      try {
        // A character whose court_category is Primogen but who holds NEITHER
        // real Primogen seat — the exact ambiguous case this story exists to
        // refuse rather than guess at.
        const staleHolder = { _id: 'stale-holder', court_category: 'Primogen' };
        const slot = doc._addSlot('stale-holder');
        await patchOfficeMerits(staleHolder);
        await flush();

        expect(slot.innerHTML).toBe('');
      } finally {
        globalThis.document = realDocument;
      }
    });

    it('AC3: leaves the placeholder empty when the fetch fails', async () => {
      globalThis.fetch = async () => jsonRes({ message: 'nope' }, false);
      const doc = fakeDocument();
      const realDocument = globalThis.document;
      globalThis.document = doc;
      try {
        const slot = doc._addSlot('yusuf');
        await patchOfficeMerits(YUSUF);
        await flush();
        expect(slot.innerHTML).toBe('');
      } finally {
        globalThis.document = realDocument;
      }
    });

    it('AC3: a character with no court_category never fetches anything at all', async () => {
      let called = false;
      globalThis.fetch = async () => { called = true; return jsonRes({}); };
      await patchOfficeMerits({ _id: 'bystander', court_category: null });
      await flush();
      expect(called).toBe(false);
    });

    it('AC3: Administrator never fetches anything either — no OFFICE_DATA entry to look up merits from', async () => {
      let called = false;
      globalThis.fetch = async () => { called = true; return jsonRes({}); };
      await patchOfficeMerits({ _id: 'ivana', court_category: 'Administrator' });
      await flush();
      expect(called).toBe(false);
    });

    it('a missing dots-key (never purchased into) renders every merit at 0, not an error', async () => {
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(OFFICE_SEATS);
        if (u.includes('/api/office_merit_dots')) return jsonRes({}); // no key for SEAT_P1 at all
        return jsonRes({});
      };
      const doc = fakeDocument();
      const realDocument = globalThis.document;
      globalThis.document = doc;
      try {
        const slot = doc._addSlot('yusuf');
        await patchOfficeMerits(YUSUF);
        await flush();
        expect(slot.innerHTML).toContain('sh-sec-title'); // office is real, just unpurchased
        expect(slot.innerHTML).not.toContain('class="pointed"'); // zero filled dots anywhere
      } finally {
        globalThis.document = realDocument;
      }
    });

    it('Codex review, oxp.7: a throw AFTER a successful fetch resolves quietly, not as an unhandled rejection', async () => {
      // patchOfficeMerits is called un-awaited with no .catch() at its real
      // call site (suite/sheet.js). Before this fix, only the Promise.all
      // fetch itself was inside the try/catch — anything thrown afterwards
      // (document.querySelectorAll here, standing in for any post-fetch
      // throw) would have escaped as an unhandled promise rejection instead
      // of matching AC3's "a failed fetch renders nothing" contract.
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(OFFICE_SEATS);
        if (u.includes('/api/office_merit_dots')) return jsonRes({ [SEAT_P1._id]: { Contacts: 2 } });
        return jsonRes({});
      };
      const realDocument = globalThis.document;
      globalThis.document = {
        querySelectorAll() { throw new Error('simulated post-fetch DOM failure'); },
      };
      try {
        // The whole point: this must resolve, not reject.
        await expect(patchOfficeMerits(YUSUF)).resolves.toBeUndefined();
      } finally {
        globalThis.document = realDocument;
      }
    });
  });

  // Codex review, oxp.7: this proves the module-scoped `_officeMeritsGen`
  // counter mechanism itself — the actual bug class oxp.3/oxp.6 found — by
  // calling `patchOfficeMerits` directly twice, NOT by driving a real
  // `renderSheet()` call for each character. `renderSheet()` is a large
  // function touching dozens of DOM elements across the whole sheet (health
  // tracker, attributes, skills, disciplines, equipment...); this codebase
  // deliberately has no jsdom, and building a full fake-DOM harness for it
  // is out of proportion to this one guard property. This test does NOT
  // prove the desktop/mobile dual-container wiring in `suite/sheet.js` end
  // to end — an earlier draft of the Dev Agent Record overclaimed that it
  // did; corrected here rather than left standing.
  describe('render-generation guard mechanism (AC7) — direct unit proof, not a renderSheet() integration test', () => {
    it('a late-resolving fetch from a PREVIOUS character never paints into a later render\'s slot', async () => {
      // Yusuf's render starts FIRST (gen=N) and blocks on the FIRST
      // /api/office_seats call only. Rene's render starts SECOND (gen=N+1)
      // and is not gated at all, so it runs to completion first. When
      // Yusuf's own fetch is finally released, his write must be abandoned —
      // the module-scoped generation counter has already moved past his.
      let seatsCallCount = 0;
      let releaseFirstCall;
      const firstCallGate = new Promise(r => { releaseFirstCall = r; });

      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) {
          seatsCallCount++;
          if (seatsCallCount === 1) await firstCallGate; // only Yusuf's call blocks
          return jsonRes(OFFICE_SEATS);
        }
        if (u.includes('/api/office_merit_dots')) return jsonRes({ [SEAT_P1._id]: { Contacts: 4 } });
        return jsonRes({});
      };

      const doc = fakeDocument();
      const realDocument = globalThis.document;
      globalThis.document = doc;
      try {
        const yusufSlot = doc._addSlot('yusuf');
        // Starts synchronously up to its own first real await (inside the
        // fetch stub above), which increments seatsCallCount to 1 and blocks
        // there — so by the time this line returns, gen has been claimed for
        // Yusuf and his fetch is genuinely in flight.
        const yusufPromise = patchOfficeMerits(YUSUF);

        const rene = { _id: 'rene', court_category: 'Primogen' };
        const reneSlot = doc._addSlot('rene');
        await patchOfficeMerits(rene); // unblocked call — claims the NEXT gen, completes fully
        await flush();
        expect(reneSlot.innerHTML).toContain('Office Merits');

        releaseFirstCall(); // now let Yusuf's own fetch finally resolve
        await yusufPromise;
        await flush();

        // Yusuf's own write must have been abandoned — Rene's render claimed
        // a newer generation and finished before Yusuf's fetch settled.
        expect(yusufSlot.innerHTML).toBe('');
      } finally {
        globalThis.document = realDocument;
      }
    });
  });
});
