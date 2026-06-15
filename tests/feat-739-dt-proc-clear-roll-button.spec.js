/**
 * Tests for feat #739 — DT Processing: Clear Roll button on feeding ROLL card
 *
 * AC-1: "Clear Roll" button is visible inside .proc-feed-right when feeding_roll is set
 * AC-2: "Clear Roll" button is absent when feeding_roll is null/absent
 * AC-3: Clicking Clear Roll sends a PATCH with feeding_roll: null
 * AC-4: After clicking Clear Roll, the roll result is gone and button label resets to "Roll Dice Pool"
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ST_USER_739 = {
  id: '123000739', username: 'test_st_739', global_name: 'Test ST 739',
  avatar: null, role: 'st', player_id: 'p-739', character_ids: [], is_dual_role: false,
};

const CYCLE_739 = {
  _id: 'cycle-739', cycle_number: 5, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_739 = {
  _id: 'char-739', name: 'Clear Roll Tester', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player 739',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: 'academy', retired: false,
  status: { city: 1, clan: 0, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TERRITORY_ACADEMY_739 = {
  _id: 'aaa000000000000000000739', slug: 'academy', name: 'The Academy',
  regent_id: null, lieutenant_id: null, feeding_rights: [], ambience: 2,
};

const FEED_ROLL_OBJ = {
  successes: 1,
  exceptional: false,
  dice: [1, 4, 2, 3, 2, 5, 1, 8],
  dice_string: '[1,4,2,3,2,5,1,8]',
  pool: 8,
  methodName: 'kiss',
  rolledAt: '2026-06-15T10:00:00Z',
};

// Submission WITH a roll result
const SUB_WITH_ROLL = {
  _id: 'sub-739-rolled',
  cycle_id: 'cycle-739',
  character_name: 'Clear Roll Tester',
  character_id: 'char-739',
  player_name: 'Test Player 739',
  submitted_at: '2026-06-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feed_violence: 'kiss',
    '_feed_blood_types': '["human"]',
    feeding_territories: '{"the_academy":"feeding_rights"}',
  },
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5',
    pool_validated: 'Presence 3 + Persuasion 2 = 5',
    pool_status: 'rolled',
    nine_again: false, eight_again: false,
    active_feed_specs: [], pool_mod_spec: 0, pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  feeding_roll: FEED_ROLL_OBJ,
  feeding_vitae_tally: { total: 2 },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_review: {},
  st_narrative: {},
};

// Submission WITHOUT a roll result
const SUB_NO_ROLL = {
  ...SUB_WITH_ROLL,
  _id: 'sub-739-no-roll',
  feeding_review: {
    ...SUB_WITH_ROLL.feeding_review,
    pool_status: 'confirmed',
  },
  feeding_roll: null,
  feeding_vitae_tally: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupProcessing739(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER_739 });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions'))  return ok(submissions);
    if (url.includes('/api/downtime_cycles'))       return ok([CYCLE_739]);
    if (url.includes('/api/characters/names'))      return ok([{ _id: CHAR_739._id, name: CHAR_739.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))            return ok([CHAR_739]);
    if (url.includes('/api/territories'))           return ok([TERRITORY_ACADEMY_739]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(1000);
}

async function openFeedingAction739(page) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
  await page.waitForTimeout(300);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.739: Clear Roll button on feeding ROLL card', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: Clear Roll button is visible in right panel when feeding_roll exists', async ({ page }) => {
    await setupProcessing739(page, [SUB_WITH_ROLL]);
    await openFeedingAction739(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    const clearBtn = rightPanel.locator('.proc-feed-clear-roll-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await expect(clearBtn).toContainText('Clear Roll');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: Clear Roll button is absent when feeding_roll is null', async ({ page }) => {
    await setupProcessing739(page, [SUB_NO_ROLL]);
    await openFeedingAction739(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });

    await expect(rightPanel.locator('.proc-feed-clear-roll-btn')).toHaveCount(0);
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: clicking Clear Roll sends PATCH with feeding_roll: null', async ({ page }) => {
    const capturedPatches = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' || req.method() === 'PUT') {
        try { capturedPatches.push(JSON.parse(req.postData() || '{}')); } catch { /* ignore */ }
      }
    });

    await setupProcessing739(page, [SUB_WITH_ROLL]);
    await openFeedingAction739(page);

    const rightPanel = page.locator('.proc-feed-right').first();
    await rightPanel.locator('.proc-feed-clear-roll-btn').click();
    await page.waitForTimeout(600);

    expect(capturedPatches.length).toBeGreaterThan(0);
    const patch = capturedPatches[0];
    expect(patch.feeding_roll).toBeNull();
    expect(patch.feeding_vitae_tally).toBeNull();
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: after Clear Roll, result line gone and button shows "Roll Dice Pool"', async ({ page }) => {
    await setupProcessing739(page, [SUB_WITH_ROLL]);
    await openFeedingAction739(page);

    const rightPanel = page.locator('.proc-feed-right').first();

    // Confirm roll result is visible before clearing
    await expect(rightPanel.locator('.proc-proj-roll-result').first()).toBeVisible({ timeout: 5000 });

    // Click Clear Roll
    await rightPanel.locator('.proc-feed-clear-roll-btn').click();
    await page.waitForTimeout(800);

    // Roll result line should be gone
    await expect(rightPanel.locator('.proc-proj-roll-result')).toHaveCount(0);

    // Roll button should now say "Roll Dice Pool" (not "Re-roll")
    const rollBtn = rightPanel.locator('.proc-feed-roll-btn');
    await expect(rollBtn).toContainText('Roll Dice Pool');
  });

});
