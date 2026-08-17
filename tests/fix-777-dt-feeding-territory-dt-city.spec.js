/**
 * Fix #777 — DT feeding territory not reaching DT City or processing panel (OID keys + ST override)
 *
 * Two disconnects fixed:
 *   1. Rote feed pill pre-selection used TERRITORY_SLUG_MAP which fails for OID keys (DT4+
 *      submissions store ObjectID keys in feeding_territories_rote). Now uses cachedTerritories
 *      lookup in _renderRightMechanics and _renderActionTypeRow.
 *   2. DT City TAAG matrix iterated entry.feedTerrs (raw player data from buildProcessingQueue)
 *      and never read ST override. Now uses _getSubFedTerrs which honours
 *      st_review.territory_overrides.feeding.
 *
 * Tests:
 *   AC-rote:     OID-keyed feeding_territories_rote → correct pill pre-selected (not N/A)
 *   AC-taag:     DT City TAAG feeding row shows character when they feed in a real territory
 *   AC-override: ST override territory → DT City TAAG uses override, not player pick
 *   AC-empty:    No territory selected → no crash
 *   AC-legacy:   Legacy slug-keyed submissions still resolve in DT City TAAG (regression)
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ──────────────────────────────────────────────────────────────

const ST_USER = {
  id: '777000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-777', character_ids: [], is_dual_role: false,
};

const CHAR_777 = {
  _id: 'char-hazel-777', name: 'Hazel Wren', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Unaligned', player: 'Hazel Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 0, covenant: { Carthian: 0, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-777', cycle_number: 4, status: 'game',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
};

// Fake 24-char hex OID — simulates a territory _id from MongoDB as stored in DT4+ form responses
const TERR_OID = '507f1f77bcf86cd799439777';

// North Shore territory document; its _id matches the OID Hazel submitted
const TERR_NS_777 = {
  _id: TERR_OID,
  slug: 'northshore',
  name: 'The North Shore',
  ambience: 'Tended',
  feeding_rights: [],
  regent_id: null,
  lieutenant_id: null,
};

// ── Submission builders ───────────────────────────────────────────────────────

/** Main feed with OID key — DT4+ format, no ST override */
function makeMainFeedOidSub() {
  return {
    _id: 'sub-777-main',
    chapter_id: 'cycle-777',
    character_name: 'Hazel Wren',
    character_id: 'char-hazel-777',
    player_name: 'Hazel Player',
    submitted_at: '2026-06-01T00:00:00Z',
    _raw: { projects: [], feeding: { method: 'stalking' }, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      _feed_method: 'stalking',
      feeding_territories: JSON.stringify({ [TERR_OID]: 'feeding_rights' }),
    },
    projects_resolved: [],
    feeding_review: {
      pool_player: 'Dexterity 2 + Stealth 0 = 2',
      pool_validated: '',
      pool_status: 'pending',
      nine_again: false, eight_again: false,
      pool_mod_equipment: 0,
      notes_thread: [], player_feedback: '',
    },
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

/** Same but with ST override: player picked northshore (OID), ST overrides to academy */
function makeMainFeedWithOverrideSub() {
  return {
    ...makeMainFeedOidSub(),
    _id: 'sub-777-override',
    st_review: { territory_overrides: { feeding: ['academy'] } },
  };
}

/** Rote feed with OID key in feeding_territories_rote — tests Edit 1 + 2 */
function makeRoteFeedOidSub() {
  return {
    _id: 'sub-777-rote',
    chapter_id: 'cycle-777',
    character_name: 'Hazel Wren',
    character_id: 'char-hazel-777',
    player_name: 'Hazel Player',
    submitted_at: '2026-06-01T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'rote', desired_outcome: 'Rote hunt', detail: '', primary_pool: { expression: 'Dexterity 2 = 2' } }],
      feeding: { method: 'stalking' },
      sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      _feed_method: 'stalking',
      feeding_territories: JSON.stringify({ [TERR_OID]: 'feeding_rights' }),
      feeding_territories_rote: JSON.stringify({ [TERR_OID]: 'feeding_rights' }),
      project_1_action: 'rote',
    },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

/** No territory selected — verifies no crash */
function makeNoTerritorySub() {
  return {
    ...makeMainFeedOidSub(),
    _id: 'sub-777-noterr',
    responses: {
      _feed_method: 'stalking',
      feeding_territories: JSON.stringify({}),
    },
  };
}

/** Legacy slug-keyed submission (DT1/DT2 format) — regression */
function makeLegacySlugSub() {
  return {
    ...makeMainFeedOidSub(),
    _id: 'sub-777-legacy',
    responses: {
      _feed_method: 'stalking',
      feeding_territories: JSON.stringify({ northshore: 'feeding_rights' }),
    },
  };
}

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setup(page, submission, territories = [TERR_NS_777]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok([submission]);
    if (url.includes('/api/chapters'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_777._id, name: CHAR_777.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_777]);
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

async function openRoteFeedAction(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(400);

  // Processing queue renders a flat list of proc-action-row divs (no phase section toggles).
  // The rote project action has label "Rote Feed" — distinct from the plain "Feeding" entry.
  const roteRow = page.locator('.proc-action-row').filter({ hasText: 'Rote Feed' }).first();
  await roteRow.waitFor({ state: 'visible', timeout: 8000 });
  await roteRow.click();
  await page.waitForTimeout(400);
}

async function openMainFeedAction(page) {
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(400);

  // "Feeding" is distinct from "Rote Feed" — "Feeding" is not a substring of "Rote Feed".
  const feedRow = page.locator('.proc-action-row').filter({ hasText: 'Feeding' }).first();
  await feedRow.waitFor({ state: 'visible', timeout: 8000 });
  await feedRow.click();
  await page.waitForTimeout(400);
}

/**
 * Returns 1-based column index of a TAAG header cell by its text content.
 * Returns 0 if not found (findIndex returns -1 → -1+1=0).
 */
async function getTaagColIndex(page, headerText) {
  return page.locator('.dt-taag-table thead th').evaluateAll(
    (cells, label) => cells.findIndex(c => c.textContent.trim() === label) + 1,
    headerText
  );
}

// ── AC-rote: OID key in feeding_territories_rote → pill active ───────────────

test.describe('Fix #777 — Rote feed OID key: pill pre-selection', () => {

  test('AC-rote-1: North Shore pill is active when rote grid uses OID key for northshore', async ({ page }) => {
    await setup(page, makeRoteFeedOidSub());
    await openRoteFeedAction(page);

    const nshorePill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding_rote"] .proc-terr-pill[data-terr-id="northshore"]'
    );
    await expect(nshorePill).toBeVisible({ timeout: 5000 });
    await expect(nshorePill).toHaveClass(/active/);
  });

  test('AC-rote-2: Academy pill is NOT active when OID maps only to northshore', async ({ page }) => {
    await setup(page, makeRoteFeedOidSub());
    await openRoteFeedAction(page);

    const academyPill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding_rote"] .proc-terr-pill[data-terr-id="academy"]'
    );
    await expect(academyPill).toBeVisible({ timeout: 5000 });
    await expect(academyPill).not.toHaveClass(/active/);
  });

});

// ── AC-taag: DT City TAAG shows character in correct territory ────────────────

test.describe('Fix #777 — DT City TAAG: OID key resolves to territory column', () => {

  test('AC-taag-1: Feeding row appears in TAAG table when character feeds via OID-keyed territory', async ({ page }) => {
    await setup(page, makeMainFeedOidSub());
    await navigateToCityTab(page);

    const feedingRow = page.locator('.dt-taag-table tbody tr').filter({ hasText: 'Feeding' });
    await expect(feedingRow).toBeVisible({ timeout: 5000 });
  });

  test('AC-taag-2: Hazel chip appears in North Shore column when OID maps to northshore', async ({ page }) => {
    await setup(page, makeMainFeedOidSub());
    await navigateToCityTab(page);

    const colIdx = await getTaagColIndex(page, 'North Shore');
    expect(colIdx).toBeGreaterThan(0);

    const feedingRow = page.locator('.dt-taag-table tbody tr').filter({ hasText: 'Feeding' });
    await expect(feedingRow).toBeVisible({ timeout: 5000 });

    const chip = feedingRow.locator(`td:nth-child(${colIdx}) .dt-taag-chip`).filter({ hasText: 'Hazel' });
    await expect(chip).toBeVisible({ timeout: 5000 });
  });

});

// ── AC-override: ST override → DT City TAAG uses override territory ───────────

test.describe('Fix #777 — DT City TAAG: ST override replaces player pick', () => {

  test('AC-override-1: Hazel chip appears in Academy column when ST overrides to academy', async ({ page }) => {
    await setup(page, makeMainFeedWithOverrideSub());
    await navigateToCityTab(page);

    const colIdx = await getTaagColIndex(page, 'Academy');
    expect(colIdx).toBeGreaterThan(0);

    const feedingRow = page.locator('.dt-taag-table tbody tr').filter({ hasText: 'Feeding' });
    await expect(feedingRow).toBeVisible({ timeout: 5000 });

    const chip = feedingRow.locator(`td:nth-child(${colIdx}) .dt-taag-chip`).filter({ hasText: 'Hazel' });
    await expect(chip).toBeVisible({ timeout: 5000 });
  });

  test('AC-override-2: Hazel chip is absent from North Shore column when ST overrides to academy', async ({ page }) => {
    await setup(page, makeMainFeedWithOverrideSub());
    await navigateToCityTab(page);

    const nsColIdx = await getTaagColIndex(page, 'North Shore');
    expect(nsColIdx).toBeGreaterThan(0);

    const feedingRow = page.locator('.dt-taag-table tbody tr').filter({ hasText: 'Feeding' });
    // Feeding row exists (character is feeding, just in a different column)
    await expect(feedingRow).toBeVisible({ timeout: 5000 });

    const chip = feedingRow.locator(`td:nth-child(${nsColIdx}) .dt-taag-chip`).filter({ hasText: 'Hazel' });
    await expect(chip).not.toBeVisible();
  });

});

// ── AC-empty: No territory → no crash ────────────────────────────────────────

test.describe('Fix #777 — No territory: no crash on DT City render', () => {

  test('AC-empty: DT City renders without crash when submission has no territory selected', async ({ page }) => {
    await setup(page, makeNoTerritorySub());
    await navigateToCityTab(page);

    // Admin app must remain intact — no JS error should have broken the view
    await expect(page.locator('#admin-app')).toBeVisible({ timeout: 5000 });

    // TAAG table is rendered (even if empty) — either empty-row or no feeding row at all
    const taagTable = page.locator('.dt-taag-table');
    await expect(taagTable).toBeVisible({ timeout: 5000 });
  });

});

// ── AC-legacy: Slug keys still resolve in DT City TAAG (regression) ──────────

test.describe('Fix #777 — Legacy slug keys: regression', () => {

  test('AC-legacy-1: Feeding row appears in TAAG table with legacy northshore slug key', async ({ page }) => {
    await setup(page, makeLegacySlugSub());
    await navigateToCityTab(page);

    const feedingRow = page.locator('.dt-taag-table tbody tr').filter({ hasText: 'Feeding' });
    await expect(feedingRow).toBeVisible({ timeout: 5000 });
  });

  test('AC-legacy-2: Hazel chip appears in North Shore column with legacy northshore slug key', async ({ page }) => {
    await setup(page, makeLegacySlugSub());
    await navigateToCityTab(page);

    const colIdx = await getTaagColIndex(page, 'North Shore');
    expect(colIdx).toBeGreaterThan(0);

    const feedingRow = page.locator('.dt-taag-table tbody tr').filter({ hasText: 'Feeding' });
    await expect(feedingRow).toBeVisible({ timeout: 5000 });

    const chip = feedingRow.locator(`td:nth-child(${colIdx}) .dt-taag-chip`).filter({ hasText: 'Hazel' });
    await expect(chip).toBeVisible({ timeout: 5000 });
  });

});

// ── AC-1 (main feed): OID key pill pre-selection in DT Processing ─────────────

test.describe('Fix #777 — Main feed OID key: pill pre-selection in DT Processing', () => {

  test('AC-1-mainpill-1: North Shore pill is active when main feed grid uses OID key', async ({ page }) => {
    await setup(page, makeMainFeedOidSub());
    await openMainFeedAction(page);

    const nshorePill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding"] .proc-terr-pill[data-terr-id="northshore"]'
    );
    await expect(nshorePill).toBeVisible({ timeout: 5000 });
    await expect(nshorePill).toHaveClass(/active/);
  });

  test('AC-1-mainpill-2: Academy pill is NOT active when OID maps only to northshore', async ({ page }) => {
    await setup(page, makeMainFeedOidSub());
    await openMainFeedAction(page);

    const academyPill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding"] .proc-terr-pill[data-terr-id="academy"]'
    );
    await expect(academyPill).toBeVisible({ timeout: 5000 });
    await expect(academyPill).not.toHaveClass(/active/);
  });

});

// ── AC-6 (main feed, DT Processing): legacy slug key regression ───────────────

test.describe('Fix #777 — Main feed legacy slug: DT Processing pill regression', () => {

  test('AC-6-proc: North Shore pill is active with legacy northshore slug key in DT Processing', async ({ page }) => {
    await setup(page, makeLegacySlugSub());
    await openMainFeedAction(page);

    const nshorePill = page.locator(
      '.proc-terr-pill-row[data-terr-context="feeding"] .proc-terr-pill[data-terr-id="northshore"]'
    );
    await expect(nshorePill).toBeVisible({ timeout: 5000 });
    await expect(nshorePill).toHaveClass(/active/);
  });

});
