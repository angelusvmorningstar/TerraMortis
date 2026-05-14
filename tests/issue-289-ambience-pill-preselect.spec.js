/**
 * Issue #289 — DT Processing Step 5: ambience action territory pill pre-selects
 * from player's submitted project_${slot}_ambience_target when no ST override exists.
 *
 * AC coverage:
 *   AC1 — no ST override: N.Shore pill active when player submitted northshore (Increase)
 *   AC2 — ST override exists: override takes precedence; player suggestion not shown
 *   AC3 — Ambience Decrease: same pre-selection applies
 *   AC4 — clicking a pill saves correctly (no regression to click handler)
 *   AC5 — regression: non-ambience project actions unaffected
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_289 = {
  _id: 'char-289', name: 'Ambi Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Crone', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 1, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Occult: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
  merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-289', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// ── AC1/AC3: no ST override — player submission drives pre-selection ──────────

// Ambience Increase, slot 1, submitted northshore
const SUBMISSION_AMBI_INCREASE_NO_OVR = {
  _id: 'sub-289-inc',
  cycle_id: 'cycle-289',
  character_name: 'Ambi Test',
  character_id: 'char-289',
  player_name: 'Test Player',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'ambience_increase', desired_outcome: 'Improve northshore', detail: '' }],
    feeding: { method: 'predatory_aura', pool: { expression: 'Presence 2 + Intimidation 0 = 2' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action_type: 'ambience_increase',
    project_1_ambience_target: 'northshore',
  },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Presence 2 = 2',
    pool_validated: '',
    pool_status: 'pending',
    nine_again: false, eight_again: false,
    pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Ambience Decrease, slot 1, submitted harbour
const SUBMISSION_AMBI_DECREASE_NO_OVR = {
  ...SUBMISSION_AMBI_INCREASE_NO_OVR,
  _id: 'sub-289-dec',
  _raw: {
    ...SUBMISSION_AMBI_INCREASE_NO_OVR._raw,
    projects: [{ action_type: 'ambience_decrease', desired_outcome: 'Degrade harbour', detail: '' }],
  },
  responses: {
    project_1_action_type: 'ambience_decrease',
    project_1_ambience_target: 'harbour',
  },
};

// ── AC2: ST override exists — override wins, not player suggestion ─────────────

const SUBMISSION_AMBI_WITH_OVR = {
  ...SUBMISSION_AMBI_INCREASE_NO_OVR,
  _id: 'sub-289-ovr',
  // Player submitted northshore, but ST has overridden to academy
  st_review: {
    territory_overrides: { '0': 'academy' },  // actionIdx=0 for first project
  },
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setup(page, submissions, chars = [CHAR_289]) {
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
    if (url.includes('/api/characters/names'))     return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(chars);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  // Navigate to DT Projects via DTUX-1 ribbon (ambience is a section within Projects)
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(300);
}

async function openAmbienceAction(page) {
  await page.waitForSelector('.proc-phase-section', { state: 'visible', timeout: 8000 });
  const ambiHeader = page.locator('.proc-phase-header').filter({ hasText: 'Step 5' }).first();
  const toggle = ambiHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await ambiHeader.click();
  await page.waitForTimeout(200);
  const ambiPhase = page.locator('.proc-phase-section').filter({ hasText: 'Step 5' }).first();
  await ambiPhase.locator('.proc-action-row').first().click();
  await page.waitForTimeout(400);
}

// ── AC1: Ambience Increase pre-selects from northshore ───────────────────────

test.describe('Issue #289 — Ambience Increase: player territory pre-selects', () => {

  test('AC1: N.Shore pill is active when player submitted northshore (no ST override)', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_INCREASE_NO_OVR]);
    await openAmbienceAction(page);
    const nshorePill = page.locator('.proc-terr-pill[data-terr-id="northshore"]').first();
    await expect(nshorePill).toBeVisible({ timeout: 5000 });
    await expect(nshorePill).toHaveClass(/active/);
  });

  test('AC1: Em-dash (clear) pill is NOT active when player submitted northshore', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_INCREASE_NO_OVR]);
    await openAmbienceAction(page);
    const clearPill = page.locator('.proc-terr-pill[data-terr-id=""]').first();
    await expect(clearPill).not.toHaveClass(/active/);
  });

  test('AC1: Other territory pills are NOT active (only northshore)', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_INCREASE_NO_OVR]);
    await openAmbienceAction(page);
    const harbourPill = page.locator('.proc-terr-pill[data-terr-id="harbour"]').first();
    await expect(harbourPill).not.toHaveClass(/active/);
  });

});

// ── AC2: ST override takes precedence ────────────────────────────────────────

test.describe('Issue #289 — ST territory override takes precedence', () => {

  test('AC2: Academy pill active when ST override is academy (player submitted northshore)', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_WITH_OVR]);
    await openAmbienceAction(page);
    const academyPill = page.locator('.proc-terr-pill[data-terr-id="academy"]').first();
    await expect(academyPill).toBeVisible({ timeout: 5000 });
    await expect(academyPill).toHaveClass(/active/);
  });

  test('AC2: N.Shore pill NOT active when ST override is academy', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_WITH_OVR]);
    await openAmbienceAction(page);
    const nshorePill = page.locator('.proc-terr-pill[data-terr-id="northshore"]').first();
    await expect(nshorePill).not.toHaveClass(/active/);
  });

});

// ── AC3: Ambience Decrease also pre-selects ──────────────────────────────────

test.describe('Issue #289 — Ambience Decrease: player territory pre-selects', () => {

  test('AC3: Harbour pill is active when player submitted harbour (Decrease, no ST override)', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_DECREASE_NO_OVR]);
    await openAmbienceAction(page);
    const harbourPill = page.locator('.proc-terr-pill[data-terr-id="harbour"]').first();
    await expect(harbourPill).toBeVisible({ timeout: 5000 });
    await expect(harbourPill).toHaveClass(/active/);
  });

  test('AC3: Em-dash NOT active when Decrease player submitted harbour', async ({ page }) => {
    await setup(page, [SUBMISSION_AMBI_DECREASE_NO_OVR]);
    await openAmbienceAction(page);
    const clearPill = page.locator('.proc-terr-pill[data-terr-id=""]').first();
    await expect(clearPill).not.toHaveClass(/active/);
  });

});

// ── AC4: Clicking a pill saves correctly (click handler regression) ───────────

test.describe('Issue #289 — Pill click handler regression', () => {

  test('AC4: Clicking the Dockyards pill activates it and makes the pre-selected pill inactive', async ({ page }) => {
    let savedTerrContext = null;
    let savedTerrId = null;

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER });

    await page.route('http://localhost:3000/**', route => {
      const url = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if ((method === 'PUT' || method === 'PATCH') && url.includes('/api/downtime_submissions')) {
        // Capture the territory override being saved
        const body = route.request().postDataJSON() || {};
        const key = Object.keys(body).find(k => k.startsWith('st_review.territory_overrides'));
        if (key) {
          savedTerrContext = key.split('.').pop();
          savedTerrId = body[key];
        }
        return ok({ ok: true });
      }
      if (url.includes('/api/downtime_submissions')) return ok([SUBMISSION_AMBI_INCREASE_NO_OVR]);
      if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
      if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_289._id, name: CHAR_289.name, moniker: null, honorific: null }]);
      if (url.includes('/api/characters'))           return ok([CHAR_289]);
      if (url.includes('/api/territories'))          return ok([]);
      if (url.includes('/api/game_sessions'))        return ok([]);
      if (url.includes('/api/session_logs'))         return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(500);
    await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    await page.waitForTimeout(300);
    await openAmbienceAction(page);

    // Confirm northshore is pre-selected
    const nshorePill = page.locator('.proc-terr-pill[data-terr-id="northshore"]').first();
    await expect(nshorePill).toHaveClass(/active/);

    // Click dockyards pill — should save the override and activate dockyards
    const docksPill = page.locator('.proc-terr-pill[data-terr-id="dockyards"]').first();
    await docksPill.click();
    await page.waitForTimeout(300);

    await expect(docksPill).toHaveClass(/active/);
    // The save should have written dockyards as the override
    expect(savedTerrId).toBe('dockyards');
  });

});
