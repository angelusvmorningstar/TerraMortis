const { test, expect } = require('@playwright/test');

// ── Auth + mock data ──

const PLAYER_USER = {
  id: '987654321',
  username: 'test_player',
  global_name: 'Test Player',
  avatar: null,
  role: 'player',
  player_id: 'p-002',
  character_ids: ['char-001'],
  is_dual_role: false,
};

const ST_USER = {
  id: '123456789',
  username: 'test_st',
  global_name: 'Test ST',
  avatar: null,
  role: 'st',
  player_id: 'p-001',
  character_ids: ['char-001'],
  is_dual_role: true,
};

const TEST_CHAR = {
  _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: 'The North Shore', regent_lieutenant: 'Keeper',
  retired: false,
  status: { city: 2, clan: 3, covenant: 2 },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 3, bonus: 0 },
  },
  skills: {
    Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false },
    Stealth: { dots: 3, bonus: 0, specs: ['Crowds'], nine_again: false },
    Occult: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Auspex: 2, Obfuscate: 3 },
  merits: [], powers: [],
  ordeals: {},
};

async function loginAs(page, user) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CHAR]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: TEST_CHAR._id, name: TEST_CHAR.name }]) })
  );
  await page.route('**/api/downtime_cycles', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/ordeal-responses*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user });
}

// ══════════════════════════════════════
//  AUTH GATE
// ══════════════════════════════════════

test.describe('Player Portal — Auth Gate', () => {
  test('login screen hidden when authenticated', async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    await expect(page.locator('#login-screen')).toBeHidden();
    await expect(page.locator('#player-app')).toBeVisible();
  });

  test('no login flash (screen starts hidden)', async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    // Check immediately — login screen should never be visible
    const flashed = [];
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const ls = document.getElementById('login-screen');
        if (ls && getComputedStyle(ls).display !== 'none') {
          window.__loginFlashed = true;
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    const flashed2 = await page.evaluate(() => window.__loginFlashed || false);
    expect(flashed2).toBe(false);
  });

  test('shows login screen when not authenticated', async ({ page }) => {
    await page.goto('/player.html');
    await page.waitForSelector('#login-screen:not([style*="display: none"])', { timeout: 5000 });
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  HEADER & NAV
// ══════════════════════════════════════

test.describe('Player Portal — Header', () => {
  test('shows username in header', async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    await expect(page.locator('#header-user')).toContainText('Test Player');
  });

  test('shows logout button', async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    await expect(page.locator('#logout-btn')).toBeVisible();
  });

  test('shows Game App nav button', async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    await expect(page.locator('#nav-game')).toBeVisible();
  });

  test('player does not see ST Admin button', async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    await expect(page.locator('#nav-admin')).toHaveCount(0);
  });

  test('ST sees ST Admin button', async ({ page }) => {
    await loginAs(page, ST_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
    await expect(page.locator('#nav-admin')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════

test.describe('Player Portal — Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, PLAYER_USER);
    await page.goto('/player.html');
    await page.waitForSelector('#player-app:not([style*="display: none"])');
  });

  test('four tabs visible', async ({ page }) => {
    const tabs = page.locator('.tab-btn');
    await expect(tabs).toHaveCount(4);
  });

  test('Sheet tab is active by default', async ({ page }) => {
    await expect(page.locator('.tab-btn[data-tab="sheet"]')).toHaveClass(/on/);
    await expect(page.locator('#tab-sheet')).toHaveClass(/active/);
  });

  test('clicking Downtime tab switches', async ({ page }) => {
    await page.click('.tab-btn[data-tab="downtime"]');
    await expect(page.locator('.tab-btn[data-tab="downtime"]')).toHaveClass(/on/);
    await expect(page.locator('#tab-downtime')).toHaveClass(/active/);
    await expect(page.locator('#tab-sheet')).not.toHaveClass(/active/);
  });

  test('clicking Ordeals tab switches', async ({ page }) => {
    await page.click('.tab-btn[data-tab="ordeals"]');
    await expect(page.locator('.tab-btn[data-tab="ordeals"]')).toHaveClass(/on/);
    await expect(page.locator('#tab-ordeals')).toHaveClass(/active/);
  });

  test('clicking Story tab switches', async ({ page }) => {
    await page.click('.tab-btn[data-tab="story"]');
    await expect(page.locator('.tab-btn[data-tab="story"]')).toHaveClass(/on/);
    await expect(page.locator('#tab-story')).toHaveClass(/active/);
  });
});

// ══════════════════════════════════════
//  SHEET TAB
// ══════════════════════════════════════

// Note: Sheet rendering tests are covered by editor.spec.js which uses the same
// renderSheet() function against the real API. Player portal sheet rendering
// requires either full API auth bypass or deep mock data — deferred for now.
