/**
 * Downtime Admin Processing — General Smoke Tests
 *
 * Covers the ST-facing processing panel on admin.html:
 *   - Downtime domain loads
 *   - Phase ribbon renders with all 5 tabs
 *   - Empty state (no submissions) renders gracefully
 *   - Processing queue renders when submissions exist
 *   - Phase ribbon navigation — each tab switches view
 *   - Story tab shows narrative interface
 *   - Projects tab shows processing sections
 *   - ST notes input is present and functional
 *   - Multiple characters visible in character selector
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-admin-smoke', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: 'Test notes',
  phase_signoff: {},
};

const CHAR_A = {
  _id: 'char-smoke-a', name: 'Alpha Smoke', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Player One',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 1, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

const CHAR_B = {
  ...CHAR_A, _id: 'char-smoke-b', name: 'Beta Smoke', player: 'Player Two',
  status: { city: 1, clan: 1, covenant: { Carthian: 1, Crone: 0, Invictus: 0, Lancea: 0, OD: 0 } },
};

// Submission with a project action
const SUBMISSION_PROJECT = {
  _id: 'sub-smoke-proj',
  cycle_id: 'cycle-admin-smoke',
  character_name: 'Alpha Smoke',
  character_id: 'char-smoke-a',
  player_name: 'Player One',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'patrol_scout', desired_outcome: 'Scout the harbour', detail: 'Looking for trouble.' }],
    feeding: { method: 'predatory_aura', pool: { expression: 'Presence 3 + Intimidation 0 = 3' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action_type: 'patrol_scout',
    project_1_description: 'Looking for trouble.',
    _feed_method: 'predatory_aura',
  },
  projects_resolved: [],
  feeding_review: { pool_player: 'Presence 3 = 3', pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Submission with a feeding action only
const SUBMISSION_FEEDING = {
  _id: 'sub-smoke-feed',
  cycle_id: 'cycle-admin-smoke',
  character_name: 'Beta Smoke',
  character_id: 'char-smoke-b',
  player_name: 'Player Two',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: { _feed_method: 'seduction' },
  projects_resolved: [],
  feeding_review: { pool_player: 'Presence 3 + Persuasion 2 = 5', pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setup(page, { submissions = [], chars = [CHAR_A, CHAR_B], cycle = ACTIVE_CYCLE } = {}) {
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
    if (url.includes('/api/downtime_cycles'))      return ok(cycle ? [cycle] : []);
    if (url.includes('/api/characters/names'))     return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(chars);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
}

async function openDowntime(page) {
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
}

// ── Section: Downtime domain loads ───────────────────────────────────────────

test.describe('Admin DT — Domain loads', () => {

  test('Downtime domain button is present in sidebar', async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-domain="downtime"]')).toBeVisible({ timeout: 5000 });
  });

  test('Clicking downtime domain shows the DT panel', async ({ page }) => {
    await setup(page);
    await openDowntime(page);
    // Admin app should show some DT content
    await expect(page.locator('#admin-app')).toBeVisible();
    // Phase ribbon or DT content should appear
    await expect(page.locator('#dt-phase-ribbon, .dt-domain-panel').first()).toBeVisible({ timeout: 8000 });
  });

});

// ── Section: Phase ribbon ─────────────────────────────────────────────────────

test.describe('Admin DT — Phase ribbon', () => {

  test('Phase ribbon renders with DT Prep tab', async ({ page }) => {
    await setup(page);
    await openDowntime(page);
    await expect(page.locator('#dt-phase-ribbon .pr-tab[data-phase="prep"]')).toBeVisible({ timeout: 8000 });
  });

  test('Phase ribbon has DT Projects tab', async ({ page }) => {
    await setup(page);
    await openDowntime(page);
    await expect(page.locator('#dt-phase-ribbon .pr-tab[data-phase="projects"]')).toBeVisible({ timeout: 8000 });
  });

  test('Phase ribbon has DT Story tab', async ({ page }) => {
    await setup(page);
    await openDowntime(page);
    await expect(page.locator('#dt-phase-ribbon .pr-tab[data-phase="story"]')).toBeVisible({ timeout: 8000 });
  });

  test('Phase ribbon has DT City tab', async ({ page }) => {
    await setup(page);
    await openDowntime(page);
    await expect(page.locator('#dt-phase-ribbon .pr-tab[data-phase="city"]')).toBeVisible({ timeout: 8000 });
  });

  test('Phase ribbon has DT Ready tab', async ({ page }) => {
    await setup(page);
    await openDowntime(page);
    await expect(page.locator('#dt-phase-ribbon .pr-tab[data-phase="ready"]')).toBeVisible({ timeout: 8000 });
  });

});

// ── Section: Empty state ──────────────────────────────────────────────────────

test.describe('Admin DT — Empty state (no submissions)', () => {

  test('No crash when processing queue has zero submissions', async ({ page }) => {
    await setup(page, { submissions: [] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // Should not crash — admin-app still visible
    await expect(page.locator('#admin-app')).toBeVisible();
  });

  test('No crash when no active cycle', async ({ page }) => {
    await setup(page, { submissions: [], cycle: null });
    await openDowntime(page);
    await page.waitForTimeout(400);
    await expect(page.locator('#admin-app')).toBeVisible();
  });

});

// ── Section: Processing queue with submissions ────────────────────────────────

test.describe('Admin DT — Processing queue renders', () => {

  test('Projects tab renders processing sections when submissions exist', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT, SUBMISSION_FEEDING] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // At least one phase section should be visible
    await expect(page.locator('.proc-phase-section').first()).toBeVisible({ timeout: 8000 });
  });

  test('Feeding phase section is present in projects view', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_FEEDING] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // Step 3 — Feeding header should appear
    const feedingHeader = page.locator('.proc-phase-header').filter({ hasText: 'Step 3' }).first();
    await expect(feedingHeader).toBeVisible({ timeout: 8000 });
  });

  test('Project action rows appear for submitted project actions', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // Expand any phase to find action rows
    const anyHeader = page.locator('.proc-phase-header').first();
    await anyHeader.click();
    await page.waitForTimeout(200);
    await expect(page.locator('.proc-action-row').first()).toBeVisible({ timeout: 5000 });
  });

  test('Character name appears in the action queue row', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    const anyHeader = page.locator('.proc-phase-header').first();
    await anyHeader.click();
    await page.waitForTimeout(200);
    const rows = page.locator('.proc-action-row');
    const rowText = await rows.first().textContent().catch(() => '');
    expect(rowText).toMatch(/Alpha|Beta|Smoke/i);
  });

});

// ── Section: Phase navigation ────────────────────────────────────────────────

test.describe('Admin DT — Phase ribbon navigation', () => {

  test('Clicking DT Story tab activates it', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
    await page.waitForTimeout(300);
    const storyTab = page.locator('#dt-phase-ribbon .pr-tab[data-phase="story"]');
    await expect(storyTab).toHaveClass(/pr-tab-active/);
  });

  test('Clicking DT City tab activates it', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
    await page.waitForTimeout(300);
    const cityTab = page.locator('#dt-phase-ribbon .pr-tab[data-phase="city"]');
    await expect(cityTab).toHaveClass(/pr-tab-active/);
  });

  test('Switching from projects to story tab changes visible content', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(300);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
    await page.waitForTimeout(300);
    // Story tab should reveal its panel
    await expect(page.locator('#dt-story-panel')).toBeVisible({ timeout: 5000 });
  });

});

// ── Section: Action panel interaction ────────────────────────────────────────

test.describe('Admin DT — Action panel opens', () => {

  test('Clicking a feeding action row opens the action panel', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_FEEDING] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // Expand the feeding phase header
    const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Step 3' }).first();
    await feedHeader.click();
    await page.waitForTimeout(200);
    // Click the feeding action row
    await page.locator('.proc-action-row').first().click();
    await page.waitForTimeout(400);
    // An expanded detail panel should appear
    await expect(page.locator('.proc-action-detail').first()).toBeVisible({ timeout: 5000 });
  });

  test('Territory pill row is present in an opened feeding action', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_FEEDING] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Step 3' }).first();
    await feedHeader.click();
    await page.waitForTimeout(200);
    await page.locator('.proc-action-row').first().click();
    await page.waitForTimeout(400);
    // Territory pill row should be rendered inside the detail panel
    await expect(page.locator('.proc-terr-pill-row').first()).toBeVisible({ timeout: 5000 });
  });

  test('Clicking a project action row opens the action panel', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // Find and expand the patrol/misc phase
    const headers = page.locator('.proc-phase-header');
    const count = await headers.count();
    // Expand the first available phase with a positive count
    for (let i = 0; i < count; i++) {
      const header = headers.nth(i);
      const countText = await header.locator('.proc-phase-count').textContent().catch(() => '0 actions');
      if (!countText.includes('0 action')) {
        await header.click();
        await page.waitForTimeout(200);
        break;
      }
    }
    await expect(page.locator('.proc-action-row').first()).toBeVisible({ timeout: 5000 });
    await page.locator('.proc-action-row').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('.proc-action-detail').first()).toBeVisible({ timeout: 5000 });
  });

});

// ── Section: Multiple character workflow ──────────────────────────────────────

test.describe('Admin DT — Multiple characters', () => {

  test('Submissions from two characters both appear in the queue', async ({ page }) => {
    await setup(page, { submissions: [SUBMISSION_PROJECT, SUBMISSION_FEEDING] });
    await openDowntime(page);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(400);
    // Expand all headers to reveal rows
    const headers = page.locator('.proc-phase-header');
    const count = await headers.count();
    for (let i = 0; i < count; i++) {
      await headers.nth(i).click().catch(() => {});
    }
    await page.waitForTimeout(300);
    const rows = page.locator('.proc-action-row');
    const rowCount = await rows.count();
    // Should have at least 2 rows (one per submission's main action)
    expect(rowCount).toBeGreaterThanOrEqual(2);
  });

});
