/**
 * fix.729 — DT Processing: spec bonus dice missing from project action roll
 *
 * Root cause: .proc-proj-roll-btn handler extracted diceCount from pool_validated
 * only, ignoring pool_mod_spec (active specialty bonus). The feeding handler
 * (.proc-feed-roll-btn) correctly added pool_mod_spec.
 *
 * Fix: add `diceCount += (review?.pool_mod_spec || 0)` in the project handler.
 *
 * Acceptance criteria:
 *   AC1: pool_validated=7, pool_mod_spec=1 → roll modal opens with "8 dice"
 *   AC2: pool_validated=5, pool_mod_spec=0 → roll modal opens with "5 dice" (no regression)
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const TEST_CHAR = {
  _id: 'char-729', name: 'Aleksei', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Carthian Movement', player: 'Test Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 3, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {
    Empathy: { dots: 4, bonus: 0, specs: ['Groups'], nine_again: false },
  },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-729', cycle_number: 5, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

function makeSub(projectsResolved) {
  return {
    _id: 'sub-729',
    cycle_id: 'cycle-729',
    character_name: 'Aleksei',
    character_id: 'char-729',
    player_name: 'Test Player',
    submitted_at: '2026-06-14T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'rote', primary_pool: null, desired_outcome: 'Feed.' }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'rote',
      project_1_title: 'Rote Feed',
      project_1_description: 'Feed using rote.',
      project_1_territory: 'firstcity',
    },
    projects_resolved: projectsResolved || [],
    feeding_review: null,
    merit_actions_resolved: [],
    sorcery_review: {},
    st_review: { territory_overrides: {} },
  };
}

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
    if (url.includes('/api/downtime_cycles'))       return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))      return ok([{ _id: TEST_CHAR._id, name: TEST_CHAR.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))            return ok([TEST_CHAR]);
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

async function openAction(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('fix.729 — project roll includes pool_mod_spec in dice count', () => {

  test('AC1: pool_mod_spec=1 is added to the roll size — modal shows 8 dice', async ({ page }) => {
    const sub = makeSub([{
      action_type: 'rote',
      pool_validated: 'Presence 3 + Empathy 4 ±0 = 7',
      pool_status: 'confirmed',
      pool_mod_spec: 1,
      active_feed_specs: ['Groups'],
      roll: null,
    }]);

    await setupProcessing(page, sub);
    await openAction(page);

    // Confirm button advances pool_status → proceed to roll
    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await rollBtn.waitFor({ state: 'visible', timeout: 8000 });
    await rollBtn.click();

    // Roll modal should appear
    const modal = page.locator('#roll-modal-overlay');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // The .roll-param element showing dice count must say "8 dice"
    const diceParam = modal.locator('.roll-param').first();
    await expect(diceParam).toHaveText('8 dice');
  });

  test('AC2: pool_mod_spec=0 does not inflate the roll — modal shows 5 dice', async ({ page }) => {
    const char = { ...TEST_CHAR, skills: { Stealth: { dots: 2, bonus: 0, specs: [], nine_again: false } } };

    const sub = makeSub([{
      action_type: 'investigate',
      pool_validated: 'Wits 3 + Stealth 2 ±0 = 5',
      pool_status: 'confirmed',
      pool_mod_spec: 0,
      active_feed_specs: [],
      roll: null,
    }]);
    // Override character route to use modified char
    await page.route('http://localhost:3000/api/characters*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
    );
    // Override responses for investigate action type
    sub.responses = { ...sub.responses, project_1_action: 'investigate' };

    await setupProcessing(page, sub);
    await openAction(page);

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await rollBtn.waitFor({ state: 'visible', timeout: 8000 });
    await rollBtn.click();

    const modal = page.locator('#roll-modal-overlay');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const diceParam = modal.locator('.roll-param').first();
    await expect(diceParam).toHaveText('5 dice');
  });

});
