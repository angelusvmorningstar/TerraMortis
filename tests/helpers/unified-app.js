/**
 * Shared Playwright setup for the unified app (index.html / app.js) — #625.
 *
 * player.html now REDIRECTS to the unified Game App (index.html), which boots
 * via app.js into #app (not the old #player-app). Specs must boot at '/', wait
 * for #app, and mock the FULL /api surface — otherwise unmocked boot-time calls
 * escape to the localhost API_BASE (http://localhost:3000) and the boot fails
 * with "Could not load app".
 *
 * Usage:
 *   const { bootApp, PLAYER_USER, ST_USER } = require('./helpers/unified-app.js');
 *   await bootApp(page, PLAYER_USER, { routes: async (p) => {
 *     await p.route(/\/api\/characters$/, r => r.fulfill({ ..., body: JSON.stringify([CHAR]) }));
 *   }});
 */

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002', character_ids: ['char-001'], is_dual_role: false,
};

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: ['char-001'], is_dual_role: true,
};

/**
 * Boot the unified app with mocked auth + a catch-all /api fallback.
 * @param {import('@playwright/test').Page} page
 * @param {object} user                              authenticated user (role-aware)
 * @param {object} [opts]
 * @param {(page) => Promise<void>} [opts.routes]    extra mocks, registered AFTER the
 *                                                   catch-all + auth so caller mocks WIN
 *                                                   (Playwright is last-registered-first).
 * @param {boolean} [opts.navigate=true]             goto '/' + wait for #app visible.
 */
async function bootApp(page, user, opts = {}) {
  const { routes, navigate = true } = opts;

  // Catch-all FIRST so no unmocked boot call escapes to http://localhost:3000.
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  // Auth (overrides the catch-all).
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }));

  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, user);

  // Caller-specific mocks last → they win over the catch-all.
  if (routes) await routes(page);

  if (navigate) {
    await page.goto('/');
    await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 15000 });
  }
}

module.exports = { bootApp, PLAYER_USER, ST_USER };
