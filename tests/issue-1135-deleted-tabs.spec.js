/**
 * E2E — #1135: the eight deleted Game App tabs, and the scrapped ticket system.
 *
 * Covers:
 *   - None of the eight appears in the More grid, the bottom nav, or the sidebar
 *   - The LORE section is gone (its only three tiles were Primer/Game Guide/Rules)
 *   - No container div survives, so the DOM-derived router at app.js:1202/:1248
 *     can never re-enter a deleted tab
 *   - goTab('<deleted>') neither throws nor activates anything
 *   - The Settings Submit-a-Ticket form is gone
 *   - The Rules OVERLAY still opens from the sheet button (the tab went, the
 *     overlay stayed)
 */

const { test, expect } = require('@playwright/test');

const DELETED = ['whos-who', 'primer', 'game-guide', 'rules', 'relationships', 'tickets', 'finance', 'devlog'];
// The six that had a NAV_ITEMS entry (relationships and tickets never did).
const DELETED_NAV = ['whos-who', 'primer', 'game-guide', 'rules', 'finance', 'devlog'];

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

// The Primer/Game Guide/Rules tiles used to be gated behind a `guide` flag and a
// tm-show-guides preference, so an early version of this file set that preference
// to stop the assertions passing vacuously. #1135 removed the flag, the toggle and
// the preference along with the three tiles, so there is nothing left to unhide.
async function setupSuite(page, { width = 1280 } = {}) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// ── Containers ───────────────────────────────────────────────────────────────

test('#1135: no container div survives for any of the eight', async ({ page }) => {
  await setupSuite(page);
  for (const id of DELETED) {
    await expect(page.locator(`#t-${id}`), `#t-${id} should not exist`).toHaveCount(0);
  }
});

test('#1135: the surviving neighbours still have their containers', async ({ page }) => {
  await setupSuite(page);
  for (const id of ['spheres', 'signin', 'ordeals', 'feeding', 'combat', 'emergency']) {
    await expect(page.locator(`#t-${id}`), `#t-${id} should still exist`).toHaveCount(1);
  }
});

// ── More grid ────────────────────────────────────────────────────────────────

test('#1135: none of the eight appears in the More grid', async ({ page }) => {
  await setupSuite(page);
  await page.evaluate(() => window.goTab('more'));
  await page.waitForSelector('.more-grid-wrap', { state: 'visible', timeout: 10000 });

  for (const id of DELETED) {
    await expect(page.locator(`.more-app-icon[data-app="${id}"]`), `More grid tile ${id}`).toHaveCount(0);
  }
  // Sanity: the grid did render and still holds surviving tiles.
  await expect(page.locator('.more-app-icon[data-app="spheres"]')).toHaveCount(1);
});

test('#1135: the More grid renders no Lore section', async ({ page }) => {
  await setupSuite(page);
  await page.evaluate(() => window.goTab('more'));
  await page.waitForSelector('.more-grid-wrap', { state: 'visible', timeout: 10000 });

  const labels = await page.locator('.more-section-label').allTextContents();
  expect(labels.some(l => /lore/i.test(l))).toBe(false);
  expect(labels.length).toBeGreaterThan(0);
});

// ── Bottom nav (phone width) ─────────────────────────────────────────────────

test('#1135: no bottom-nav button for any deleted tab', async ({ page }) => {
  await setupSuite(page, { width: 800 });
  await page.waitForSelector('#bnav', { timeout: 10000 });

  for (const id of DELETED_NAV) {
    await expect(page.locator(`#n-${id}`), `bottom nav button ${id}`).toHaveCount(0);
  }
  // Sanity: the nav rendered, and the check-in (kept) is still there.
  await expect(page.locator('#n-signin')).toHaveCount(1);
});

// ── Desktop sidebar ──────────────────────────────────────────────────────────

test('#1135: desktop sidebar has no Lore section and no deleted tiles', async ({ page }) => {
  await setupSuite(page, { width: 1280 });
  await page.waitForSelector('#desktop-sidebar-nav', { timeout: 10000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).not.toMatch(/Lore/i);
  expect(navText).not.toMatch(/Primer/i);
  expect(navText).not.toMatch(/Game Guide/i);
  expect(navText).not.toMatch(/Tickets/i);
  expect(navText).not.toMatch(/Finance/i);
  expect(navText).not.toMatch(/Devlog/i);
  expect(navText).not.toMatch(/NPCs/i);
  // Sanity: the sidebar rendered its surviving sections.
  expect(navText).toMatch(/Storyteller/i);
});

// ── goTab is inert for a deleted id ──────────────────────────────────────────

test('#1135: goTab on a deleted id neither throws nor activates anything', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await setupSuite(page);

  for (const id of DELETED) {
    const activeAfter = await page.evaluate((tab) => {
      window.goTab(tab);
      return document.querySelectorAll('.tab.active').length;
    }, id);
    // goTab clears every .tab.active, then finds no container to re-activate.
    expect(activeAfter, `goTab('${id}') should activate no tab`).toBe(0);
  }
  expect(errors, `goTab threw: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── Ticket system ────────────────────────────────────────────────────────────

test('#1135: Settings has no Submit-a-Ticket form', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await setupSuite(page);

  await page.evaluate(() => window.goTab('settings'));
  await page.waitForSelector('#t-settings.active', { timeout: 10000 });

  for (const sel of ['#stk-submit', '#stk-type', '#stk-title', '#stk-body', '#stk-status', '.settings-ticket-form']) {
    await expect(page.locator(sel), `${sel} should be gone`).toHaveCount(0);
  }
  const bodyText = await page.locator('#t-settings').textContent();
  expect(bodyText).not.toMatch(/Submit a Ticket/i);
  expect(errors, `Settings threw: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── Admin side: Tickets gone, City and Devlog untouched ──────────────────────

async function loginAsAdmin(page) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);
  // Order matters: Playwright uses the LAST matching route, so the broad
  // catch-all is registered first and the auth stub second. Registered the other
  // way round, /api/auth/me returns [] and admin.html bounces back to /.
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) }));
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 15000 });
}

test('#1135: admin has no Tickets domain, and no 404 for the deleted stylesheet', async ({ page }) => {
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url()));
  const notFound = [];
  page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await loginAsAdmin(page);

  await expect(page.locator('[data-domain="tickets"]')).toHaveCount(0);
  await expect(page.locator('#d-tickets')).toHaveCount(0);
  await expect(page.locator('#tickets-admin-content')).toHaveCount(0);

  const badCss = [...failed, ...notFound].filter(u => /admin-tickets\.css/.test(u));
  expect(badCss, `admin-tickets.css should not be requested at all: ${badCss.join(', ')}`).toHaveLength(0);
  expect(errors, `admin threw: ${errors.join(' | ')}`).toHaveLength(0);
});

test('#1135: the admin Devlog domain still opens (authoring survives)', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('[data-domain="devlog"]')).toBeVisible();
  await page.click('[data-domain="devlog"]');
  await page.waitForSelector('#d-devlog.active', { timeout: 10000 });
  await expect(page.locator('#devlog-admin-content')).toBeVisible();
});

// AC5 is about the city map OVERLAY still working, not merely the domain opening.
// city-tab.js survives only because admin/city-views.js:17 imports
// openCityMapOverlay from it, so the overlay is the thing that must be exercised.
test('#1135: the admin City map overlay still opens (city-tab.js untouched)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await loginAsAdmin(page);
  await expect(page.locator('[data-domain="city"]')).toBeVisible();
  await page.click('[data-domain="city"]');
  await page.waitForSelector('#d-city.active', { timeout: 10000 });

  // Drive the real launch button, not the imported function.
  const launch = page.locator('[data-open-map-edit]');
  await expect(launch, 'city map launch button should exist').toHaveCount(1);
  await launch.click();
  await expect(page.locator('#city-map-overlay'), 'overlay should open').toHaveCount(1);
  expect(errors, `City map overlay threw: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── The Rules overlay survived the Rules tab ─────────────────────────────────

test('#1135: the Rules overlay still opens and closes from the sheet button', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await setupSuite(page);

  // AC4 names the SHEET BUTTON, so drive that wiring rather than calling the
  // exported function: index.html:119 is `onclick="openRulesOverlay()"`, and the
  // button can be off-screen without a character loaded, so click it via the DOM.
  const btn = page.locator('button.sheet-edit-btn', { hasText: /^Rules$/ });
  await expect(btn, 'the sheet Rules button should still exist').toHaveCount(1);
  expect(await btn.getAttribute('onclick')).toContain('openRulesOverlay()');

  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.sheet-edit-btn')]
      .find(el => el.textContent.trim() === 'Rules');
    b.click();                                   // fires the real inline handler
    const el = document.getElementById('rules-overlay');
    return el ? window.getComputedStyle(el).display : null;
  });
  expect(opened).toBe('flex');

  const closed = await page.evaluate(() => {
    window.closeRulesOverlay();
    const el = document.getElementById('rules-overlay');
    return el ? window.getComputedStyle(el).display : null;
  });
  expect(closed).toBe('none');
  expect(errors, `rules overlay threw: ${errors.join(' | ')}`).toHaveLength(0);
});
