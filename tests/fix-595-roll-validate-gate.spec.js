/**
 * Fix #595 — roll card "Validate pool first" while the status ribbon reads "Valid".
 *
 * Repro (the user's exact stuck state): an action that is set to 'no_roll' (pool
 * exists, ribbon shows "Valid"), then switched to "Player Pool". The old roll-mode
 * handler gated validation on `!!(rev.roll)` (the roll RESULT) and on
 * `!DONE_STATUSES.has(curStatus)` — so switching to Player Pool on a not-yet-rolled,
 * no_roll action never validated the pool, leaving the roll card stuck on
 * "Validate pool first".
 *
 * Fix: validate when a POOL exists (rev.pool_validated / pool_player / entry.poolPlayer)
 * and it hasn't been rolled — so selecting a rolling mode enables the roll.
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: '123000595', username: 'test_st_595', global_name: 'Test ST 595',
  avatar: null, role: 'st', player_id: 'p-595', character_ids: [], is_dual_role: false,
};

const CHAR = {
  _id: 'char-595', name: 'Einar Test', moniker: null, honorific: null,
  clan: 'Gangrel', covenant: 'Invictus', player: 'P', blood_potency: 2,
  humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Auspex: { dots: 2 } }, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = { _id: 'cycle-595', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };
const TITLE = 'Hunting the Hunter';
const POOL = 'Wits 3 + Investigation 3 = 6';

// Investigate action stuck in the bug state: a pool exists, pool_status='no_roll'
// (ribbon "Valid"), roll_mode='no_roll'.
function stuckSub() {
  return {
    _id: 'sub-595',
    cycle_id: 'cycle-595',
    character_name: 'Einar Test',
    character_id: 'char-595',
    player_name: 'P',
    submitted_at: '2026-06-05T00:00:00Z',
    _raw: {
      projects: [{ action_type: 'investigate', title: TITLE, desired_outcome: TITLE, detail: 'Scour the Harbour.', primary_pool: { expression: POOL } }],
      feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    },
    responses: {
      project_1_action: 'investigate',
      project_1_title: TITLE,
      project_1_description: 'Scour the Harbour.',
      project_1_pool_expr: POOL,
    },
    projects_resolved: [{
      action_type: 'investigate',
      pool_player: POOL,
      pool_validated: POOL,
      pool_status: 'no_roll',
      roll_mode: 'no_roll',
      roll: null,
      notes_thread: [],
    }],
    feeding_review: null, merit_actions_resolved: [],
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
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openInvestigate(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-action-row', { hasText: TITLE }).first().click();
  await page.waitForSelector('.proc-action-detail .proc-proj-roll-card', { timeout: 8000 });
}

const rollCard = (page) => page.locator('.proc-action-detail .proc-proj-roll-card').first();

test.describe('Fix #595 — roll validation gate', () => {

  test('a no_roll action shows "No roll needed", not "Validate pool first"', async ({ page }) => {
    await setup(page, [stuckSub()]);
    await openInvestigate(page);
    await expect(rollCard(page)).toContainText('No roll needed');
    await expect(rollCard(page)).not.toContainText('Validate pool first');
  });

  test('selecting Player Pool validates the pool and enables the roll', async ({ page }) => {
    await setup(page, [stuckSub()]);
    await openInvestigate(page);

    // Initially stuck: no roll button.
    await expect(rollCard(page).locator('.proc-proj-roll-btn')).toHaveCount(0);

    // Switch to Player Pool — this must validate the pool so the roll becomes available.
    await page.locator('.proc-roll-mode-btn[data-roll-mode="player"]').first().click();
    await page.waitForTimeout(500);

    await expect(rollCard(page).locator('.proc-proj-roll-btn')).toHaveCount(1);
    await expect(rollCard(page)).toContainText('Roll Dice Pool');
    await expect(rollCard(page)).not.toContainText('Validate pool first');
    await expect(rollCard(page)).not.toContainText('No roll needed');
  });

  // QA top-up: ST Override is the other rolling mode and must validate the same way.
  test('selecting ST Override also validates the pool and enables the roll', async ({ page }) => {
    await setup(page, [stuckSub()]);
    await openInvestigate(page);
    await page.locator('.proc-roll-mode-btn[data-roll-mode="st_override"]').first().click();
    await page.waitForTimeout(500);
    await expect(rollCard(page).locator('.proc-proj-roll-btn')).toHaveCount(1);
    await expect(rollCard(page)).not.toContainText('Validate pool first');
  });

  // QA top-up (safety-critical): the `!rev.roll` guard must PRESERVE a real roll
  // result — re-selecting a roll mode on an already-rolled action must NOT reset it.
  test('re-selecting a mode does NOT clobber an existing roll result', async ({ page }) => {
    const rolledSub = {
      ...stuckSub(),
      projects_resolved: [{
        action_type: 'investigate',
        pool_player: POOL,
        pool_validated: POOL,
        pool_status: 'rolled',
        roll_mode: 'player',
        roll: { dice_string: '8,9,10', successes: 3, exceptional: false },
        notes_thread: [],
      }],
    };
    await setup(page, [rolledSub]);
    await openInvestigate(page);

    // The roll result is shown.
    await expect(rollCard(page)).toContainText('3 success');

    // Re-select Player Pool — the existing result must survive (not "Validate pool first").
    await page.locator('.proc-roll-mode-btn[data-roll-mode="player"]').first().click();
    await page.waitForTimeout(500);
    await expect(rollCard(page)).toContainText('3 success');
    await expect(rollCard(page)).not.toContainText('Validate pool first');
  });

});
