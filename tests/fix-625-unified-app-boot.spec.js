/**
 * #625 — verifies the shared unified-app boot harness actually boots the app
 * (the catch-all + goto '/' + #app fix). Guards the helper future specs rely on.
 */

const { test, expect } = require('@playwright/test');
const { bootApp, PLAYER_USER, ST_USER } = require('./helpers/unified-app.js');

test.describe('#625 — unified-app boot harness', () => {
  test('player boots into #app with the login screen hidden', async ({ page }) => {
    await bootApp(page, PLAYER_USER);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('ST user also boots into #app', async ({ page }) => {
    await bootApp(page, ST_USER);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('unauthenticated request shows the login screen', async ({ page }) => {
    // No bootApp() → no auth in localStorage; still catch-all the API.
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('/');
    await page.waitForSelector('#login-screen:not([style*="display: none"])', { timeout: 8000 });
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});

// QA (Quinn): the harness contract that future specs depend on.
test.describe('#625 — bootApp harness contract', () => {
  test('caller routes override the catch-all', async ({ page }) => {
    let overrideHit = false;
    await bootApp(page, PLAYER_USER, {
      routes: async (p) => {
        await p.route(/\/api\/characters$/, r => {
          overrideHit = true;
          r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: 'qa-1', name: 'QA Char' }]) });
        });
      },
    });
    await expect(page.locator('#app')).toBeVisible();
    // The app fetches /api/characters during boot; the caller's route must win
    // over the catch-all (Playwright matches last-registered first).
    expect(overrideHit).toBe(true);
  });

  test('no boot /api request escapes to the localhost API_BASE', async ({ page }) => {
    const escaped = [];
    page.on('requestfailed', r => {
      const u = r.url();
      if (u.includes('localhost:3000') && u.includes('/api/')) escaped.push(u);
    });
    await bootApp(page, PLAYER_USER);
    await expect(page.locator('#app')).toBeVisible();
    // ws://localhost:3000/ws is the known non-fatal exception (not an /api call).
    expect(escaped).toEqual([]);
  });

  test('navigate:false sets up mocks/auth without loading the page', async ({ page }) => {
    await bootApp(page, PLAYER_USER, { navigate: false });
    expect(page.url()).toBe('about:blank');
  });
});
