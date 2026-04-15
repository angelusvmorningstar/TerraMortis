/**
 * Downtime Processing — DT-Fixes Sprint E2E tests
 * Covers changes from 2026-04-15:
 *   DT-Fix-17: Committed chip/badge amber + ST attribution saved on Committed/Resolved
 *   DT-Fix-19: Character selectors — investigate radio list, sorcery checkboxes, all-chars list
 *   DT-Fix-20: Feeding Barrens default (-4 ambience) when no territory selected
 *   DT-Fix-21: Territory pills on project-based Investigate actions
 *   DT-Fix-22: Roll button unlocks on Committed (not only on Validated)
 *   DT-Fix-23: Merit actions show automatic successes, no dice pool or Roll button
 *   DT-Fix-24: Sorcery rite blob (>60 chars) pre-populates Notes field
 *   DT-Fix-25: Second Opinion button moved to right-panel status section
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data (extended from downtime-processing.spec.js) ───────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const CHAR_PT4 = {
  _id: 'char-pt4', name: 'Charlie Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: 1 },
  attributes: {
    Strength: { dots: 3, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Weaponry: { dots: 4, bonus: 0, specs: ['Coward Punch (Stealth)'], nine_again: false } },
  disciplines: { Obfuscate: { dots: 5 } },
  merits: [
    { name: 'Allies', category: 'influence', rating: 3, qualifier: 'Criminal' },
  ],
  powers: [],
  ordeals: [],
  _pt_dot4_bonus_skills_arr: ['Weaponry'],
};

// A retired character — should NOT appear in all-chars lists
const CHAR_RETIRED = {
  _id: 'char-ret', name: 'Retired One', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Unaligned', player: 'Old Player',
  blood_potency: 1, humanity: 5, humanity_base: 7, court_title: null,
  retired: true,
  status: { city: 0, clan: 0, covenant: 0 },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// Non-submitting active character — should appear in all-chars lists
const CHAR_NON_SUBMITTER = {
  _id: 'char-ns', name: 'Non Submitter', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Carthian Movement', player: 'Other Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: 1 },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 2, status: 'open',
  confirmed_ambience: {}, narrative_notes: '',
};

// Project action in 'committed' state (pool set, not yet rolled)
const SUBMISSION_PROJECT_COMMITTED = {
  _id: 'sub-proj-committed',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      {
        action_type: 'ambience_increase',
        desired_outcome: 'Increase ambience',
        detail: 'Scout the district.',
        primary_pool: { expression: 'Strength 3 + Weaponry 4 = 7' },
      },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'ambience_increase',
    project_1_outcome: 'Increase ambience',
    project_1_description: 'Scout the district.',
    project_1_pool_expr: 'Strength 3 + Weaponry 4 = 7',
  },
  projects_resolved: [
    {
      pool_status: 'committed',
      pool_validated: 'Strength 3 + Weaponry 4 = 7',
      pool_committed_by: 'Test ST',
    },
  ],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Project-based Investigate action
const SUBMISSION_PROJECT_INVESTIGATE = {
  _id: 'sub-proj-inv',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      {
        action_type: 'investigate',
        desired_outcome: 'Find the truth',
        detail: 'Investigate Academy dealings.',
        primary_pool: { expression: 'Intelligence 2 + Investigation 3 = 5' },
      },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'investigate',
    project_1_outcome: 'Find the truth',
    project_1_description: 'Investigate Academy dealings.',
    project_1_pool_expr: 'Intelligence 2 + Investigation 3 = 5',
  },
  projects_resolved: [
    {
      pool_status: 'committed',
      pool_validated: 'Intelligence 2 + Investigation 3 = 5',
    },
  ],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Merit-based Allies investigate (formula: dots2plus2 — should NOT have dice pool)
const SUBMISSION_ALLIES_INVESTIGATE = {
  _id: 'sub-allies-inv',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: null,
    sphere_actions: [
      {
        merit_type: 'Allies 3 (Criminal)',
        action_type: 'investigate',
        description: 'Criminal network investigates.',
        desired_outcome: 'Learn Academy secrets',
        primary_pool: { expression: '' },
      },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [
    {
      pool_status: 'pending',
      inv_secrecy: '',
      inv_has_lead: null,
    },
  ],
  st_review: { territory_overrides: {} },
};

// Merit-based auto action (non-roll formula) — status buttons should be AUTOMATIC set
const SUBMISSION_ALLIES_AUTO = {
  _id: 'sub-allies-auto',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: null,
    sphere_actions: [
      {
        merit_type: 'Allies 3 (Criminal)',
        action_type: 'gather_info',
        description: 'Gather street-level intelligence.',
        desired_outcome: 'Improve influence',
        primary_pool: { expression: '' },
      },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [
    { pool_status: 'pending' },
  ],
  st_review: { territory_overrides: {} },
};

// Sorcery submission using sorcery slot format (sorcery_1_rite) — not project format.
// LONG_RITE_BLOB > 60 chars: notesVal = blob (pre-populated because sorc_notes not set in review).
// Phase: resolve_first → 'Step 1 — Blood Sorcery & Rituals' (openFirstAction label: 'Sorcery')
const LONG_RITE_BLOB = 'Panoptic Warding: Ward location against intrusion by supernatural entities using Cruac rite level 3';
const SUBMISSION_SORCERY = {
  _id: 'sub-sorc-001',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    sorcery_slot_count: '1',
    sorcery_1_rite: LONG_RITE_BLOB,
    sorcery_1_targets: '',
    sorcery_1_notes: '',
    sorcery_1_pool_expr: 'Intelligence 2 + Occult 3 = 5',
  },
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [],
  sorcery_review: {
    1: { pool_status: 'pending' },
  },
  st_review: { territory_overrides: {} },
};

// Feeding submission with no territory saved (should default to Barrens, -4)
const SUBMISSION_FEEDING_NO_TERR = {
  _id: 'sub-feed-noterr',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: {
      method: 'predator',
      pool: { expression: 'Strength 3 + Weaponry 4 = 7' },
    },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'predator',
    feeding_pool_expr: 'Strength 3 + Weaponry 4 = 7',
  },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Strength 3 + Weaponry 4 = 7',
    pool_validated: 'Strength 3 + Weaponry 4 = 7',
    pool_status: 'validated',
    nine_again: false,
    eight_again: false,
    active_feed_specs: [],
    pool_mod_spec: 0,
    pool_mod_equipment: 0,
    notes_thread: [],
    player_feedback: '',
    // No territory saved — should default to Barrens
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup helper ───────────────────────────────────────────────────────────────
// On localhost, admin.js uses API_BASE = 'http://localhost:3000' for all API
// calls. Use a single 'http://localhost:3000/**' string glob (NOT RegExp) to
// intercept all of them, dispatching by URL inside the handler.

async function setupDowntimeProcessing(page, submissions, chars = [CHAR_PT4, CHAR_NON_SUBMITTER, CHAR_RETIRED]) {
  await page.addInitScript(({ user }) => {
    // 'local-test-token' triggers the localhost bypass in validateToken()
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    // Write operations always succeed
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    // Dispatch by URL
    if (url.includes('/api/downtime_submissions'))    return ok(submissions);
    if (url.includes('/api/downtime_cycles'))         return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))        return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))              return ok(chars);
    if (url.includes('/api/territories'))             return ok([]);
    if (url.includes('/api/game_sessions'))           return ok([]);
    if (url.includes('/api/session_logs'))            return ok([]);
    // Catch-all for investigations, npcs, players, rules, etc.
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

// ── DT-Fix-17: Committed chip amber + ST attribution ───────────────────────────

test.describe('DT-Fix-17: Committed status styling and attribution', () => {

  test('queue row with committed status has proc-row-status.committed class', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    // Phases start collapsed — expand Ambience phase so rows are visible
    const ambienceHeader = page.locator('.proc-phase-header').filter({ hasText: 'Ambience' }).first();
    await ambienceHeader.click();
    await page.waitForTimeout(200);

    const committedBadge = page.locator('.proc-row-status.committed').first();
    await expect(committedBadge).toBeVisible({ timeout: 5000 });
  });

  test('committed pool badge renders when pool_status is committed', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    // The committed pool badge in the right panel should be visible
    const committedBadge = page.locator('.proc-pool-committed-badge').first();
    await expect(committedBadge).toBeVisible({ timeout: 5000 });
  });

  test('committed pool badge shows [Committed] label', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    // Badge text is '[Committed]'; the ST name appears in the queue-row validator chip, not here
    const committedBadge = page.locator('.proc-pool-committed-badge').first();
    await expect(committedBadge).toContainText('Committed');
  });

  test('queue row validator label shows committed-by name (not only validated-by)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
    // Expand Ambience phase so queue rows are visible
    const ambienceHeader = page.locator('.proc-phase-header').filter({ hasText: 'Ambience' }).first();
    await ambienceHeader.click();
    await page.waitForTimeout(200);

    const attrChip = page.locator('.proc-row-validator').first();
    await expect(attrChip).toContainText('Test ST');
  });

});

// ── DT-Fix-19: Character selectors ────────────────────────────────────────────

test.describe('DT-Fix-19: Character selectors', () => {

  test('investigate target renders as radio list, not a dropdown', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    // investigate → phase 'Step 5 — Investigative'
    await openFirstAction(page, 'Investigative');

    const radioInputs = page.locator('.proc-inv-target-radio');
    await expect(radioInputs.first()).toBeVisible({ timeout: 5000 });

    // No <select class="proc-inv-char-sel"> should exist (replaced by radios)
    await expect(page.locator('.proc-inv-char-sel')).toHaveCount(0);
  });

  test('investigate target radio list contains all non-retired characters', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const panel = page.locator('.proc-action-detail').first();
    await expect(panel).toContainText('Charlie Test');
    await expect(panel).toContainText('Non Submitter');
  });

  test('investigate target radio list does NOT contain retired characters', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const panel = page.locator('.proc-action-detail').first();
    await expect(panel).not.toContainText('Retired One');
  });

  test('sorcery targets render as checkboxes, not a dropdown', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY]);
    // resolve_first → 'Step 1 — Blood Sorcery & Rituals' (matches 'Sorcery')
    await openFirstAction(page, 'Sorcery');
    // Checkboxes live in the edit mode section; click Edit to reveal them
    await page.locator('.proc-feed-desc-edit-btn').first().click();
    await page.waitForTimeout(300);

    const checkboxes = page.locator('.proc-sorc-target-chk');
    await expect(checkboxes.first()).toBeVisible({ timeout: 5000 });

    // No <select multiple> for targets
    await expect(page.locator('.proc-sorc-targets-sel[multiple]')).toHaveCount(0);
  });

  test('sorcery targets checkbox list contains all non-retired characters', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY]);
    await openFirstAction(page, 'Sorcery');
    await page.locator('.proc-feed-desc-edit-btn').first().click();
    await page.waitForTimeout(300);

    // sortName() returns .toLowerCase(), so labels use lowercase names
    const panel = page.locator('.proc-action-detail').first();
    await expect(panel).toContainText('charlie test');
    await expect(panel).toContainText('non submitter');
  });

  test('sorcery targets checkbox list does NOT contain retired characters', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY]);
    await openFirstAction(page, 'Sorcery');
    await page.locator('.proc-feed-desc-edit-btn').first().click();
    await page.waitForTimeout(300);

    const panel = page.locator('.proc-action-detail').first();
    await expect(panel).not.toContainText('Retired One');
  });

});

// ── DT-Fix-20: Feeding Barrens default ────────────────────────────────────────

test.describe('DT-Fix-20: Feeding Barrens default ambience', () => {

  test('feeding panel shows Barrens when no territory is set', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_NO_TERR]);
    await openFirstAction(page, 'Feeding');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toContainText('Barrens');
  });

  test('feeding panel shows -4 ambience modifier when defaulting to Barrens', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_NO_TERR]);
    await openFirstAction(page, 'Feeding');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toContainText('-4');
  });

});

// ── DT-Fix-21: Investigate territory pills ────────────────────────────────────

test.describe('DT-Fix-21: Territory pills on project-based Investigate', () => {

  test('project-based investigate action shows territory pills', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    // investigate → phase 'Step 5 — Investigative'
    await openFirstAction(page, 'Investigative');

    // Territory pill buttons are rendered inline for project investigate actions
    const terrPills = page.locator('.proc-terr-pill');
    await expect(terrPills.first()).toBeVisible({ timeout: 5000 });
  });

  test('project-based investigate territory pills default to — (no territory)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    // Neutral pill (data-terr-id="") is active when no territory override is set
    const neutralPill = page.locator('.proc-terr-pill[data-terr-id=""].active').first();
    await expect(neutralPill).toBeVisible({ timeout: 5000 });
  });

  test('project-based investigate territory pills include named territories', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const panel = page.locator('.proc-action-detail').first();
    await expect(panel).toContainText('Academy');
  });

  test('merit-based investigate does NOT show project territory pills in action type row', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    // merit allies investigate → phase 'Step 5 — Investigative'
    await openFirstAction(page, 'Investigative');

    // isMerit=true → project investigate pills (context "0") are skipped;
    // allies merit gets its own pills with context "allies_N" instead
    const panel = page.locator('.proc-action-detail').first();
    await expect(panel.locator('.proc-terr-inline-pills[data-terr-context="0"]')).toHaveCount(0);
  });

});

// ── DT-Fix-22: Roll button unlocks on Committed ───────────────────────────────

test.describe('DT-Fix-22: Roll button available on Committed status', () => {

  test('Roll button renders when pool_status is committed', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
  });

  test('Roll button is labelled ROLL when no prior roll exists', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toContainText('Roll');
  });

  test('Roll button is absent when pool_status is pending and no prior roll', async ({ page }) => {
    // Submission with no pool_validated and pending status
    const subPending = {
      ...SUBMISSION_PROJECT_COMMITTED,
      _id: 'sub-proj-pending',
      projects_resolved: [
        { pool_status: 'pending', pool_validated: '' },
      ],
    };
    await setupDowntimeProcessing(page, [subPending]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-proj-roll-btn')).toHaveCount(0);
  });

  test('Roll button still renders when pool_status is validated (no regression)', async ({ page }) => {
    const subValidated = {
      ...SUBMISSION_PROJECT_COMMITTED,
      _id: 'sub-proj-validated',
      projects_resolved: [
        { pool_status: 'validated', pool_validated: 'Strength 3 + Weaponry 4 = 7' },
      ],
    };
    await setupDowntimeProcessing(page, [subValidated]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
  });

});

// ── DT-Fix-23: Merit actions — automatic successes, no dice pool ──────────────

test.describe('DT-Fix-23: Merit automatic successes, no dice pool', () => {

  test('merit investigate (dots2plus2) shows Automatic Successes panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    // allies merit investigate → phase 'Step 5 — Investigative'
    await openFirstAction(page, 'Investigative');

    // Merit right panel uses class proc-feed-right (same as project/feeding)
    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toContainText('Automatic Successes');
  });

  test('merit investigate does NOT show a dice pool builder', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    // Merit panel uses proc-feed-mod-panel for 'Automatic Successes', not 'Dice Pool'
    await expect(page.locator('.proc-feed-mod-panel .proc-mod-panel-title').filter({ hasText: 'Dice Pool' })).toHaveCount(0);
    await expect(page.locator('.proc-pool-builder')).toHaveCount(0);
  });

  test('merit investigate does NOT show a Roll button', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-proj-roll-btn')).toHaveCount(0);
  });

  test('merit investigate automatic successes panel shows base successes equal to dot level', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    // Allies 3 (Criminal) — dots = 3 — autoSucc = dots = 3
    const autoPanel = page.locator('.proc-feed-mod-panel').filter({ hasText: 'Automatic Successes' }).first();
    await expect(autoPanel).toContainText('3');
  });

  test('merit investigate automatic successes panel does NOT have Target Secrecy selector (moved to project panel)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-inv-secrecy-sel')).toHaveCount(0);
  });

  test('merit investigate automatic successes panel does NOT have Lead toggle buttons (moved to project panel)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-inv-lead-btn')).toHaveCount(0);
  });

});

// ── DT-Fix-24: Rite blob pre-populates Notes ─────────────────────────────────

test.describe('DT-Fix-24: Sorcery rite blob pre-populates Notes', () => {

  test('sorcery notes field is pre-populated when rite_name blob exceeds 60 chars', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY]);
    // resolve_first → 'Step 1 — Blood Sorcery & Rituals' (matches 'Sorcery')
    await openFirstAction(page, 'Sorcery');

    // Check the VIEW MODE only (.proc-feed-desc-view) — excludes hidden edit mode
    // View mode renders a Notes row when notesVal is non-empty
    const viewMode = page.locator('.proc-feed-desc-view').first();
    await expect(viewMode).toBeVisible({ timeout: 5000 });
    await expect(viewMode).toContainText('Notes');
  });

  test('sorcery notes field blob content matches the rite_name value', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY]);
    await openFirstAction(page, 'Sorcery');

    const viewMode = page.locator('.proc-feed-desc-view').first();
    await expect(viewMode).toContainText('Panoptic Warding');
  });

  test('sorcery notes field is empty when rite_name is a short title (<=60 chars)', async ({ page }) => {
    // Short rite: blobAsNotes = '' → notesVal = '' → view mode does NOT render Notes row
    const subShortRite = {
      ...SUBMISSION_SORCERY,
      _id: 'sub-sorc-short',
      responses: {
        sorcery_slot_count: '1',
        sorcery_1_rite: 'Panoptic Warding',  // <= 60 chars — should not pre-populate
        sorcery_1_targets: '',
        sorcery_1_notes: '',
        sorcery_1_pool_expr: 'Intelligence 2 + Occult 3 = 5',
      },
      sorcery_review: { 1: { pool_status: 'pending' } },
    };
    await setupDowntimeProcessing(page, [subShortRite]);
    await openFirstAction(page, 'Sorcery');

    // View mode only (not the hidden edit mode which always has a Notes textarea label)
    const viewMode = page.locator('.proc-feed-desc-view').first();
    await expect(viewMode).toBeVisible({ timeout: 5000 });
    await expect(viewMode).not.toContainText('Notes');
  });

});

// ── DT-Fix-25: Second Opinion button in sidebar ───────────────────────────────

test.describe('DT-Fix-25: Second Opinion button location', () => {

  test('Second Opinion button is NOT in the left panel (proc-feed-left)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    const leftPanel = page.locator('.proc-feed-left').first();
    await expect(leftPanel.locator('.proc-second-opinion-btn')).toHaveCount(0);
  });

  test('Second Opinion button IS present in the right panel status section', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    // The button should be somewhere in the right panel
    const rightPanel = page.locator('.proc-feed-right, .proc-right-panel').first();
    const secondOpinionBtn = rightPanel.locator('.proc-second-opinion-btn');
    await expect(secondOpinionBtn).toBeVisible({ timeout: 5000 });
  });

  test('Second Opinion button is present on feeding action right panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING_NO_TERR]);
    await openFirstAction(page, 'Feeding');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-second-opinion-btn')).toBeVisible({ timeout: 5000 });
  });

  test('Second Opinion button is present on merit action right panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    // allies merit → phase 'Step 5 — Investigative'
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-second-opinion-btn')).toBeVisible({ timeout: 5000 });
  });

});

// ── DTQ-1: Rote feed project renders in Feed phase ────────────────────────────

const SUBMISSION_ROTE_FEED = {
  _id: 'sub-rote-feed',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      {
        action_type: 'feed',
        desired_outcome: 'Find a second vessel',
        detail: 'Extended hunt in the Warehouse District.',
        primary_pool: null,
      },
    ],
    feeding: {
      method: 'stalking',
      pool: { expression: 'Strength 3 + Stealth 2 = 5' },
    },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'stalking',
    feeding_pool_expr: 'Strength 3 + Stealth 2 = 5',
    project_1_action: 'feed',
    project_1_title: 'Extended Hunt',
    project_1_outcome: 'Find a second vessel',
    project_1_description: 'Extended hunt in the Warehouse District.',
    project_1_feed_method2: 'seduction',
  },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Strength 3 + Stealth 2 = 5',
    pool_validated: '',
    pool_status: 'pending',
    nine_again: false,
    eight_again: false,
    active_feed_specs: [],
    pool_mod_spec: 0,
    pool_mod_equipment: 0,
    notes_thread: [],
    player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

test.describe('DTQ-1: Rote feed project renders in Feed phase', () => {

  test('rote feed project row appears under the Feed phase section', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });

    // Expand the Feed phase
    const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Feeding' }).first();
    const toggle = feedHeader.locator('.proc-phase-toggle');
    const toggleText = await toggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await feedHeader.click();
    await page.waitForTimeout(200);

    const feedPhase = page.locator('.proc-phase-section').filter({ hasText: 'Feeding' }).first();
    await expect(feedPhase.locator('.proc-action-row')).toHaveCount(2); // standard + rote feed
  });

  test('rote feed project row is labelled "Rote Feed"', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });

    const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Feeding' }).first();
    const toggle = feedHeader.locator('.proc-phase-toggle');
    const toggleText = await toggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await feedHeader.click();
    await page.waitForTimeout(200);

    const feedPhase = page.locator('.proc-phase-section').filter({ hasText: 'Feeding' }).first();
    await expect(feedPhase).toContainText('Rote Feed');
  });

  test('rote feed project does NOT appear in any other phase', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });

    // Expand all phases and check none (other than Feeding) contain "Rote Feed"
    const allHeaders = page.locator('.proc-phase-header');
    const headerCount = await allHeaders.count();
    for (let i = 0; i < headerCount; i++) {
      const hdr = allHeaders.nth(i);
      const text = await hdr.textContent().catch(() => '');
      if (text.includes('Feeding')) continue;
      const toggle = hdr.locator('.proc-phase-toggle');
      const toggleText = await toggle.textContent().catch(() => '');
      if (toggleText.includes('Show')) await hdr.click();
    }
    await page.waitForTimeout(200);

    // Only the Feeding phase section should contain 'Rote Feed'
    const nonFeedPhases = page.locator('.proc-phase-section').filter({ hasNotText: 'Feeding' });
    const count = await nonFeedPhases.count();
    for (let i = 0; i < count; i++) {
      await expect(nonFeedPhases.nth(i)).not.toContainText('Rote Feed');
    }
  });

  test('rote feed project card shows secondary feed method when present', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    await page.waitForSelector('.proc-phase-section', { timeout: 8000 });

    // Expand the Feed phase
    const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Feeding' }).first();
    const toggle = feedHeader.locator('.proc-phase-toggle');
    const toggleText = await toggle.textContent().catch(() => '');
    if (toggleText.includes('Show')) await feedHeader.click();
    await page.waitForTimeout(300);

    // Find the Rote Feed row specifically by its label text and click it
    const roteRow = page.locator('.proc-action-row').filter({ hasText: 'Rote Feed' }).first();
    await roteRow.click();
    await page.waitForTimeout(500);

    // The expanded detail panel for the rote feed row should contain 'seduction' (the secondary method)
    const detailPanel = page.locator('.proc-action-detail[data-proc-key="sub-rote-feed:proj:0"]');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });
    await expect(detailPanel).toContainText('seduction');
  });

});

// ── DTQ-3: Lead/No Lead ticker on project investigate only ────────────────────

test.describe('DTQ-3: Lead ticker on project investigate, not merit investigate', () => {

  test('project investigate right panel shows Lead / No Lead buttons', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-inv-lead-btns')).toBeVisible({ timeout: 5000 });
  });

  test('project investigate right panel shows Target Secrecy selector', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-inv-secrecy-sel')).toBeVisible({ timeout: 5000 });
  });

  test('project investigate panel has "Investigation" section title', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toContainText('Investigation');
  });

  test('merit investigate right panel does NOT show Lead / No Lead buttons', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-inv-lead-btns')).toHaveCount(0);
  });

  test('merit investigate right panel does NOT show Target Secrecy selector', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-inv-secrecy-sel')).toHaveCount(0);
  });

});
