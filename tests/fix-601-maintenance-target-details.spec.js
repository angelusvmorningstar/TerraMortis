/**
 * Feature #601 — show the maintained asset (Target) on the Maintenance Details card.
 *
 * The player picks the maintained asset via a chip; it is stored in
 * responses.project_${n}_target_value as `${m.name}_${dots}` (e.g.
 * "Professional Training_5") with no target_type — so it never reached the
 * processing Details card. buildProcessingQueue now resolves the readable merit
 * name (strip the trailing _<dots>) into entry.maintenanceTarget, gated to
 * maintenance actions, and renderNormalisedCard shows a "Target" row.
 *
 * AC1/AC2: maintenance shows "Target: Professional Training" (not "..._5").
 * AC3: a non-maintenance action (whose target_value is a character target) shows
 *      no maintenance Target row.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000601', username: 'test_st_601', global_name: 'Test ST 601',
  avatar: null, role: 'st', player_id: 'p-601', character_ids: [], is_dual_role: false,
};

function mkChar(id, name) {
  return {
    _id: id, name, moniker: null, honorific: null,
    clan: 'Nosferatu', covenant: 'Carthian Movement', player: 'P', blood_potency: 2,
    humanity: 6, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const CARVER = mkChar('char-carver', 'Carver Test');
const RYAN   = mkChar('char-ryan',   'Ryan Ambrose');
const ALL_CHARS = [CARVER, RYAN];

const TEST_CYCLE = { _id: 'cycle-601', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const MAINT_DESC = 'Carver continues to provide advice to folks as and when requested.';

function maintenanceSub() {
  return {
    _id: 'sub-maint-601',
    cycle_id: 'cycle-601',
    character_name: 'Carver Test',
    character_id: 'char-carver',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'maintenance', detail: MAINT_DESC, primary_pool: { expression: '' } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'maintenance',
      project_1_description: MAINT_DESC,
      project_1_target_value: 'Professional Training_5',
    },
    projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

// A non-maintenance (investigate) action whose target_value is a CHARACTER target —
// must NOT produce a maintenance Target row.
function investigateSub() {
  return {
    _id: 'sub-inv-601',
    cycle_id: 'cycle-601',
    character_name: 'Carver Test',
    character_id: 'char-carver',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: 'Hunt', desired_outcome: 'Hunt', detail: 'Look around.', primary_pool: { expression: 'Wits 3 = 3' } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'investigate',
      project_1_title: 'Hunt',
      project_1_description: 'Look around.',
      project_1_target_type: 'character',
      project_1_target_value: 'char-ryan',
    },
    projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
  };
}

async function setup(page, submissions) {
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
    if (url.includes('/api/characters/names'))     return ok(ALL_CHARS.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(ALL_CHARS);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openRow(page, rowText) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: rowText }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-feed-desc-view', { timeout: 8000 });
}

const descView = (page) => page.locator('.proc-action-detail .proc-feed-desc-view').first();

test.describe('Feature #601 — maintenance target on Details card', () => {

  test('maintenance shows "Target: Professional Training" (resolved, not the raw _5)', async ({ page }) => {
    await setup(page, [maintenanceSub()]);
    await openRow(page, 'Maintenance');

    const target = descView(page).locator('.proc-proj-field', { hasText: 'Target' }).first();
    await expect(target).toBeVisible({ timeout: 5000 });
    await expect(target).toContainText('Professional Training');
    await expect(descView(page)).not.toContainText('Professional Training_5');
    await expect(descView(page)).toContainText(MAINT_DESC);
  });

  test('non-maintenance action (character target) shows no maintenance Target row', async ({ page }) => {
    await setup(page, [investigateSub()]);
    await openRow(page, 'Hunt');

    await expect(descView(page).locator('.proc-feed-lbl', { hasText: /^Target$/ })).toHaveCount(0);
  });

});
