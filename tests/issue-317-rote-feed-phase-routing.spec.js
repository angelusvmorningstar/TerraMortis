/**
 * issue-317: Rote Feed project actions routing to Step 10 instead of Step 3
 * feature.98 — expands the feed-routing block to also handle action_type 'rote'
 *
 * Test scenarios:
 *   1. 'rote' action type routes to Step 3 — Feeding, not Step 10 — Miscellaneous
 *   2. Legacy 'feed' action type still routes to Step 3 (no regression)
 *   3. Action row label shows "Rote Feed" for both 'rote' and legacy 'feed'
 *   4. Non-rote project action (patrol_scout) is unaffected — stays in its own phase
 */

const { test, expect } = require('@playwright/test');

// ── Shared stubs ───────────────────────────────────────────────────────────────

const ST_USER = {
  id: '317000001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-317', character_ids: [], is_dual_role: false,
};

const CHAR_ALICE = {
  _id: 'char-alice-317', name: 'Alice Vunder', moniker: null, honorific: null,
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
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-317', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '', phase_signoff: {},
};

// Submission with a project slot set to the given action type (rote or feed).
// No standard feeding — any feeding-phase section that appears is due to the project slot.
function makeRoteSub(actionType) {
  return {
    _id: `sub-317-${actionType}`,
    cycle_id: 'cycle-317',
    character_name: 'Alice Vunder',
    character_id:   'char-alice-317',
    player_name:    'Alice Player',
    submitted_at:   '2026-05-15T00:00:00Z',
    _raw: {
      projects: [
        { action_type: actionType, desired_outcome: 'Hunt by night', detail: '', primary_pool: { expression: '' } },
      ],
      feeding: null, sphere_actions: [],
      contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: { project_1_action: actionType },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// Submission with a non-rote project action (patrol_scout → Step 9 Support & Patrol)
function makePatrolSub() {
  return {
    _id: 'sub-317-patrol',
    cycle_id: 'cycle-317',
    character_name: 'Alice Vunder',
    character_id:   'char-alice-317',
    player_name:    'Alice Player',
    submitted_at:   '2026-05-15T00:00:00Z',
    _raw: {
      projects: [
        { action_type: 'patrol_scout', desired_outcome: 'Scout the docks', detail: '', primary_pool: { expression: '' } },
      ],
      feeding: null, sphere_actions: [],
      contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: { project_1_action: 'patrol_scout' },
    projects_resolved: [{}],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// ── Setup helper ───────────────────────────────────────────────────────────────

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
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_ALICE._id, name: CHAR_ALICE.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_ALICE]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('#dt-phase-ribbon', { state: 'visible', timeout: 8000 });
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(300);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('issue-317: Rote Feed phase routing fix (feature.98)', () => {

  test("'rote' action type: Step 3 — Feeding section is present in the queue", async ({ page }) => {
    await setup(page, [makeRoteSub('rote')]);
    // After fix: feeding section exists because rote project was routed there
    await expect(page.locator('[data-toggle-phase="feeding"]')).toBeVisible({ timeout: 10000 });
  });

  test("'rote' action type: action does NOT appear in Step 10 — Miscellaneous", async ({ page }) => {
    await setup(page, [makeRoteSub('rote')]);
    await page.waitForSelector('[data-toggle-phase="feeding"]', { state: 'visible', timeout: 10000 });
    // misc phase should have no entries — header not rendered
    await expect(page.locator('[data-toggle-phase="misc"]')).toHaveCount(0);
  });

  test("'rote' action row shows label 'Rote Feed'", async ({ page }) => {
    await setup(page, [makeRoteSub('rote')]);
    await page.waitForSelector('[data-toggle-phase="feeding"]', { state: 'visible', timeout: 10000 });
    await page.locator('[data-toggle-phase="feeding"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.proc-action-row').first()).toContainText('Rote Feed', { timeout: 5000 });
  });

  test("legacy 'feed' action type still routes to Step 3 — Feeding (no regression)", async ({ page }) => {
    await setup(page, [makeRoteSub('feed')]);
    await expect(page.locator('[data-toggle-phase="feeding"]')).toBeVisible({ timeout: 10000 });
  });

  test("legacy 'feed' action type does NOT appear in Step 10 — Miscellaneous", async ({ page }) => {
    await setup(page, [makeRoteSub('feed')]);
    await page.waitForSelector('[data-toggle-phase="feeding"]', { state: 'visible', timeout: 10000 });
    await expect(page.locator('[data-toggle-phase="misc"]')).toHaveCount(0);
  });

  test("legacy 'feed' action row shows label 'Rote Feed'", async ({ page }) => {
    await setup(page, [makeRoteSub('feed')]);
    await page.waitForSelector('[data-toggle-phase="feeding"]', { state: 'visible', timeout: 10000 });
    await page.locator('[data-toggle-phase="feeding"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.proc-action-row').first()).toContainText('Rote Feed', { timeout: 5000 });
  });

  test('patrol_scout action type is unaffected — stays in Step 9, not Step 3', async ({ page }) => {
    await setup(page, [makePatrolSub()]);
    await expect(page.locator('[data-toggle-phase="support_patrol"]')).toBeVisible({ timeout: 10000 });
    // feeding section always renders (every submission gets a standard feeding entry),
    // but patrol_scout should not produce a "Rote Feed" project row in it
    await page.locator('[data-toggle-phase="feeding"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('.proc-action-row')).not.toContainText('Rote Feed');
  });

});
