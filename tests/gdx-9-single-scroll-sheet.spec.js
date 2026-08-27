// E2E coverage for gdx-9 — the single-scroll phone sheet with a pinned
// track strip + jump-nav chips, gated behind the tm_gdx9_single_scroll
// localStorage flag (see public/js/data/helpers.js's singleScrollEnabled()).
//
// Character injection: this app registers a Service Worker (public/sw.js)
// that can intercept /api/characters ahead of Playwright's page.route()
// stubs — see [[project-sw-leaks-live-data-in-playwright-tests]] and
// tests/rlv-4-custom-pool-builder.spec.js's own header comment for the
// full diagnosis. This suite sidesteps it entirely: /api/characters is
// stubbed to return an empty array (so boot never auto-selects a real
// character), and the fixture character is injected directly into
// suite/data.js's state, then rendered via the real exposed
// window.onSheetChar(name) — the same function the app's own character
// list uses, just skipping the network fetch the SW would otherwise hijack.

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

// Playwright's default viewport (1280x720) exceeds this app's own
// DESKTOP_MQ breakpoint (min-width: 900px, app.js), so without an explicit
// override every test would boot into desktop-mode regardless of intent —
// desktop-mode is what this suite's own dedicated describe block wants,
// but the "phone" describe blocks below need a real phone-width viewport
// to exercise the single-scroll behaviour at all.
const PHONE_VIEWPORT = { width: 390, height: 844 };

const PLAYER_USER = {
  id: '900000009', username: 'test_player_gdx9', global_name: 'Test Player gdx9',
  avatar: null, role: 'player', player_id: 'p-gdx9', character_ids: ['char-gdx9'], is_dual_role: false,
};

function attrs(overrides = {}) {
  return {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    ...overrides,
  };
}

const CHAR = {
  _id: 'char-gdx9', name: 'Gdx9 Tester', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: {} },
  attributes: attrs(),
  skills: { Occult: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } },
  merits: [], powers: [], ordeals: [], banes: [],
};

// A character sparse enough that the whole single-scroll page fits on
// screen at PHONE_VIEWPORT without needing to scroll at all — the
// `maxScroll === 0` edge case for the active-chip sync (code-review
// finding: the max-scroll branch must not fire when there's nothing to
// scroll, or it wrongly snaps straight to Powers instead of leaving Info
// active).
const SPARSE_CHAR = {
  ...CHAR,
  _id: 'char-gdx9-sparse', name: 'Sparse Tester',
  attributes: attrs({}), skills: {}, disciplines: {},
};

async function setupSuite(page, { singleScroll }) {
  await page.addInitScript((opts) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(opts.user));
    if (opts.singleScroll) localStorage.setItem('tm_gdx9_single_scroll', '1');
  }, { user: PLAYER_USER, singleScroll });

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  // Boot never auto-selects a real character (empty roster) — this test
  // injects its own fixture directly instead, below.
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// Injects CHAR via the real exposed window.onSheetChar(name) rather than
// depending on /api/characters — see file header comment. `landingTab`
// defaults to 'sheets' (single-scroll mode's destination); the flag-OFF
// test passes 'stats' instead, since 'sheets' renders nothing on phone
// when the flag is off (that's the whole point of AC5).
async function openSheetFixture(page, char = CHAR, landingTab = 'sheets') {
  await page.evaluate(async ({ c, tab }) => {
    const m = await import('/js/suite/data.js');
    m.default.chars = [c];
    window.onSheetChar(c.name);
    window.goTab(tab);
  }, { c: char, tab: landingTab });
  await page.waitForSelector(`#t-${landingTab}.active`, { state: 'visible', timeout: 5000 });
}

// ── Flag ON, phone viewport ──────────────────────────────────────────────

test.describe('gdx-9 — single-scroll flag ON (phone)', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('nav consolidates to one Sheet button', async ({ page }) => {
    await setupSuite(page, { singleScroll: true });
    await expect(page.locator('#n-sheet')).toBeVisible();
    await expect(page.locator('#n-stats')).toHaveCount(0);
    await expect(page.locator('#n-skills')).toHaveCount(0);
    await expect(page.locator('#n-powers')).toHaveCount(0);
    await expect(page.locator('#n-misc')).toHaveCount(0);
  });

  test('pinned track strip + jump-nav render with real tracker data', async ({ page }) => {
    await setupSuite(page, { singleScroll: true });
    await openSheetFixture(page);

    await expect(page.locator('#gdx9-pinned')).toBeVisible();
    const chips = page.locator('.gdx9-jump-chip');
    await expect(chips).toHaveCount(4);
    await expect(chips.nth(0)).toHaveText('Info');
    await expect(chips.nth(1)).toHaveText('Stats');
    await expect(chips.nth(2)).toHaveText('Skills');
    await expect(chips.nth(3)).toHaveText('Powers');
    // Info starts active (top of the scroll on open).
    await expect(chips.nth(0)).toHaveClass(/active/);

    // Real tracker-derived numbers, not placeholders — full health/vitae/wp
    // at a fresh character with no tracker_state writes yet. A bare
    // /\d+\/\d+/ regex would pass for "0/0" or "5/2" (current > max), so
    // assert the parsed values are actually sane, not just digit-shaped.
    for (const id of ['gdx9-tn-health', 'gdx9-tn-vitae', 'gdx9-tn-wp']) {
      const text = await page.locator('#' + id).textContent();
      const [cur, max] = text.split('/').map(Number);
      expect(max, `${id}: "${text}"`).toBeGreaterThan(0);
      expect(cur, `${id}: "${text}"`).toBeGreaterThanOrEqual(0);
      expect(cur, `${id}: "${text}"`).toBeLessThanOrEqual(max);
    }

    // The four sections are all present in one scroll, in order.
    const ids = await page.locator('.gdx9-section').evaluateAll(els => els.map(e => e.id));
    expect(ids).toEqual(['gdx9-sec-info', 'gdx9-sec-stats', 'gdx9-sec-skills', 'gdx9-sec-powers']);

    // The real tracker (tap-boxes) lives inside Stats, not duplicated elsewhere.
    await expect(page.locator('#gdx9-sec-stats .sh-tracker-block')).toBeVisible();
    await expect(page.locator('#gdx9-sec-info .sh-tracker-block')).toHaveCount(0);
  });

  test('Info stays active for a sparse character whose whole sheet fits without scrolling', async ({ page }) => {
    // A tall-enough viewport, not a sparser fixture: bio/derived-stats/
    // tracker/one-carousel-card is a floor of real content no VtR character
    // can go below, so the fixture is fixed and the viewport grows instead.
    await page.setViewportSize({ width: 390, height: 2000 });
    await setupSuite(page, { singleScroll: true });
    await openSheetFixture(page, SPARSE_CHAR);

    const maxScroll = await page.evaluate(() => {
      const host = document.getElementById('gdx9-pinned').closest('.tab');
      return host.scrollHeight - host.clientHeight;
    });
    expect(maxScroll, 'fixture must be sparse enough to fit on one screen for this test to be meaningful').toBeLessThanOrEqual(0);

    await expect(page.locator('.gdx9-jump-chip', { hasText: 'Info' })).toHaveClass(/active/);
    await expect(page.locator('.gdx9-jump-chip', { hasText: 'Powers' })).not.toHaveClass(/active/);
  });

  test('re-rendering the sheet does not accumulate scroll listeners on #t-sheets', async ({ page }) => {
    // Code-review finding (all 3 internal layers): #t-sheets is never
    // recreated between renders, so a 'scroll' listener attached on every
    // renderSheet() call (e.g. every character switch) without removing the
    // previous one accumulates without bound. Count real addEventListener/
    // removeEventListener('scroll', ...) traffic on that exact element
    // across three consecutive renders and assert the net count stays 1.
    await page.addInitScript(() => {
      window.__scrollListenerNet = 0;
      const origAdd = EventTarget.prototype.addEventListener;
      const origRemove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (type, ...rest) {
        if (type === 'scroll' && this.id === 't-sheets') window.__scrollListenerNet++;
        return origAdd.call(this, type, ...rest);
      };
      EventTarget.prototype.removeEventListener = function (type, ...rest) {
        if (type === 'scroll' && this.id === 't-sheets') window.__scrollListenerNet--;
        return origRemove.call(this, type, ...rest);
      };
    });

    await setupSuite(page, { singleScroll: true });
    await openSheetFixture(page);
    await page.evaluate(async () => {
      const m = await import('/js/suite/data.js');
      window.onSheetChar(m.default.chars[0].name); // re-render #2
      window.onSheetChar(m.default.chars[0].name); // re-render #3
    });

    const net = await page.evaluate(() => window.__scrollListenerNet);
    expect(net).toBe(1);
  });

  test('clicking a jump chip scrolls to its section and updates the active chip', async ({ page }) => {
    await setupSuite(page, { singleScroll: true });
    await openSheetFixture(page);

    await page.locator('.gdx9-jump-chip', { hasText: 'Powers' }).click();
    // Powers is the last section and, with this fixture's minimal data
    // (one collapsed discipline, no merits), shorter than the viewport —
    // the scroll-position sync must still resolve it active even though
    // its own top can never reach the activation line (max-scroll case).
    await expect(page.locator('.gdx9-jump-chip', { hasText: 'Powers' })).toHaveClass(/active/);

    // A bare `r.top >= 0` also passes for a section scrolled just barely
    // under the sticky pinned bar (e.g. a stale scroll-margin-top) — assert
    // the section's top clears the pinned block's real height, not just the
    // viewport's literal top edge.
    const inView = await page.locator('#gdx9-sec-powers').evaluate((el) => {
      const pinnedHeight = document.getElementById('gdx9-pinned').offsetHeight;
      const r = el.getBoundingClientRect();
      return r.top >= pinnedHeight - 2 && r.top < window.innerHeight;
    });
    expect(inView).toBe(true);
  });

  test('tapping the track strip scrolls to Stats — the section with the real tracker', async ({ page }) => {
    await setupSuite(page, { singleScroll: true });
    await openSheetFixture(page);

    await page.locator('#gdx9-track-strip').click();
    await expect(page.locator('.gdx9-jump-chip', { hasText: 'Stats' })).toHaveClass(/active/);

    const inView = await page.locator('#gdx9-sec-stats').evaluate((el) => {
      const pinnedHeight = document.getElementById('gdx9-pinned').offsetHeight;
      const r = el.getBoundingClientRect();
      return r.top >= pinnedHeight - 2 && r.top < window.innerHeight;
    });
    expect(inView).toBe(true);
  });
});

// ── Flag OFF — must be byte-for-byte the original four-tab behaviour ────

test.describe('gdx-9 — single-scroll flag OFF (default)', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('original four separate nav buttons still exist; no pinned block anywhere', async ({ page }) => {
    await setupSuite(page, { singleScroll: false });
    await expect(page.locator('#n-stats')).toBeVisible();
    await expect(page.locator('#n-skills')).toBeVisible();
    await expect(page.locator('#n-powers')).toBeVisible();
    await expect(page.locator('#n-misc')).toBeVisible();
    await expect(page.locator('#n-sheet')).toHaveCount(0);

    await openSheetFixture(page, CHAR, 'stats');
    await expect(page.locator('#gdx9-pinned')).toHaveCount(0);
    // Content goes into the original split containers, not #sh-content-suite.
    await expect(page.locator('#stats-content .sh-stats-strip')).toBeVisible();
  });
});

// ── Desktop mode — must be completely unaffected even with the flag on ──

test.describe('gdx-9 — desktop mode unaffected (AC4)', () => {
  // No viewport override — Playwright's default (1280x720) already exceeds
  // this app's own 900px desktop breakpoint, so it boots into desktop-mode
  // on its own. That's deliberately relied on here rather than driving the
  // real toggle button, which is ST-only chrome (app.js's own
  // _applyDesktopMode: "Header controls ... are ST-only") and this test
  // uses PLAYER_USER, matching every other test in this file.
  test('flag ON has no effect in desktop mode', async ({ page }) => {
    await setupSuite(page, { singleScroll: true });
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('desktop-mode')))
      .toBe(true);
    await expect(page.locator('#bnav')).toBeHidden();

    await openSheetFixture(page);
    // Desktop's own concatenation still runs (content present), but with no
    // pinned block and no gdx9-section wrappers — byte-for-byte the original
    // desktop shape.
    await expect(page.locator('#sh-content-suite .sh-stats-strip')).toBeVisible();
    await expect(page.locator('#gdx9-pinned')).toHaveCount(0);
    await expect(page.locator('.gdx9-section')).toHaveCount(0);
  });
});
