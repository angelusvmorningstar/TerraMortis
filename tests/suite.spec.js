const { test, expect } = require('@playwright/test');

// Helper: navigate to a tab in the unified SPA
async function openTab(page, tabName) {
  await page.goto('/index.html');
  await page.waitForSelector('#bnav');
  if (tabName !== 'chars') {
    await page.click(`#n-${tabName}`);
  }
}

test.describe('Suite — Load & Navigation', () => {
  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/index.html');
    await page.waitForSelector('#bnav');
    expect(errors).toHaveLength(0);
  });

  test('character dropdown is populated', async ({ page }) => {
    await openTab(page, 'st');
    const options = page.locator('#st-char-sel option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
  });

  test('tab navigation works', async ({ page }) => {
    await openTab(page, 'chars');

    await page.click('#n-roll');
    await expect(page.locator('#t-roll')).toHaveClass(/active/);

    await page.click('#n-st');
    await expect(page.locator('#t-st')).toHaveClass(/active/);

    await page.click('#n-chars');
    await expect(page.locator('#t-chars')).toHaveClass(/active/);
  });

  test('theme.css loads and defines custom properties', async ({ page }) => {
    await page.goto('/index.html');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#0D0B09');
  });
});

test.describe('Suite — Roll Tab', () => {
  test.beforeEach(async ({ page }) => {
    await openTab(page, 'roll');
  });

  test('pool display shows initial value', async ({ page }) => {
    const pval = page.locator('#pval');
    await expect(pval).toBeVisible();
    const text = await pval.textContent();
    expect(text).toBeTruthy();
  });

  test('pool increment/decrement works', async ({ page }) => {
    const before = await page.locator('#pval').textContent();
    await page.locator('#t-roll button', { hasText: '+' }).first().click();
    const after = await page.locator('#pval').textContent();
    expect(parseInt(after)).toBe(parseInt(before) + 1);
  });

  test('roll button produces results', async ({ page }) => {
    await page.click('#roll-btn');
    const area = page.locator('#dice-area');
    await expect(area).not.toBeEmpty();
  });

  test('again buttons toggle correctly', async ({ page }) => {
    await page.click('#a9');
    await expect(page.locator('#a9')).toHaveClass(/on/);
    await expect(page.locator('#a10')).not.toHaveClass(/on/);
  });

  test('rote toggle works', async ({ page }) => {
    await page.click('#rote-c');
    await expect(page.locator('#rote-c')).toHaveClass(/on/);
  });

  test('roll history records rolls', async ({ page }) => {
    await page.click('#roll-btn');
    const hist = page.locator('.hitem');
    await expect(hist).toHaveCount(1);
    await page.click('#roll-btn');
    await expect(hist).toHaveCount(2);
  });

  test('clear history works', async ({ page }) => {
    await page.click('#roll-btn');
    await page.locator('.hist-clr').click();
    const hist = page.locator('.hitem');
    await expect(hist).toHaveCount(0);
  });

  test('character picker opens', async ({ page }) => {
    await page.click('#sc-char');
    await expect(page.locator('#panel-overlay')).toHaveClass(/on/);
    const items = page.locator('.panel-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Suite — Tracker Tab', () => {
  test.beforeEach(async ({ page }) => {
    await openTab(page, 'st');
  });

  test('tracker character dropdown is populated', async ({ page }) => {
    const options = page.locator('#st-char-sel option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
  });

  test('selecting a character shows tracker card', async ({ page }) => {
    const options = await page.locator('#st-char-sel option').allTextContents();
    const charName = options.find(o => o !== '\u2014 Select character \u2014');
    if (charName) {
      await page.selectOption('#st-char-sel', charName);
      const list = page.locator('#st-char-list');
      await expect(list).not.toBeEmpty();
    }
  });

  test('feeding test section visible after selecting character', async ({ page }) => {
    const options = await page.locator('#st-char-sel option').allTextContents();
    const charName = options.find(o => o !== '\u2014 Select character \u2014');
    if (charName) {
      await page.selectOption('#st-char-sel', charName);
      await expect(page.locator('.feed-toggle')).toBeVisible();
    }
  });
});

test.describe('Suite — Territory Tab', () => {
  test('territory tab renders React component', async ({ page }) => {
    await openTab(page, 'territory');
    const container = page.locator('#terr-root');
    await expect(container).not.toBeEmpty();
  });
});
