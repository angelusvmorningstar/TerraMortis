/**
 * E2E tests — Admin Cycle tab: phase controls (CYCLE epic #708, story 3)
 * Covers: phase buttons rendered, active state, PUT on click, Game confirm +
 * tracker reset, cancel aborts, inline error on API failure.
 */

const { test, expect } = require('@playwright/test');

// ── Test data ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001',
  character_ids: [], is_dual_role: false,
};

const TEST_STORY_CYCLES = [
  { _id: 'sc-001', number: 1, label: 'Story One', created_at: '2026-01-01T00:00:00.000Z' },
];

// cyc-001: currently in 'processing' phase
// cyc-002: no game_phase (legacy)
// cyc-003: currently in 'game' phase
const TEST_CYCLES = [
  { _id: 'cyc-001', label: 'DT 1', game_number: 1, game_phase: 'processing', story_cycle_id: 'sc-001', status: 'closed' },
  { _id: 'cyc-002', label: 'DT 2', game_number: 2, game_phase: null,         story_cycle_id: null,     status: 'active' },
  { _id: 'cyc-003', label: 'DT 3', game_number: 3, game_phase: 'game',       story_cycle_id: null,     status: 'game'   },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsST(page) {
  await page.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);
}

async function mockCycleApis(page, {
  cycles = TEST_CYCLES,
  putStatus = 200,
  trackerDeleteStatus = 200,
} = {}) {
  // Mutable reference so tests can swap the returned cycle per PUT
  let currentCycles = cycles.map(c => ({ ...c }));

  await page.route(/\/api\/story_cycles$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_STORY_CYCLES) })
  );
  await page.route(/\/api\/story_cycles\//, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
  await page.route(/\/api\/downtime_cycles$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentCycles) })
  );
  // PUT /api/downtime_cycles/:id
  await page.route(/\/api\/downtime_cycles\/[^/]+$/, route => {
    if (route.request().method() === 'PUT') {
      const id = route.request().url().split('/').pop();
      if (putStatus !== 200) {
        return route.fulfill({ status: putStatus, contentType: 'application/json',
          body: JSON.stringify({ error: 'SERVER_ERROR', message: 'Phase update failed' }) });
      }
      const body = JSON.parse(route.request().postData() || '{}');
      const cycle = currentCycles.find(c => c._id === id) || { _id: id };
      const updated = { ...cycle, ...body };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    }
    // Other methods fall through
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  // DELETE /api/tracker_state
  await page.route(/\/api\/tracker_state$/, route => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({
        status: trackerDeleteStatus,
        contentType: 'application/json',
        body: JSON.stringify({ deleted: trackerDeleteStatus === 200 ? 5 : 0 }),
      });
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function navigateToCycleTab(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.click('.sidebar-btn[data-domain="cycle"]');
  await expect(page.locator('#d-cycle')).toHaveClass(/active/);
  await page.waitForFunction(() => {
    const el = document.getElementById('cycle-content');
    return el && !el.textContent.includes('Loading');
  }, { timeout: 5000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Cycle tab — phase buttons: rendering', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('each cycle row renders three phase buttons', async ({ page }) => {
    // All three cycles should each have Game, Downtime, Processing buttons
    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    await expect(rows).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      await expect(row.locator('button[data-phase="game"]')).toBeVisible();
      await expect(row.locator('button[data-phase="downtime"]')).toBeVisible();
      await expect(row.locator('button[data-phase="processing"]')).toBeVisible();
    }
  });

  test('active phase button is disabled', async ({ page }) => {
    const rows = page.locator('#cycle-content table').last().locator('tbody tr');

    // cyc-001: game_phase='processing' → Processing button disabled
    const row1 = rows.nth(0);
    await expect(row1.locator('button[data-phase="processing"]')).toBeDisabled();
    await expect(row1.locator('button[data-phase="game"]')).not.toBeDisabled();
    await expect(row1.locator('button[data-phase="downtime"]')).not.toBeDisabled();
  });

  test('legacy cycle (game_phase null) shows all buttons enabled', async ({ page }) => {
    const rows = page.locator('#cycle-content table').last().locator('tbody tr');

    // cyc-002: game_phase=null → all buttons enabled
    const row2 = rows.nth(1);
    await expect(row2.locator('button[data-phase="game"]')).not.toBeDisabled();
    await expect(row2.locator('button[data-phase="downtime"]')).not.toBeDisabled();
    await expect(row2.locator('button[data-phase="processing"]')).not.toBeDisabled();
  });

  test('game-phase cycle shows Game button disabled', async ({ page }) => {
    const rows = page.locator('#cycle-content table').last().locator('tbody tr');

    // cyc-003: game_phase='game' → Game button disabled
    const row3 = rows.nth(2);
    await expect(row3.locator('button[data-phase="game"]')).toBeDisabled();
    await expect(row3.locator('button[data-phase="downtime"]')).not.toBeDisabled();
    await expect(row3.locator('button[data-phase="processing"]')).not.toBeDisabled();
  });
});

test.describe('Cycle tab — phase buttons: non-game transitions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('clicking Downtime calls PUT with game_phase=downtime and disables that button', async ({ page }) => {
    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    // cyc-001 is 'processing' — click Downtime
    const row1 = rows.nth(0);
    const dtBtn = row1.locator('button[data-phase="downtime"]');

    let putBody = null;
    await page.route(/\/api\/downtime_cycles\/cyc-001/, route => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ _id: 'cyc-001', game_phase: 'downtime' }) });
      }
      route.continue();
    });

    await dtBtn.click();
    await page.waitForTimeout(300);

    expect(putBody).not.toBeNull();
    expect(putBody.game_phase).toBe('downtime');
    // Downtime button is now disabled (active)
    await expect(row1.locator('button[data-phase="downtime"]')).toBeDisabled();
    // Processing button is now enabled
    await expect(row1.locator('button[data-phase="processing"]')).not.toBeDisabled();
  });

  test('clicking Processing calls PUT with game_phase=processing', async ({ page }) => {
    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    // cyc-002 is legacy (null) — click Processing
    const row2 = rows.nth(1);

    let putBody = null;
    await page.route(/\/api\/downtime_cycles\/cyc-002/, route => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ _id: 'cyc-002', game_phase: 'processing' }) });
      }
      route.continue();
    });

    await row2.locator('button[data-phase="processing"]').click();
    await page.waitForTimeout(300);

    expect(putBody.game_phase).toBe('processing');
    await expect(row2.locator('button[data-phase="processing"]')).toBeDisabled();
  });

  test('API failure on phase change shows inline error', async ({ page }) => {
    // Override cycles PUT to fail
    await page.route(/\/api\/downtime_cycles\//, route => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 500, contentType: 'application/json',
          body: JSON.stringify({ error: 'SERVER_ERROR', message: 'DB write failed' }) });
      }
      route.continue();
    });

    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    await rows.nth(1).locator('button[data-phase="processing"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#cycle-content')).toContainText('Phase change failed');
  });
});

test.describe('Cycle tab — Game phase: confirm + tracker reset', () => {
  test('clicking Game shows a confirmation dialog', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);

    let dialogShown = false;
    page.once('dialog', async dialog => {
      dialogShown = true;
      await dialog.dismiss();
    });

    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    // cyc-002 (legacy) — all buttons enabled, click Game
    await rows.nth(1).locator('button[data-phase="game"]').click();
    await page.waitForTimeout(300);

    expect(dialogShown).toBe(true);
  });

  test('accepting Game confirm calls DELETE /api/tracker_state then PUT game_phase', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);

    const calls = [];
    await page.route(/\/api\/tracker_state$/, route => {
      calls.push({ method: route.request().method(), url: route.request().url() });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: 3 }) });
    });
    await page.route(/\/api\/downtime_cycles\/cyc-002/, route => {
      if (route.request().method() === 'PUT') {
        calls.push({ method: 'PUT', url: route.request().url(), body: JSON.parse(route.request().postData() || '{}') });
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ _id: 'cyc-002', game_phase: 'game' }) });
      }
      route.continue();
    });

    page.once('dialog', async dialog => dialog.accept());

    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    await rows.nth(1).locator('button[data-phase="game"]').click();
    await page.waitForTimeout(500);

    const trackerDelete = calls.find(c => c.method === 'DELETE');
    const phasePut      = calls.find(c => c.method === 'PUT');
    expect(trackerDelete).toBeDefined();
    expect(phasePut).toBeDefined();
    expect(phasePut.body.game_phase).toBe('game');
    // DELETE must come before PUT (ordered in calls array)
    expect(calls.indexOf(trackerDelete)).toBeLessThan(calls.indexOf(phasePut));
  });

  test('dismissing Game confirm makes no API calls', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);

    let putCalled = false;
    let deleteCalled = false;
    await page.route(/\/api\/tracker_state$/, route => {
      deleteCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"deleted":0}' });
    });
    await page.route(/\/api\/downtime_cycles\/cyc-002/, route => {
      if (route.request().method() === 'PUT') { putCalled = true; }
      route.continue();
    });

    page.once('dialog', async dialog => dialog.dismiss());

    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    await rows.nth(1).locator('button[data-phase="game"]').click();
    await page.waitForTimeout(300);

    expect(deleteCalled).toBe(false);
    expect(putCalled).toBe(false);
    // Button states unchanged — Game still enabled for cyc-002
    await expect(rows.nth(1).locator('button[data-phase="game"]')).not.toBeDisabled();
  });

  test('after accepted Game phase change, Game button becomes disabled', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);

    await page.route(/\/api\/tracker_state$/, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"deleted":2}' })
    );
    await page.route(/\/api\/downtime_cycles\/cyc-002/, route => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ _id: 'cyc-002', game_phase: 'game' }) });
      }
      route.continue();
    });

    page.once('dialog', async dialog => dialog.accept());

    const rows = page.locator('#cycle-content table').last().locator('tbody tr');
    await rows.nth(1).locator('button[data-phase="game"]').click();
    await page.waitForTimeout(500);

    await expect(rows.nth(1).locator('button[data-phase="game"]')).toBeDisabled();
    await expect(rows.nth(1).locator('button[data-phase="downtime"]')).not.toBeDisabled();
    await expect(rows.nth(1).locator('button[data-phase="processing"]')).not.toBeDisabled();
  });
});
