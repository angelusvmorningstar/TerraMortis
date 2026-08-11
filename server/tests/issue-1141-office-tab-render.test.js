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

  function render(char, chars = [char]) {
    const el = { innerHTML: '' };
    renderOfficeTab(el, char, chars);
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
      expect(html).toContain('Cacophony Savvy');
      expect(html).not.toContain('<span class="office-merit-chip">Elan</span>'); // asset name must not appear as a merit chip
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
});
