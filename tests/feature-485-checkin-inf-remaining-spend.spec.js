/**
 * E2E — feature.485: Check-In INF remaining = total minus last-cycle spend
 *
 * AC1 — char with influence_spend in last closed cycle → shows (max - spent) / max
 * AC2 — char with no submission for last cycle → shows max / max
 * AC3 — char with submission but no influence_spend field (DT1 era) → shows max / max
 * AC4 — no closed cycle exists → shows max / max for all
 * Regression — most-recent cycle is chosen by game_number, not array order
 *   (live DT1 was re-imported with a newer _id than DT3, breaking .find()).
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

const CLOSED_CYCLE = { _id: 'cycle-closed-001', status: 'closed', game_number: 3 };
const OPEN_CYCLE   = { _id: 'cycle-open-001',   status: 'open',   game_number: 4 };

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
  await page.route('**/api/downtime_submissions**', route => {
    // Mirror the real endpoint: scope returned submissions to ?cycle_id=.
    const cid = new URL(route.request().url()).searchParams.get('cycle_id');
    const body = cid
      ? submissions.filter(s => String(s.cycle_id) === cid)
      : submissions;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
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

// ── AC1 variant: cycle with status='game' (live DT3 pattern) ─────────────────

test('AC1 live: cycle with status "game" is treated as a past cycle (not skipped)', async ({ page }) => {
  const gameCycle = { _id: 'cycle-game-001', status: 'game', game_number: 3 };
  await setup(page, {
    cycles: [gameCycle, OPEN_CYCLE],
    submissions: SUBMISSIONS_WITH_SPEND.map(s => ({ ...s, cycle_id: 'cycle-game-001' })),
  });
  // c-001 spent 3 of 4 → remaining = 1
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('1/4');
});

// ── Regression: most-recent cycle chosen by game_number, not array order ─────
// Live bug — the cycles API sorts by _id desc, but DT1 was re-imported and got
// a newer _id than DT3. The stale DT1 therefore appeared first in the array and
// .find() grabbed it; its CSV submissions carry no influence_spend, so every
// character wrongly showed max/max. Fix orders cycles on game_number.

test('regression: spend resolves from highest game_number cycle, not array order', async ({ page }) => {
  const dt1 = { _id: 'cycle-dt1', status: 'closed', game_number: 1 };
  const dt3 = { _id: 'cycle-dt3', status: 'game',   game_number: 3 };
  await setup(page, {
    // dt3 (the genuine most-recent cycle) deliberately placed AFTER dt1,
    // reproducing the broken _id-desc ordering from the live data.
    cycles: [dt1, dt3, OPEN_CYCLE],
    submissions: [
      { _id: 'sub-dt3', character_id: 'c-001', cycle_id: 'cycle-dt3', status: 'submitted',
        responses: { influence_spend: JSON.stringify({ the_harbour: 3 }) } },
    ],
  });
  // c-001 infMax=4; spend (3) lives only in dt3. If dt1 were picked, the
  // cycle-scoped submissions fetch returns [] and INF wrongly shows 4/4.
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('1/4');
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

// ── Regression: V and WP still show max/max ──────────────────────────────────

test('regression: V and WP resource displays still show max/max after INF change', async ({ page }) => {
  await setup(page);
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  await expect(aliceRow).toBeVisible();
  // V and WP are unchanged — they always show max/max
  const vSpan = aliceRow.locator('.si-res-lbl:text("V")').locator('..');
  const wpSpan = aliceRow.locator('.si-res-lbl:text("WP")').locator('..');
  await expect(vSpan).toBeVisible();
  await expect(wpSpan).toBeVisible();
  const vText = await vSpan.textContent();
  const wpText = await wpSpan.textContent();
  // Both should be N/N (same numerator and denominator)
  expect(vText).toMatch(/\d+\/\d+/);
  expect(wpText).toMatch(/\d+\/\d+/);
  const [vL, vR] = vText.replace(/[^0-9/]/g, '').split('/');
  const [wpL, wpR] = wpText.replace(/[^0-9/]/g, '').split('/');
  expect(vL).toBe(vR);
  expect(wpL).toBe(wpR);
});

// ── Graceful degradation: API failure → max/max ───────────────────────────────

test('graceful degradation: downtime_cycles API error → INF shows max/max', async ({ page }) => {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route('**/api/game_sessions', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SESSION]) })
  );
  await page.route('**/api/characters**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_CHARS) })
  );
  await page.route('**/api/players/display-names', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // downtime_cycles returns 500 error
  await page.route('**/api/downtime_cycles', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'SERVER_ERROR' }) })
  );
  await page.route('**/api/st_mods**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#bnav', { timeout: 10000 });
  await page.locator('#n-signin').click();
  await page.waitForSelector('.si-row', { timeout: 8000 });

  // c-001 has clan status 4 → infMax=4; API error → spent defaults to 0 → shows 4/4
  const aliceRow = page.locator('.si-row[data-char-id="c-001"]');
  const infSpan = aliceRow.locator('.si-res-lbl:text("Inf")').locator('..');
  await expect(infSpan).toContainText('4/4');
});

// ── AC5: both new API calls are fired on load ─────────────────────────────────

test('AC5: downtime_cycles and downtime_submissions are both requested on init', async ({ page }) => {
  const requested = new Set();
  page.on('request', req => {
    if (req.url().includes('/api/downtime_cycles')) requested.add('cycles');
    if (req.url().includes('/api/downtime_submissions')) requested.add('submissions');
  });

  await setup(page);

  expect(requested.has('cycles')).toBe(true);
  expect(requested.has('submissions')).toBe(true);
});
