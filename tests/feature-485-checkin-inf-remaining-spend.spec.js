/**
 * E2E — feature.485: Check-In INF remaining = total minus last-cycle spend
 *
 * AC1 — char with influence_spend in last closed cycle → shows (max - spent) / max
 * AC2 — char with no submission for last cycle → shows max / max
 * AC3 — char with submission but no influence_spend field (DT1 era) → shows max / max
 * AC4 — no closed cycle exists → shows max / max for all
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: 'test-st-001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-st-001', character_ids: [], is_dual_role: false,
};

const SESSION = {
  _id: 'sess-485-001',
  session_date: '2099-06-01',
  game_number: 5,
  attendance: [],
};

// calcTotalInfluence adds status.clan + status.covenant[covenant] directly (no merit calc needed).
// c-001: clan status 4 → infMax=4; spent 3 in last cycle → remaining=1
// c-002: clan status 5 → infMax=5; no submission → remaining=5
// c-003: clan status 3 → infMax=3; DT1 submission (no influence_spend) → 3
const TEST_CHARS = [
  {
    _id: 'c-001', name: 'Alice Char', player: 'Alice Player', retired: false,
    clan: 'Daeva', covenant: 'Invictus',
    status: { city: 0, clan: 4, covenant: {} },
    merits: [],
  },
  {
    _id: 'c-002', name: 'Bob Char', player: 'Bob Player', retired: false,
    clan: 'Gangrel', covenant: 'Circle of the Crone',
    status: { city: 0, clan: 5, covenant: {} },
    merits: [],
  },
  {
    _id: 'c-003', name: 'Carol Char', player: 'Carol Player', retired: false,
    clan: 'Mekhet', covenant: 'Carthian Movement',
    status: { city: 0, clan: 3, covenant: {} },
    merits: [],
  },
];

const CLOSED_CYCLE = { _id: 'cycle-closed-001', status: 'closed', cycle_number: 3 };
const OPEN_CYCLE   = { _id: 'cycle-open-001',   status: 'open',   cycle_number: 4 };

// c-001 spent 3 total (2 + 1 + 0)
const SUBMISSIONS_WITH_SPEND = [
  {
    _id: 'sub-001',
    character_id: 'c-001',
    cycle_id: 'cycle-closed-001',
    status: 'submitted',
    responses: {
      influence_spend: JSON.stringify({ the_harbour: 2, the_academy: 1, the_north_shore: 0 }),
    },
  },
];

// c-003 has a DT1-era submission with no influence_spend field
const SUBMISSIONS_DT1 = [
  {
    _id: 'sub-003',
    character_id: 'c-003',
    cycle_id: 'cycle-closed-001',
    status: 'submitted',
    responses: {}, // no influence_spend
  },
];

async function setup(page, {
  sessions = [SESSION],
  cycles = [CLOSED_CYCLE, OPEN_CYCLE],
  submissions = SUBMISSIONS_WITH_SPEND,
} = {}) {
  await page.addInitScript(({ user, chars }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    window.__TEST_CHARS__ = chars;
  }, { user: ST_USER, chars: TEST_CHARS });

  // Catch-all first (lowest priority)
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route('**/api/game_sessions', route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions[0] || {}) });
  });
  await page.route('**/api/characters**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS) })
  );
  await page.route('**/api/players/display-names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/downtime_cycles', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cycles) })
  );
  await page.route('**/api/downtime_submissions**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submissions) })
  );
  await page.route('**/api/st_mods**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#bnav', { timeout: 10000 });
  await page.locator('#n-signin').click();
  await page.waitForSelector('.si-row', { timeout: 8000 });
}

// ── AC1: char with influence_spend shows remaining/max ────────────────────────

test('AC1: char with 3 spent of 4 total shows 1/4 in INF display', async ({ page }) => {
  await setup(page);
  // c-001 has Allies 4 → infMax=4, spent=3 → remaining=1
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  await expect(aliceRow).toBeVisible();
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('1/4');
});

test('AC1: INF display format is remaining/max (not max/max) when spend exists', async ({ page }) => {
  await setup(page);
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  const text = await infSpan.textContent();
  // Should be "Inf 1/4" not "Inf 4/4"
  expect(text).not.toContain('4/4');
  expect(text).toContain('1/4');
});

// ── AC2: char with no submission shows max/max ────────────────────────────────

test('AC2: char with no submission shows max/max for INF', async ({ page }) => {
  await setup(page);
  // c-002 has Allies 5 → infMax=5, no submission → remaining=5
  const bobRow = page.locator('.si-row[data-char-id="c-002"]');
  await expect(bobRow).toBeVisible();
  const infSpan = bobRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('5/5');
});

// ── AC3: DT1-era submission (no influence_spend) shows max/max ────────────────

test('AC3: DT1 submission with no influence_spend shows max/max', async ({ page }) => {
  await setup(page, { submissions: SUBMISSIONS_DT1 });
  // c-003 has Allies 3 → infMax=3, DT1 sub has no influence_spend → remaining=3
  const carolRow = page.locator('.si-row[data-char-id="c-003"]');
  await expect(carolRow).toBeVisible();
  const infSpan = carolRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('3/3');
});

// ── AC4: no closed cycle → all chars show max/max ────────────────────────────

test('AC4: no closed cycle → all INF displays show max/max', async ({ page }) => {
  await setup(page, { cycles: [OPEN_CYCLE] }); // only open cycle, no closed
  // c-001 has Allies 4 → infMax=4, no closed cycle to derive spend → remaining=4
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  await expect(aliceRow).toBeVisible();
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('4/4');
});

test('AC4: no cycles at all → all INF displays show max/max', async ({ page }) => {
  await setup(page, { cycles: [] });
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('4/4');
});
