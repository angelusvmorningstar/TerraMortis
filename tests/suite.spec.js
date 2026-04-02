const { test, expect } = require('@playwright/test');

// ── Auth helpers ──

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

/**
 * Inject auth state and mock /api/auth/me so the app thinks we're logged in.
 * Also mocks /api/characters to return test data without needing the real API.
 */
async function loginAs(page, user, chars = []) {
  // Mock the auth validation endpoint
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  );

  // Mock the characters endpoint
  await page.route('**/api/characters', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) })
  );

  // Seed localStorage before navigation
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user });
}

const TEST_CHARS = [
  { _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null, clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H', blood_potency: 1, humanity: 6, court_title: null, regent_territory: 'The North Shore', regent_lieutenant: 'Keeper', retired: false, status: { city: 2, clan: 3, covenant: 2 }, attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [] },
  { _id: 'char-002', name: 'Brandy LaRoux', moniker: null, honorific: null, clan: 'Gangrel', covenant: 'Circle of the Crone', player: 'Ashley K', blood_potency: 1, humanity: 5, court_title: 'Harpy', retired: false, status: { city: 1, clan: 2, covenant: 1 }, attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [] },
  { _id: 'char-003', name: 'Eve Lockridge', moniker: null, honorific: null, clan: 'Daeva', covenant: 'Carthian Movement', player: 'Jamie', blood_potency: 1, humanity: 6, court_title: 'Premier', retired: false, status: { city: 3, clan: 1, covenant: 2 }, attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [] },
];

// ══════════════════════════════════════
//  AUTH GATE
// ══════════════════════════════════════

test.describe('Game App — Auth Gate', () => {
  test('shows login screen when not authenticated', async ({ page }) => {
    await page.goto('/index.html');
    const loginScreen = page.locator('#login-screen');
    await expect(loginScreen).toBeVisible();
    const app = page.locator('#app');
    await expect(app).toBeHidden();
  });

  test('shows app when authenticated as ST', async ({ page }) => {
    await loginAs(page, ST_USER, TEST_CHARS);
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
    const app = page.locator('#app');
    await expect(app).toBeVisible();
  });

  test('shows app when authenticated as player', async ({ page }) => {
    await loginAs(page, PLAYER_USER, [TEST_CHARS[0]]);
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
    await expect(page.locator('#app')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════

test.describe('Game App — Navigation (ST)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ST_USER, TEST_CHARS);
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
  });

  test('starts on Roll tab', async ({ page }) => {
    await expect(page.locator('#t-roll')).toHaveClass(/active/);
  });

  test('Roll and Character nav buttons visible', async ({ page }) => {
    await expect(page.locator('#n-roll')).toBeVisible();
    await expect(page.locator('#n-chars')).toBeVisible();
  });

  test('Territory nav visible for ST', async ({ page }) => {
    await expect(page.locator('#n-territory')).toBeVisible();
  });

  test('no Tracker nav button (retired)', async ({ page }) => {
    await expect(page.locator('#n-st')).toHaveCount(0);
  });

  test('tab navigation works', async ({ page }) => {
    await page.click('#n-chars');
    await expect(page.locator('#t-chars')).toHaveClass(/active/);
    await expect(page.locator('#t-roll')).not.toHaveClass(/active/);

    await page.click('#n-roll');
    await expect(page.locator('#t-roll')).toHaveClass(/active/);
  });
});

test.describe('Game App — Navigation (Player)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, PLAYER_USER, [TEST_CHARS[0]]);
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
  });

  test('Territory nav hidden for player', async ({ page }) => {
    await expect(page.locator('#n-territory')).toBeHidden();
  });

  test('ST Admin nav button hidden for player', async ({ page }) => {
    await expect(page.locator('#nav-admin')).toBeHidden();
  });

  test('Player nav button visible', async ({ page }) => {
    await expect(page.locator('#nav-player')).toBeVisible();
  });
});

// ══════════════════════════════════════
//  ROLL TAB
// ══════════════════════════════════════

test.describe('Game App — Roll Tab', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ST_USER, TEST_CHARS);
    await page.goto('/index.html');
    await page.waitForSelector('#t-roll.active');
  });

  test('pool display shows initial value', async ({ page }) => {
    const pval = page.locator('#pval');
    await expect(pval).toBeVisible();
    const text = await pval.textContent();
    expect(parseInt(text)).toBeGreaterThanOrEqual(0);
  });

  test('pool increment works', async ({ page }) => {
    const before = parseInt(await page.locator('#pval').textContent());
    await page.locator('#t-roll .cbtn', { hasText: '+' }).first().click();
    const after = parseInt(await page.locator('#pval').textContent());
    expect(after).toBe(before + 1);
  });

  test('roll button produces results', async ({ page }) => {
    await page.click('#roll-btn');
    const area = page.locator('#dice-area');
    await expect(area).not.toBeEmpty();
  });

  test('again buttons toggle', async ({ page }) => {
    await page.click('#a9');
    await expect(page.locator('#a9')).toHaveClass(/on/);
    await expect(page.locator('#a10')).not.toHaveClass(/on/);
  });

  test('rote toggle works', async ({ page }) => {
    await page.click('#rote-c');
    await expect(page.locator('#rote-c')).toHaveClass(/on/);
  });

  test('roll history records and clears', async ({ page }) => {
    await page.click('#roll-btn');
    await expect(page.locator('.hitem')).toHaveCount(1);
    await page.click('#roll-btn');
    await expect(page.locator('.hitem')).toHaveCount(2);
    await page.locator('.hist-clr').click();
    await expect(page.locator('.hitem')).toHaveCount(0);
  });

  test('character picker opens for ST', async ({ page }) => {
    await page.click('#sc-char');
    await expect(page.locator('#panel-overlay')).toHaveClass(/on/);
    const items = page.locator('.panel-item');
    const count = await items.count();
    expect(count).toBe(3); // All 3 test chars
  });

  test('feeding section visible for ST', async ({ page }) => {
    await expect(page.locator('#feed-section')).toBeVisible();
  });
});

test.describe('Game App — Roll Tab (Player restrictions)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, PLAYER_USER, [TEST_CHARS[0]]);
    await page.goto('/index.html');
    await page.waitForSelector('#t-roll.active');
  });

  test('feeding section hidden for player', async ({ page }) => {
    await expect(page.locator('#feed-section')).toBeHidden();
  });

  test('character picker shows only player\'s character', async ({ page }) => {
    await page.click('#sc-char');
    await expect(page.locator('#panel-overlay')).toHaveClass(/on/);
    const items = page.locator('.panel-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Alice Vunder');
  });
});

// ══════════════════════════════════════
//  CROSS-APP NAV
// ══════════════════════════════════════

test.describe('Game App — Cross-App Navigation', () => {
  test('ST sees both Player and ST Admin buttons', async ({ page }) => {
    await loginAs(page, ST_USER, TEST_CHARS);
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
    await expect(page.locator('#nav-player')).toBeVisible();
    await expect(page.locator('#nav-admin')).toBeVisible();
  });

  test('Player sees Player button but not ST Admin', async ({ page }) => {
    await loginAs(page, PLAYER_USER, [TEST_CHARS[0]]);
    await page.goto('/index.html');
    await page.waitForSelector('#app:not([style*="display: none"])');
    await expect(page.locator('#nav-player')).toBeVisible();
    await expect(page.locator('#nav-admin')).toBeHidden();
  });
});

// ══════════════════════════════════════
//  THEME
// ══════════════════════════════════════

test.describe('Game App — Theme', () => {
  test('CSS custom properties load', async ({ page }) => {
    await loginAs(page, ST_USER, TEST_CHARS);
    await page.goto('/index.html');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#0D0B09');
  });
});
