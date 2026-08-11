/**
 * E2E tests — Devlog admin domain (issue #502)
 *
 * Admin CRUD: admin.html Devlog domain — create, edit, delete entries.
 *
 * The player-read half of this file was retired with #1135, which deleted the
 * Devlog tab from the game app. The admin surface below is unchanged and must
 * keep passing: it is still the only way devlog entries are authored, and they
 * still reach players, via TM Herald's GET /api/devlog poll into Discord.
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ─────────────────────────────────────────────────────────────

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
//  PLAYER — retired with #1135 (the devlog tab was deleted from the game app).
//
//  The AC#7-10 describe block and its loginAsGameApp helper went with the tab.
//  The ST authoring surface above survives and must keep passing. Devlog entries
//  still reach players through Discord: TM Herald polls GET /api/devlog and
//  announces new ones (TM Herald/services/announcements.js).
// ══════════════════════════════════════════════════════════════════════════
