/**
 * E2E — feature.483: Check-In roster-first rendering + New Session
 *
 * Covers:
 *   AC1 — Roster drives rows (all non-retired chars visible, with or without attendance entry)
 *   AC2 — Ticking an unattended char creates their entry and triggers autosave
 *   AC3 — Chars already in attendance retain their data (attended state)
 *   AC4 — No-session state shows "+ New Session" button
 *   AC5 — New session confirm dialog shows derived game number
 *   AC6 — Session header shows game number, date, attended/total from roster
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: 'test-st-483', username: 'test_st_483', global_name: 'Test ST 483',
  avatar: null, role: 'st', player_id: 'p-st-483', character_ids: [], is_dual_role: false,
};

// 4 chars: 3 non-retired, 1 retired.  Session attendance has only c-001.
const TEST_CHARS = [
  {
    _id: 'c-001', name: 'Alice Active', player: 'AliceP', retired: false,
    blood_potency: 1, humanity: 7, humanity_base: 7, moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Carthian Movement',
    status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 1 } },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  },
  {
    _id: 'c-002', name: 'Bob Active', player: 'BobP', retired: false,
    blood_potency: 1, humanity: 7, humanity_base: 7, moniker: null, honorific: null,
    clan: 'Daeva', covenant: 'Invictus',
    status: { city: 1, clan: 0, covenant: {} },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  },
  {
    _id: 'c-003', name: 'Carol Retired', player: 'CarolP', retired: true,
    blood_potency: 1, humanity: 7, humanity_base: 7, moniker: null, honorific: null,
    clan: 'Gangrel', covenant: 'Ordo Dracul',
    status: { city: 0, clan: 0, covenant: {} },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  },
  {
    _id: 'c-004', name: 'Dave Active', player: 'DaveP', retired: false,
    blood_potency: 1, humanity: 7, humanity_base: 7, moniker: null, honorific: null,
    clan: 'Ventrue', covenant: 'Invictus',
    status: { city: 1, clan: 1, covenant: {} },
    attributes: { Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  },
];

// c-001 is already in attendance (attended=true); c-002, c-004 have no entry
const TEST_SESSION = {
  _id: 'sess-483-001',
  session_date: '2026-05-23',
  game_number: 4,
  attendance: [
    {
      character_id: 'c-001', character_name: 'Alice Active', character_display: 'Alice Active',
      player: 'AliceP', attended: true, costuming: false, downtime: false, extra: 0,
      paid: false, payment: { method: 'cash', amount: 15 }, payment_method: 'cash',
    },
  ],
};

async function setup(page, sessions = [TEST_SESSION]) {
  // Register catch-all last so specific routes (registered later in test body) take precedence.
  await page.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/players/display-names', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(
        TEST_CHARS.filter(c => c.player).map(c => ({ character_id: String(c._id), display_name: c.player }))
      ),
    })
  );
  await page.route(/\/api\/game_sessions$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS) })
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );

  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#bnav', { timeout: 10000 });
}

async function goToCheckin(page) {
  await page.locator('#n-signin').click();
  await page.waitForSelector('.si-list', { timeout: 5000 });
}

// ── AC1: roster-first rendering ─────────────────────────────────────────────

test('feature.483/AC1: shows all non-retired chars (roster drives row count)', async ({ page }) => {
  await setup(page);
  await goToCheckin(page);
  // 3 non-retired chars (c-001, c-002, c-004); c-003 is retired — 3 rows expected
  await expect(page.locator('.si-row')).toHaveCount(3);
});

test('feature.483/AC1: char without attendance entry renders as unchecked row', async ({ page }) => {
  await setup(page);
  await goToCheckin(page);
  // c-002 (Bob) has no attendance entry; use .si-row prefix to avoid strict-mode clash with checkbox/select
  const row = page.locator('.si-row[data-char-id="c-002"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.si-att-chk')).not.toBeChecked();
});

test('feature.483/AC1: rows use data-char-id (not data-idx)', async ({ page }) => {
  await setup(page);
  await goToCheckin(page);
  // Roster-first keying: attribute is data-char-id, not data-idx
  const rows = page.locator('.si-row[data-char-id]');
  await expect(rows).toHaveCount(3);
  // Old data-idx attribute must not exist
  const oldRows = page.locator('.si-row[data-idx]');
  await expect(oldRows).toHaveCount(0);
});

// ── AC3: existing entries retain state ──────────────────────────────────────

test('feature.483/AC3: char with attended=true renders checked with si-attended class', async ({ page }) => {
  await setup(page);
  await goToCheckin(page);
  // c-001 (Alice) is in attendance with attended=true
  const row = page.locator('.si-row[data-char-id="c-001"]');
  await expect(row).toHaveClass(/si-attended/);
  await expect(row.locator('.si-att-chk')).toBeChecked();
});

// ── AC6: session header ──────────────────────────────────────────────────────

test('feature.483/AC6: session header shows game number', async ({ page }) => {
  await setup(page);
  await goToCheckin(page);
  await expect(page.locator('.si-session-label')).toContainText('Game 4');
});

test('feature.483/AC6: attended/total count uses roster length', async ({ page }) => {
  await setup(page);
  await goToCheckin(page);
  // 1 attended (Alice), 3 non-retired in roster
  await expect(page.locator('.si-stat')).toContainText('1 / 3');
});

// ── AC4/AC5: new session ─────────────────────────────────────────────────────

test('feature.483/AC4: no-session state shows + New Session button', async ({ page }) => {
  await setup(page, []);
  await page.locator('#n-signin').click();
  await page.waitForSelector('.si-new-session-btn', { timeout: 5000 });
  await expect(page.locator('.si-new-session-btn')).toContainText('+ New Session');
});

test('feature.483/AC5: new session confirm dialog shows game number', async ({ page }) => {
  await setup(page, [TEST_SESSION]); // one existing session with game_number 4
  // Override: re-add the sessions route (last registered wins) to simulate game 4 existing
  // so new session = game 5
  await page.route(/\/api\/game_sessions$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_SESSION]) })
  );

  // Temporarily switch to no-session state for the no-session render
  // but game_sessions GET still returns one session when queried by handleNewSession
  // => easier to test via an empty sessions setup
  await setup(page, []);
  await page.locator('#n-signin').click();
  await page.waitForSelector('.si-new-session-btn', { timeout: 5000 });

  let dialogMessage = '';
  page.on('dialog', async dialog => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });

  await page.locator('.si-new-session-btn').click();
  await page.waitForTimeout(300);
  expect(dialogMessage).toContain('Game 1');
});

// ── AC2: upsert-on-tick ──────────────────────────────────────────────────────

test('feature.483/AC2: ticking unattended char triggers PUT with new entry', async ({ page }) => {
  await setup(page);

  let savedBody = null;
  await page.route('**/api/game_sessions/sess-483-001', async route => {
    if (route.request().method() === 'PUT') {
      savedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...TEST_SESSION, ...savedBody }),
      });
    } else {
      await route.continue();
    }
  });

  await goToCheckin(page);

  // Watch for the PUT before clicking (waitForResponse must be set up first)
  const putDone = page.waitForResponse(
    res => res.url().includes('/api/game_sessions/sess-483-001') && res.request().method() === 'PUT',
    { timeout: 4000 }
  );

  // Tick Bob (c-002) who has no existing attendance entry
  await page.locator('.si-att-chk[data-char-id="c-002"]').check();

  // Wait for the 800ms autosave debounce to fire and the PUT to complete
  await putDone;

  expect(savedBody).not.toBeNull();
  const newEntry = (savedBody.attendance || []).find(a => String(a.character_id) === 'c-002');
  expect(newEntry).toBeTruthy();
  expect(newEntry.attended).toBe(true);
  expect(newEntry.character_name).toBe('Bob Active');
});
