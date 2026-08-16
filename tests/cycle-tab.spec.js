/**
 * E2E tests — Admin Cycle tab shell (CYCLE epic #708, story 2)
 * Covers: sidebar nav, stories panel (list/create/delete), cycles panel.
 * cm-2: the collection behind this panel is `story_cycles`, served at
 * /api/story_cycles, and the UI chrome says Story rather than Chapter.
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

const TEST_STORY_CYCLES = [
  { _id: 'sc-001', number: 1, label: 'Story One: Blood and Shadows', created_at: '2026-01-01T00:00:00.000Z' },
  { _id: 'sc-002', number: 2, label: 'Story Two: The Price of Power', created_at: '2026-03-01T00:00:00.000Z' },
];

const TEST_CYCLES = [
  { _id: 'cyc-001', label: 'DT 1', game_number: 1, game_phase: 'processing', story_cycle_id: 'sc-001', status: 'closed' },
  { _id: 'cyc-002', label: 'DT 2', game_number: 2, game_phase: null, story_cycle_id: null, status: 'active' },
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

/** Register story cycle + cycle mocks for the cycle tab (LIFO — overrides catch-all). */
async function mockCycleApis(page, {
  storyCycles = TEST_STORY_CYCLES,
  cycles = TEST_CYCLES,
  postStoryCycleResponse = { _id: 'sc-003', number: 3, label: 'Story Three', created_at: '2026-06-11T00:00:00.000Z' },
  deleteResponse = { deleted: true },
  deleteStatus = 200,
} = {}) {
  // story_cycles collection-level: GET list + POST create
  await page.route(/\/api\/story_cycles$/, route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(postStoryCycleResponse) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storyCycles) });
    }
  });
  // story_cycles document-level: DELETE /:id
  await page.route(/\/api\/story_cycles\//, route => {
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

test.describe('Admin — Cycle Tab: Stories panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await mockCycleApis(page);
    await navigateToCycleTab(page);
  });

  test('renders Stories heading', async ({ page }) => {
    await expect(page.locator('#cycle-content')).toContainText('Stories');
  });

  test('lists story cycle rows sorted by number', async ({ page }) => {
    const rows = page.locator('#cycle-content table').first().locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Story One: Blood and Shadows');
    await expect(rows.nth(1)).toContainText('Story Two: The Price of Power');
  });

  test('"+ New Story" button is visible', async ({ page }) => {
    await expect(page.locator('#cycle-content button', { hasText: '+ New Story' })).toBeVisible();
  });

  test('"+ New Story" reveals inline form with number and label fields', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Story")');
    await expect(page.locator('#new-sc-num')).toBeVisible();
    await expect(page.locator('#new-sc-label')).toBeVisible();
    await expect(page.locator('#new-sc-save')).toBeVisible();
  });

  test('Cancel hides the inline form', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Story")');
    await page.click('#new-sc-cancel');
    await expect(page.locator('#new-sc-num')).not.toBeVisible();
    await expect(page.locator('#cycle-content button:has-text("+ New Story")')).toBeVisible();
  });

  test('saving a new story cycle posts to API and adds it to the list', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Story")');
    await page.fill('#new-sc-num', '3');
    await page.fill('#new-sc-label', 'Story Three');
    await page.click('#new-sc-save');
    // Form closes and new row appears
    await expect(page.locator('#new-sc-num')).not.toBeVisible();
    await expect(page.locator('#cycle-content')).toContainText('Story Three');
  });

  test('saving with empty fields shows validation message', async ({ page }) => {
    await page.click('#cycle-content button:has-text("+ New Story")');
    await page.click('#new-sc-save');
    await expect(page.locator('#cycle-content')).toContainText('required');
  });

  test('deleting a story cycle removes it from the list', async ({ page }) => {
    // First row delete button
    const deleteBtn = page.locator('#cycle-content table').first().locator('tbody tr').first().locator('button');
    await deleteBtn.click();
    await page.waitForTimeout(200);
    // Row gone from the stories table (first table); the cycles panel may still
    // reference the story label
    await expect(page.locator('#cycle-content table').first()).not.toContainText('Story One: Blood and Shadows');
  });

  test('409 STORY_CYCLE_IN_USE on delete shows human-readable error', async ({ page }) => {
    // Override delete to return 409
    await page.route(/\/api\/story_cycles\//, route =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'STORY_CYCLE_IN_USE', message: 'Story cycle is linked to 1 downtime cycle(s) — remove the link first.', linked_cycles: 1 }),
      })
    );
    const deleteBtn = page.locator('#cycle-content table').first().locator('tbody tr').first().locator('button');
    await deleteBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#cycle-content')).toContainText('linked to cycle');
  });

  // cm-2 review (P4). Before the rename the server's other refusals were
  // "Chapter not found" / "Invalid chapter ID format", so the client's
  // `err.message.includes('cycle')` heuristic could only match the 409. The
  // reworded messages are "Story cycle not found" / "Invalid story cycle ID
  // format" — both contain 'cycle'. Two STs, one deletes a Story, the other
  // clicks delete on the now-gone row: a 404 was being reported as "linked to
  // cycle(s)", the exact opposite of the truth.
  test('404 NOT_FOUND on delete does NOT claim the story is in use', async ({ page }) => {
    await page.route(/\/api\/story_cycles\//, route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'NOT_FOUND', message: 'Story cycle not found' }),
      })
    );
    const deleteBtn = page.locator('#cycle-content table').first().locator('tbody tr').first().locator('button');
    await deleteBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#cycle-content')).not.toContainText('linked to cycle');
    await expect(page.locator('#cycle-content')).toContainText('Delete failed: Story cycle not found');
  });

  // Same heuristic, the other reworded message.
  test('400 invalid-ID on delete does NOT claim the story is in use', async ({ page }) => {
    await page.route(/\/api\/story_cycles\//, route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid story cycle ID format' }),
      })
    );
    const deleteBtn = page.locator('#cycle-content table').first().locator('tbody tr').first().locator('button');
    await deleteBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#cycle-content')).not.toContainText('linked to cycle');
    await expect(page.locator('#cycle-content')).toContainText('Delete failed: Invalid story cycle ID format');
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

  // cm-2 review (P13a). The previous form of this test asserted that
  // '#cycle-content' contained the story label somewhere on the page — which it
  // does regardless, because the Stories table lists it. It could not fail if
  // the cycle-to-story link never rendered. Scoped to cyc-001's OWN row.
  test('shows linked story in the cycle row own select', async ({ page }) => {
    const row = page.locator('#cycle-content tr', { hasText: 'DT 1' }).first();
    const select = row.locator('select.cy-story-cycle-select');
    await expect(select).toHaveValue('sc-001');
    await expect(select.locator('option:checked')).toContainText('Story One: Blood and Shadows');
  });

  // cm-2 review (P13b). The previous form asserted '#cycle-content' contained
  // an em-dash — but every story-cycle select renders a permanent
  // '— none —' option, so the character is on the page whatever this cycle's
  // link is. Scoped to cyc-002's own select, and paired with the opposite
  // assertion on the linked row so it discriminates.
  test('shows the none option selected for a cycle with no story cycle', async ({ page }) => {
    const unlinked = page.locator('#cycle-content tr', { hasText: 'DT 2' }).first()
      .locator('select.cy-story-cycle-select');
    await expect(unlinked).toHaveValue('');
    await expect(unlinked.locator('option:checked')).toHaveText(/none/);

    const linked = page.locator('#cycle-content tr', { hasText: 'DT 1' }).first()
      .locator('select.cy-story-cycle-select');
    await expect(linked).not.toHaveValue('');
    await expect(linked.locator('option:checked')).not.toHaveText(/none/);
  });
});

test.describe('Admin — Cycle Tab: error handling', () => {
  test('shows error message if API fetch fails', async ({ page }) => {
    await loginAsST(page);
    // Override the story_cycles route to fail AFTER loginAsST (takes LIFO priority)
    await page.route(/\/api\/story_cycles$/, route =>
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
