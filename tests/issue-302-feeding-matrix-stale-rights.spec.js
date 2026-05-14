/**
 * Issue #302 — Feeding matrix + action panel show stale rights after regent grants access.
 *
 * Root cause: saveFeedingRights() in city-views.js did not call invalidateCachedTerritories(),
 * so cachedTerritories stayed stale. The fix adds that call.
 *
 * AC coverage:
 *   AC1 — Matrix shows O (rights) when character IS in territory.feeding_rights
 *   AC1b — Matrix shows X (poaching) when character is NOT in territory.feeding_rights
 *   AC2 — Mismatch warning absent when character is on Regent's list
 *   AC2b — Mismatch warning present when character is NOT on Regent's list
 *   AC1-cache — After saving feeding rights, matrix re-fetches and shows O (cache invalidation)
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_302 = {
  _id: 'char-302', name: 'Ivana Horvat', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 1, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
  merits: [], powers: [], ordeals: [],
};

// Cycle in 'game' status so City tab is the default (and DT Processing available)
const TEST_CYCLE = {
  _id: 'cycle-302', cycle_number: 3, status: 'game',
  confirmed_ambience: {}, narrative_notes: '',
};

// North Shore territory WITHOUT Ivana in feeding_rights
const TERR_NS_NO_RIGHTS = {
  _id: 'terr-ns-302', slug: 'northshore', name: 'The North Shore',
  ambience: 'Neglected', feeding_rights: [],
  regent_id: null, lieutenant_id: null,
};

// North Shore territory WITH Ivana in feeding_rights
const TERR_NS_WITH_RIGHTS = {
  ...TERR_NS_NO_RIGHTS,
  feeding_rights: ['char-302'],
};

// Submission: Ivana claims feeding_rights in northshore
const SUBMISSION_302 = {
  _id: 'sub-302',
  cycle_id: 'cycle-302',
  character_name: 'Ivana Horvat',
  character_id: 'char-302',
  player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: { projects: [], feeding: {}, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  responses: {
    _feed_method: 'seduction',
    feeding_territories: JSON.stringify({ northshore: 'feeding_rights' }),
  },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5',
    pool_validated: '',
    pool_status: 'pending',
    nine_again: false, eight_again: false,
    pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setup(page, territories, submissions = [SUBMISSION_302]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_302._id, name: CHAR_302.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_302]);
    if (url.includes('/api/territories'))          return ok(territories);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
}

async function navigateToCityTab(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForTimeout(400);
}

async function showFeedingMatrix(page) {
  const matrixToggle = page.locator('.proc-disc-header[data-toggle="city-feed-matrix"]');
  await matrixToggle.waitFor({ state: 'visible', timeout: 8000 });
  const toggleText = await matrixToggle.textContent();
  if (toggleText && toggleText.includes('Show')) {
    await matrixToggle.click();
    await page.waitForTimeout(300);
  }
}

async function openFeedingAction(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(400);
  await page.waitForSelector('.proc-phase-section', { state: 'visible', timeout: 8000 });
  const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Feeding' }).first();
  const toggle = feedHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await feedHeader.click();
  await page.waitForTimeout(200);
  const feedPhase = page.locator('.proc-phase-section').filter({ hasText: 'Feeding' }).first();
  await feedPhase.locator('.proc-action-row').first().click();
  await page.waitForTimeout(400);
}

// ── AC1: Matrix shows O when character IS in feeding_rights ──────────────────

test.describe('Issue #302 — Feeding Matrix rights status', () => {

  test('AC1: North Shore column shows O when Ivana is in feeding_rights', async ({ page }) => {
    await setup(page, [TERR_NS_WITH_RIGHTS]);
    await navigateToCityTab(page);
    await showFeedingMatrix(page);

    const matrixWrap = page.locator('.dt-matrix-wrap');
    await expect(matrixWrap).toBeVisible({ timeout: 5000 });

    // Ivana's row should have a resident cell (O) — not a poach cell (X)
    const ivanaRow = page.locator('tr.dt-matrix-row').filter({ hasText: 'Ivana' });
    await expect(ivanaRow).toBeVisible({ timeout: 5000 });
    await expect(ivanaRow.locator('td.dt-matrix-resident')).toBeVisible();
    await expect(ivanaRow.locator('td.dt-matrix-poach')).not.toBeVisible();
  });

  test('AC1b: North Shore column shows X when Ivana is NOT in feeding_rights', async ({ page }) => {
    await setup(page, [TERR_NS_NO_RIGHTS]);
    await navigateToCityTab(page);
    await showFeedingMatrix(page);

    const matrixWrap = page.locator('.dt-matrix-wrap');
    await expect(matrixWrap).toBeVisible({ timeout: 5000 });

    const ivanaRow = page.locator('tr.dt-matrix-row').filter({ hasText: 'Ivana' });
    await expect(ivanaRow).toBeVisible({ timeout: 5000 });
    await expect(ivanaRow.locator('td.dt-matrix-poach')).toBeVisible();
    await expect(ivanaRow.locator('td.dt-matrix-resident')).not.toBeVisible();
  });

});

// ── AC2: Mismatch warning in feeding action panel ───────────────────────────

test.describe('Issue #302 — Mismatch warning in action panel', () => {

  test('AC2: No mismatch warning when Ivana IS on Regent\'s rights list', async ({ page }) => {
    await setup(page, [TERR_NS_WITH_RIGHTS]);
    await openFeedingAction(page);

    // Warning should NOT appear
    const warning = page.locator('.proc-mismatch-flag').filter({ hasText: 'Claims feeding rights in' });
    await expect(warning).not.toBeVisible();
  });

  test('AC2b: Mismatch warning appears when Ivana claims rights but is NOT on list', async ({ page }) => {
    await setup(page, [TERR_NS_NO_RIGHTS]);
    await openFeedingAction(page);

    // Warning SHOULD appear
    const warning = page.locator('.proc-mismatch-flag').filter({ hasText: 'Claims feeding rights in' });
    await expect(warning).toBeVisible({ timeout: 5000 });
  });

});

// ── AC1-cache: After saving rights, matrix re-fetches and shows O ────────────
// The fix adds invalidateCachedTerritories() to saveFeedingRights(). This means
// cachedTerritories = null after saving. The next cycle load calls ensureTerritories()
// which re-fetches from the API. This test verifies that flow end-to-end.

test.describe('Issue #302 — Cache invalidation after saving feeding rights', () => {

  test('AC1-cache: Matrix shows O after cache invalidated and cycle reloaded', async ({ page }) => {
    let returnWithRights = false;

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER });

    await page.route('http://localhost:3000/**', route => {
      const url = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (url.includes('/api/territories') && (method === 'POST' || method === 'PUT')) {
        returnWithRights = true;
        return ok({ ok: true });
      }
      if (url.includes('/api/territories')) {
        const terr = returnWithRights ? TERR_NS_WITH_RIGHTS : TERR_NS_NO_RIGHTS;
        return ok([terr]);
      }
      if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
      if (url.includes('/api/downtime_submissions')) return ok([SUBMISSION_302]);
      if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
      if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_302._id, name: CHAR_302.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))           return ok([CHAR_302]);
      if (url.includes('/api/game_sessions'))        return ok([]);
      if (url.includes('/api/session_logs'))         return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(500);

    // Step 1: Navigate to City tab, show matrix — Ivana should show X (no rights yet)
    await navigateToCityTab(page);
    await showFeedingMatrix(page);
    const ivanaRow = page.locator('tr.dt-matrix-row').filter({ hasText: 'Ivana' });
    await expect(ivanaRow).toBeVisible({ timeout: 5000 });
    await expect(ivanaRow.locator('td.dt-matrix-poach')).toBeVisible();

    // Step 2: Simulate what saveFeedingRights() now does — POST to territories, then
    // call invalidateCachedTerritories(). After this, cachedTerritories = null.
    returnWithRights = true;
    await page.evaluate(async () => {
      const mod = await import('/js/admin/downtime-views.js');
      mod.invalidateCachedTerritories();
    });

    // Step 3: Trigger cycle reload (what the ST would do by re-selecting the cycle or
    // navigating back) — this calls ensureTerritories() which re-fetches because
    // cachedTerritories is null. Re-click the downtime domain to force a reload.
    await page.click('[data-domain="player"]');
    await page.waitForTimeout(200);
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(800);

    // Step 4: Navigate back to City tab and show matrix
    await navigateToCityTab(page);
    await showFeedingMatrix(page);

    // Ivana's row should now show O (rights fetched fresh from API)
    await expect(ivanaRow.locator('td.dt-matrix-resident')).toBeVisible({ timeout: 5000 });
    await expect(ivanaRow.locator('td.dt-matrix-poach')).not.toBeVisible();
  });

});
