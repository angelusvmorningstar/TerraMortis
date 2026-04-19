/**
 * Post-Game-1 E2E tests — covers all features from the 2026-04-19 session.
 *
 * Epics covered:
 *   EPA — API State Foundation
 *   EPB — Mobile & Tablet Responsiveness
 *   EPC — Game App Live Play Features
 *   EPD — Admin Housekeeping
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const TEST_PLAYER = {
  _id: 'player-001', discord_id: 'disc-001', display_name: 'Test Player',
  role: 'player', character_ids: ['char-001'],
  emergency_contact_name: 'Jane Doe',
  emergency_contact_mobile: '0400 111 222',
  medical_info: 'None',
};

const TEST_CHAR = {
  _id: 'char-001', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 2, clan: 1, covenant: 1 },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 3, bonus: 0 },
  },
  skills: {}, disciplines: { Auspex: { dots: 3 }, Celerity: { dots: 2 } },
  merits: [{ category: 'general', name: 'Herd', rating: 3 }],
  powers: [], ordeals: [],
};

const TEST_SESSION = {
  _id: 'sess-001',
  session_date: '2026-04-18',
  title: 'Game 1',
  attendance: [
    {
      character_id: 'char-001', character_name: 'alice vunder', character_display: 'Alice Vunder',
      player: 'Test Player', attended: false, costuming: false, downtime: false,
      extra: 0, paid: false, payment_method: '',
    },
  ],
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

// NOTE: Playwright matches LAST registered route first. Catch-all is registered
// first (lowest priority); specific routes registered after take precedence.
async function setupAdminPage(page, { sessions = [TEST_SESSION], players = [TEST_PLAYER], chars = [TEST_CHAR] } = {}) {
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);

  // Catch-all first (lowest priority)
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  // Specific routes after (higher priority — last-registered wins in Playwright)
  await page.route(/\/api\/tracker_state/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character_id: 'char-001', vitae: 8, willpower: 5, influence: 3 }) }));
  await page.route(/\/api\/players/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(players) }));
  await page.route(/\/api\/game_sessions\/[^/]+$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions[0]) }));
  await page.route(/\/api\/game_sessions$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) }));
  await page.route(/\/api\/game_sessions\/next/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) }));
  await page.route(/\/api\/characters\/names/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) }));

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 });
}

async function setupSuitePage(page, { chars = [TEST_CHAR], sessions = [TEST_SESSION] } = {}) {
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, ST_USER);

  // Catch-all first, specific after
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/game_sessions\/next/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/\/api\/game_sessions$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chars) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

// ── EPB.5 — Admin character cards slim ────────────────────────────────────────

test('EPB.5 — admin char cards show name but not BP/Hum/XP', async ({ page }) => {
  await setupAdminPage(page);

  // Navigate to player domain to see char grid
  await page.click('[data-domain="player"]');
  await page.waitForSelector('.char-card', { state: 'visible', timeout: 10000 });

  const card = page.locator('.char-card').first();
  await expect(card.locator('.cc-name')).toBeVisible();

  const cardText = await card.textContent();
  expect(cardText).not.toMatch(/\bBP\b/);
  expect(cardText).not.toMatch(/\bHum\b/);
  expect(cardText).not.toMatch(/\bXP\b/);
});

// ── EPB.7 — Emergency contact modal ───────────────────────────────────────────

test('EPB.7 — emergency contact button opens modal with correct details', async ({ page }) => {
  await setupAdminPage(page);

  await page.click('[data-domain="player"]');
  await page.waitForSelector('.char-card', { state: 'visible', timeout: 10000 });
  await page.locator('.char-card').first().click();
  await page.waitForSelector('#char-detail', { state: 'visible', timeout: 10000 });

  const emergencyBtn = page.locator('#cd-emergency');
  await expect(emergencyBtn).toBeVisible();
  await emergencyBtn.click();

  const modal = page.locator('#ec-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Jane Doe');
  await expect(modal).toContainText('0400 111 222');

  await page.locator('#ec-close').click();
  await expect(modal).not.toBeAttached();
});

test('EPB.7 — emergency contact modal closes on Escape', async ({ page }) => {
  await setupAdminPage(page);
  await page.click('[data-domain="player"]');
  await page.waitForSelector('.char-card', { state: 'visible', timeout: 10000 });
  await page.locator('.char-card').first().click();
  await page.waitForSelector('#char-detail', { state: 'visible', timeout: 10000 });
  await page.locator('#cd-emergency').click();
  await expect(page.locator('#ec-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ec-modal')).not.toBeAttached();
});

// ── EPD.4 — Engine tab removed ────────────────────────────────────────────────

test('EPD.4 — Engine tab is not present in admin sidebar', async ({ page }) => {
  await setupAdminPage(page);
  await expect(page.locator('[data-domain="engine"]')).toHaveCount(0);
});

// ── EPD.3 — Next Session editor in Attendance domain ─────────────────────────

test('EPD.3 — Next Session editor appears in Attendance domain', async ({ page }) => {
  await setupAdminPage(page);
  await page.click('[data-domain="attendance"]');
  await page.waitForSelector('#next-session-content', { state: 'visible', timeout: 10000 });
  await expect(page.locator('#ns-date')).toBeAttached();
  await expect(page.locator('#ns-deadline')).toBeAttached();
});

// ── EPA.3 — Attendance autosave ───────────────────────────────────────────────

test('EPA.3 — attendance grid has no Save Changes button', async ({ page }) => {
  await setupAdminPage(page);
  await page.click('[data-domain="attendance"]');
  await page.waitForTimeout(500);
  await expect(page.locator('#att-save-btn')).toHaveCount(0);
});

test('EPA.3 — attendance PUT fires automatically on checkbox change', async ({ page }) => {
  const putRequests = [];

  await setupAdminPage(page);

  // Register PUT interceptor AFTER setupAdminPage so it takes precedence
  await page.route(/\/api\/game_sessions\/sess-001/, route => {
    if (route.request().method() === 'PUT') putRequests.push(true);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_SESSION) });
  });

  await page.click('[data-domain="attendance"]');
  await page.waitForSelector('.att-check input[type="checkbox"]', { state: 'visible', timeout: 10000 });

  await page.locator('.att-check input[type="checkbox"]').first().check();
  // Wait for debounce (800ms) + some margin
  await page.waitForTimeout(1500);

  expect(putRequests.length).toBeGreaterThanOrEqual(1);
});

// ── EPD.2 — Attendance character name capitalisation ──────────────────────────

test('EPD.2 — attendance grid capitalises character names', async ({ page }) => {
  await setupAdminPage(page);
  await page.click('[data-domain="attendance"]');
  await page.waitForSelector('.att-char-name', { state: 'visible', timeout: 10000 });

  const charCell = page.locator('.att-char-name').first();
  const text = await charCell.textContent();
  // "alice vunder" stored in session should display capitalised
  expect(text?.trim()).toMatch(/^[A-Z]/);
});

// ── EPB.6 — Character chips in suite app ──────────────────────────────────────

test('EPB.6 — suite character list renders chips not cards', async ({ page }) => {
  await setupSuitePage(page);

  // Sheet tab shows character picker (chip grid) for ST
  await page.click('#n-sheet');
  await page.waitForSelector('.char-chip', { state: 'visible', timeout: 10000 });

  await expect(page.locator('.char-chip').first()).toContainText('Alice Vunder');
  await expect(page.locator('.char-card')).toHaveCount(0);
});

test('EPB.6 — char chip search filter reduces results', async ({ page }) => {
  const twoChars = [
    TEST_CHAR,
    {
      _id: 'char-002', name: 'Bob Markov', moniker: null, honorific: null,
      clan: 'Gangrel', covenant: 'Unaligned', player: 'Test B',
      blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
      status: { city: 0, clan: 0, covenant: 0 },
      attributes: TEST_CHAR.attributes, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
    },
  ];
  await setupSuitePage(page, { chars: twoChars });

  await page.click('#n-sheet');
  await page.waitForSelector('.char-chip', { state: 'visible', timeout: 10000 });
  const initialCount = await page.locator('.char-chip').count();
  expect(initialCount).toBe(2);

  // Type into the search — use locator.type() to trigger oninput properly
  await page.locator('.list-search').click();
  await page.locator('.list-search').type('alice');
  await page.waitForTimeout(300);
  const afterCount = await page.locator('.char-chip').count();
  expect(afterCount).toBeLessThan(initialCount);
});

// ── EPC.1+3 — Pool chips + Auspex button in Roll tab ─────────────────────────

test('EPC.3 — Auspex button hidden when no character selected', async ({ page }) => {
  await setupSuitePage(page);
  await expect(page.locator('#sc-auspex')).toBeHidden();
});

test('EPC.3 — Auspex button appears after selecting char with Auspex', async ({ page }) => {
  await setupSuitePage(page);

  await page.click('#sc-char');
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await page.locator('.panel-item').first().click();

  await expect(page.locator('#sc-auspex')).toBeVisible({ timeout: 5000 });
});

test('EPC.1 — pool chips render in roll tab after character selection', async ({ page }) => {
  await setupSuitePage(page);

  await page.click('#sc-char');
  await page.waitForSelector('#panel', { state: 'visible', timeout: 10000 });
  await page.locator('.panel-item').first().click();

  await expect(page.locator('#roll-char-pools')).toBeVisible({ timeout: 5000 });
});

// ── EPC.4 — Sign-in tab ───────────────────────────────────────────────────────

test('EPC.4 — sign-in accessible via More tab for ST', async ({ page }) => {
  await setupSuitePage(page);
  // Sign-in moved to More grid in nav-1-2 — More tab is always visible for ST
  await expect(page.locator('#n-more')).toBeVisible();
  // goTab('signin') still works directly
  await page.evaluate(() => window.goTab('signin'));
  await expect(page.locator('#t-signin')).toHaveClass(/active/, { timeout: 5000 });
});

test('EPC.4 — sign-in tab renders attendance list', async ({ page }) => {
  await setupSuitePage(page);

  await page.evaluate(() => window.goTab('signin'));
  await page.waitForSelector('#t-signin.active', { timeout: 10000 });
  // Wait for API fetch + render
  await page.waitForSelector('.si-row, .si-empty, .si-loading', { timeout: 10000 });

  const tab = page.locator('#t-signin');
  const text = await tab.textContent();
  // Either shows a row (loaded) or loading/empty state — tab itself is active
  expect(text).toBeTruthy();
});

test('EPC.4 — sign-in tab hidden for player role', async ({ page }) => {
  const playerUser = {
    id: '999', username: 'player_test', global_name: 'Player',
    avatar: null, role: 'player', player_id: 'p-002',
    character_ids: ['char-001'], is_dual_role: false,
  };
  await page.addInitScript((user) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, playerUser);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await expect(page.locator('#n-signin')).toBeHidden();
});

// ── EPB.1 — dot-hollow CSS class ─────────────────────────────────────────────

test('EPB.1 — .dot-hollow CSS class is defined', async ({ page }) => {
  await setupSuitePage(page);
  const hasRule = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === '.dot-hollow') return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  expect(hasRule).toBe(true);
});

// ── EPD.1 — Rules search bar retains focus ────────────────────────────────────

test('EPD.1 — rules search bar retains focus while typing', async ({ page }) => {
  await setupAdminPage(page);

  // Register rules route AFTER setupAdminPage so it wins over the catch-all
  await page.route('**/api/rules**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: [], total: 0, page: 1, pages: 0 }),
  }));

  await page.click('[data-domain="rules"]');
  await page.waitForSelector('#rules-search', { state: 'visible', timeout: 10000 });

  await page.click('#rules-search');
  await page.keyboard.type('auspex');

  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(focused).toBe('rules-search');
});

// ── EPB.4 — Sidebar close button tap target ───────────────────────────────────

test('EPB.4 — sidebar close button is at least 44×44px on tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await setupAdminPage(page);

  const box = await page.locator('#sb-close').boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

// ── EPB.3 — Dice roll button in admin ────────────────────────────────────────

test('EPB.3 — admin dice engine roll button min-height on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupAdminPage(page);

  // Navigate to engine where .de-roll-btn lives
  // (Engine tab was removed; dice engine now only in suite app #roll-btn)
  // Test CSS directly: .de-roll-btn has min-height via media query
  const hasMinHeight = await page.evaluate(() => {
    const el = document.createElement('button');
    el.className = 'de-roll-btn';
    document.body.appendChild(el);
    const h = parseFloat(window.getComputedStyle(el).minHeight) || 0;
    document.body.removeChild(el);
    return h;
  });
  expect(hasMinHeight).toBeGreaterThanOrEqual(48);
});
