/**
 * fix.723 — Rote feed in DT processing: territory not pre-selected; action type display wrong
 *
 * Acceptance criteria:
 *   AC1: project_1_territory: 'secondcity' → Second City pill is is-active in detail panel
 *   AC2: project_1_territory: 'barrens'    → Barrens pill is is-active in detail panel
 *   AC3: ST override wins over player's submitted territory
 *   AC4: Rote feed action type row shows no .proc-recat-select (chip replaced it)
 *   AC5: .proc-action-type-rote chip is visible
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_ROTE = {
  _id: 'char-rote-723', name: 'Aleksei', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Circle of the Crone', player: 'Test Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 3, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
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

function makeRoteSub(territory, stTerrOverride = null) {
  return {
    _id: 'sub-rote-723',
    chapter_id: 'cycle-001',
    character_name: 'Aleksei',
    character_id: 'char-rote-723',
    player_name: 'Test Player',
    submitted_at: '2026-06-14T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'rote', primary_pool: null, desired_outcome: 'Feed in peace.' }],
      feeding: null,
      sphere_actions: [],
      contact_actions: { requests: [] },
      retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'rote',
      project_1_title: 'Rote Feeding Hunt',
      project_1_description: 'Using Obfuscate to feed undetected.',
      project_1_territory: territory,
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    sorcery_review: {},
    st_review: stTerrOverride
      ? { territory_overrides: { feeding_rote: stTerrOverride } }
      : { territory_overrides: {} },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function setupProcessing(page, sub) {
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
    if (url.includes('/api/downtime_submissions'))  return ok([sub]);
    if (url.includes('/api/chapters'))       return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))      return ok([CHAR_ROTE].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))            return ok([CHAR_ROTE]);
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

async function openRoteAction(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('fix.723 — rote feed territory pre-selection + action type chip', () => {

  test('AC1: Second City territory pre-selected from project_1_territory', async ({ page }) => {
    await setupProcessing(page, makeRoteSub('secondcity'));
    await openRoteAction(page);

    const pill = page.locator('.proc-terr-pill[data-terr-id="secondcity"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveClass(/is-active/);
  });

  test('AC2: Barrens territory pre-selected from project_1_territory', async ({ page }) => {
    await setupProcessing(page, makeRoteSub('barrens'));
    await openRoteAction(page);

    const pill = page.locator('.proc-terr-pill[data-terr-id="barrens"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveClass(/is-active/);
  });

  test('AC3: ST override wins — academy active when player submitted secondcity', async ({ page }) => {
    await setupProcessing(page, makeRoteSub('secondcity', ['academy']));
    await openRoteAction(page);

    await expect(page.locator('.proc-terr-pill[data-terr-id="academy"]')).toHaveClass(/is-active/);
    await expect(page.locator('.proc-terr-pill[data-terr-id="secondcity"]')).not.toHaveClass(/is-active/);
  });

  test('AC4: No proc-recat-select dropdown for rote action type', async ({ page }) => {
    await setupProcessing(page, makeRoteSub('secondcity'));
    await openRoteAction(page);

    await expect(page.locator('.proc-recat-select')).toHaveCount(0);
  });

  test('AC5: proc-action-type-rote chip is visible', async ({ page }) => {
    await setupProcessing(page, makeRoteSub('secondcity'));
    await openRoteAction(page);

    const chip = page.locator('.proc-action-type-rote');
    await expect(chip).toBeVisible();
  });

});
