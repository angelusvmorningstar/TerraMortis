/**
 * fix.719 — DT processing territory pill row missing The Second City
 *
 * Acceptance criteria:
 *   1. .proc-terr-pill[data-terr-id="secondcity"] exists in the pill row
 *   2. That pill's text content is "Second City"
 *   3. Barrens pill (data-terr-id="barrens") still exists
 *   4. Academy pill (data-terr-id="academy") still exists
 *   5. N/A pill (data-terr-id="") still exists and is the last pill
 *   6. Total pill count is 7 (5 formal territories + Barrens + N/A)
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_PROJ = {
  _id: 'char-proj-719', name: 'Test Character', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [],
  ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 4, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// Project submission — territory set to secondcity (the missing territory in the old hardcoded list)
const PROJECT_SUB = {
  _id: 'sub-proj-719',
  cycle_id: 'cycle-001',
  character_name: 'Test Character',
  character_id: 'char-proj-719',
  player_name: 'Test Player',
  submitted_at: '2026-06-14T00:00:00Z',
  _raw: {
    projects: [],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'misc',
    project_1_title: 'Second City Survey',
    project_1_description: 'Scouting The Second City for opportunities.',
    project_1_territory: 'secondcity',
  },
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [],
  sorcery_review: {},
  st_review: { territory_overrides: {} },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

async function setupProcessing(page) {
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
    if (url.includes('/api/downtime_submissions'))  return ok([PROJECT_SUB]);
    if (url.includes('/api/downtime_cycles'))       return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))      return ok([CHAR_PROJ].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))            return ok([CHAR_PROJ]);
    if (url.includes('/api/territories'))           return ok([]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openProjectAction(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  // Filter to misc phase so only our project action is visible
  const miscPill = page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="misc"]');
  if (await miscPill.count() > 0) {
    await miscPill.first().click();
    await page.waitForTimeout(300);
  }
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('fix.719 — territory pill row includes The Second City', () => {

  test('AC1+2: Second City pill exists with correct label', async ({ page }) => {
    await setupProcessing(page);
    await openProjectAction(page);

    const pill = page.locator('.proc-terr-pill[data-terr-id="secondcity"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText('Second City');
  });

  test('AC3: Barrens pill still present', async ({ page }) => {
    await setupProcessing(page);
    await openProjectAction(page);

    await expect(page.locator('.proc-terr-pill[data-terr-id="barrens"]')).toBeVisible();
  });

  test('AC4: Academy pill still present', async ({ page }) => {
    await setupProcessing(page);
    await openProjectAction(page);

    await expect(page.locator('.proc-terr-pill[data-terr-id="academy"]')).toBeVisible();
  });

  test('AC5: N/A pill still present and is the last pill', async ({ page }) => {
    await setupProcessing(page);
    await openProjectAction(page);

    const pills = page.locator('.proc-terr-pill');
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);

    const lastPill = pills.nth(count - 1);
    await expect(lastPill).toHaveAttribute('data-terr-id', '');
    await expect(lastPill).toHaveText('N/A');
  });

  test('AC6: Total pill count is 7 (5 territories + Barrens + N/A)', async ({ page }) => {
    await setupProcessing(page);
    await openProjectAction(page);

    const pills = page.locator('.proc-terr-pill');
    await expect(pills).toHaveCount(7);
  });

});
