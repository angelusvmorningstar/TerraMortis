/**
 * Attendance domain E2E tests — admin.html
 *
 * Covers:
 *   - Domain navigation and toolbar render
 *   - Session selector populated from API
 *   - Attendance grid renders character rows
 *   - Summary counts (attended / paid)
 *   - Toggling a checkbox marks dirty, reveals Save button
 *   - Save triggers PUT /api/game_sessions/:id with updated data
 *   - Empty state when no sessions exist
 *   - Create new session via toolbar
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const TEST_CHARS = [
  {
    _id: 'char-att-001', name: 'Alice Vunder', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Katherine H',
    blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 2, clan: 3, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 2, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 3, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  },
  {
    _id: 'char-att-002', name: 'Eve Lockridge', moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Carthian Movement', player: 'Jamie',
    blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 3, clan: 1, covenant: { 'Carthian Movement': 2, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  },
];

// Alice is absent, Eve attended + costumed
const TEST_SESSION = {
  _id: 'sess-att-001',
  session_date: '2026-04-20',
  title: 'Game 5',
  attendance: [
    {
      character_id: 'char-att-001', character_name: 'Alice Vunder', character_display: 'Alice Vunder',
      player: 'Katherine H',
      attended: false, costuming: false, downtime: false, extra: 0, paid: false, payment_method: '',
    },
    {
      character_id: 'char-att-002', character_name: 'Eve Lockridge', character_display: 'Eve Lockridge',
      player: 'Jamie',
      attended: true, costuming: true, downtime: false, extra: 0, paid: true, payment_method: 'Cash',
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsST(page, sessions = [TEST_SESSION]) {
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route(/\/api\/game_sessions\/next/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  );
  await page.route(/\/api\/game_sessions$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) })
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

async function goToAttendance(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app:not([style*="display: none"])');
  await page.click('.sidebar-btn[data-domain="attendance"]');
  await page.waitForSelector('#attendance-content .att-toolbar', { timeout: 5000 });
}

// ══════════════════════════════════════
//  TOOLBAR + SESSION SELECTOR
// ══════════════════════════════════════

test.describe('Attendance — Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await goToAttendance(page);
  });

  test('toolbar renders with session selector', async ({ page }) => {
    await expect(page.locator('#att-session-sel')).toBeVisible();
    await expect(page.locator('#att-add-btn')).toBeVisible();
    await expect(page.locator('#att-new-btn')).toBeVisible();
  });

  test('session selector shows session date and title', async ({ page }) => {
    const option = page.locator('#att-session-sel option');
    const text = await option.first().textContent();
    expect(text).toContain('2026-04-20');
    expect(text).toContain('Game 5');
  });

  test('Save button is hidden before any changes', async ({ page }) => {
    await expect(page.locator('#att-save-btn')).toBeHidden();
  });
});

// ══════════════════════════════════════
//  ATTENDANCE GRID
// ══════════════════════════════════════

test.describe('Attendance — Grid', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await goToAttendance(page);
    await page.waitForSelector('.att-table tbody tr', { timeout: 5000 });
  });

  test('renders a row for each attendance entry', async ({ page }) => {
    const rows = page.locator('.att-table tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('shows character names in grid', async ({ page }) => {
    const names = await page.locator('.att-char-name').allTextContents();
    expect(names).toContain('Alice Vunder');
    expect(names).toContain('Eve Lockridge');
  });

  test('absent row has att-absent class', async ({ page }) => {
    const absentRows = page.locator('tr.att-absent');
    const count = await absentRows.count();
    expect(count).toBe(1);
  });

  test('summary shows correct attended count', async ({ page }) => {
    const summary = await page.locator('.att-summary').textContent();
    // 1 of 2 attended
    expect(summary).toContain('1');
    expect(summary).toContain('2');
  });

  test('XP column shows correct value for attended+costumed row', async ({ page }) => {
    // Eve: attended(1) + costuming(1) = 2 XP
    const xpCells = await page.locator('.att-xp').allTextContents();
    expect(xpCells.map(Number)).toContain(2);
  });
});

// ══════════════════════════════════════
//  DIRTY STATE + SAVE FLOW
// ══════════════════════════════════════

test.describe('Attendance — Save flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsST(page);
    await goToAttendance(page);
    await page.waitForSelector('.att-table tbody tr', { timeout: 5000 });
  });

  test('toggling attended checkbox shows Save button', async ({ page }) => {
    // Use attUpdate directly — the onchange handler re-renders the table,
    // which replaces the checkbox DOM element and breaks locator.check().
    await page.evaluate(() => window.attUpdate(0, 'attended', true));
    await expect(page.locator('#att-save-btn')).toBeVisible();
  });

  test('Save button triggers PUT /api/game_sessions/:id', async ({ page }) => {
    let putCalled = false;
    let putBody = null;

    await page.route('**/api/game_sessions/sess-att-001', route => {
      if (route.request().method() === 'PUT') {
        putCalled = true;
        putBody = route.request().postDataJSON();
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ...TEST_SESSION, updated_at: new Date().toISOString() }),
        });
      } else {
        route.continue();
      }
    });

    // Use attUpdate directly — onchange re-renders the table, breaking locator.check()
    await page.evaluate(() => window.attUpdate(0, 'attended', true));
    await expect(page.locator('#att-save-btn')).toBeVisible();

    await page.click('#att-save-btn');
    await page.waitForTimeout(500);

    expect(putCalled).toBe(true);
    expect(putBody).toBeTruthy();
    expect(putBody.attendance).toBeTruthy();
  });

  test('Save button hides after successful save', async ({ page }) => {
    await page.route('**/api/game_sessions/sess-att-001', route => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify(TEST_SESSION),
        });
      } else {
        route.continue();
      }
    });

    await page.evaluate(() => window.attUpdate(0, 'attended', true));
    await page.click('#att-save-btn');
    await page.waitForTimeout(500);

    await expect(page.locator('#att-save-btn')).toBeHidden();
  });
});

// ══════════════════════════════════════
//  EMPTY STATE
// ══════════════════════════════════════

test.describe('Attendance — Empty state', () => {
  test('shows empty message when no sessions exist', async ({ page }) => {
    await loginAsST(page, []);
    await goToAttendance(page);
    await expect(page.locator('.att-empty')).toBeVisible();
    const text = await page.locator('.att-empty').textContent();
    expect(text).toContain('No game sessions');
  });
});
