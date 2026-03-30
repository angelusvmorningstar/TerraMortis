const { test, expect } = require('@playwright/test');

test.describe('Editor — List View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('.char-grid');
  });

  test('loads and renders test characters', async ({ page }) => {
    const cards = page.locator('.char-grid > *');
    await expect(cards).not.toHaveCount(0);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/index.html');
    await page.waitForSelector('.char-grid');
    expect(errors).toHaveLength(0);
  });

  test('clan filter works', async ({ page }) => {
    const countBefore = await page.locator('.char-grid > *').count();
    await page.selectOption('#filter-clan', 'Mekhet');
    const countAfter = await page.locator('.char-grid > *').count();
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThan(0);
  });

  test('covenant filter works', async ({ page }) => {
    const countBefore = await page.locator('.char-grid > *').count();
    await page.selectOption('#filter-cov', 'Invictus');
    const countAfter = await page.locator('.char-grid > *').count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);
  });

  test('search filters characters', async ({ page }) => {
    const countBefore = await page.locator('.char-grid > *').count();
    await page.fill('.list-search', 'Nox');
    const countAfter = await page.locator('.char-grid > *').count();
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThan(0);
  });
});

test.describe('Editor — Sheet View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('.char-grid');
  });

  test('clicking a character opens sheet view', async ({ page }) => {
    await page.locator('.char-grid > *').first().click();
    await expect(page.locator('#t-editor')).toHaveClass(/active/);
    await expect(page.locator('#sh-content')).not.toBeEmpty();
  });

  test('sheet renders stats strip', async ({ page }) => {
    await page.locator('.char-grid > *').first().click();
    await expect(page.locator('.sh-stats-strip')).toBeVisible();
  });

  test('sheet renders attributes section', async ({ page }) => {
    await page.locator('.char-grid > *').first().click();
    const attrs = page.locator('.sh-sec-title', { hasText: 'Attributes' });
    await expect(attrs).toBeVisible();
  });

  test('sheet renders skills section', async ({ page }) => {
    await page.locator('.char-grid > *').first().click();
    const skills = page.locator('.sh-sec-title', { hasText: 'Skills' });
    await expect(skills).toBeVisible();
  });

  test('dots display as filled circles', async ({ page }) => {
    await page.locator('.char-grid > *').first().click();
    const content = await page.locator('#sh-content').textContent();
    expect(content).toContain('\u25CF');
  });

  test('back button returns to list', async ({ page }) => {
    await page.locator('.char-grid > *').first().click();
    await expect(page.locator('#t-editor')).toHaveClass(/active/);
    await page.locator('.sheet-topbar button', { hasText: 'Back' }).click();
    await expect(page.locator('#t-chars')).toHaveClass(/active/);
  });
});

test.describe('Editor — Edit Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('.char-grid');
    await page.locator('.char-grid > *').first().click();
    await expect(page.locator('#t-editor')).toHaveClass(/active/);
  });

  test('edit button toggles edit mode', async ({ page }) => {
    await page.locator('.sheet-edit-btn').click();
    const btn = page.locator('.sheet-edit-btn');
    await expect(btn).toHaveText('Done');
  });

  test('edit mode shows form controls', async ({ page }) => {
    await page.locator('.sheet-edit-btn').click();
    const inputs = page.locator('#sh-content input, #sh-content select');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Editor — Save & Persist', () => {
  test('save persists to localStorage', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('.char-grid');
    // Navigate to editor to make Save button visible
    await page.locator('.char-grid > *').first().click();
    await expect(page.locator('#btn-save')).toBeVisible();
    await page.click('#btn-save');
    const stored = await page.evaluate(() => localStorage.getItem('tm_chars_db'));
    expect(stored).toBeTruthy();
    expect(stored.length).toBeGreaterThan(100);
  });
});

test.describe('Editor — CSS Theme', () => {
  test('theme.css loads and defines custom properties', async ({ page }) => {
    await page.goto('/index.html');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#0D0B09');
  });

  test('gold accent variable is applied', async ({ page }) => {
    await page.goto('/index.html');
    const gold2 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gold2').trim()
    );
    expect(gold2).toBe('#E0C47A');
  });
});
