/**
 * Wizard pre-flight checks — E2E tests for the "New Cycle" reset wizard.
 *
 * Tests the blocking/warning logic in the wizard checklist:
 *   - Blank narrative on a staged submission blocks Begin Reset
 *   - Unresolved submissions block Begin Reset
 *   - All checks passed → Begin Reset enabled immediately
 *   - After ticking all blocking checkboxes, Begin Reset enables
 *
 * Uses Playwright with mocked API responses (no live server needed).
 */

const { test, expect } = require('@playwright/test');

// ── Shared auth setup ──────────────────────────────────────────────────────

function stAuthHeaders() {
  return {
    tm_auth_token: 'local-test-token',
    tm_auth_expires: String(Date.now() + 3600000),
    tm_auth_user: JSON.stringify({
      id: 'st-001', username: 'test_st', global_name: 'Test ST',
      avatar: null, role: 'st', player_id: 'p-001', character_ids: [],
      is_dual_role: false,
    }),
  };
}

function baseMocks(page, overrides = {}) {
  const defaults = {
    characters: [
      {
        _id: 'char-001', name: 'Alice Test', moniker: null, honorific: null,
        clan: 'Daeva', covenant: 'Invictus', player: 'Test Player', blood_potency: 2,
        humanity: 6, humanity_base: 7, court_title: null, retired: false,
        status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
        attributes: {
          Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 },
          Stamina: { dots: 2, bonus: 0 }, Intelligence: { dots: 2, bonus: 0 },
          Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
          Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 },
          Composure: { dots: 2, bonus: 0 },
        },
        skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
        influence_balance: 0,
      },
    ],
    cycles: [{
      _id: 'cycle-001', game_number: 2, label: 'Downtime 2',
      status: 'active', submission_count: 1,
    }],
    submissions: [],
    territories: [],
    game_sessions: [],
  };
  return { ...defaults, ...overrides };
}

async function setupPage(page, mocks) {
  await page.addInitScript((headers) => {
    for (const [k, v] of Object.entries(headers)) localStorage.setItem(k, v);
  }, stAuthHeaders());

  await page.route('http://localhost:3000/api/characters**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mocks.characters) }));
  await page.route('http://localhost:3000/api/downtime_cycles**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mocks.cycles) }));
  await page.route('http://localhost:3000/api/downtime_submissions**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mocks.submissions) }));
  await page.route('http://localhost:3000/api/territories**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mocks.territories) }));
  await page.route('http://localhost:3000/api/game_sessions**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mocks.game_sessions) }));
  await page.route('http://localhost:3000/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
}

async function openWizard(page) {
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  const btn = await page.$('#dt-new-cycle');
  if (!btn) throw new Error('#dt-new-cycle button not found');
  await btn.click();
  // Wait for wizard overlay
  await page.waitForSelector('.gc-wizard-overlay, .gc-wizard-box', { timeout: 5000 });
}

// ══════════════════════════════════════════════════════════════

test('wizard shows "all checks passed" and Begin Reset is enabled when no issues', async ({ page }) => {
  const mocks = baseMocks(page, {
    submissions: [{
      _id: 'sub-001', cycle_id: 'cycle-001',
      character_id: 'char-001', character_name: 'Alice Test', player_name: 'Test Player',
      approval_status: 'approved',
      st_review: { outcome_text: 'A full narrative.', outcome_visibility: 'ready' },
      feeding_roll: { result: 3 },
      _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] }, projects: [], feeding: null },
      responses: {}, projects_resolved: [], merit_actions_resolved: [],
    }],
  });

  await setupPage(page, mocks);
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 });
  await openWizard(page);

  const beginBtn = await page.$('#gc-begin');
  expect(beginBtn).toBeTruthy();
  const disabled = await beginBtn.getAttribute('disabled');
  expect(disabled).toBeNull(); // not disabled
  const itemText = await page.textContent('.gc-checklist');
  expect(itemText).toContain('All checks passed');
});

test('wizard blocks Begin Reset when a staged submission has blank narrative', async ({ page }) => {
  const mocks = baseMocks(page, {
    submissions: [{
      _id: 'sub-blank', cycle_id: 'cycle-001',
      character_id: 'char-001', character_name: 'Alice Test', player_name: 'Test Player',
      approval_status: 'approved',
      // outcome_text is blank — this is the risk scenario
      st_review: { outcome_text: '', outcome_visibility: 'ready' },
      feeding_roll: { result: 2 },
      _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] }, projects: [], feeding: null },
      responses: {}, projects_resolved: [], merit_actions_resolved: [],
    }],
  });

  await setupPage(page, mocks);
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 });
  await openWizard(page);

  // Begin Reset should be disabled
  const beginBtn = await page.$('#gc-begin');
  const disabled = await beginBtn.getAttribute('disabled');
  expect(disabled).not.toBeNull();

  // Should show blank narrative warning
  const listText = await page.textContent('.gc-checklist');
  expect(listText).toMatch(/blank narrative|no narrative/i);

  // Tick the checkbox to acknowledge
  const checkbox = await page.$('.gc-dismiss-check');
  expect(checkbox).toBeTruthy();
  await checkbox.click();
  await page.waitForTimeout(100);

  // Begin Reset should now enable
  const disabledAfter = await beginBtn.getAttribute('disabled');
  expect(disabledAfter).toBeNull();
});

test('wizard blocks Begin Reset for unresolved submissions', async ({ page }) => {
  const mocks = baseMocks(page, {
    submissions: [{
      _id: 'sub-unresolved', cycle_id: 'cycle-001',
      character_id: 'char-001', character_name: 'Alice Test', player_name: 'Test Player',
      approval_status: 'approved',
      // No outcome_visibility set — unresolved
      st_review: {},
      _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] }, projects: [], feeding: null },
      responses: {}, projects_resolved: [], merit_actions_resolved: [],
    }],
  });

  await setupPage(page, mocks);
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 });
  await openWizard(page);

  const beginBtn = await page.$('#gc-begin');
  const disabled = await beginBtn.getAttribute('disabled');
  expect(disabled).not.toBeNull();

  const listText = await page.textContent('.gc-checklist');
  expect(listText).toMatch(/unresolved/i);
});

test('wizard shows cancel button and it closes the overlay', async ({ page }) => {
  const mocks = baseMocks(page, { submissions: [] });

  await setupPage(page, mocks);
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 });
  await openWizard(page);

  await page.click('#gc-cancel');
  await page.waitForTimeout(300);

  const overlay = await page.$('.gc-wizard-overlay');
  // Either gone or hidden
  if (overlay) {
    const visible = await overlay.isVisible();
    expect(visible).toBe(false);
  }
});

test('dismiss-all button appears with multiple blocking items and clears them', async ({ page }) => {
  const mocks = baseMocks(page, {
    characters: [
      { _id: 'char-001', name: 'Alice', moniker: null, honorific: null, clan: 'Daeva', covenant: 'Invictus', player: 'P1', blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null, retired: false, status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } }, attributes: { Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } }, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {}, influence_balance: 0 },
      { _id: 'char-002', name: 'Bob', moniker: null, honorific: null, clan: 'Gangrel', covenant: 'Circle', player: 'P2', blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false, status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } }, attributes: { Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 }, Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 }, Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 } }, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {}, influence_balance: 0 },
    ],
    submissions: [
      {
        _id: 'sub-a', cycle_id: 'cycle-001',
        character_id: 'char-001', character_name: 'Alice', player_name: 'P1',
        approval_status: 'approved', st_review: {},
        _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] }, projects: [], feeding: null },
        responses: {}, projects_resolved: [], merit_actions_resolved: [],
      },
      {
        _id: 'sub-b', cycle_id: 'cycle-001',
        character_id: 'char-002', character_name: 'Bob', player_name: 'P2',
        approval_status: 'approved', st_review: {},
        _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] }, projects: [], feeding: null },
        responses: {}, projects_resolved: [], merit_actions_resolved: [],
      },
    ],
  });

  await setupPage(page, mocks);
  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 15000 });
  await openWizard(page);

  // Dismiss all button should appear
  const dismissAll = await page.$('#gc-dismiss-all');
  expect(dismissAll).toBeTruthy();

  await dismissAll.click();
  await page.waitForTimeout(200);

  // Begin Reset should be enabled after dismiss all
  const beginBtn = await page.$('#gc-begin');
  const disabled = await beginBtn.getAttribute('disabled');
  expect(disabled).toBeNull();
});
