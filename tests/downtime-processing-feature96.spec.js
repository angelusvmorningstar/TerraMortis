/**
 * Downtime Processing — Feature 96/310: Confirmed/Rolled Progress Ribbon
 * Covers changes from 2026-05-14 (f96) and 2026-05-14 (f310):
 *   F96-1: Progress ribbon renders for intermediate pool states (pending/confirmed)
 *   F96-2: Committed/Confirmed and Rolled removed as clickable buttons for pool-builder action types
 *   F96-3: Terminal buttons remain clickable; Pending button absent (removed in f310)
 *   F96-4: Auto-merit action type unaffected (no ribbon, compact panel unchanged)
 *   F96-5: Roll Dice Pool button visible from pending state
 *   F96-6: Terminal button click triggers pool_validated save + status save API writes
 *   F96-7: Confirm Dice Pool button visible from pending; absent once confirmed
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_PT4 = {
  _id: 'char-pt4', name: 'Charlie Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Weaponry: { dots: 4, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [{ name: 'Allies', category: 'influence', rating: 3, qualifier: 'Criminal' }],
  powers: [], ordeals: [], _pt_dot4_bonus_skills_arr: [],
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 2, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// Project in 'pending' state, pool expression pre-set (player submitted pool)
const SUBMISSION_PROJECT_PENDING = {
  _id: 'sub-f96-proj-pending',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'ambience_increase', desired_outcome: 'Increase ambience', detail: 'Scout the district.', primary_pool: { expression: 'Strength 3 + Weaponry 4 = 7' } }],
    feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: { project_1_action: 'ambience_increase', project_1_outcome: 'Increase ambience', project_1_description: 'Scout the district.', project_1_pool_expr: 'Strength 3 + Weaponry 4 = 7' },
  projects_resolved: [{ pool_status: 'pending', pool_validated: 'Strength 3 + Weaponry 4 = 7' }],
  feeding_review: null, merit_actions_resolved: [], st_review: { territory_overrides: {} },
};

// Project in 'confirmed' state (ribbon should show Confirmed as active step)
const SUBMISSION_PROJECT_CONFIRMED = {
  _id: 'sub-f96-proj-confirmed',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'ambience_increase', desired_outcome: 'Increase ambience', detail: 'Scout the district.', primary_pool: { expression: 'Strength 3 + Weaponry 4 = 7' } }],
    feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: { project_1_action: 'ambience_increase', project_1_outcome: 'Increase ambience', project_1_description: 'Scout the district.', project_1_pool_expr: 'Strength 3 + Weaponry 4 = 7' },
  projects_resolved: [{ pool_status: 'confirmed', pool_validated: 'Strength 3 + Weaponry 4 = 7', pool_confirmed_by: 'Test ST' }],
  feeding_review: null, merit_actions_resolved: [], st_review: { territory_overrides: {} },
};

// Project in 'validated' state (terminal — ribbon should be absent)
const SUBMISSION_PROJECT_VALIDATED = {
  _id: 'sub-f96-proj-validated',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'ambience_increase', desired_outcome: 'Increase ambience', detail: 'Scout the district.', primary_pool: { expression: 'Strength 3 + Weaponry 4 = 7' } }],
    feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: { project_1_action: 'ambience_increase', project_1_outcome: 'Increase ambience', project_1_description: 'Scout the district.', project_1_pool_expr: 'Strength 3 + Weaponry 4 = 7' },
  projects_resolved: [{ pool_status: 'validated', pool_validated: 'Strength 3 + Weaponry 4 = 7', pool_confirmed_by: 'Test ST', pool_validated_by: 'Test ST', roll: { dice_string: '[8,7,5]', successes: 2, exceptional: false } }],
  feeding_review: null, merit_actions_resolved: [], st_review: { territory_overrides: {} },
};

// Feeding in 'pending' state
const SUBMISSION_FEEDING_PENDING = {
  _id: 'sub-f96-feed-pending',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'predator', pool: { expression: 'Strength 3 + Weaponry 4 = 7' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: { feeding_method: 'predator', feeding_pool_expr: 'Strength 3 + Weaponry 4 = 7' },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Strength 3 + Weaponry 4 = 7', pool_validated: 'Strength 3 + Weaponry 4 = 7',
    pool_status: 'pending', nine_again: false, eight_again: false,
    active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0, notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [], st_review: { territory_overrides: {} },
};

// Sorcery in 'pending' state
const SUBMISSION_SORCERY_PENDING = {
  _id: 'sub-f96-sorc-pending',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [], feeding: null, sphere_actions: [],
    contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    sorcery_slot_count: '1', sorcery_1_rite: 'Fires of Inspiration',
    sorcery_1_targets: '', sorcery_1_notes: '', sorcery_1_pool_expr: 'Intelligence 2 + Occult 3 = 5',
  },
  projects_resolved: [], feeding_review: null, merit_actions_resolved: [],
  sorcery_review: { 1: { pool_status: 'pending' } },
  st_review: { territory_overrides: {} },
};

// Non-auto merit (investigate, formula dots2plus2) in 'pending' state
const SUBMISSION_MERIT_INVEST_PENDING = {
  _id: 'sub-f96-merit-invest',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [], feeding: null,
    sphere_actions: [{ merit_type: 'Allies 3 (Criminal)', action_type: 'investigate', description: 'Criminal network investigates.', desired_outcome: 'Learn secrets', primary_pool: { expression: '' } }],
    contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [], feeding_review: null,
  merit_actions_resolved: [{ pool_status: 'pending', inv_secrecy: '', inv_has_lead: null }],
  st_review: { territory_overrides: {} },
};

// Auto-mode merit (ambience_decrease → compact panel; no ribbon)
const SUBMISSION_AUTO_MERIT_PENDING = {
  _id: 'sub-f96-auto-merit',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test', character_id: 'char-pt4', player_name: 'Test Player',
  submitted_at: '2026-05-14T00:00:00Z',
  _raw: {
    projects: [], feeding: null,
    sphere_actions: [{ merit_type: 'Allies 3 (Criminal)', action_type: 'ambience_decrease', description: 'Undermine the peace.', desired_outcome: 'Reduce ambience', primary_pool: { expression: '' } }],
    contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [], feeding_review: null,
  merit_actions_resolved: [{ pool_status: 'pending' }],
  st_review: { territory_overrides: {} },
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setupDowntimeProcessing(page, submissions, chars = [CHAR_PT4]) {
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

    if (url.includes('/api/downtime_submissions'))    return ok(submissions);
    if (url.includes('/api/downtime_cycles'))         return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))        return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))              return ok(chars);
    if (url.includes('/api/territories'))             return ok([]);
    if (url.includes('/api/game_sessions'))           return ok([]);
    if (url.includes('/api/session_logs'))            return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFirstAction(page, phaseLabel) {
  await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
  const phaseHeader = page.locator('.proc-phase-header').filter({ hasText: phaseLabel }).first();
  const toggle = phaseHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await phaseHeader.click();
  await page.waitForTimeout(200);
  const phase = page.locator('.proc-phase-section').filter({ hasText: phaseLabel }).first();
  const firstRow = phase.locator('.proc-action-row').first();
  await firstRow.click();
  await page.waitForTimeout(400);
}

// ── F96-1: Progress ribbon rendering ──────────────────────────────────────────

test.describe('F96-1: Progress ribbon renders for intermediate pool states', () => {

  test('project panel shows ribbon when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-status-ribbon').first()).toBeVisible({ timeout: 5000 });
  });

  test('project ribbon highlights Pending step as active when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-ribbon-step.ribbon-active.pending').first()).toBeVisible({ timeout: 5000 });
  });

  test('project ribbon shows Confirmed and Rolled as future steps when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    const future = page.locator('.proc-ribbon-step.ribbon-future');
    await expect(future).toHaveCount(2);
  });

  test('project ribbon highlights Confirmed step as active when pool_status is confirmed', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_CONFIRMED]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-ribbon-step.ribbon-active.confirmed').first()).toBeVisible({ timeout: 5000 });
  });

  test('project ribbon shows Pending as past step when pool_status is confirmed', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_CONFIRMED]);
    await openFirstAction(page, 'Ambience');

    const past = page.locator('.proc-ribbon-step.ribbon-past');
    await expect(past).toHaveCount(1);
  });

  test('feeding panel shows ribbon when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-status-ribbon').first()).toBeVisible({ timeout: 5000 });
  });

  test('feeding ribbon highlights Pending step as active when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-ribbon-step.ribbon-active.pending').first()).toBeVisible({ timeout: 5000 });
  });

  test('sorcery panel shows ribbon when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY_PENDING]);
    await openFirstAction(page, 'Sorcery');

    await expect(page.locator('.proc-status-ribbon').first()).toBeVisible({ timeout: 5000 });
  });

  test('non-auto merit panel shows ribbon when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_MERIT_INVEST_PENDING]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-status-ribbon').first()).toBeVisible({ timeout: 5000 });
  });

  test('project panel does NOT show ribbon when pool_status is terminal (validated)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_VALIDATED]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-status-ribbon')).toHaveCount(0);
  });

});

// ── F96-2: Committed/Rolled removed as clickable buttons ──────────────────────

test.describe('F96-2: Committed and Rolled removed from pool-builder button sets', () => {

  test('project panel has no Committed button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="committed"]')).toHaveCount(0);
  });

  test('project panel has no Rolled button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="rolled"]')).toHaveCount(0);
  });

  test('feeding panel has no Committed button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-val-btn[data-status="committed"]')).toHaveCount(0);
  });

  test('feeding panel has no Rolled button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-val-btn[data-status="rolled"]')).toHaveCount(0);
  });

  test('sorcery panel has no Committed button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY_PENDING]);
    await openFirstAction(page, 'Sorcery');

    await expect(page.locator('.proc-val-btn[data-status="committed"]')).toHaveCount(0);
  });

  test('sorcery panel has no Rolled button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY_PENDING]);
    await openFirstAction(page, 'Sorcery');

    await expect(page.locator('.proc-val-btn[data-status="rolled"]')).toHaveCount(0);
  });

  test('non-auto merit panel has no Committed button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_MERIT_INVEST_PENDING]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-val-btn[data-status="committed"]')).toHaveCount(0);
  });

  test('non-auto merit panel has no Rolled button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_MERIT_INVEST_PENDING]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-val-btn[data-status="rolled"]')).toHaveCount(0);
  });

});

// ── F96-3: Terminal buttons and Pending reset remain ──────────────────────────

test.describe('F96-3: Terminal buttons and Pending reset remain clickable', () => {

  test('project panel still has Validated button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="validated"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('project panel still has No Roll Needed button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="no_roll"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('project panel still has Skip button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="skipped"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('project panel has NO Pending reset button (removed in f310 — Clear Pool is the reset path)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="pending"]')).toHaveCount(0);
  });

  test('feeding panel still has Validated button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-val-btn[data-status="validated"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('feeding panel still has No Valid Feeding button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-val-btn[data-status="no_feed"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('sorcery panel still has Resolved button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY_PENDING]);
    await openFirstAction(page, 'Sorcery');

    await expect(page.locator('.proc-val-btn[data-status="resolved"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('sorcery panel still has No Effect button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY_PENDING]);
    await openFirstAction(page, 'Sorcery');

    await expect(page.locator('.proc-val-btn[data-status="no_effect"]').first()).toBeVisible({ timeout: 5000 });
  });

});

// ── F96-4: Auto-merit action unaffected ───────────────────────────────────────

test.describe('F96-4: Auto-merit action type unaffected by ribbon changes', () => {

  test('auto-merit action has no progress ribbon', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_AUTO_MERIT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-status-ribbon')).toHaveCount(0);
  });

  test('auto-merit action still renders compact panel (not val-status row)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_AUTO_MERIT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-compact-merit-panel').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-val-status')).toHaveCount(0);
  });

  test('auto-merit action has no Committed or Rolled buttons in compact panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_AUTO_MERIT_PENDING]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-val-btn[data-status="committed"]')).toHaveCount(0);
    await expect(page.locator('.proc-val-btn[data-status="rolled"]')).toHaveCount(0);
  });

});

// ── F96-5: Roll button visible from pending ───────────────────────────────────

test.describe('F96-5: Roll button visible from pending (no longer requires Committed first)', () => {

  test('project Roll button is visible when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
  });

  test('feeding Roll button is visible when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    const rollBtn = page.locator('.proc-feed-roll-btn').first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
  });

  test('project Roll Dice Pool button remains visible after pool_status advances to confirmed (no regression)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_CONFIRMED]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
  });

});

// ── F96-6: Implicit commit API write on terminal button click ─────────────────

test.describe('F96-6: Terminal button click triggers implicit commit API write', () => {

  test('clicking Validated on pending project triggers at least one API write', async ({ page }) => {
    const writes = [];

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER });

    await page.route('http://localhost:3000/**', route => {
      const url = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
        writes.push({ method, url });
        return ok({ ok: true });
      }

      if (url.includes('/api/downtime_submissions'))    return ok([SUBMISSION_PROJECT_PENDING]);
      if (url.includes('/api/downtime_cycles'))         return ok([TEST_CYCLE]);
      if (url.includes('/api/characters/names'))        return ok([{ _id: CHAR_PT4._id, name: CHAR_PT4.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))              return ok([CHAR_PT4]);
      if (url.includes('/api/territories'))             return ok([]);
      if (url.includes('/api/game_sessions'))           return ok([]);
      if (url.includes('/api/session_logs'))            return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(1000);
    await openFirstAction(page, 'Ambience');

    writes.length = 0; // clear any writes from initial load

    const validatedBtn = page.locator('.proc-val-btn[data-status="validated"]').first();
    await expect(validatedBtn).toBeVisible({ timeout: 5000 });
    await validatedBtn.click();
    await page.waitForTimeout(600);

    // pool_validated save + statusPatch save = at least 2 writes
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  test('clicking a terminal button on already-confirmed entry makes at least one status save', async ({ page }) => {
    const writes = [];

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER });

    await page.route('http://localhost:3000/**', route => {
      const url = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
        writes.push({ method, url });
        return ok({ ok: true });
      }

      if (url.includes('/api/downtime_submissions'))    return ok([SUBMISSION_PROJECT_CONFIRMED]);
      if (url.includes('/api/downtime_cycles'))         return ok([TEST_CYCLE]);
      if (url.includes('/api/characters/names'))        return ok([{ _id: CHAR_PT4._id, name: CHAR_PT4.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))              return ok([CHAR_PT4]);
      if (url.includes('/api/territories'))             return ok([]);
      if (url.includes('/api/game_sessions'))           return ok([]);
      if (url.includes('/api/session_logs'))            return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(1000);
    await openFirstAction(page, 'Ambience');

    writes.length = 0;

    const validatedBtn = page.locator('.proc-val-btn[data-status="validated"]').first();
    await expect(validatedBtn).toBeVisible({ timeout: 5000 });
    await validatedBtn.click();
    await page.waitForTimeout(600);

    expect(writes.length).toBeGreaterThanOrEqual(1);
  });

});

// ── F96-7: Confirm Dice Pool button (feature.310) ─────────────────────────────

test.describe('F96-7: Confirm Dice Pool button visible from pending; absent once confirmed', () => {

  test('project panel shows Confirm Dice Pool button when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    const confirmBtn = page.locator('.proc-confirm-pool-btn').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  });

  test('project Confirm Dice Pool button is labelled correctly', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    const confirmBtn = page.locator('.proc-confirm-pool-btn').first();
    await expect(confirmBtn).toHaveText('Confirm Dice Pool');
  });

  test('project panel has NO Confirm Dice Pool button when pool_status is confirmed', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_CONFIRMED]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-confirm-pool-btn')).toHaveCount(0);
  });

  test('feeding panel shows Confirm Dice Pool button when pool_status is pending', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_PENDING]);
    await openFirstAction(page, 'Feeding');

    const confirmBtn = page.locator('.proc-confirm-pool-btn').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  });

  test('project Roll Dice Pool button label is correct (first roll, no prior roll)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_PENDING]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toHaveText('Roll Dice Pool');
  });

});
