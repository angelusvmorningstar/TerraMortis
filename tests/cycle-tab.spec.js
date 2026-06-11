/**
 * E2E tests — Admin Cycle tab shell (CYCLE epic #708, story 2)
 * Covers: sidebar nav, chapters panel (list/create/delete), cycles panel.
 */

const { test, expect } = require('@playwright/test');

// ── Test data ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001',
  character_ids: [], is_dual_role: false,
};

const TEST_CHARS = [
  {
    _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H',
    blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
    retired: false,
    status: { city: 2, clan: 3, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 2, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 3, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
  },
];

const TEST_CHAPTERS = [
  { _id: 'ch-001', number: 1, label: 'Chapter One: Blood and Shadows', created_at: '2026-01-01T00:00:00.000Z' },
  { _id: 'ch-002', number: 2, label: 'Chapter Two: The Price of Power', created_at: '2026-03-01T00:00:00.000Z' },
];

const TEST_CYCLES = [
  { _id: 'cyc-001', label: 'DT 1', game_number: 1, game_phase: 'processing', chapter_id: 'ch-001', status: 'closed' },
  { _id: 'cyc-002', label: 'DT 2', game_number: 2, game_phase: null, chapter_id: null, status: 'active' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsST(page) {
  // Catch-all first so no unmocked boot call escapes.
  await page.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);
}

/** Register chapter + cycle mocks for the cycle tab (LIFO — overrides catch-all). */
async function mockCycleApis(page, {
  chapters = TEST_CHAPTERS,
  cycles = TEST_CYCLES,
  postChapterResponse = { _id: 'ch-003', number: 3, label: 'Chapter Three', created_at: '2026-06-11T00:00:00.000Z' },
  deleteResponse = { deleted: true },
  deleteStatus = 200,
} = {}) {
  // chapters collection-level: GET list + POST create
  await page.route(/\/api\/chapters$/, route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(postChapterResponse) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chapters) });
    }
  });
  // chapters document-level: DELETE /:id
  await page.route(/\/api\/chapters\//, route => {
    route.fulfill({ status: deleteStatus, contentType: 'application/json', body: JSON.stringify(deleteResponse) });
  });
  // downtime_cycles: override catch-all with phase-tagged data
  await page.route(/\/api\/downtime_cycles$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cycles) })
  );
}

async function navigateToCycleTab(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.click('.sidebar-btn[data-domain="cycle"]');
  await expect(page.locator('#d-cycle')).toHaveClass(/active/);
  // Wait until loading placeholder is gone
  await page.waitForFunction(() => {
    const el = document.getElementById('cycle-content');
    return el && !el.textContent.includes('Loading');
  }, { timeout: 5000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Admin — Cycle Tab: navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
  });

  test('Cycle sidebar button is visible', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await expect(page.locator('.sidebar-btn[data-domain="cycle"]')).toBeVisible();
  });

  test('clicking Cycle activates the cycle domain section', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('.sidebar-btn[data-domain="cycle"]');
    await expect(page.locator('#d-cycle')).toHaveClass(/active/);
    await expect(page.locator('#d-player')).not.toHaveClass(/active/);
  });

  test('Cycle button is positioned between Downtime and Ordeals in sidebar', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    const buttons = page.locator('.sidebar-btn[data-domain]');
    const domains = await buttons.evaluateAll(els => els.map(el => el.dataset.domain));
    const dtIdx    = domains.indexOf('downtime');
    const cycleIdx = domains.indexOf('cycle');
    const ordIdx   = domains.indexOf('ordeals');
    expect(cycleIdx).toBeGreaterThan(dtIdx);
    expect(ordIdx).toBeGreaterThan(cycleIdx);
  });
});

test.describe('Admin — Cycle Tab: Chapters panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('renders Chapters heading', async ({ page }) => {
    await expect(page.locator('#cycle-content')).toContainText('Chapters');
  });

  test('lists chapter rows sorted by number', async ({ page }) => {
    const rows = page.locator('#cycle-content table').first().locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Chapter One: Blood and Shadows');
    await expect(rows.nth(1)).toContainText('Chapter Two: The Price of Power');
  });

  test('"+ New Chapter" button is visible', async ({ page }) => {
    await expect(page.locator('#cycle-content button', { hasText: '+ New Chapter' })).toBeVisible();
  });

  test('"+ New Chapter" reveals inline form with number and label fields', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Chapter")');
    await expect(page.locator('#new-ch-num')).toBeVisible();
    await expect(page.locator('#new-ch-label')).toBeVisible();
    await expect(page.locator('#new-ch-save')).toBeVisible();
  });

  test('Cancel hides the inline form', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Chapter")');
    await page.click('#new-ch-cancel');
    await expect(page.locator('#new-ch-num')).not.toBeVisible();
    await expect(page.locator('#cycle-content button:has-text("+ New Chapter")')).toBeVisible();
  });

  test('saving a new chapter posts to API and adds it to the list', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Chapter")');
    await page.fill('#new-ch-num', '3');
    await page.fill('#new-ch-label', 'Chapter Three');
    await page.click('#new-ch-save');
    // Form closes and new row appears
    await expect(page.locator('#new-ch-num')).not.toBeVisible();
    await expect(page.locator('#cycle-content')).toContainText('Chapter Three');
  });

  test('saving with empty fields shows validation message', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Chapter")');
    await page.click('#new-ch-save');
    await expect(page.locator('#cycle-content')).toContainText('required');
  });

  test('deleting a chapter removes it from the list', async ({ page }) => {
    // First row delete button
    const deleteBtn = page.locator('#cycle-content table').first().locator('tbody tr').first().locator('button');
    await deleteBtn.click();
    await page.waitForTimeout(200);
    // Row gone from chapters table (first table); cycles panel may still reference the chapter label
    await expect(page.locator('#cycle-content table').first()).not.toContainText('Chapter One: Blood and Shadows');
  });

  test('409 CHAPTER_IN_USE on delete shows human-readable error', async ({ page }) => {
    // Override delete to return 409
    await page.route(/\/api\/chapters\//, route =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'CHAPTER_IN_USE', message: 'Chapter is linked to 1 downtime cycle(s) — remove the link first.', linked_cycles: 1 }),
      })
    );
    const deleteBtn = page.locator('#cycle-content table').first().locator('tbody tr').first().locator('button');
    await deleteBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#cycle-content')).toContainText('linked to cycle');
  });
});

test.describe('Admin — Cycle Tab: Game Cycles panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('renders Game Cycles heading', async ({ page }) => {
    await expect(page.locator('#cycle-content')).toContainText('Game Cycles');
  });

  test('lists cycle labels', async ({ page }) => {
    await expect(page.locator('#cycle-content')).toContainText('DT 1');
    await expect(page.locator('#cycle-content')).toContainText('DT 2');
  });

  test('shows human-readable phase labels', async ({ page }) => {
    // cyc-001 has game_phase: 'processing' → 'Processing'
    await expect(page.locator('#cycle-content')).toContainText('Processing');
    // cyc-002 has game_phase: null → 'legacy'
    await expect(page.locator('#cycle-content')).toContainText('legacy');
  });

  test('shows linked chapter label for cycle with chapter_id', async ({ page }) => {
    // cyc-001 is linked to ch-001 ('Chapter One: Blood and Shadows')
    await expect(page.locator('#cycle-content')).toContainText('Chapter One: Blood and Shadows');
  });

  test('shows dash for cycle with no chapter', async ({ page }) => {
    // cyc-002 has chapter_id: null → '—'
    await expect(page.locator('#cycle-content')).toContainText('—');
  });
});

test.describe('Admin — Cycle Tab: error handling', () => {
  test('shows error message if API fetch fails', async ({ page }) => {
    await loginAsST(page);
    // Override chapters route to fail AFTER loginAsST (takes LIFO priority)
    await page.route(/\/api\/chapters$/, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'SERVER_ERROR' }) })
    );
    await page.route(/\/api\/downtime_cycles$/, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app:not([style*="display: none"])');
    await page.click('.sidebar-btn[data-domain="cycle"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('cycle-content');
      return el && (el.textContent.toLowerCase().includes('failed') || el.textContent.toLowerCase().includes('error'));
    }, { timeout: 5000 });
    await expect(page.locator('#cycle-content')).toContainText(/failed|error/i);
  });
});
