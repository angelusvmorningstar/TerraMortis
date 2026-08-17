/**
 * E2E — feature.489: Check-In V shows last cycle's logged feed roll, else 0
 *
 * AC1 — char with a logged feed roll (vessel allocation + bonus) → shows feedTotal / vMax
 * AC2 — char with no submission for the last cycle → shows 0 / vMax
 * AC3 — char whose submission has no logged feed (deferred, or tally only) → shows 0 / vMax
 * AC4 — no last cycle exists → shows 0 / vMax for every character
 * AC5 — feed total exceeding vMax → clamped to vMax / vMax
 *
 * "Logged" = feeding_vitae_allocation is a non-empty array.
 * feedTotal = sum(feeding_vitae_allocation) + (feeding_vitae_tally.total_bonus || 0).
 * Feeding fields sit at the TOP LEVEL of a submission, not under responses.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: 'test-st-001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-st-001', character_ids: [], is_dual_role: false,
};

const SESSION = {
  _id: 'sess-489-001',
  session_date: '2099-06-01',
  game_number: 5,
  attendance: [],
};

// blood_potency 1 → calcVitaeMax = 10 for every test char (BP_TABLE, accessors.js).
const TEST_CHARS = [
  {
    _id: 'c-001', name: 'Alice Char', player: 'Alice Player', retired: false,
    blood_potency: 1, clan: 'Daeva', covenant: 'Invictus',
    status: { city: 0, clan: 0, covenant: {} }, merits: [],
  },
  {
    _id: 'c-002', name: 'Bob Char', player: 'Bob Player', retired: false,
    blood_potency: 1, clan: 'Gangrel', covenant: 'Circle of the Crone',
    status: { city: 0, clan: 0, covenant: {} }, merits: [],
  },
  {
    _id: 'c-003', name: 'Carol Char', player: 'Carol Player', retired: false,
    blood_potency: 1, clan: 'Mekhet', covenant: 'Carthian Movement',
    status: { city: 0, clan: 0, covenant: {} }, merits: [],
  },
  {
    _id: 'c-004', name: 'Dave Char', player: 'Dave Player', retired: false,
    blood_potency: 1, clan: 'Ventrue', covenant: 'Lancea et Sanctum',
    // status.clan 5 → calcTotalInfluence = 5; used by the both-fields coverage test.
    status: { city: 0, clan: 5, covenant: {} }, merits: [],
  },
];

const CLOSED_CYCLE = { _id: 'cycle-closed-001', status: 'closed', game_number: 3 };
const OPEN_CYCLE   = { _id: 'cycle-open-001',   status: 'open',   game_number: 4 };

// c-001: vessels [3,3] = 6, bonus +2 → feedTotal 8
const SUB_LOGGED_FEED = {
  _id: 'sub-489-001', character_id: 'c-001', chapter_id: 'cycle-closed-001', status: 'submitted',
  feeding_vitae_allocation: [3, 3],
  feeding_vitae_tally: { total_bonus: 2 },
};

function vSpan(page, charId) {
  return page.locator(`.si-row[data-char-id="${charId}"]`)
    .locator('.si-res-lbl:text("V")').locator('..');
}

async function setup(page, {
  sessions = [SESSION],
  cycles = [CLOSED_CYCLE, OPEN_CYCLE],
  submissions = [SUB_LOGGED_FEED],
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
  await page.route('**/api/chapters', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cycles) })
  );
  await page.route('**/api/downtime_submissions**', route => {
    // Mirror the real endpoint: scope returned submissions to ?chapter_id=.
    const cid = new URL(route.request().url()).searchParams.get('chapter_id');
    const body = cid
      ? submissions.filter(s => String(s.chapter_id) === cid)
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

// ── AC1: logged feed roll → feedTotal / vMax ─────────────────────────────────

test('AC1: char with logged feed (vessels 3+3, bonus +2) shows V 8/10', async ({ page }) => {
  await setup(page);
  const v = vSpan(page, 'c-001');
  await expect(v).toBeVisible();
  await expect(v).toContainText('8/10');
});

test('AC1: V is feedTotal/vMax, not vMax/vMax, when a feed is logged', async ({ page }) => {
  await setup(page);
  const text = await vSpan(page, 'c-001').textContent();
  expect(text).toContain('8/10');
  expect(text).not.toContain('10/10');
});

// ── AC2: no submission → 0 / vMax ────────────────────────────────────────────

test('AC2: char with no submission for the last cycle shows V 0/10', async ({ page }) => {
  await setup(page);
  // c-002 has no submission in SUB_LOGGED_FEED set.
  const v = vSpan(page, 'c-002');
  await expect(v).toBeVisible();
  await expect(v).toContainText('0/10');
});

// ── AC3: submission with no logged feed → 0 / vMax ───────────────────────────

test('AC3: deferred feed (no allocation) shows V 0/10', async ({ page }) => {
  await setup(page, {
    submissions: [
      { _id: 'sub-def', character_id: 'c-003', chapter_id: 'cycle-closed-001', status: 'submitted',
        feeding_deferred: true },
    ],
  });
  const v = vSpan(page, 'c-003');
  await expect(v).toBeVisible();
  await expect(v).toContainText('0/10');
});

test('AC3: submission with a tally but no vessel allocation shows V 0/10', async ({ page }) => {
  await setup(page, {
    submissions: [
      { _id: 'sub-tally', character_id: 'c-003', chapter_id: 'cycle-closed-001', status: 'submitted',
        feeding_vitae_tally: { total_bonus: 5 } },
    ],
  });
  // A bonus tally alone is not a logged feed — allocation is required.
  await expect(vSpan(page, 'c-003')).toContainText('0/10');
});

// ── AC4: no last cycle → 0 / vMax for all ────────────────────────────────────

test('AC4: no last cycle → every character shows V 0/10', async ({ page }) => {
  await setup(page, { cycles: [OPEN_CYCLE] }); // only an open cycle, none past it
  await expect(vSpan(page, 'c-001')).toContainText('0/10');
  await expect(vSpan(page, 'c-002')).toContainText('0/10');
});

test('AC4: no cycles at all → V 0/10', async ({ page }) => {
  await setup(page, { cycles: [] });
  await expect(vSpan(page, 'c-001')).toContainText('0/10');
});

// ── AC5: feed total exceeding vMax clamps to vMax/vMax ───────────────────────

test('AC5: feed total above vMax is clamped to V 10/10', async ({ page }) => {
  await setup(page, {
    submissions: [
      { _id: 'sub-over', character_id: 'c-001', chapter_id: 'cycle-closed-001', status: 'submitted',
        feeding_vitae_allocation: [5, 5, 5], feeding_vitae_tally: { total_bonus: 3 } },
    ],
  });
  // 15 + 3 = 18 spent, vMax 10 → clamped to 10/10.
  const text = await vSpan(page, 'c-001').textContent();
  expect(text).toContain('10/10');
  expect(text).not.toContain('18');
});

// ── Regression: WP display unchanged by the V change ─────────────────────────

test('regression: WP display still renders max/max after the V change', async ({ page }) => {
  await setup(page);
  const wp = page.locator('.si-row[data-char-id="c-001"]')
    .locator('.si-res-lbl:text("WP")').locator('..');
  await expect(wp).toBeVisible();
  const wpText = await wp.textContent();
  expect(wpText).toMatch(/\d+\/\d+/);
  const [l, r] = wpText.replace(/[^0-9/]/g, '').split('/');
  expect(l).toBe(r);
});

// ── QA coverage (feature.489 review) ─────────────────────────────────────────

test('coverage: a submission with both influence_spend and a feed roll resolves both INF and V', async ({ page }) => {
  // Real DT3 shape — many submissions carry both. Guards the loadLastCycleData
  // loop restructure: dropping the influence `continue`s must leave both
  // extractions running from a single document.
  await setup(page, {
    submissions: [
      {
        _id: 'sub-both', character_id: 'c-004', chapter_id: 'cycle-closed-001', status: 'submitted',
        responses: { influence_spend: JSON.stringify({ the_harbour: 2, the_academy: 1 }) },
        feeding_vitae_allocation: [4, 4],
        feeding_vitae_tally: { total_bonus: 1 },
      },
    ],
  });
  const row = page.locator('.si-row[data-char-id="c-004"]');
  // INF: max 5, spent 3 → 2/5
  await expect(row.locator('.si-res-lbl:text("Inf")').locator('..')).toContainText('2/5');
  // V: vessels 4+4 + bonus 1 = 9, max 10 → 9/10
  await expect(row.locator('.si-res-lbl:text("V")').locator('..')).toContainText('9/10');
});

test('coverage: empty feeding_vitae_allocation array counts as no logged feed', async ({ page }) => {
  await setup(page, {
    submissions: [
      { _id: 'sub-empty', character_id: 'c-001', chapter_id: 'cycle-closed-001', status: 'submitted',
        feeding_vitae_allocation: [] },
    ],
  });
  // A length-0 array fails the `length > 0` guard → treated as not logged → 0/10.
  await expect(vSpan(page, 'c-001')).toContainText('0/10');
});

test('coverage: logged feed with allocation but no tally → V is allocation sum / vMax', async ({ page }) => {
  await setup(page, {
    submissions: [
      { _id: 'sub-notally', character_id: 'c-001', chapter_id: 'cycle-closed-001', status: 'submitted',
        feeding_vitae_allocation: [2, 2] },
    ],
  });
  // No feeding_vitae_tally → bonus defaults to 0 → 2 + 2 = 4 → 4/10. (Real DT3 shape.)
  await expect(vSpan(page, 'c-001')).toContainText('4/10');
});
