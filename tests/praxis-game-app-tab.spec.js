/**
 * Epic PRAX (2026-09-01): the Praxis Claim / People's Harpy Vote board is now
 * reachable from the Game App (public/index.html), not only admin.html - see
 * CLAUDE.md and specs/stories/sprint-status.yaml's own entry for why.
 *
 * This spec covers ONLY the new integration surface: the ST-only nav tile,
 * the lazy import of admin/praxis-tab.js, and the on-demand admin-praxis.css
 * load, mirroring the existing 'spheres' tab's own reuse pattern. It does not
 * re-test praxis-tab.js's own business logic (claim/support/resolve) - that
 * module is unmodified and already covered by the admin app's own prax-2/
 * prax-3/prax-4a/prax-4b test suites.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR = {
  _id: 'char-praxis-test', name: 'Petra Test', moniker: null, honorific: null,
  clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null,
  regent_territory: null, retired: false,
  status: { city: 3, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

async function setup(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/auth/me'))             return ok(ST_USER);
    if (url.includes('/api/chapters'))            return ok([]);
    if (url.includes('/api/game_sessions'))       return ok([]);
    if (url.includes('/api/office_seats'))        return ok([]);
    if (url.includes('/api/praxis_sessions'))     return ok(null);
    if (url.includes('/api/characters/names'))    return ok([{ _id: CHAR._id, name: CHAR.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))          return ok([CHAR]);
    if (url.includes('/api/territories'))         return ok([]);
    if (url.includes('/api/downtime_submissions')) return ok([]);
    if (url.includes('/api/session_logs'))        return ok([]);
    if (url.includes('/api/ordeal-responses'))    return ok([]);
    return ok([]);
  });

  // Pre-existing, unrelated to Praxis: app.js's own lifecycle-card boot code
  // (renderLifecycleCards) calls '/api/game_sessions/next' with a raw relative
  // fetch() rather than through apiGet()/API_BASE, so it resolves against the
  // static server's own origin (:8080) instead of the real API (:3000).
  await page.route('http://localhost:8080/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

test.describe('Game App — Praxis tab (Epic PRAX integration)', () => {
  test('an ST sees a Praxis tile in the More grid', async ({ page }) => {
    await setup(page);
    await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
    await page.evaluate(() => window.goTab('more'));
    await expect(page.locator('[data-app="praxis"]')).toBeVisible();
    await expect(page.locator('[data-app="praxis"]')).toContainText('Praxis');
  });

  test('opening the Praxis tab lazy-loads admin/praxis-tab.js and renders the board', async ({ page }) => {
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('requestfailed', req => failedRequests.push(req.url()));
    page.on('response', res => { if (res.status() === 404) failedRequests.push(`404: ${res.url()}`); });

    await setup(page);
    await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
    await page.evaluate(() => window.goTab('praxis'));

    // No board open for this chapter yet (mocked GET returns null) -> the
    // module's own empty state, `.pb-empty` with an "Open board" action.
    await expect(page.locator('#praxis-content .praxis-board, #praxis-content .pb-empty')).toBeVisible({ timeout: 8000 });

    expect(failedRequests).toEqual([]);
    expect(consoleErrors.filter(e => !e.includes('favicon'))).toEqual([]);
  });

  test('admin-praxis.css is loaded exactly once, and only after the tab opens', async ({ page }) => {
    await setup(page);
    const sheetsBefore = await page.evaluate(() =>
      Array.from(document.styleSheets).filter(s => s.href && s.href.includes('admin-praxis.css')).length);
    expect(sheetsBefore).toBe(0);

    await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
    await page.evaluate(() => window.goTab('praxis'));
    await page.waitForSelector('#praxis-content .praxis-board, #praxis-content .pb-empty', { timeout: 8000 });

    const sheetsAfter = await page.evaluate(() =>
      Array.from(document.styleSheets).filter(s => s.href && s.href.includes('admin-praxis.css')).length);
    expect(sheetsAfter).toBe(1);
  });
});
