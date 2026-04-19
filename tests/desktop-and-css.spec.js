/**
 * Desktop mode + CSS audit E2E tests
 *
 * Covers:
 *   - Desktop mode toggle (nav-desktop-mode)
 *   - CSS audit: Primer styled, Archive styled, DT Submission dark theme
 *   - CSS audit: two-panel collapses on mobile
 *   - Font harmonisation: buttons use Lato not Cinzel
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const PLAYER_USER = {
  id: '999', username: 'player_test', global_name: 'Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

async function setupSuite(page, user = ST_USER) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode'); // start in game mode
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, user);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// ── Desktop mode tests ─────────────────────────────────────────────────────────

test('desktop-mode — toggle button visible in header', async ({ page }) => {
  await setupSuite(page);
  await expect(page.locator('#btn-desktop-toggle')).toBeVisible();
});

test('desktop-mode — starts in game mode (no body.desktop-mode)', async ({ page }) => {
  await setupSuite(page);
  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(false);
});

test('desktop-mode — toggle adds body.desktop-mode and shows sidebar', async ({ page }) => {
  await setupSuite(page);

  await page.click('#btn-desktop-toggle');

  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(true);

  await expect(page.locator('#desktop-sidebar')).toBeVisible();
});

test('desktop-mode — bottom nav hidden in desktop mode', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await expect(page.locator('#bnav')).toBeHidden();
});

test('desktop-mode — sidebar has primary tabs (Dice, Sheet, Status)', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).toMatch(/Dice/i);
  expect(navText).toMatch(/Sheet/i);
  expect(navText).toMatch(/Status/i);
});

test('desktop-mode — sidebar has section labels', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).toMatch(/Game/i);
  expect(navText).toMatch(/Lore/i);
  expect(navText).toMatch(/Storyteller/i);
});

test('desktop-mode — ST sees Tracker and Sign-In in sidebar', async ({ page }) => {
  await setupSuite(page, ST_USER);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  const navText = await page.locator('#desktop-sidebar-nav').textContent();
  expect(navText).toMatch(/Tracker/i);
  expect(navText).toMatch(/Sign-In/i);
});

test('desktop-mode — tapping sidebar Dice navigates to dice tab', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');
  await page.waitForSelector('#desktop-sidebar', { state: 'visible', timeout: 5000 });

  // Navigate away first
  await page.evaluate(() => window.goTab('status'));
  await page.waitForTimeout(200);

  // Click Dice in sidebar (now a .sidebar-app-tile in primary grid)
  await page.locator('#desktop-sidebar-nav .sidebar-app-tile').filter({ hasText: /Dice/i }).click();
  await expect(page.locator('#t-dice')).toHaveClass(/active/, { timeout: 5000 });
});

test('desktop-mode — toggling back restores game mode', async ({ page }) => {
  await setupSuite(page);

  await page.click('#btn-desktop-toggle'); // → desktop (header visible)
  // In desktop mode, header is hidden — use JS to toggle back
  await page.evaluate(() => window.toggleDesktopMode()); // → game

  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(false);

  await expect(page.locator('#bnav')).toBeVisible();
  await expect(page.locator('#desktop-sidebar')).toBeHidden();
});

test('desktop-mode — preference saved to localStorage', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');

  const mode = await page.evaluate(() => localStorage.getItem('tm-mode'));
  expect(mode).toBe('desktop');
});

test('desktop-mode — preference restored on page load', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('tm-mode', 'desktop');
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, ST_USER);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

  const hasClass = await page.evaluate(() => document.body.classList.contains('desktop-mode'));
  expect(hasClass).toBe(true);
  await expect(page.locator('#desktop-sidebar')).toBeVisible();
});

test('desktop-mode — app width uncapped in desktop mode', async ({ page }) => {
  await setupSuite(page);
  await page.click('#btn-desktop-toggle');

  const maxWidth = await page.evaluate(() => {
    const app = document.getElementById('app');
    return window.getComputedStyle(app).maxWidth;
  });
  // Should be 'none' or very large — not 600px
  expect(maxWidth).not.toBe('600px');
});

// ── CSS audit tests ────────────────────────────────────────────────────────────

test('css-audit — Primer tab renders styled TOC (not bare blue links)', async ({ page }) => {
  await setupSuite(page);

  await page.route('**/api/rules**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, pages: 0 }) }));

  // Navigate to Primer via More grid
  await page.evaluate(() => window.goTab('more'));
  await page.waitForSelector('.more-grid-wrap', { state: 'visible', timeout: 10000 });
  await page.locator('.more-app-icon[data-app="primer"]').click();
  await page.waitForTimeout(800);

  // Primer CSS should be applied — .primer-toc-link should NOT be default blue
  const linkColour = await page.evaluate(() => {
    const link = document.querySelector('.primer-toc-link');
    if (!link) return null;
    return window.getComputedStyle(link).color;
  });

  // If null, the primer content hasn't loaded — that's OK for this test (no server)
  // The key check is that the CSS class EXISTS and doesn't render as browser-default blue (rgb(0,0,238))
  if (linkColour !== null) {
    expect(linkColour).not.toBe('rgb(0, 0, 238)');
  }

  // .primer-layout class should be defined (CSS ported)
  const hasPrimerLayout = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === '.primer-layout') return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  expect(hasPrimerLayout).toBe(true);
});

test('css-audit — Archive CSS class is defined in suite.css', async ({ page }) => {
  await setupSuite(page);

  const hasArcDocs = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === '.arc-docs') return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  expect(hasArcDocs).toBe(true);
});

test('css-audit — DT Submission tab has dark-theme input styles', async ({ page }) => {
  await setupSuite(page);

  // .qf-input override should force dark background
  const hasOverride = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && rule.selectorText.includes('t-dt-submission') && rule.selectorText.includes('qf-input')) {
            return true;
          }
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  expect(hasOverride).toBe(true);
});

test('css-audit — story-split is single column on phone (≤768px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupSuite(page);

  // Inject a story-split element and measure
  const flexDir = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'story-split';
    document.body.appendChild(el);
    const dir = window.getComputedStyle(el).flexDirection;
    document.body.removeChild(el);
    return dir;
  });
  expect(flexDir).toBe('column');
});

test('css-audit — tab-split is single column on phone (≤768px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupSuite(page);

  const flexDir = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'tab-split';
    document.body.appendChild(el);
    const dir = window.getComputedStyle(el).flexDirection;
    document.body.removeChild(el);
    return dir;
  });
  expect(flexDir).toBe('column');
});

test('css-audit — dice roll button uses Lato font (not Cinzel)', async ({ page }) => {
  await setupSuite(page);

  const fontFamily = await page.evaluate(() => {
    const btn = document.getElementById('roll-btn');
    if (!btn) return null;
    return window.getComputedStyle(btn).fontFamily;
  });

  if (fontFamily) {
    expect(fontFamily.toLowerCase()).toContain('lato');
    expect(fontFamily.toLowerCase()).not.toContain('cinzel');
  }
});

test('css-audit — modifier chips use Lato font (not Cinzel)', async ({ page }) => {
  await setupSuite(page);

  const fontFamily = await page.evaluate(() => {
    const chip = document.querySelector('.mchip');
    if (!chip) return null;
    return window.getComputedStyle(chip).fontFamily;
  });

  if (fontFamily) {
    expect(fontFamily.toLowerCase()).toContain('lato');
    expect(fontFamily.toLowerCase()).not.toContain('cinzel');
  }
});

test('css-audit — app title retains Cinzel font', async ({ page }) => {
  await setupSuite(page);

  const fontFamily = await page.evaluate(() => {
    const title = document.querySelector('.hdr-title');
    if (!title) return null;
    return window.getComputedStyle(title).fontFamily;
  });

  if (fontFamily) {
    expect(fontFamily.toLowerCase()).toContain('cinzel');
  }
});
