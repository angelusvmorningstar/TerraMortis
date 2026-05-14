/**
 * issue-315: XP Spend card structured breakdown in DT Processing
 * feature.97 — replaces flat summary string with per-row table + totals
 *
 * Test scenarios:
 *   1. Structured table renders with costs + totals when xpCost + budget stored
 *   2. Merit name extracted from raw key (Haven|grad|0|3 → Haven, 0 → 1)
 *   3. Skill and discipline rows show correct labels and transitions
 *   4. Legacy rows (no xpCost) show table but no cost values / totals
 *   5. No xp_budget_snapshot — totals footer omitted
 *   6. Over-budget remaining gets warning class
 *   7. Very old submission (no xp_rows) falls back to flat string
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '315000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-315', character_ids: [], is_dual_role: false,
};

const CHAR_MEKHET = {
  _id: 'char-alice-315', name: 'Alice Vunder', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Alice Player',
  blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null,
  retired: false,
  status: {
    city: 0, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {
    Socialise:     { dots: 2, bonus: 0, specs: [], nine_again: false },
    Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Auspex: { dots: 1 } },
  merits: [],
  powers: [], ordeals: [],
};

// 'active' status is what the smoke test uses; ensures the DT panel renders
const TEST_CYCLE = {
  _id: 'cycle-315', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
};

// Rows stored post-feature.97: each row has xpCost
const XP_ROWS_WITH_COSTS = [
  { category: 'merit',      item: 'Haven|grad|0|3', dotsBuying: 1, xpCost: 1 },
  { category: 'discipline', item: 'Auspex',          dotsBuying: 1, xpCost: 3 },
  { category: 'skill',      item: 'Socialise',       dotsBuying: 1, xpCost: 2 },
  { category: 'skill',      item: 'Investigation',   dotsBuying: 1, xpCost: 2 },
];

// Legacy rows: saved before feature.97; no xpCost field
const XP_ROWS_LEGACY = [
  { category: 'discipline', item: 'Celerity',  dotsBuying: 1 },
  { category: 'skill',      item: 'Athletics', dotsBuying: 1 },
];

function makeXpSub(overrides = {}) {
  const rows      = overrides.rows      ?? XP_ROWS_WITH_COSTS;
  const budget    = overrides.budget    ?? 13;
  const hasBudget = overrides.hasBudget ?? true;
  const responses = {
    project_1_action:   'xp_spend',
    project_1_xp_rows:  JSON.stringify(rows),
    xp_spend:           JSON.stringify(rows),
    ...(hasBudget ? { xp_budget_snapshot: budget } : {}),
  };
  return {
    _id: overrides._id ?? 'sub-xp-315',
    cycle_id: 'cycle-315',
    character_name: 'Alice Vunder',
    character_id:   'char-alice-315',
    player_name:    'Alice Player',
    submitted_at:   '2026-05-15T00:00:00Z',
    _raw: {
      projects: [
        { action_type: 'xp_spend', desired_outcome: '', detail: '', primary_pool: { expression: '' } },
      ],
      feeding: null, sphere_actions: [],
      contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses,
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// Old-format: no xp_rows, only legacy flat keys
function makeLegacyFlatSub() {
  return {
    _id: 'sub-xp-legacy-315',
    cycle_id: 'cycle-315',
    character_name: 'Alice Vunder',
    character_id:   'char-alice-315',
    player_name:    'Alice Player',
    submitted_at:   '2026-05-01T00:00:00Z',
    _raw: {
      projects: [
        { action_type: 'xp_spend', desired_outcome: '', detail: '', primary_pool: { expression: '' } },
      ],
      feeding: null, sphere_actions: [],
      contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action:      'xp_spend',
      project_1_xp_category: 'skill',
      project_1_xp_item:     'Athletics',
    },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setup(page, submissions) {
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
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_MEKHET._id, name: CHAR_MEKHET.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_MEKHET]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  // Wait for the phase ribbon before proceeding
  await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(300);
}

// Expand the 'misc' phase section (where xp_spend actions live) and open the first card.
async function openXpSpendCard(page) {
  // Wait for the misc phase header — proves data has loaded and rendered
  await page.waitForSelector('[data-toggle-phase="misc"]', { state: 'visible', timeout: 10000 });
  // Expand the misc section with a regular click (no force needed — header is always visible)
  await page.locator('[data-toggle-phase="misc"]').click();
  await page.waitForTimeout(200);
  // Click the first action row to open the card
  const rows = page.locator('.proc-action-row');
  await expect(rows.first()).toBeVisible({ timeout: 5000 });
  await rows.first().click();
  await page.waitForTimeout(400);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('issue-315: XP Spend — structured breakdown (feature.97)', () => {

  test('XP Spend card renders a table (.proc-xp-table) for a modern submission', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    await expect(page.locator('.proc-xp-table').first()).toBeVisible({ timeout: 5000 });
  });

  test('table shows all four spend rows from the submission', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    await expect(page.locator('.proc-xp-table tbody tr')).toHaveCount(4, { timeout: 5000 });
  });

  test('merit name extracted from raw key — "Haven|grad|0|3" shows as "Haven"', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    const table = page.locator('.proc-xp-table').first();
    await expect(table).toContainText('Haven', { timeout: 5000 });
    await expect(table).not.toContainText('|grad|');
  });

  test('graduated merit shows dot transition (0 → 1)', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    await expect(page.locator('.proc-xp-table').first()).toContainText('0 → 1', { timeout: 5000 });
  });

  test('skill rows show category label and trait name', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    const table = page.locator('.proc-xp-table').first();
    await expect(table).toContainText('Skill', { timeout: 5000 });
    await expect(table).toContainText('Socialise');
    await expect(table).toContainText('Investigation');
  });

  test('discipline row shows category label and trait name', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    const table = page.locator('.proc-xp-table').first();
    await expect(table).toContainText('Discipline', { timeout: 5000 });
    await expect(table).toContainText('Auspex');
  });

  test('per-row XP costs are shown (1 XP, 3 XP, 2 XP)', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    const table = page.locator('.proc-xp-table').first();
    await expect(table).toContainText('1 XP', { timeout: 5000 });
    await expect(table).toContainText('3 XP');
    await expect(table).toContainText('2 XP');
  });

  test('totals footer shows Total, Budget, and Remaining', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    await openXpSpendCard(page);
    const tfoot = page.locator('.proc-xp-totals').first();
    await expect(tfoot).toBeVisible({ timeout: 5000 });
    await expect(tfoot).toContainText('Total');
    await expect(tfoot).toContainText('Budget');
    await expect(tfoot).toContainText('Remaining');
  });

  test('totals show correct values: 8 XP total, 13 XP budget, 5 XP remaining', async ({ page }) => {
    await setup(page, [makeXpSub({ budget: 13 })]);
    await openXpSpendCard(page);
    const tfoot = page.locator('.proc-xp-totals').first();
    await expect(tfoot).toContainText('8 XP', { timeout: 5000 });
    await expect(tfoot).toContainText('13 XP');
    await expect(tfoot).toContainText('5 XP');
  });

  test('over-budget remaining gets .proc-xp-remaining--over class and shows negative value', async ({ page }) => {
    // Total 8 XP, budget 5 → remaining = -3
    await setup(page, [makeXpSub({ budget: 5 })]);
    await openXpSpendCard(page);
    const overEl = page.locator('.proc-xp-remaining--over').first();
    await expect(overEl).toBeVisible({ timeout: 5000 });
    await expect(overEl).toContainText('-3 XP');
  });

  test('within-budget remaining does NOT get .proc-xp-remaining--over', async ({ page }) => {
    await setup(page, [makeXpSub({ budget: 13 })]);
    await openXpSpendCard(page);
    await expect(page.locator('.proc-xp-remaining--over')).toHaveCount(0, { timeout: 5000 });
  });

  test('totals footer omitted when xp_budget_snapshot is absent', async ({ page }) => {
    await setup(page, [makeXpSub({ hasBudget: false })]);
    await openXpSpendCard(page);
    await expect(page.locator('.proc-xp-table').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-xp-totals')).toHaveCount(0);
  });

  test('legacy rows without xpCost show table rows but no XP cost text', async ({ page }) => {
    await setup(page, [makeXpSub({ rows: XP_ROWS_LEGACY, hasBudget: false })]);
    await openXpSpendCard(page);
    await expect(page.locator('.proc-xp-table').first()).toBeVisible({ timeout: 5000 });
    const costCells = page.locator('.proc-xp-cost');
    const texts = await costCells.allTextContents();
    expect(texts.some(t => /\d+ XP/.test(t))).toBe(false);
  });

  test('very old submission (no xp_rows) does not render .proc-xp-table — no crash', async ({ page }) => {
    await setup(page, [makeLegacyFlatSub()]);
    await openXpSpendCard(page);
    // Structured table should be absent
    await expect(page.locator('.proc-xp-table')).toHaveCount(0, { timeout: 5000 });
    // No error banner
    await expect(page.locator('.dt-error, .error-banner')).toHaveCount(0);
  });

  test('XP Spend label shown in action queue row before card is opened', async ({ page }) => {
    await setup(page, [makeXpSub()]);
    // Wait for misc section header and expand it — don't open the card
    await page.waitForSelector('[data-toggle-phase="misc"]', { state: 'visible', timeout: 10000 });
    await page.locator('[data-toggle-phase="misc"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.proc-action-row').first()).toContainText('XP Spend', { timeout: 5000 });
  });

});
