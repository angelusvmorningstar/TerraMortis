const { test, expect } = require('@playwright/test');

// ── Auth helpers ──
// Editor tests use the real API (localhost:3000) for character data
// since renderList depends on deep character structures for XP calculation.

const ST_USER = {
  id: '123456789',
  username: 'test_st',
  global_name: 'Test ST',
  avatar: null,
  role: 'st',
  player_id: 'p-001',
  character_ids: [],
  is_dual_role: false,
};

async function loginAsST(page) {
  // Mock auth only — let real API serve character data
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });
}

async function goToCharList(page) {
  await page.goto('/index.html');
  await page.waitForSelector('#app:not([style*="display: none"])');
  await page.waitForFunction(() => window._charNames && window._charNames.length > 0, { timeout: 10000 });
  await page.click('#n-chars');
  await page.waitForSelector('#t-chars.active');
  // Wait for cards to render after tab switch
  await page.waitForSelector('.char-card', { timeout: 5000 });
}

// ══════════════════════════════════════
//  LIST VIEW
// ══════════════════════════════════════

test.describe('Editor — List View', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await goToCharList(page);
  });

  test('renders character cards', async ({ page }) => {
    const cards = page.locator('.char-grid .char-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
    expect(errors).toHaveLength(0);
  });

  test('clan filter reduces card count', async ({ page }) => {
    const countBefore = await page.locator('.char-grid .char-card').count();
    await page.selectOption('#filter-clan', 'Mekhet');
    const countAfter = await page.locator('.char-grid .char-card').count();
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThan(0);
  });

  test('covenant filter works', async ({ page }) => {
    const countBefore = await page.locator('.char-grid .char-card').count();
    await page.selectOption('#filter-cov', 'Circle of the Crone');
    const countAfter = await page.locator('.char-grid .char-card').count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);
    expect(countAfter).toBeGreaterThan(0);
  });

  test('search input exists and is interactive', async ({ page }) => {
    const search = page.locator('.list-search');
    await expect(search).toBeVisible();
    await search.fill('test');
    await expect(search).toHaveValue('test');
  });
});

// ══════════════════════════════════════
//  SHEET VIEW
// ══════════════════════════════════════

test.describe('Editor — Sheet View', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await goToCharList(page);
  });

  test('clicking a character opens sheet view', async ({ page }) => {
    await page.locator('.char-grid .char-card').first().click();
    await expect(page.locator('#t-editor')).toHaveClass(/active/);
    await expect(page.locator('#sh-content')).not.toBeEmpty();
  });

  test('sheet renders attributes section', async ({ page }) => {
    await page.locator('.char-grid .char-card').first().click();
    const attrs = page.locator('.sh-sec-title', { hasText: 'Attributes' });
    await expect(attrs).toBeVisible();
  });

  test('sheet renders skills section', async ({ page }) => {
    await page.locator('.char-grid .char-card').first().click();
    const skills = page.locator('.sh-sec-title', { hasText: 'Skills' });
    await expect(skills).toBeVisible();
  });

  test('dots display as filled circles', async ({ page }) => {
    await page.locator('.char-grid .char-card').first().click();
    const content = await page.locator('#sh-content').textContent();
    expect(content).toContain('\u25CF');
  });

  test('back button returns to list', async ({ page }) => {
    await page.locator('.char-grid .char-card').first().click();
    await expect(page.locator('#t-editor')).toHaveClass(/active/);
    await page.locator('.sheet-topbar button', { hasText: 'Back' }).click();
    await expect(page.locator('#t-chars')).toHaveClass(/active/);
  });
});

// ══════════════════════════════════════
//  EDIT MODE
// ══════════════════════════════════════

test.describe('Editor — Edit Mode', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await goToCharList(page);
    await page.locator('.char-grid .char-card').first().click();
    await expect(page.locator('#t-editor')).toHaveClass(/active/);
  });

  test('edit button toggles edit mode', async ({ page }) => {
    await page.locator('.sheet-edit-btn', { hasText: 'Edit' }).click();
    const btn = page.locator('.sheet-edit-btn').first();
    await expect(btn).toHaveText('Done');
  });

  test('edit mode shows form controls', async ({ page }) => {
    await page.locator('.sheet-edit-btn', { hasText: 'Edit' }).click();
    const inputs = page.locator('#sh-content input, #sh-content select');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════
//  CSS THEME
// ══════════════════════════════════════

test.describe('Editor — CSS Theme', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
  });

  test('theme custom properties load', async ({ page }) => {
    await page.goto('/index.html');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#0D0B09');
  });

  test('gold accent variable applied', async ({ page }) => {
    await page.goto('/index.html');
    const gold2 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gold2').trim()
    );
    expect(gold2).toBe('#E0C47A');
  });
});
