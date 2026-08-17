/**
 * E2E tests — Admin Cycle tab: Prep Access controls (CYCLE epic #708, story 4)
 * Covers: Prep Access button rendered, toggle expand/collapse, character list
 * pre-checked, PUT on toggle, revert on failure, button highlight state.
 */

const { test, expect } = require('@playwright/test');

// ── Test data ────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001',
  character_ids: [], is_dual_role: false,
};

const TEST_STORY_CYCLES = [
  { _id: 'sc-001', number: 1, label: 'Story One', created_at: '2026-01-01T00:00:00.000Z' },
];

// char-001: has out-of-window access on cyc-001
// char-002: does NOT have access
// char-003: retired (should not appear)
const TEST_CHARACTERS = [
  { _id: 'char-001', name: 'Alice Vane',  moniker: null, retired: false },
  { _id: 'char-002', name: 'Bob Crane',   moniker: null, retired: false },
  { _id: 'char-003', name: 'Charlie Daw', moniker: null, retired: true  },
];

const TEST_CYCLES = [
  {
    _id: 'cyc-001', label: 'DT 1', game_number: 1, game_phase: 'processing',
    story_cycle_id: 'sc-001', status: 'closed',
    out_of_window_player_ids: ['char-001'],
  },
  {
    _id: 'cyc-002', label: 'DT 2', game_number: 2, game_phase: null,
    story_cycle_id: null, status: 'active',
    out_of_window_player_ids: [],
  },
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARACTERS) })
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

async function mockCycleApis(page, { cycles = TEST_CYCLES, putStatus = 200 } = {}) {
  let currentCycles = cycles.map(c => ({ ...c }));

  await page.route(/\/api\/story_cycles$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_STORY_CYCLES) })
  );
  await page.route(/\/api\/story_cycles\//, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
  await page.route(/\/api\/chapters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentCycles) })
  );
  await page.route(/\/api\/chapters\/[^/]+$/, route => {
    if (route.request().method() === 'PUT') {
      const id = route.request().url().split('/').pop();
      if (putStatus !== 200) {
        return route.fulfill({ status: putStatus, contentType: 'application/json',
          body: JSON.stringify({ error: 'SERVER_ERROR' }) });
      }
      const body = JSON.parse(route.request().postData() || '{}');
      const cycle = currentCycles.find(c => c._id === id) || { _id: id };
      const updated = { ...cycle, ...body };
      const idx = currentCycles.findIndex(c => c._id === id);
      if (idx >= 0) currentCycles[idx] = updated;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Cycle tab — Prep Access: rendering', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('each cycle row renders a Prep Access button', async ({ page }) => {
    const rows = page.locator('#cycle-content table').last().locator('tbody tr:not([style*="display"])');
    // 2 cycles → 2 visible rows (detail rows are hidden)
    const prepBtns = page.locator('#cycle-content button', { hasText: 'Prep Access' });
    await expect(prepBtns).toHaveCount(2);
  });

  test('Prep Access button is visible and enabled', async ({ page }) => {
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await expect(btn).toBeVisible();
    await expect(btn).not.toBeDisabled();
  });
});

test.describe('Cycle tab — Prep Access: expand/collapse', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('clicking Prep Access expands the character list', async ({ page }) => {
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();
    // The detail row becomes visible — look for a checkbox inside the cycle table
    await expect(page.locator('#cycle-content table').last().locator('input[type="checkbox"]').first()).toBeVisible();
  });

  test('clicking Prep Access again collapses the list', async ({ page }) => {
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();
    await expect(page.locator('#cycle-content table').last().locator('input[type="checkbox"]').first()).toBeVisible();
    await btn.click();
    await expect(page.locator('#cycle-content table').last().locator('input[type="checkbox"]').first()).not.toBeVisible();
  });

  test('Prep Access button is gold-highlighted when open', async ({ page }) => {
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();
    const color = await btn.evaluate(el => el.style.color);
    expect(color).toMatch(/gold|rgb\(224, 196, 122\)/i);
  });

  test('retired characters are not shown in the list', async ({ page }) => {
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();
    // Charlie Daw is retired — should not appear
    const labels = page.locator('#cycle-content table').last().locator('label');
    await expect(labels.filter({ hasText: 'Charlie Daw' })).toHaveCount(0);
  });
});

test.describe('Cycle tab — Prep Access: pre-checked state', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('char-001 is pre-checked for cyc-001 (has access)', async ({ page }) => {
    // cyc-001 row is first; open its Prep Access
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();
    // Find the label for Alice Vane and check its checkbox
    const aliceLabel = page.locator('#cycle-content table').last().locator('label', { hasText: 'Alice Vane' }).first();
    const cb = aliceLabel.locator('input[type="checkbox"]');
    await expect(cb).toBeChecked();
  });

  test('char-002 is unchecked for cyc-001 (no access)', async ({ page }) => {
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();
    const bobLabel = page.locator('#cycle-content table').last().locator('label', { hasText: 'Bob Crane' }).first();
    const cb = bobLabel.locator('input[type="checkbox"]');
    await expect(cb).not.toBeChecked();
  });

  test('all characters unchecked for cyc-002 (empty access list)', async ({ page }) => {
    // cyc-002 is second row
    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).nth(1);
    await btn.click();
    const checkboxes = page.locator('#cycle-content table').last()
      .locator('tr:nth-child(4)').locator('input[type="checkbox"]');
    // All should be unchecked
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).not.toBeChecked();
    }
  });
});

test.describe('Cycle tab — Prep Access: toggle behaviour', () => {
  test('checking a character calls PUT with updated out_of_window_player_ids', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);

    let putBody = null;
    await page.route(/\/api\/chapters\/cyc-001/, route => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ _id: 'cyc-001', out_of_window_player_ids: putBody.out_of_window_player_ids }) });
      }
      route.continue();
    });

    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();

    // Uncheck Alice (char-001) — currently checked
    const aliceLabel = page.locator('#cycle-content table').last().locator('label', { hasText: 'Alice Vane' }).first();
    await aliceLabel.locator('input[type="checkbox"]').uncheck();
    await page.waitForTimeout(300);

    expect(putBody).not.toBeNull();
    expect(Array.isArray(putBody.out_of_window_player_ids)).toBe(true);
    expect(putBody.out_of_window_player_ids).not.toContain('char-001');
  });

  test('unchecking then re-checking adds the character back', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);

    const puts = [];
    await page.route(/\/api\/chapters\/cyc-002/, route => {
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        puts.push(body.out_of_window_player_ids);
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ _id: 'cyc-002', out_of_window_player_ids: body.out_of_window_player_ids }) });
      }
      route.continue();
    });

    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).nth(1);
    await btn.click();

    // Scope to the cyc-002 prep-access detail row.
    // tbody order: main1(0), prep1(1), attend1(2), main2(3), prep2(4), attend2(5)
    const cyc002Detail = page.locator('#cycle-content table').last().locator('tbody tr').nth(4);
    const bobLabel = cyc002Detail.locator('label', { hasText: 'Bob Crane' });
    const cb = bobLabel.locator('input[type="checkbox"]');
    await expect(cb).toBeVisible({ timeout: 3000 });
    await cb.check();
    await page.waitForTimeout(300);
    expect(puts[0]).toContain('char-002');

    await cb.uncheck();
    await page.waitForTimeout(300);
    expect(puts[1]).not.toContain('char-002');
  });

  test('checkbox reverts on API failure', async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page, { putStatus: 500 });
    await navigateToCycleTab(page);

    const btn = page.locator('#cycle-content button', { hasText: 'Prep Access' }).first();
    await btn.click();

    // Alice is checked; try to uncheck — should revert after 500
    const aliceLabel = page.locator('#cycle-content table').last().locator('label', { hasText: 'Alice Vane' }).first();
    const cb = aliceLabel.locator('input[type="checkbox"]');
    await cb.uncheck();
    await page.waitForTimeout(400);

    // Checkbox should be checked again (reverted)
    await expect(cb).toBeChecked();
  });
});
