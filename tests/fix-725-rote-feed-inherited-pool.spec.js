/**
 * fix.725 — Rote feed in DT Processing: inherited pool from primary hunt not surfacing
 *
 * Acceptance criteria:
 *   AC1: _feed_method:'seduction' + _feed_disc:'Majesty' → rote card shows "Seduction" and "Majesty"
 *   AC2: _feed_method:'other' + custom attr/skill → rote card shows "Presence + Socialise"
 *   AC3: No _feed_method set → rote card pool area is blank (no crash)
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_ROTE = {
  _id: 'char-rote-725', name: 'Aleksei', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Circle of the Crone', player: 'Test Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 3, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
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

function makeRoteSub(feedOverrides = {}) {
  return {
    _id: 'sub-rote-725',
    chapter_id: 'cycle-001',
    character_name: 'Aleksei',
    character_id: 'char-rote-725',
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
      project_1_territory: 'secondcity',
      ...feedOverrides,
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    sorcery_review: {},
    st_review: { territory_overrides: {} },
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

test.describe('fix.725 — rote feed inherited pool surfaces in DT Processing', () => {

  test('AC1: seduction + Majesty feed method → rote card shows inherited pool string', async ({ page }) => {
    const sub = makeRoteSub({ _feed_method: 'seduction', _feed_disc: 'Majesty' });
    await setupProcessing(page, sub);
    await openRoteAction(page);

    // Pool builder "Player's Pool" row must be visible
    const poolMeta = page.locator('.proc-pool-player-meta');
    await expect(poolMeta).toBeVisible({ timeout: 6000 });

    const poolRow = poolMeta.locator('.proc-pool-meta-row').filter({ hasText: "Player's Pool" });
    await expect(poolRow).toBeVisible();
    await expect(poolRow).toContainText('Seduction');
    await expect(poolRow).toContainText('Majesty');
  });

  test('AC2: other method with custom attr/skill → rote card shows Presence + Socialise', async ({ page }) => {
    const sub = makeRoteSub({
      _feed_method: 'other',
      _feed_custom_attr: 'Presence',
      _feed_custom_skill: 'Socialise',
    });
    await setupProcessing(page, sub);
    await openRoteAction(page);

    const poolMeta = page.locator('.proc-pool-player-meta');
    await expect(poolMeta).toBeVisible({ timeout: 6000 });

    const poolRow = poolMeta.locator('.proc-pool-meta-row').filter({ hasText: "Player's Pool" });
    await expect(poolRow).toBeVisible();
    await expect(poolRow).toContainText('Presence');
    await expect(poolRow).toContainText('Socialise');
  });

  test('AC3: no feed method → rote card pool area is blank, no crash', async ({ page }) => {
    const sub = makeRoteSub({}); // no _feed_method
    await setupProcessing(page, sub);
    await openRoteAction(page);

    // Pool builder must render (no JS crash)
    await expect(page.locator('.proc-pool-builder')).toBeVisible({ timeout: 6000 });

    // Player's Pool row should NOT appear (nothing to show)
    const poolRow = page.locator('.proc-pool-meta-row').filter({ hasText: "Player's Pool" });
    await expect(poolRow).toHaveCount(0);
  });

});
