/**
 * Issue #1141 — permanent render-level regression coverage for AC6 (two
 * concurrent Socialite holders render independently) and AC7 (the
 * Administrator "pending" fallback still fires).
 *
 * Added after code review: `issue-1141-office-data-sync.test.js` deliberately
 * imports only `office-data.js`, never `office-tab.js`, because `office-tab.js`
 * pulls in `../data/api.js`, which reads `location.hostname` at module top
 * level — a bare vitest import throws `ReferenceError: location is not
 * defined` (no jsdom configured in `server/vitest.config.js`). The original
 * story proved AC6/AC7 with a one-off Playwright script that was deleted
 * after use, leaving no permanent regression guard — a real gap the review
 * caught (Blind Hunter, Medium and Low findings).
 *
 * The fix: stub `globalThis.location` with the minimum `office-tab.js`'s
 * import chain needs, import AFTER stubbing, then restore. This technique was
 * proven safe by the code review itself (both the Edge Case Hunter and the
 * Acceptance Auditor independently ran the equivalent stub-and-import in a
 * throwaway Node script and it rendered correctly).
 *
 * `server/vitest.config.js` sets `fileParallelism: false` and
 * `poolOptions.forks.singleFork: true` — every test file in this project
 * shares ONE process. A `globalThis.location` stub left in place would leak
 * into every test file that runs after this one in the same run. The stub is
 * therefore applied only if `location` was not already defined, and removed
 * in `afterAll` regardless of pass/fail, so no other suite ever sees it.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

describe('issue-1141 — office-tab.js render-level regressions', () => {
  let renderOfficeTab;
  let manoeuvreListHtml;
  let manoeuvreRankHtml;
  const hadLocation = 'location' in globalThis;

  beforeAll(async () => {
    if (!hadLocation) {
      globalThis.location = { hostname: 'test', pathname: '/' };
    }
    ({ renderOfficeTab, manoeuvreListHtml, manoeuvreRankHtml } =
      await import('../../public/js/tabs/office-tab.js'));
  });

  afterAll(() => {
    if (!hadLocation) {
      delete globalThis.location;
    }
  });

  function render(char, chars = [char], viewCategory) {
    const el = { innerHTML: '' };
    renderOfficeTab(el, char, chars, viewCategory);
    return el.innerHTML;
  }

  it('AC6: two characters both holding court_category "Socialite" render independently, no collision', () => {
    const brandy = { _id: 'brandy', name: 'Brandy LaRoux', court_category: 'Socialite', court_title: 'Harpy' };
    const carver = { _id: 'carver', name: 'Carver', court_category: 'Socialite', court_title: "People's Harpy" };
    const chars = [brandy, carver];

    const brandyHtml = render(brandy, chars);
    const carverHtml = render(carver, chars);

    for (const html of [brandyHtml, carverHtml]) {
      expect(html).toContain('Size Them Up');
      expect(html).toContain('Curry Favour');
      // office-merit-dots: merit NAMES (e.g. Cacophony Savvy) now render
      // async via _wireMeritDots against real dot state; this plain-object
      // mock has no real querySelector, so only the section's synchronous
      // loading placeholder is present here.
      expect(html).toContain('data-office-merit-mount');
    }
    // Rendering one does not mutate or leak into the other's own render.
    expect(brandyHtml).not.toBe('');
    expect(carverHtml).not.toBe('');
  });

  it('AC7: a character holding court_category "Administrator" still renders the pending fallback', () => {
    const ivana = { _id: 'ivana', name: 'Ivana Horvat', court_category: 'Administrator', court_title: 'Seneschal' };
    const html = render(ivana);

    expect(html).toContain('Office details for this role are pending.');
    expect(html).not.toContain('office-manoeuvre-list');
    expect(html).not.toContain('office-merit-chip');
  });

  it('the Manoeuvres section heading no longer claims a flat, false cost (review finding: Blind Hunter + Edge Case Hunter + Acceptance Auditor, independently)', () => {
    // Deliberately not Head of State: that category triggers the async,
    // fire-and-forget _wireHosActions(), which calls el.querySelector and
    // throws against this test's plain-object mock (unrelated to what this
    // test checks). Any other category exercises the same heading render
    // without that unrelated interactive-UI code path.
    const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
    const html = render(yusuf);

    // The old heading, "Manoeuvres (each costs 1 Influence)", was false for
    // most of Symon's rewritten powers (several cost Influence equal to City
    // Status or a territory's Ambience rating, not a flat 1). Costs are
    // already stated per-power in each effect string, so the heading no
    // longer claims a summary cost at all.
    expect(html).toContain('<div class="office-section-hd">Manoeuvres</div>');
    expect(html).not.toContain('each costs 1 Influence');
  });

  it('otc.1: Status Power renders as one <p> per paragraph, not one undifferentiated block (AC1)', () => {
    // Deliberately not Head of State, for the same reason as the test above
    // (_wireHosActions is async, fire-and-forget, and throws against this
    // test's plain-object mock).
    const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
    const html = render(yusuf);

    // Primogen's statusPower is 2 paragraphs (specs/stories/otc-1-status-power-paragraph-rendering.md).
    const matches = [...html.matchAll(/<div class="office-status-power">([\s\S]*?)<\/div>/g)];
    expect(matches.length).toBe(1);
    const block = matches[0][1];
    const paragraphs = [...block.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]);
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]).toContain('You may permanently sacrifice one of your own City Status dots');
    // esc() (public/js/data/helpers.js) does not escape apostrophes, only &, <, >, " — the
    // rendered text keeps its literal apostrophe.
    expect(paragraphs[1]).toBe("Your decisions should be grounded in the City Deeds. If you can't justify a Status change, others will be justified in dropping yours.");
    // The block must genuinely be two separate <p> tags, not one flat run of text.
    expect(block).not.toBe(paragraphs.join(''));
  });

  describe('otc.3 — browsable reference mode', () => {
    it('AC1/AC2: renders a category picker for all five offices, defaulting to your own held office', () => {
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const html = render(yusuf);

      expect(html).toContain('id="office-category-select"');
      for (const cat of ['Head of State', 'Primogen', 'Enforcer', 'Socialite', 'Administrator']) {
        expect(html).toContain(`>${cat}`);
      }
      // Own office is selected by default and marked as such.
      expect(html).toMatch(/<option value="Primogen" selected>Primogen \(yours\)<\/option>/);
    });

    it('AC3/AC5, the core security boundary: browsing an office you do NOT hold shows reference only — no Status Actions panel, even for Head of State', () => {
      // Yusuf holds Primogen, not Head of State. Browsing Head of State's
      // reference must NEVER expose the interactive panel a real Head of
      // State would see — this is the exact gap this story exists to close.
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const html = render(yusuf, [yusuf], 'Head of State');

      expect(html).not.toContain('office-budget-line');
      expect(html).not.toContain('office-picker-mount');
      expect(html).not.toContain('office-action-btns');
      expect(html).not.toContain('office-action-msg');
      // Reference content is still present — this is a browsing view, not an empty one.
      expect(html).toContain('Due Diligence'); // a real Head of State manoeuvre name
      // office-merit-dots: merit rows now render async via _wireMeritDots
      // (fetches real dot state), which no-ops against this plain-object
      // mock (no real querySelector) — the merit SECTION itself is still
      // present synchronously as its loading placeholder.
      expect(html).toContain('data-office-merit-mount');
    });

    it('AC5: the reference-view banner appears when browsing, and is absent on your own office', () => {
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const browsing = render(yusuf, [yusuf], 'Head of State');
      const own = render(yusuf, [yusuf], 'Primogen');

      expect(browsing).toContain('office-reference-banner');
      expect(own).not.toContain('office-reference-banner');
    });

    it('AC4: your own office still renders exactly as before this story (no regression)', () => {
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const html = render(yusuf, [yusuf], 'Primogen');

      expect(html).toContain('People Talk'); // a real Primogen manoeuvre name
      expect(html).toContain('data-office-merit-mount'); // office-merit-dots: merit rows render async now
      expect(html).not.toContain('office-reference-banner');
    });

    it('AC6: selecting Administrator via the picker still hits the pending fallback', () => {
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const html = render(yusuf, [yusuf], 'Administrator');

      expect(html).toContain('Office details for this role are pending.');
      expect(html).not.toContain('office-manoeuvre-list');
      expect(html).not.toContain('office-merit-chip');
      // The picker itself must still be present so the viewer isn't stuck.
      expect(html).toContain('id="office-category-select"');
    });

    it('the picker actually wires a change listener that re-renders on selection (Codex review, Pass 3b, 2026-08-12)', () => {
      // Every other otc.3 test drives category switches by passing
      // viewCategory directly, never through a real <select> change event —
      // Codex proved via mutation that deleting `_wireCategoryPicker`'s
      // addEventListener call left the whole suite green. This test builds a
      // minimal fake <select> (no jsdom/happy-dom in this project) so the
      // event actually fires through the real wiring path.
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };

      const select = { value: '', _listeners: {} };
      select.addEventListener = (evt, fn) => { (select._listeners[evt] ||= []).push(fn); };
      select.dispatchEvent = (evt) => { (select._listeners[evt.type] || []).forEach(fn => fn(evt)); };

      const el = {
        _html: '',
        get innerHTML() { return this._html; },
        set innerHTML(v) {
          this._html = v;
          // Keep the fake <select>'s value synced to the freshly rendered
          // markup, the way a real DOM element would be after a re-render.
          const m = v.match(/<option value="([^"]*)" selected>/);
          select.value = m ? m[1] : '';
        },
        querySelector: (sel) => (sel === '#office-category-select' ? select : null),
      };

      renderOfficeTab(el, yusuf, [yusuf]);
      expect(el.innerHTML).toContain('People Talk'); // Primogen's own manoeuvre
      expect(el.innerHTML).not.toContain('office-reference-banner');

      // Simulate the user picking a different office in the real <select>.
      select.value = 'Head of State';
      select.dispatchEvent({ type: 'change' });

      // A genuine re-render happened via the wired listener, not a direct call.
      expect(el.innerHTML).toContain('office-reference-banner');
      expect(el.innerHTML).toContain('Due Diligence'); // a real Head of State manoeuvre
      expect(el.innerHTML).not.toContain('People Talk');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // oxp.3 — manoeuvre purchase state (graduated rank, muted-when-unpurchased)
  //
  // `manoeuvreListHtml` and `manoeuvreRankHtml` are pure markup builders,
  // exported precisely so the rank-dependent rendering is testable without a
  // browser harness (this project has no jsdom — see this file's own header).
  // The async wiring that feeds them real values is covered by the
  // source-contract block in oxp-3-office-manoeuvre-rank.test.js.
  // ───────────────────────────────────────────────────────────────────────
  describe('oxp.3 — manoeuvre purchase state', () => {
    const MUTED = 'office-manoeuvre-unpurchased';
    // Five stand-ins, one per rank, so position is unambiguous in assertions.
    const FIVE = [1, 2, 3, 4, 5].map(n => ({ name: `Rank ${n}`, effect: `Effect ${n}` }));

    /** The class attribute of each rendered .office-manoeuvre BLOCK, in order.
     *  Deliberately not `office-manoeuvre[^"]*` — that would also swallow the
     *  inner .office-manoeuvre-name / -effect divs. */
    function blockClasses(html) {
      return [...html.matchAll(/<div class="(office-manoeuvre(?: [\w-]+)*)">/g)].map(m => m[1]);
    }

    it('AC1: own-office view at rank 2 of 5 mutes only ranks 3-5, never 1-2', () => {
      const classes = blockClasses(manoeuvreListHtml(FIVE, 2, true));
      expect(classes).toHaveLength(5);
      expect(classes[0]).not.toContain(MUTED);
      expect(classes[1]).not.toContain(MUTED);
      expect(classes[2]).toContain(MUTED);
      expect(classes[3]).toContain(MUTED);
      expect(classes[4]).toContain(MUTED);
    });

    it('AC1: rank 0 (no document / nothing purchased) mutes all five', () => {
      const classes = blockClasses(manoeuvreListHtml(FIVE, 0, true));
      expect(classes).toHaveLength(5);
      for (const c of classes) expect(c).toContain(MUTED);
    });

    it('AC1: rank 5 (everything purchased) mutes none', () => {
      const classes = blockClasses(manoeuvreListHtml(FIVE, 5, true));
      expect(classes).toHaveLength(5);
      for (const c of classes) expect(c).not.toContain(MUTED);
    });

    it('AC1: all five are still listed in fixed rank order whatever the rank — muting never hides one', () => {
      for (const rank of [0, 1, 2, 3, 4, 5]) {
        const html = manoeuvreListHtml(FIVE, rank, true);
        for (const m of FIVE) expect(html).toContain(m.name);
        expect(blockClasses(html)).toHaveLength(5);
      }
    });

    it('AC2, the structural boundary: the reference view never carries the muted class, whatever the stored rank', () => {
      // Not "visually suppressed" — genuinely absent from the markup, so a
      // reference viewer reading the DOM learns nothing about purchase state.
      for (const rank of [0, 1, 2, 3, 4, 5]) {
        const html = manoeuvreListHtml(FIVE, rank, false);
        expect(html).not.toContain(MUTED);
        for (const c of blockClasses(html)) expect(c).toBe('office-manoeuvre');
      }
    });

    it('AC1: an unknown rank (null — the synchronous first render, before the fetch resolves) mutes nothing', () => {
      expect(manoeuvreListHtml(FIVE, null, true)).not.toContain(MUTED);
      expect(manoeuvreListHtml(FIVE, undefined, true)).not.toContain(MUTED);
    });

    it('AC2/AC8: renderOfficeTab\'s reference view emits the manoeuvre list with no purchase state at all', () => {
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const html = render(yusuf, [yusuf], 'Head of State');

      expect(html).toContain('Due Diligence'); // the reference summary is intact
      expect(html).toContain('Executive Order');
      expect(html).not.toContain(MUTED);
    });

    it('AC6: the rank readout is a graduated dot display, filled to the rank and hollow beyond it', () => {
      expect(manoeuvreRankHtml(0, 5, false)).toContain('○○○○○');
      expect(manoeuvreRankHtml(2, 5, false)).toContain('●●○○○');
      expect(manoeuvreRankHtml(5, 5, false)).toContain('●●●●●');
    });

    it('AC6: the +/- stepper renders for an ST/dev viewer and never for anyone else', () => {
      const stHtml     = manoeuvreRankHtml(2, 5, true);
      const playerHtml = manoeuvreRankHtml(2, 5, false);

      expect(stHtml).toContain('cs-step-btn');
      expect(stHtml).toContain('data-manoeuvre-rank-up');
      expect(stHtml).toContain('data-manoeuvre-rank-down');

      expect(playerHtml).not.toContain('cs-step-btn');
      expect(playerHtml).not.toContain('data-manoeuvre-rank-up');
      expect(playerHtml).not.toContain('data-manoeuvre-rank-down');
      // A non-ST still sees the readout itself, just no controls.
      expect(playerHtml).toContain('●●○○○');
    });

    it('the exported builder clamps a rank from outside [0, count] rather than throwing (Codex review, Pass 1, Low)', () => {
      // manoeuvreRankHtml is exported, and '●'.repeat(-1) throws a RangeError.
      // The only current caller clamps first, so this is a boundary-robustness
      // fix for whatever calls it next, not a live UI path today.
      expect(() => manoeuvreRankHtml(-1, 5, false)).not.toThrow();
      expect(manoeuvreRankHtml(-1, 5, false)).toContain('○○○○○');
      expect(manoeuvreRankHtml(7, 5, false)).toContain('●●●●●');
      expect(manoeuvreRankHtml(2.7, 5, false)).toContain('●●○○○');
      expect(manoeuvreRankHtml(NaN, 5, false)).toContain('○○○○○');
      // The stepper's disabled states follow the clamped value, not the raw one.
      expect(manoeuvreRankHtml(-1, 5, true)).toMatch(/data-manoeuvre-rank-down disabled/);
      expect(manoeuvreRankHtml(-1, 5, true)).not.toMatch(/data-manoeuvre-rank-up disabled/);
      expect(manoeuvreRankHtml(7, 5, true)).toMatch(/data-manoeuvre-rank-up disabled/);
      expect(manoeuvreRankHtml(7, 5, true)).not.toMatch(/data-manoeuvre-rank-down disabled/);
    });

    it('AC6: the stepper disables up at the cap and down at zero, matching the merit stepper\'s pattern', () => {
      const atMax = manoeuvreRankHtml(5, 5, true);
      expect(atMax).toMatch(/data-manoeuvre-rank-up disabled/);
      expect(atMax).not.toMatch(/data-manoeuvre-rank-down disabled/);

      const atZero = manoeuvreRankHtml(0, 5, true);
      expect(atZero).toMatch(/data-manoeuvre-rank-down disabled/);
      expect(atZero).not.toMatch(/data-manoeuvre-rank-up disabled/);

      const middle = manoeuvreRankHtml(3, 5, true);
      expect(middle).not.toMatch(/disabled/);
    });

    it('AC6: the readout mount is present in the Manoeuvres section but carries no rank until the fetch resolves', () => {
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const own = render(yusuf, [yusuf], 'Primogen');

      expect(own).toContain('data-office-manoeuvre-rank-mount');
      // Empty on the synchronous render — the rank is not known yet, and an
      // empty mount leaks nothing to a reference viewer who never gets one filled.
      expect(own).not.toContain('●');
      expect(own).not.toContain('cs-step-btn');
    });

    it('AC8: the Administrator pending fallback still renders no manoeuvre markup at all', () => {
      const ivana = { _id: 'ivana', name: 'Ivana Horvat', court_category: 'Administrator', court_title: 'Seneschal' };
      const html = render(ivana);

      expect(html).toContain('Office details for this role are pending.');
      expect(html).not.toContain('office-manoeuvre');
      expect(html).not.toContain('data-office-manoeuvre-rank-mount');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // oxp.3 review round (external Codex review, 2026-08-13): the ASYNC wiring.
  //
  // The pure builders above cannot say anything about what _wireManoeuvreRank
  // and _adjustManoeuvreRank do with their results, and both of the Medium
  // findings this round patched live entirely in that layer: a rank-fetch
  // failure leaving the holder's list looking fully purchased, and an
  // adjustment resolving after a category switch repainting the wrong office.
  //
  // So these tests drive the real wiring against a hand-rolled fake DOM, the
  // same technique the picker test above already established for its fake
  // <select> (this project has no jsdom). Two globals the wiring reaches for
  // are stubbed the way this file's header stubs `location`: `localStorage`
  // (discord.js's getRole, and api.js's auth header) and `fetch` (api.js).
  // ───────────────────────────────────────────────────────────────────────
  describe('oxp.3: async rank wiring', () => {
    const MUTED = 'office-manoeuvre-unpurchased';
    const YUSUF = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
    const hadLocalStorage = 'localStorage' in globalThis;
    let realFetch;

    beforeAll(() => {
      if (!hadLocalStorage) {
        const store = new Map();
        globalThis.localStorage = {
          getItem: k => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: k => store.delete(k),
        };
      }
      realFetch = globalThis.fetch;
    });

    afterEach(() => { globalThis.fetch = realFetch; });

    afterAll(() => {
      if (!hadLocalStorage) delete globalThis.localStorage;
      globalThis.fetch = realFetch;
    });

    function setRole(role) {
      globalThis.localStorage.setItem('tm_auth_user', JSON.stringify({ role }));
    }

    const jsonRes = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

    /** Drain queued microtasks/timers. The wiring is fire-and-forget, so there
     *  is no promise to await from the caller's side. */
    async function flush(turns = 10) {
      for (let i = 0; i < turns; i++) await new Promise(r => setTimeout(r, 0));
    }

    function fakeButton() {
      const listeners = [];
      return {
        addEventListener(evt, fn) { if (evt === 'click') listeners.push(fn); },
        click() { listeners.forEach(fn => fn()); },
      };
    }

    function fakeMount() {
      return {
        _html: '',
        _btns: {},
        get innerHTML() { return this._html; },
        set innerHTML(v) {
          this._html = v;
          this._btns = {
            '[data-manoeuvre-rank-up]':   v.includes('data-manoeuvre-rank-up')   ? [fakeButton()] : [],
            '[data-manoeuvre-rank-down]': v.includes('data-manoeuvre-rank-down') ? [fakeButton()] : [],
          };
        },
        querySelectorAll(sel) { return this._btns[sel] || []; },
      };
    }

    /** A fake office-tab root. Assigning innerHTML discards every previous
     *  child node, exactly as a real element does. That is precisely what makes
     *  a late async write land on the wrong category's nodes, so the fake has
     *  to model it rather than hand back the same objects every time. */
    function fakeRoot() {
      const el = {
        _html: '',
        _nodes: {},
        get innerHTML() { return this._html; },
        set innerHTML(v) {
          this._html = v;
          // The manoeuvre list's own inner markup, anchored on the section
          // boundary that follows it (the Merit Suite section) so the lazy
          // match cannot stop early inside a manoeuvre block.
          const m = v.match(/<div class="office-manoeuvre-list">([\s\S]*?)<\/div><\/div><div class="office-section">/);
          this._nodes = {
            '[data-office-manoeuvre-rank-mount]': fakeMount(),
            '.office-manoeuvre-list':             { innerHTML: m ? m[1] : '' },
            '[data-office-merit-mount]':          { innerHTML: '', querySelectorAll: () => [] },
          };
        },
        querySelector(sel) { return this._nodes[sel] ?? null; },
      };
      el.innerHTML = '';
      return el;
    }

    it('a rejected rank fetch must not leave the holder\'s list looking fully purchased (Codex Pass 1, Medium)', async () => {
      setRole('player');
      globalThis.fetch = async (url) => {
        if (String(url).includes('/api/office_manoeuvre_rank')) return jsonRes({ message: 'nope' }, false);
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen'); // Yusuf's own office
      const list = el.querySelector('.office-manoeuvre-list');
      // The synchronous render is deliberately optimistic: rank not known yet,
      // so nothing is muted. That is correct only while the fetch is pending.
      expect(list.innerHTML).toContain('People Talk');
      expect(list.innerHTML).not.toContain(MUTED);

      await flush();

      // The rank never arrived. Leaving the optimistic list up would silently
      // tell the holder all five manoeuvres are theirs.
      expect(list.innerHTML).not.toContain('People Talk');
      expect(list.innerHTML).toContain('Could not load purchase state.');
      expect(el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML)
        .toContain('Could not load manoeuvre rank.');
    });

    it('an adjustment resolving after a category switch must not repaint the new category (Codex Pass 1, Medium)', async () => {
      setRole('st');
      let releasePut;
      const putGate = new Promise(r => { releasePut = r; });

      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (opts && opts.method === 'PUT' && u.includes('/api/office_manoeuvre_rank/')) {
          await putGate;
          return jsonRes({ _id: 'Primogen', rank: 3 });
        }
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes({ Primogen: 2, Enforcer: 5 });
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen'); // own office, ST viewer
      await flush();

      const mountA = el.querySelector('[data-office-manoeuvre-rank-mount]');
      expect(mountA.innerHTML).toContain('●●○○○'); // Primogen sits at rank 2
      const up = mountA.querySelectorAll('[data-manoeuvre-rank-up]')[0];
      expect(up).toBeTruthy();

      up.click();   // _adjustManoeuvreRank starts and blocks on the write
      await flush();

      // The ST switches office before that write comes back.
      renderOfficeTab(el, YUSUF, [YUSUF], 'Enforcer');
      await flush();

      const mountB = el.querySelector('[data-office-manoeuvre-rank-mount]');
      const listB  = el.querySelector('.office-manoeuvre-list');
      expect(mountB).not.toBe(mountA);              // a real re-render replaced the nodes
      expect(mountB.innerHTML).toContain('●●●●●');  // Enforcer's own stored rank

      releasePut();
      await flush();

      // Primogen's rank, manoeuvres and muting must not have landed here.
      expect(mountB.innerHTML).toContain('●●●●●');
      expect(mountB.innerHTML).not.toContain('●●○○○');
      expect(listB.innerHTML).not.toContain('People Talk'); // a Primogen manoeuvre
      expect(listB.innerHTML).toContain('Perimeter');       // an Enforcer manoeuvre
      expect(listB.innerHTML).not.toContain(MUTED);         // reference view stays plain
    });

    it('AC7: the stepper sends a relative step to the server, never a locally computed absolute rank', async () => {
      setRole('st');
      const calls = [];
      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (opts && opts.method === 'PUT') {
          calls.push({ url: u, body: JSON.parse(opts.body) });
          return jsonRes({ _id: 'Primogen', rank: 3 });
        }
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes({ Primogen: 2 });
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      el.querySelector('[data-office-manoeuvre-rank-mount]')
        .querySelectorAll('[data-manoeuvre-rank-up]')[0].click();
      await flush();

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('/api/office_manoeuvre_rank/Primogen/step');
      expect(calls[0].body).toEqual({ delta: 1 });
      // The absolute value is the server's to work out, atomically.
      expect(calls[0].body).not.toHaveProperty('rank');
    });
  });
});
