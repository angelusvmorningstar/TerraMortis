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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('issue-1141 — office-tab.js render-level regressions', () => {
  let renderOfficeTab;
  const hadLocation = 'location' in globalThis;

  beforeAll(async () => {
    if (!hadLocation) {
      globalThis.location = { hostname: 'test', pathname: '/' };
    }
    ({ renderOfficeTab } = await import('../../public/js/tabs/office-tab.js'));
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
});
