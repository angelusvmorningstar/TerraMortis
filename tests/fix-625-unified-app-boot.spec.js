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
