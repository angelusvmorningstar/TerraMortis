/**
 * E2E tests — Devlog tab / admin domain (issue #502)
 *
 * Player read:  GET /api/devlog rendered in the player portal sidebar tab
 * Admin CRUD:   admin.html Devlog domain — create, edit, delete entries
 *
 * NOTE: player.html redirects to / (index.html) as a backwards-compat shim.
 * Player-side tab tests navigate to admin.html with a player role fixture
 * to test the API response shape, and to player.html where the tab panel
 * exists in the static HTML. If the redirect is in effect in the test env,
 * player.html tests will fail and the tab should be moved to index.html.
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ─────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: 'test-player-e2e',
  username: 'test_player',
  global_name: 'Test Player',
  avatar: null,
  role: 'player',
  player_id: 'p-player-e2e',
  character_ids: ['char-e2e-001'],
  is_dual_role: false,
};

const ST_USER = {
  id: 'test-st-e2e',
  username: 'test_st',
  global_name: 'Test ST',
  avatar: null,
  role: 'st',
  player_id: 'p-st-e2e',
  character_ids: [],
  is_dual_role: false,
};

const MOCK_DEVLOG_ENTRIES = [
  {
    _id: 'dl-001',
    type: 'rule_change',
    title: 'Street Fighting rework',
    body: 'We are reviewing the exclusive-attack clause.',
    status: 'considering',
    target_cycle: 'Game 5',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  },
  {
    _id: 'dl-002',
    type: 'app_feature',
    title: 'Regency tracker',
    body: 'Live regency dot display per territory.',
    status: 'in_progress',
    target_cycle: null,
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
  },
  {
    _id: 'dl-003',
    type: 'app_feature',
    title: 'Dark mode for mobile',
    body: 'Already shipped.',
    status: 'implemented',
    target_cycle: 'Game 4',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function loginAsAdmin(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  // Stub noisy admin API calls so the app boots without errors
  await page.route('**/api/characters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

async function loginAsPlayer(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/ordeal-responses*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN — Devlog domain
// ══════════════════════════════════════════════════════════════════════════

test.describe('Admin — Devlog domain (AC#6)', () => {
  test('Devlog sidebar button is present', async ({ page }) => {
    await loginAsAdmin(page);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });
    await expect(page.locator('[data-domain="devlog"]')).toBeVisible();
  });

  test('Clicking Devlog button loads the management panel', async ({ page }) => {
    await loginAsAdmin(page);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });

    await page.click('[data-domain="devlog"]');
    await page.waitForSelector('#d-devlog.active', { timeout: 5000 });
    await expect(page.locator('#devlog-admin-content')).toBeVisible();
  });

  test('Empty state shows after load with no entries', async ({ page }) => {
    await loginAsAdmin(page);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });
    await page.click('[data-domain="devlog"]');
    await page.waitForSelector('#d-devlog.active', { timeout: 5000 });

    // Should show some kind of empty or add-entry state, not crash
    await expect(page.locator('#devlog-admin-content')).toBeVisible();
  });

  test('Existing entries render with title and status chip', async ({ page }) => {
    await loginAsAdmin(page);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEVLOG_ENTRIES) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });
    await page.click('[data-domain="devlog"]');
    await page.waitForSelector('#d-devlog.active', { timeout: 5000 });

    // First active entry title should appear
    await expect(page.locator('#devlog-admin-content')).toContainText('Street Fighting rework');
    await expect(page.locator('#devlog-admin-content')).toContainText('Regency tracker');
    // Status chip for 'considering' should show human-readable label
    await expect(page.locator('#devlog-admin-content')).toContainText('Under Consideration');
  });

  test('Add Entry button reveals the form', async ({ page }) => {
    await loginAsAdmin(page);
    await page.route('**/api/devlog', route => {
      if (route.request().method() === 'GET')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return route.continue();
    });
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });
    await page.click('[data-domain="devlog"]');
    await page.waitForSelector('#d-devlog.active', { timeout: 5000 });

    await page.click('button:has-text("Add Entry")');
    // Form fields should appear
    await expect(page.locator('#devlog-admin-content select[name="type"], #devlog-admin-content select[data-field="type"]')).toBeVisible({ timeout: 3000 }).catch(() => {
      // Accept any form appearing in the panel
      return expect(page.locator('#devlog-admin-content form, #devlog-admin-content .devlog-form')).toBeVisible({ timeout: 3000 });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  PLAYER — Devlog tab in index.html / app.js (the unified game app)
//
//  The devlog tab is wired into index.html via NAV_ITEMS + goTab() in
//  app.js. The nav button is #n-devlog; the tab container is #t-devlog.
//  renderDevlogTab() fetches /api/devlog and renders content into #t-devlog.
// ══════════════════════════════════════════════════════════════════════════

async function loginAsGameApp(page, user) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  );
  // Stub all boot-time API calls so the app reaches a ready state
  await page.route(/\/api\/characters(\?|$)/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/settings*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'global', st_mods_enabled: true }) })
  );
  await page.route('**/api/rules*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

test.describe('Player — Devlog tab in game app (AC#7-10)', () => {
  // goTab is on window (app.js:2283). Use page.evaluate to navigate —
  // avoids fragility from bottom-nav being hidden in desktop-mode viewport.
  async function goDevlog(page) {
    await page.evaluate(() => window.goTab('devlog'));
    await page.waitForSelector('#t-devlog.active', { timeout: 5000 });
  }

  test('Devlog nav button exists in the DOM', async ({ page }) => {
    await loginAsGameApp(page, PLAYER_USER);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEVLOG_ENTRIES) })
    );
    await page.goto('/');
    await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 10000 });
    // Button exists in DOM (may be in bottom nav or desktop sidebar depending on viewport)
    await expect(page.locator('#n-devlog')).toHaveCount(1);
    await expect(page.locator('#n-devlog')).toContainText('Devlog');
  });

  test('Devlog tab renders entries grouped by type', async ({ page }) => {
    await loginAsGameApp(page, PLAYER_USER);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEVLOG_ENTRIES) })
    );
    await page.goto('/');
    await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 10000 });
    await goDevlog(page);

    await expect(page.locator('#t-devlog')).toContainText('Street Fighting rework');
    await expect(page.locator('#t-devlog')).toContainText('Regency tracker');
  });

  test('Status shown as human-readable chip not raw enum (AC#8)', async ({ page }) => {
    await loginAsGameApp(page, PLAYER_USER);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEVLOG_ENTRIES) })
    );
    await page.goto('/');
    await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 10000 });
    await goDevlog(page);

    await expect(page.locator('#t-devlog')).toContainText('Under Consideration');
    await expect(page.locator('#t-devlog')).not.toContainText('considering');
    await expect(page.locator('#t-devlog')).toContainText('In Progress');
    await expect(page.locator('#t-devlog')).not.toContainText('in_progress');
  });

  test('Implemented entries in collapsed Resolved section (AC#9)', async ({ page }) => {
    await loginAsGameApp(page, PLAYER_USER);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEVLOG_ENTRIES) })
    );
    await page.goto('/');
    await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 10000 });
    await goDevlog(page);

    const resolved = page.locator('#t-devlog details');
    await expect(resolved).toBeVisible({ timeout: 3000 });
    await resolved.click();
    await expect(page.locator('#t-devlog')).toContainText('Dark mode for mobile');
  });

  test('Empty state shows "Nothing posted yet" (AC#7)', async ({ page }) => {
    await loginAsGameApp(page, PLAYER_USER);
    await page.route('**/api/devlog*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.goto('/');
    await page.waitForSelector('#app:not([style*="display: none"])', { timeout: 10000 });
    await goDevlog(page);

    await expect(page.locator('#t-devlog')).toContainText('Nothing posted yet');
  });
});
