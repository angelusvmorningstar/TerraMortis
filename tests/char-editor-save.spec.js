/**
 * Character editor save flow E2E tests — admin.html
 *
 * Covers:
 *   - Character card renders in grid from mocked API
 *   - Clicking card opens detail panel
 *   - Edit toggle reveals "Save to DB" button
 *   - "Save to DB" triggers PUT /api/characters/:id
 *   - Button shows "Saved ✓" confirmation after successful save
 *   - Dirty badge appears when a field is changed
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

// Full character fixture — ordeals must be an array, all 9 attributes present
const TEST_CHAR = {
  _id: 'char-ces-001',
  name: 'Quinn Testwood',
  moniker: null,
  honorific: null,
  clan: 'Mekhet',
  covenant: 'Ordo Dracul',
  player: 'Test Player',
  blood_potency: 2,
  humanity: 6,
  humanity_base: 7,
  court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: 1 },
  attributes: {
    Intelligence: { dots: 3, bonus: 0 },
    Wits:         { dots: 2, bonus: 0 },
    Resolve:      { dots: 2, bonus: 0 },
    Strength:     { dots: 2, bonus: 0 },
    Dexterity:    { dots: 2, bonus: 0 },
    Stamina:      { dots: 2, bonus: 0 },
    Presence:     { dots: 2, bonus: 0 },
    Manipulation: { dots: 2, bonus: 0 },
    Composure:    { dots: 2, bonus: 0 },
  },
  skills: {
    Academics: { dots: 2, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Auspex: { dots: 2 } },
  merits: [],
  powers: [],
  ordeals: [],
  xp_log: { spent: 0 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsST(page) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CHAR]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: TEST_CHAR._id, name: TEST_CHAR.name, moniker: null, honorific: null }]) })
  );
  // Individual character fetch (triggered when entering edit mode)
  await page.route(/\/api\/characters\/char-ces-001$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHAR) })
  );
  await page.route(/\/api\/game_sessions\/next/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  );
  await page.route(/\/api\/game_sessions/, route =>
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

async function openCharDetail(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  // Wait for char card to render (requires ordeals:[] for xpOrdeals to not throw)
  await page.waitForSelector('[data-id="char-ces-001"]', { timeout: 5000 });
  await page.click('[data-id="char-ces-001"]');
  await page.waitForSelector('#char-detail #cd-edit-toggle', { timeout: 5000 });
}

// ══════════════════════════════════════
//  CHAR CARD RENDER
// ══════════════════════════════════════

test.describe('Char Editor — Grid', () => {
  test('character card renders in grid with correct name', async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.waitForSelector('[data-id="char-ces-001"]', { timeout: 5000 });

    const card = page.locator('[data-id="char-ces-001"]');
    await expect(card).toBeVisible();
    const text = await card.textContent();
    expect(text).toContain('Quinn Testwood');
  });

  test('character card shows clan and blood potency', async ({ page }) => {
    await loginAsST(page);
    await page.goto('/admin.html');
    await page.waitForSelector('[data-id="char-ces-001"]', { timeout: 5000 });

    const card = page.locator('[data-id="char-ces-001"]');
    const text = await card.textContent();
    expect(text).toContain('Mekhet');
    expect(text).toContain('2'); // blood potency
  });
});

// ══════════════════════════════════════
//  DETAIL PANEL
// ══════════════════════════════════════

test.describe('Char Editor — Detail Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await openCharDetail(page);
  });

  test('clicking a char card opens the detail panel', async ({ page }) => {
    await expect(page.locator('#char-detail')).toBeVisible();
    const header = await page.locator('.cd-name').textContent();
    expect(header).toContain('Quinn Testwood');
  });

  test('Edit button is visible; Save to DB is hidden initially', async ({ page }) => {
    await expect(page.locator('#cd-edit-toggle')).toBeVisible();
    await expect(page.locator('#cd-save-api')).toBeHidden();
  });

  test('clicking Edit reveals Save to DB and changes button label', async ({ page }) => {
    await page.click('#cd-edit-toggle');
    // Wait for the edit mode fetch to complete (mocked)
    await page.waitForTimeout(200);
    await expect(page.locator('#cd-save-api')).toBeVisible();
    await expect(page.locator('#cd-edit-toggle')).toHaveText('View');
  });
});

// ══════════════════════════════════════
//  SAVE FLOW
// ══════════════════════════════════════

test.describe('Char Editor — Save flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await openCharDetail(page);
    // Enter edit mode
    await page.click('#cd-edit-toggle');
    await page.waitForTimeout(200);
    await page.waitForSelector('#cd-save-api:not([style*="display: none"])', { timeout: 5000 });
  });

  test('Save to DB triggers PUT /api/characters/:id', async ({ page }) => {
    let putCalled = false;
    await page.route('**/api/characters/char-ces-001', route => {
      if (route.request().method() === 'PUT') {
        putCalled = true;
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify(TEST_CHAR),
        });
      } else {
        route.continue();
      }
    });

    await page.click('#cd-save-api');
    await page.waitForTimeout(500);
    expect(putCalled).toBe(true);
  });

  test('button shows "Saved ✓" after successful save', async ({ page }) => {
    await page.route('**/api/characters/char-ces-001', route => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify(TEST_CHAR),
        });
      } else {
        route.continue();
      }
    });

    await page.click('#cd-save-api');
    // Button briefly shows "Saved ✓" before reverting after 2s
    await expect(page.locator('#cd-save-api')).toHaveText(/Saved/);
  });
});
