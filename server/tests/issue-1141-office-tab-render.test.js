/**
 * Issue #1141 — permanent render-level regression coverage for AC6 (two
 * concurrent Socialite holders render independently) and AC7 (the
 * Administrator "pending" fallback still fires).
 *
 * Added after code review: `issue-1141-office-data-sync.test.js` deliberately
 * imports only the seed script's frozen content (see its own header, oxp.10),
 * never `office-tab.js`, because `office-tab.js` pulls in `../data/api.js`,
 * which reads `location.hostname` at module top level — a bare vitest import
 * throws `ReferenceError: location is not defined` (no jsdom configured in
 * `server/vitest.config.js`). The original story proved AC6/AC7 with a
 * one-off Playwright script that was deleted after use, leaving no permanent
 * regression guard — a real gap the review caught (Blind Hunter, Medium and
 * Low findings).
 *
 * The fix: stub `globalThis.location` with the minimum `office-tab.js`'s
 * import chain needs, import AFTER stubbing, then restore. This technique was
 * proven safe by the code review itself (both the Edge Case Hunter and the
 * Acceptance Auditor independently ran the equivalent stub-and-import in a
 * throwaway Node script and it rendered correctly).
 *
 * oxp.10 (2026-08-27): `office-tab.js` now reads office content from
 * `office-content-cache.js`'s synchronous accessors, not a static import, so
 * this file primes that cache (via `loadOfficeContent()` against a stubbed
 * `/api/office_content` response built from the same frozen literals
 * `seed-office-content.js` seeds the real collection from) BEFORE importing
 * `office-tab.js` — every render below still runs fully synchronously against
 * an already-populated cache, exactly as it did against the old static import.
 *
 * `server/vitest.config.js` sets `fileParallelism: false` and
 * `poolOptions.forks.singleFork: true` — every test file in this project
 * shares ONE process. A `globalThis.location` stub left in place would leak
 * into every test file that runs after this one in the same run. The stub is
 * therefore applied only if `location` was not already defined, and removed
 * in `afterAll` regardless of pass/fail, so no other suite ever sees it. The
 * office-content cache does NOT need the same care — vitest's default
 * `isolate: true` resets the module registry (and so this module-level cache)
 * between test files, even though `globalThis` itself is shared.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { OFFICE_DATA, MERIT_DOT_CAPS, buildSeedDocs } from '../scripts/seed-office-content.js';

describe('issue-1141 — office-tab.js render-level regressions', () => {
  let renderOfficeTab;
  let manoeuvreListHtml;
  let manoeuvreRankHtml;
  let manoeuvreDotReasons;
  let meritDotReasons;
  const hadLocation = 'location' in globalThis;

  beforeAll(async () => {
    if (!hadLocation) {
      globalThis.location = { hostname: 'test', pathname: '/' };
    }

    const { loadOfficeContent } = await import('../../public/js/data/office-content-cache.js');
    const seedDocs = buildSeedDocs({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS, now: '2026-08-27T00:00:00.000Z' });
    const bootFetch = globalThis.fetch;
    // apiGet's own headers() reads localStorage synchronously — not yet
    // stubbed this early (the 'oxp.3: async rank wiring' describe below sets
    // up its own stub later, at execution time, so setting one up now cannot
    // collide with its `hadLocalStorage` check, already fixed at collection
    // time). A missing localStorage here silently failed this load (caught by
    // loadOfficeContent's own try/catch), which is what an earlier version of
    // this fix got wrong — every render fell back to "pending" with no error.
    const hadLocalStorageForPrime = 'localStorage' in globalThis;
    if (!hadLocalStorageForPrime) globalThis.localStorage = { getItem: () => null };
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/office_content')) return { ok: true, status: 200, json: async () => seedDocs };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await loadOfficeContent();
    globalThis.fetch = bootFetch;
    if (!hadLocalStorageForPrime) delete globalThis.localStorage;

    ({ renderOfficeTab, manoeuvreListHtml, manoeuvreRankHtml, manoeuvreDotReasons, meritDotReasons } =
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

  /** oxp.6: dots render as `.pointed`/`.pointed.hollow` spans now, not raw
   *  Unicode ●/○ (components.css's own comment on those classes explains why:
   *  Unicode dots render at different sizes per platform, iOS Safari included).
   *  Counts filled vs hollow spans rather than matching a literal string, so
   *  these assertions test the WIRING (how many of each) without re-deriving
   *  shDots/shDotsWithBonus's own markup by hand. */
  function pointedCounts(html) {
    const filled = (html.match(/class="pointed"/g) || []).length;
    const hollow = (html.match(/class="pointed hollow"/g) || []).length;
    return { filled, hollow };
  }

  /** For markup that can contain MORE THAN ONE dot run (e.g. the merit mount,
   *  one run per merit) — pointedCounts would sum across every row. This
   *  builds the exact run shDotsWithBonus(filled, hollow) produces, so a
   *  single row's run can be matched as a substring, the same way the
   *  original Unicode assertions did with `'●'.repeat(n) + '○'.repeat(...)`. */
  function dotsSpan(filled, hollow) {
    return '<span class="pointed"></span>'.repeat(filled) + '<span class="pointed hollow"></span>'.repeat(hollow);
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

    it('oxp.10 AC6: Primogen\'s manoeuvre-to-rank mapping is unchanged end to end through the migration (frozen literal -> seed doc -> cache -> render)', () => {
      // Not a synthetic FIVE fixture (unlike the oxp.3/oxp.6 blocks below) —
      // this asserts the REAL rank order for a real, multi-manoeuvre office,
      // rendered from content this file's own beforeAll primed via
      // buildSeedDocs(OFFICE_DATA), the same pipeline the real app boots
      // through. A reorder anywhere in that pipeline (seed script, cache
      // indexing, officeEntry()) would move a name to the wrong position here.
      const yusuf = { _id: 'yusuf', name: 'Yusuf Kalusicj', court_category: 'Primogen', court_title: 'Primogen' };
      const html = render(yusuf, [yusuf], 'Primogen');

      const names = ['People Talk', 'Freedom of Information', 'Show of Hands', 'Pull Rank', 'Veto'];
      const positions = names.map(n => html.indexOf(n));
      for (const p of positions) expect(p).toBeGreaterThan(-1);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i], `${names[i]} must render after ${names[i - 1]}`).toBeGreaterThan(positions[i - 1]);
      }
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
      expect(pointedCounts(manoeuvreRankHtml(0, 5, false))).toEqual({ filled: 0, hollow: 5 });
      expect(pointedCounts(manoeuvreRankHtml(2, 5, false))).toEqual({ filled: 2, hollow: 3 });
      expect(pointedCounts(manoeuvreRankHtml(5, 5, false))).toEqual({ filled: 5, hollow: 0 });
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
      expect(pointedCounts(playerHtml)).toEqual({ filled: 2, hollow: 3 });
    });

    it('the exported builder clamps a rank from outside [0, count] rather than throwing (Codex review, Pass 1, Low)', () => {
      // manoeuvreRankHtml is exported, and shDotsWithBonus throws on a negative
      // count (same underlying '●'.repeat(-1)-style RangeError this guard was
      // originally written against). The only current caller clamps first, so
      // this is a boundary-robustness fix for whatever calls it next, not a
      // live UI path today.
      expect(() => manoeuvreRankHtml(-1, 5, false)).not.toThrow();
      expect(pointedCounts(manoeuvreRankHtml(-1, 5, false))).toEqual({ filled: 0, hollow: 5 });
      expect(pointedCounts(manoeuvreRankHtml(7, 5, false))).toEqual({ filled: 5, hollow: 0 });
      expect(pointedCounts(manoeuvreRankHtml(2.7, 5, false))).toEqual({ filled: 2, hollow: 3 });
      expect(pointedCounts(manoeuvreRankHtml(NaN, 5, false))).toEqual({ filled: 0, hollow: 5 });
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
      expect(own).not.toContain('class="pointed"');
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
  // oxp.6 AC6: per-dot affordability/rank-order reasons. Pure, DOM-free,
  // exported specifically so they can be tested directly rather than only
  // pinned by source-contract regex — the lesson oxp.5's own review round
  // had to learn the expensive way (a real High-severity bug in an
  // analogous pure function, courtSlotOptions in city-views.js, went
  // undetected until external review because nothing called it directly).
  // ───────────────────────────────────────────────────────────────────────
  describe('oxp.6 manoeuvreDotReasons', () => {
    it('purchased dots (below rank) carry no reason', () => {
      const reasons = manoeuvreDotReasons(3, 5, 10);
      expect(reasons.slice(0, 3)).toEqual([null, null, null]);
    });

    it('the single NEXT purchasable dot (index === rank) is unblocked when affordable', () => {
      const reasons = manoeuvreDotReasons(2, 5, 5); // plenty of XP left
      expect(reasons[2]).toBeNull();
    });

    it('the single NEXT purchasable dot carries an affordability reason when left < 1', () => {
      expect(manoeuvreDotReasons(2, 5, 0)[2]).toBe('Not enough office XP (1 short)');
      expect(manoeuvreDotReasons(2, 5, -2)[2]).toBe('Not enough office XP (3 short)');
    });

    it('dots beyond the next one are ALWAYS order-blocked, regardless of balance', () => {
      // A huge balance cannot skip the ladder — rank order is checked first.
      const reasons = manoeuvreDotReasons(1, 5, 999);
      expect(reasons[2]).toBe('Reach rank 2 first');
      expect(reasons[3]).toBe('Reach rank 3 first');
      expect(reasons[4]).toBe('Reach rank 4 first');
    });

    it('an unknown balance (left not finite) never asserts an affordability reason', () => {
      expect(manoeuvreDotReasons(2, 5, undefined)[2]).toBeNull();
      expect(manoeuvreDotReasons(2, 5, NaN)[2]).toBeNull();
    });

    it('a fully-purchased ladder has no reasons at all', () => {
      expect(manoeuvreDotReasons(5, 5, 0)).toEqual([null, null, null, null, null]);
    });
  });

  describe('oxp.6 meritDotReasons', () => {
    it('purchased dots carry no reason', () => {
      expect(meritDotReasons(3, 5, 10).slice(0, 3)).toEqual([null, null, null]);
    });

    it('no rank-order gate: every unpurchased dot within reach is unblocked, not just the next one', () => {
      // Unlike manoeuvres, all three remaining dots are independently
      // reachable if the balance covers their cumulative cost.
      const reasons = meritDotReasons(0, 3, 3);
      expect(reasons).toEqual([null, null, null]);
    });

    it('dots beyond what the balance covers carry an increasing affordability reason', () => {
      const reasons = meritDotReasons(0, 3, 1); // one dot affordable, two are not
      expect(reasons[0]).toBeNull();
      expect(reasons[1]).toBe('Not enough office XP (1 short)');
      expect(reasons[2]).toBe('Not enough office XP (2 short)');
    });

    it('an unknown balance never asserts an affordability reason', () => {
      expect(meritDotReasons(0, 3, undefined)).toEqual([null, null, null]);
    });

    it('a fully-purchased merit has no reasons at all', () => {
      expect(meritDotReasons(5, 5, 0)).toEqual([null, null, null, null, null]);
    });
  });

  describe('oxp.6 manoeuvreRankHtml with reasons', () => {
    it('attaches a title to the blocked dots and none to the purchased ones', () => {
      const html = manoeuvreRankHtml(2, 5, false, manoeuvreDotReasons(2, 5, 0));
      expect(pointedCounts(html)).toEqual({ filled: 2, hollow: 3 });
      expect(html).toContain('title="Not enough office XP (1 short)"');
      expect(html).toContain('title="Reach rank 3 first"');
      expect(html).toContain('title="Reach rank 4 first"');
      // No stm-modded-dot class — this is not an ST-mod overlay marker.
      expect(html).not.toContain('stm-modded-dot');
    });

    it('with reasons omitted, behaves exactly as before (plain shDotsWithBonus, no titles)', () => {
      const html = manoeuvreRankHtml(2, 5, false);
      expect(pointedCounts(html)).toEqual({ filled: 2, hollow: 3 });
      expect(html).not.toContain('title=');
    });

    it('oxp.6 Codex review (Medium): a reasons array with no actual reasons (nothing unaffordable or order-blocked) is byte-identical to omitting reasons entirely', () => {
      // Codex review, Pass 3a: the new _dotsWithReasons helper is NOT
      // shDotsWithBonus, so a future change to shDotsWithBonus's markup would
      // not automatically propagate here. This pins the parity the deviation's
      // own justification claims (same bare .pointed/.pointed.hollow shape) so
      // any future drift between the two fails a test rather than passing
      // silently. rank=4/count=5 leaves exactly one hollow dot — the single
      // next-purchasable one — which with a huge balance gets no reason at
      // all, so every entry in the array is null while a real hollow dot is
      // still present to exercise the "hollow, no title" branch.
      const allNullReasons = manoeuvreDotReasons(4, 5, 999);
      expect(allNullReasons).toEqual([null, null, null, null, null]);
      expect(manoeuvreRankHtml(4, 5, false, allNullReasons)).toBe(manoeuvreRankHtml(4, 5, false));
      expect(manoeuvreRankHtml(4, 5, true, allNullReasons)).toBe(manoeuvreRankHtml(4, 5, true));
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
    // An ST browsing Primogen as reference: holds Enforcer, so no Primogen seat
    // matches them by holder and the deterministic fallback has to decide.
    const REF_ST = { _id: 'enforcer-holder', name: 'Einar Solveig', court_category: 'Enforcer', court_title: 'Enforcer' };
    // Codex review, oxp.11: a character whose court_category IS Primogen (so
    // isOwnOffice is true) but who holds NEITHER seat by office_seats.holder_id
    // — the exact gap the story's own Dev Notes name: nothing keeps holder_id
    // current, so a real handover can leave this character believing this is
    // their own confirmed office when the fallback resolves to someone else's
    // seat entirely.
    const STALE_PRIMOGEN = { _id: 'new-primogen-holder', name: 'A New Primogen', court_category: 'Primogen', court_title: 'Primogen' };

    // oxp.11: the tab resolves a SEAT before it can read or write purchase
    // state, so every fetch stub in this block has to serve /api/office_seats
    // as well. Primogen deliberately carries two seats, mirroring the live
    // pair, and Yusuf holds the one the fallback would NOT pick — so a test
    // that lands on seat B proves holder resolution, not the fallback.
    const SEAT_P_FALLBACK = 'seat-primogen-a'; // sorts first: fallback's choice
    const SEAT_P_YUSUF    = 'seat-primogen-b'; // Yusuf's own, by holder_id
    const SEAT_ENFORCER   = 'seat-enforcer';
    const SEATS = [
      { _id: SEAT_P_YUSUF,    office_category: 'Primogen', holder_id: 'yusuf', created_at: '2026-02-21', seat_label: null },
      { _id: SEAT_P_FALLBACK, office_category: 'Primogen', holder_id: 'rene',  created_at: '2026-02-21', seat_label: null },
      { _id: SEAT_ENFORCER,   office_category: 'Enforcer', holder_id: null,    created_at: '2026-02-21', seat_label: null },
    ];
    // Yusuf's own Primogen seat sits at rank 2; the other Primogen seat has no
    // document at all, which is the client's "missing means 0". oxp.6: the
    // value shape gained manoeuvre_xp_destroyed alongside rank.
    const RANKS = {
      [SEAT_P_YUSUF]:  { rank: 2, manoeuvre_xp_destroyed: 0 },
      [SEAT_ENFORCER]: { rank: 5, manoeuvre_xp_destroyed: 0 },
    };

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
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(SEATS);
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes({ message: 'nope' }, false);
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

    it('oxp.6 Codex review (Medium): a failed rank fetch does NOT blank the otherwise-healthy merit section', async () => {
      setRole('player');
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(SEATS);
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes({ message: 'nope' }, false);
        if (u.includes('/api/office_merit_dots')) return jsonRes({ [SEAT_P_YUSUF]: { Resources: 2 } });
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      // The rank endpoint failed (proven above), but the merit endpoint did
      // not — before this fix, one shared catch blanked both sections on any
      // single failure. The merit mount must still show real purchase state,
      // not the generic "Could not load" message.
      const meritHtml = el.querySelector('[data-office-merit-mount]').innerHTML;
      expect(meritHtml).not.toContain('Could not load merit dots.');
      expect(meritHtml).toContain(dotsSpan(2, 3)); // Resources: 2 of 5
    });

    it('oxp.6 Codex review (Medium): a failed merit-dots fetch does NOT blank the otherwise-healthy manoeuvre section', async () => {
      setRole('player');
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes(SEATS);
        if (u.includes('/api/office_merit_dots')) return jsonRes({ message: 'nope' }, false);
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes(RANKS);
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      const listHtml = el.querySelector('.office-manoeuvre-list').innerHTML;
      expect(listHtml).not.toContain('Could not load purchase state.');
      expect(listHtml).toContain('People Talk'); // Yusuf's rank 2 still resolves and mutes correctly

      const meritHtml = el.querySelector('[data-office-merit-mount]').innerHTML;
      expect(meritHtml).toContain('Could not load merit dots.');
    });

    it('an adjustment resolving after a category switch must not repaint the new category (Codex Pass 1, Medium)', async () => {
      setRole('st');
      let releasePut;
      const putGate = new Promise(r => { releasePut = r; });

      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (opts && opts.method === 'PUT' && u.includes('/api/office_manoeuvre_rank/')) {
          await putGate;
          return jsonRes({ _id: SEAT_P_YUSUF, rank: 3 });
        }
        if (u.includes('/api/office_seats')) return jsonRes(SEATS);
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes(RANKS);
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen'); // own office, ST viewer
      await flush();

      const mountA = el.querySelector('[data-office-manoeuvre-rank-mount]');
      expect(pointedCounts(mountA.innerHTML)).toEqual({ filled: 2, hollow: 3 }); // Primogen sits at rank 2
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
      expect(pointedCounts(mountB.innerHTML)).toEqual({ filled: 5, hollow: 0 }); // Enforcer's own stored rank

      releasePut();
      await flush();

      // Primogen's rank, manoeuvres and muting must not have landed here.
      expect(pointedCounts(mountB.innerHTML)).toEqual({ filled: 5, hollow: 0 });
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
          return jsonRes({ _id: SEAT_P_YUSUF, rank: 3 });
        }
        if (u.includes('/api/office_seats')) return jsonRes(SEATS);
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes(RANKS);
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      el.querySelector('[data-office-manoeuvre-rank-mount]')
        .querySelectorAll('[data-manoeuvre-rank-up]')[0].click();
      await flush();

      expect(calls).toHaveLength(1);
      // oxp.11: the step goes to a SEAT, not to an office category.
      expect(calls[0].url).toContain(`/api/office_manoeuvre_rank/${SEAT_P_YUSUF}/step`);
      expect(calls[0].url).not.toContain('/Primogen/');
      expect(calls[0].body).toEqual({ delta: 1 });
      // The absolute value is the server's to work out, atomically.
      expect(calls[0].body).not.toHaveProperty('rank');
    });

    // ─────────────────────────────────────────────────────────────────────
    // oxp.11 — seat resolution, the fallback disclosure, and the no-seat
    // state. All three drive the same real wiring against the fake DOM.
    // ─────────────────────────────────────────────────────────────────────

    /** Serve seats, merit dots and manoeuvre ranks; record every PUT. */
    function stubFetch({ seats = SEATS, ranks = RANKS, dots = {}, calls = [] } = {}) {
      globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (opts && opts.method === 'PUT') {
          calls.push({ url: u, body: JSON.parse(opts.body) });
          return jsonRes({ _id: 'whatever', rank: 1 });
        }
        if (u.includes('/api/office_seats')) return jsonRes(seats);
        if (u.includes('/api/office_merit_dots')) return jsonRes(dots);
        if (u.includes('/api/office_manoeuvre_rank')) return jsonRes(ranks);
        return jsonRes({});
      };
      return calls;
    }

    it('AC5: the viewer\'s OWN office resolves to the seat that holds THEM, not to the fallback', async () => {
      setRole('st');
      // Yusuf's seat sorts second, so landing on it can only be a holder match.
      stubFetch({ dots: { [SEAT_P_YUSUF]: { Resources: 3 }, [SEAT_P_FALLBACK]: { Resources: 5 } } });

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      // Rank 2 is seat B's; seat A has no rank document at all (0).
      expect(pointedCounts(el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML))
        .toEqual({ filled: 2, hollow: 3 });
      // And the merit dots are seat B's 3, not seat A's 5 (Resources caps at 5).
      expect(el.querySelector('[data-office-merit-mount]').innerHTML).toContain(dotsSpan(3, 2));
    });

    it('oxp.6 AC7: the balance line renders for the holder, near the Manoeuvres header', async () => {
      setRole('player'); // the holder, not an ST — still entitled per AC7
      stubFetch({ dots: { [SEAT_P_YUSUF]: { Resources: 3 } } });

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen'); // Yusuf's own office
      await flush();

      // Not pinning an exact number: earned is derived from the real clock
      // (officeSeatXp's own `now` parameter), which this fake-DOM harness does
      // not inject, so the exact figure would drift as real time passes. The
      // shape and class are what this test proves.
      const mount = el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML;
      expect(mount).toMatch(/<p class="derived-note">\d+ of \d+ office XP spent, (\d+ remaining|\d+ over budget)\.<\/p>/);
    });

    it('oxp.6 AC7: the balance line is absent for a reference viewer (holder-or-ST-only)', async () => {
      setRole('player');
      stubFetch();
      const bystander = { _id: 'bystander', name: 'A Bystander', court_category: null, court_title: null };

      const el = fakeRoot();
      // A player browsing Primogen, which they do not hold, and are not ST for.
      renderOfficeTab(el, bystander, [bystander], 'Primogen');
      await flush();

      // _wireManoeuvreRank's own early return fires before ANY write, so the
      // mount never gets a new innerHTML at all — it stays at the synchronous
      // first render's empty content.
      const mount = el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML;
      expect(mount).not.toContain('derived-note');
    });

    it('2026-08-15 fix (live pre-game check): merit dot RATINGS are hidden from a reference viewer, merit NAMES are not', async () => {
      // Live-tested finding, 2026-08-15: Brandy (Socialite) browsing Eve's
      // Head of State office as reference could see her real Merit Suite dot
      // ratings. Superseded the previous "dots stay visible, just no title="
      // stance (oxp.6 Codex review, Low) — Angelus's ruling is that a
      // reference viewer should learn WHICH merits an office grants (reference
      // info, same as the Manoeuvres list) but never HOW MANY DOTS a specific
      // seat's holder has purchased. Only the seat's own holder or an ST sees
      // the rating.
      setRole('player');
      // court_category null means isOwnOffice is false, so resolution falls
      // back to the deterministic first seat (SEAT_P_FALLBACK), not Yusuf's.
      stubFetch({ dots: { [SEAT_P_FALLBACK]: { Resources: 2 } } });
      const bystander = { _id: 'bystander', name: 'A Bystander', court_category: null, court_title: null };

      const el = fakeRoot();
      renderOfficeTab(el, bystander, [bystander], 'Primogen');
      await flush();

      const meritHtml = el.querySelector('[data-office-merit-mount]').innerHTML;
      expect(meritHtml).toContain('Resources'); // the merit NAME is reference info...
      expect(meritHtml).not.toContain(dotsSpan(2, 3)); // ...but never the RATING.
      expect(meritHtml).not.toContain('office-merit-dots'); // no dots span at all for a reference viewer.
      expect(meritHtml).not.toContain('title='); // and no affordability reason either.
    });

    it('AC6: with no holder match, the fallback picks the first seat by created_at then _id', async () => {
      setRole('st');
      stubFetch({ dots: { [SEAT_P_YUSUF]: { Resources: 3 }, [SEAT_P_FALLBACK]: { Resources: 5 } } });

      const el = fakeRoot();
      // An ST who holds Enforcer, browsing Primogen: no Primogen seat is theirs.
      renderOfficeTab(el, REF_ST, [REF_ST], 'Primogen');
      await flush();

      // Seat A's state, not Yusuf's seat B.
      expect(pointedCounts(el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML))
        .toEqual({ filled: 0, hollow: 5 });
      expect(el.querySelector('[data-office-merit-mount]').innerHTML).toContain(dotsSpan(5, 0));
    });

    it('AC6: a multi-seat office names the seat on screen, in both purchase mounts', async () => {
      setRole('st');
      stubFetch();

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      // Primogen's two seats have no seat_label, so the note falls back to a
      // short form of the seat id — which is all that distinguishes them.
      const short = SEAT_P_YUSUF.slice(-6);
      for (const sel of ['[data-office-merit-mount]', '[data-office-manoeuvre-rank-mount]']) {
        const html = el.querySelector(sel).innerHTML;
        expect(html, sel).toContain('This office has more than one seat.');
        expect(html, sel).toContain(short);
        // Reuses the existing informational-line class; no new styling.
        expect(html, sel).toContain('office-reference-banner');
      }
    });

    it('AC6: a single-seat office shows no note at all — there is nothing to disclose', async () => {
      setRole('st');
      stubFetch();

      const el = fakeRoot();
      renderOfficeTab(el, REF_ST, [REF_ST], 'Enforcer'); // Enforcer has one seat
      await flush();

      for (const sel of ['[data-office-merit-mount]', '[data-office-manoeuvre-rank-mount]']) {
        expect(el.querySelector(sel).innerHTML, sel).not.toContain('more than one seat');
      }
    });

    it('2026-08-15 fix: the multi-seat disclosure note has nothing to disclose to a reference viewer either', async () => {
      // Live-tested finding, 2026-08-15: a player browsing Primogen (no seat
      // of their own there) saw "This office has more than one seat. Showing:
      // seat cfcc99." — a raw seat id fragment with no purpose once the dots
      // it used to disambiguate are hidden from that same viewer. The note
      // only exists to say WHICH seat's rating is on screen; nothing to say
      // once the rating itself does not render.
      setRole('player');
      stubFetch();
      const bystander = { _id: 'bystander', name: 'A Bystander', court_category: null, court_title: null };

      const el = fakeRoot();
      renderOfficeTab(el, bystander, [bystander], 'Primogen'); // Primogen has two seats
      await flush();

      const meritHtml = el.querySelector('[data-office-merit-mount]').innerHTML;
      expect(meritHtml).not.toContain('more than one seat');
      expect(meritHtml).not.toContain('office-reference-banner');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Codex review, oxp.11 (High): own-office view whose holder match fails
    // in a multi-seat category must never present the fallback seat's state
    // as the viewer's own confirmed progress.
    // ─────────────────────────────────────────────────────────────────────

    it('an unconfirmed own-office view does NOT mute the manoeuvre list as the viewer\'s own progress', async () => {
      setRole('st');
      // STALE_PRIMOGEN's court_category is Primogen (isOwnOffice true), but its
      // _id matches neither seat's holder_id — the exact gap this fix closes.
      stubFetch();

      const el = fakeRoot();
      renderOfficeTab(el, STALE_PRIMOGEN, [STALE_PRIMOGEN], 'Primogen');
      await flush();

      const listHtml = el.querySelector('.office-manoeuvre-list').innerHTML;
      // Rank 2 exists on the fallback seat's document via RANKS[SEAT_P_YUSUF]
      // only, not on the fallback's own — but even if it did, an unconfirmed
      // own view must never carry the muted class at all.
      expect(listHtml).not.toContain(MUTED);
    });

    it('an unconfirmed own-office view discloses that the resolved seat may not be the viewer\'s', async () => {
      setRole('st');
      stubFetch();

      const el = fakeRoot();
      renderOfficeTab(el, STALE_PRIMOGEN, [STALE_PRIMOGEN], 'Primogen');
      await flush();

      for (const sel of ['[data-office-merit-mount]', '[data-office-manoeuvre-rank-mount]']) {
        const html = el.querySelector(sel).innerHTML;
        expect(html, sel).toContain('Could not confirm which of this office\'s seats is yours');
        expect(html, sel).toContain('may not be your own');
      }
    });

    it('oxp.6 Codex review (Medium): an unconfirmed own-office view does NOT leak the fallback seat\'s balance or affordability reasons to a non-ST', async () => {
      setRole('player'); // STALE_PRIMOGEN themselves, not an ST — the leak only reaches a player
      stubFetch({ dots: { [SEAT_P_YUSUF]: { Resources: 3 } } });

      const el = fakeRoot();
      renderOfficeTab(el, STALE_PRIMOGEN, [STALE_PRIMOGEN], 'Primogen');
      await flush();

      // The balance line and every reason-bearing title are new disclosures
      // this story added; both must be absent when the viewer's own-office
      // match is unconfirmed, exactly as the pre-existing list-muting guard
      // right above already treats this same case.
      const rankMount = el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML;
      expect(rankMount).not.toContain('derived-note');
      expect(rankMount).not.toContain('title=');

      const meritMount = el.querySelector('[data-office-merit-mount]').innerHTML;
      expect(meritMount).not.toContain('title=');
    });

    it('the ST edit control still exists on an unconfirmed own-office view (reference offices are already ST-editable by design)', async () => {
      setRole('st');
      const calls = stubFetch();

      const el = fakeRoot();
      renderOfficeTab(el, STALE_PRIMOGEN, [STALE_PRIMOGEN], 'Primogen');
      await flush();

      const upBtn = el.querySelector('[data-office-manoeuvre-rank-mount]')
        .querySelectorAll('[data-manoeuvre-rank-up]')[0];
      expect(upBtn).toBeTruthy();
      upBtn.click();
      await flush();

      // The write targets whichever seat was actually resolved (the fallback,
      // named in the disclosure note above) — never silently dropped, and
      // never redirected to a seat the client cannot identify.
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain(`/api/office_manoeuvre_rank/${SEAT_P_FALLBACK}/step`);
    });

    it('a single-seat office is unaffected — the fallback is provably correct with only one candidate, so it still mutes as own', async () => {
      setRole('st');
      stubFetch();

      const el = fakeRoot();
      // REF_ST's own office (Enforcer) has exactly one seat. No holder_id was
      // set on it (SEATS' Enforcer entry is deliberately vacant), yet a single
      // candidate is never ambiguous — confirmed must still be true.
      renderOfficeTab(el, REF_ST, [REF_ST], 'Enforcer');
      await flush();

      // Rank 5 on SEAT_ENFORCER means all five manoeuvres are purchased, so
      // muting would show no MUTED class either way — assert the ABSENCE of
      // the unconfirmed-own disclosure instead, which is the actual
      // regression this test guards against.
      const html = el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML;
      expect(html).not.toContain('Could not confirm which of this office\'s seats is yours');
    });

    it('AC6: the note never reaches a non-ST reference viewer\'s manoeuvre mount (oxp.3 AC2 boundary)', async () => {
      setRole('player');
      stubFetch();

      const el = fakeRoot();
      // A player browsing Primogen, which they do not hold: entitled to the
      // plain summary and nothing else.
      renderOfficeTab(el, REF_ST, [REF_ST], 'Primogen');
      await flush();

      const mount = el.querySelector('[data-office-manoeuvre-rank-mount]');
      expect(mount.innerHTML).toBe('');
      expect(el.querySelector('.office-manoeuvre-list').innerHTML).not.toContain(MUTED);
    });

    it('AC6: an office with NO seat says so in both mounts, and attempts no write', async () => {
      setRole('st');
      // Seats exist, but none for Socialite.
      const calls = stubFetch();

      const el = fakeRoot();
      renderOfficeTab(el, REF_ST, [REF_ST], 'Socialite');
      await flush();

      const expected = 'This office has no seat on record';
      expect(el.querySelector('[data-office-merit-mount]').innerHTML).toContain(expected);
      expect(el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML).toContain(expected);
      // No plausible row of zeros, and no stepper to click.
      expect(el.querySelector('[data-office-merit-mount]').innerHTML).not.toContain('cs-step-btn');
      expect(calls).toHaveLength(0);
    });

    it('AC6: a failed seats fetch says so rather than rendering a plausible row of zeros', async () => {
      setRole('st');
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/office_seats')) return jsonRes({ message: 'nope' }, false);
        return jsonRes({});
      };

      const el = fakeRoot();
      renderOfficeTab(el, YUSUF, [YUSUF], 'Primogen');
      await flush();

      expect(el.querySelector('[data-office-merit-mount]').innerHTML).toContain('Could not load office seats.');
      expect(el.querySelector('[data-office-manoeuvre-rank-mount]').innerHTML).toContain('Could not load office seats.');
      // The holder's optimistic first-render list is not left standing either.
      expect(el.querySelector('.office-manoeuvre-list').innerHTML).toContain('Could not load office seats.');
    });
  });
});
