/**
 * Issue #23 — NPC Register sidebar link removed
 *
 * Regression guard: the "NPC Register" sidebar button must not appear in the
 * admin app. Data in MongoDB is unaffected (API-level, not tested here).
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

async function loginAsAdmin(page) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/players*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });
}

test.describe('Issue #23: NPC Register sidebar link removed', () => {

  test('NPC Register button is not present in the admin sidebar', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });

    const npcBtn = page.locator('[data-domain="npcs"]');
    await expect(npcBtn).toHaveCount(0);
  });

  test('other sidebar buttons are still present after NPC Register removal', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });

    await expect(page.locator('[data-domain="downtime"]')).toBeVisible();
    await expect(page.locator('[data-domain="ordeals"]')).toBeVisible();
    await expect(page.locator('[data-domain="player"]')).toBeVisible();
  });

  test('no JS console errors on load after NPC Register removal', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loginAsAdmin(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });

    expect(errors).toHaveLength(0);
  });

});
