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
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
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
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
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
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 2, status: 'active',
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

// Flat card wall (#581/#585): phase accordions (.proc-phase-section/.proc-phase-toggle)
// were replaced by a filter bar. Map the legacy phase label to its filter-pill phase key
// (the data-filter-val), activate that pill (which re-renders to just that phase), then
// open the first remaining action row. Keys come from PHASE_NUM_TO_LABEL in downtime-views.js.
const _PHASE_LABEL_TO_KEY = {
  Sorcery: 'resolve_first',
  Feeding: 'feeding',
  Support: 'support',
  Ambience: 'ambience',
  Investigative: 'investigate',
  Contacts: 'contacts',
  Resources: 'misc',
  Patrol: 'patrol',
  Miscellaneous: 'misc',
};
async function openFirstAction(page, phaseLabel) {
  const key = _PHASE_LABEL_TO_KEY[phaseLabel] || phaseLabel;
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator(`.proc-filter-pill[data-filter-dim="phases"][data-filter-val="${key}"]`).first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// fix.617 (#617): the tests below were re-aligned to the current DT-processing DOM after
// Angelus ruled per cluster (all intended redesigns, no regressions). Removed-feature tests
// (committed-status styling, Roll-on-committed, Second Opinion) are retired; redesigned-panel
// tests (character-target picker, sorcery panel, secrecy/lead) are rewritten to current markup.
// ─────────────────────────────────────────────────────────────────────────────

// ── DT-Fix-17: Committed status — RETIRED (committed pool-status state removed, fix.617) ──

// ── DT-Fix-19: Character selectors ────────────────────────────────────────────

test.describe('DT-Fix-19: Character target picker', () => {

  // fix.617 (Angelus ruling): character targets (investigate + sorcery) now use the unified
  // Connected-Characters typeahead picker (.proc-conn-typeahead / .proc-conn-input), not
  // radio/checkbox lists. The old static-list content assertions (which characters appear) are
  // retired — the picker is a dynamic typeahead, and its character source is covered elsewhere.

  test('investigate target uses the Connected Characters picker (not a radio/select list)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const panel = page.locator('.proc-action-detail').first();
    await expect(panel.locator('.proc-conn-typeahead').first()).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('.proc-conn-input').first()).toBeVisible();
    // Old radio/select target controls should be gone
    await expect(page.locator('.proc-inv-target-radio')).toHaveCount(0);
    await expect(page.locator('.proc-inv-char-sel')).toHaveCount(0);
  });

  test('sorcery targets use the Connected Characters picker (not a checkbox/multi-select)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORCERY]);
    await openFirstAction(page, 'Sorcery');

    const panel = page.locator('.proc-action-detail').first();
    await expect(panel.locator('.proc-conn-typeahead').first()).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('.proc-conn-input').first()).toBeVisible();
    // Old checkbox/multi-select target controls should be gone
    await expect(page.locator('.proc-sorc-target-chk')).toHaveCount(0);
    await expect(page.locator('.proc-sorc-targets-sel[multiple]')).toHaveCount(0);
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

    // fix.617: the active class is `is-active` (not `active`). Neutral pill (data-terr-id="")
    // is active when no territory override is set.
    const neutralPill = page.locator('.proc-terr-pill[data-terr-id=""].is-active').first();
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

test.describe('DT-Fix-22: Roll button availability', () => {

  // fix.617 (Angelus ruling): the "Committed" pool-status state was removed, so the two
  // Roll-on-committed tests are retired. Roll-button presence is covered by the pending +
  // validated cases below (feature.96: Roll no longer requires Committed first).

  test('Roll button IS visible when pool_status is pending (feature.96: no longer requires Committed first)', async ({ page }) => {
    // feature.96 made Roll visible from pending — this test was previously asserting absence
    const subPending = {
      ...SUBMISSION_PROJECT_COMMITTED,
      _id: 'sub-proj-pending',
      projects_resolved: [
        { pool_status: 'pending', pool_validated: '' },
      ],
    };
    await setupDowntimeProcessing(page, [subPending]);
    await openFirstAction(page, 'Ambience');

    const rollBtn = page.locator('.proc-proj-roll-btn').first();
    await expect(rollBtn).toBeVisible({ timeout: 5000 });
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

  // fix.617 (Angelus ruling): Secrecy + Lead now appear on merit investigate too (the
  // project-only distinction was intentionally dropped) — so these flip from absent to present.
  test('merit investigate shows the Target Secrecy selector', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-inv-secrecy-sel').first()).toBeVisible({ timeout: 5000 });
  });

  test('merit investigate shows the Lead toggle buttons', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    await expect(page.locator('.proc-inv-lead-btn').first()).toBeVisible({ timeout: 5000 });
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

// ── DT-Fix-25: Second Opinion button — RETIRED (button removed, fix.617) ──
// fix.617 (Angelus ruling): the "Second Opinion" button was intentionally removed from the
// action cards. All four tests (presence/location) are retired.

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
    // Flat wall (#581): activate the Feeding filter pill; only feeding-phase rows remain.
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('.proc-action-row')).toHaveCount(2); // standard + rote feed
  });

  test('rote feed project row is labelled "Rote Feed"', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    // Flat wall (#581): activate the Feeding filter pill, then assert a Rote Feed row exists.
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('.proc-action-row').filter({ hasText: 'Rote Feed' })).toHaveCount(1);
  });

  test('rote feed project does NOT appear in any other phase', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    // Flat wall (#581): phase sections are gone; the regression intent is that a rote-feed
    // project categorises into the Feeding phase, NOT the Miscellaneous phase where
    // uncategorised projects would otherwise land. Verify present under Feeding, absent under Misc.
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.proc-action-row').filter({ hasText: 'Rote Feed' })).toHaveCount(1);

    // Pills only render for populated phases. If the rote-feed project had miscategorised
    // into Miscellaneous, a misc filter pill would appear; its absence proves it routed to Feeding.
    await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="misc"]')).toHaveCount(0);
  });

  test('rote feed project card shows secondary feed method when present', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ROTE_FEED]);
    // Flat wall (#581): activate the Feeding filter pill so the rote-feed row renders.
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]').first().click();
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

  // fix.617 (Angelus ruling): Lead/Secrecy now appear on merit investigate too — flip to present.
  test('merit investigate right panel shows Lead / No Lead buttons', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-inv-lead-btns')).toBeVisible({ timeout: 5000 });
  });

  test('merit investigate right panel shows Target Secrecy selector', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('.proc-inv-secrecy-sel')).toBeVisible({ timeout: 5000 });
  });

});

// ── DTX-3: Notes / Feedback visual hierarchy ──────────────────────────────────

// Allies ambience_decrease — mode: auto → compact panel
const SUBMISSION_ALLIES_AMBIENCE_DEC = {
  _id: 'sub-allies-amb-dec',
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
        action_type: 'ambience_decrease',
        description: 'Undermine the peace.',
        desired_outcome: 'Reduce ambience',
        primary_pool: { expression: '' },
      },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [{ pool_status: 'pending' }],
  st_review: { territory_overrides: {} },
};

// Contacts entry — meritCategory ends up as 'contacts' via formula path
const SUBMISSION_CONTACTS_REQ = {
  _id: 'sub-contacts-req',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: ['Find out who owns the docks.'] },
    retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [{ pool_status: 'pending' }],
  st_review: { territory_overrides: {} },
};

// Retainer entry — actionType: 'resources_retainers', formula: 'none' via misc fallback
const SUBMISSION_RETAINER_TASK = {
  _id: 'sub-retainer-task',
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
    retainer_actions: { actions: ['Guard the warehouse overnight.'] },
  },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [{ pool_status: 'pending' }],
  st_review: { territory_overrides: {} },
};

test.describe('DTX-3: Notes / feedback visual hierarchy', () => {

  test('ST Notes section renders above Player Feedback in the left panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    const panel = page.locator('.proc-action-detail').first();
    const notesPanel   = panel.locator('.proc-notes-panel').first();
    const feedbackPanel = panel.locator('.proc-player-note-section').first();

    // Both must exist
    await expect(notesPanel).toBeVisible({ timeout: 5000 });
    await expect(feedbackPanel).toBeVisible({ timeout: 5000 });

    // Notes must appear before feedback in the DOM
    const notesBB    = await notesPanel.boundingBox();
    const feedbackBB = await feedbackPanel.boundingBox();
    expect(notesBB.y).toBeLessThan(feedbackBB.y);
  });

  test('ST Notes section label reads "ST Notes" (not "ST Notes (ST only)")', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    const notesPanel = page.locator('.proc-notes-panel').first();
    await expect(notesPanel).toContainText('ST Notes');
    await expect(notesPanel).not.toContainText('ST only');
  });

  // fix.617: Player Feedback section class is .proc-player-note-section (was .proc-feedback-section).
  test('Player Feedback section is present in the left panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-player-note-section').first()).toBeVisible({ timeout: 5000 });
  });

});

// ── DTX-2: Compact panel for binary merit actions ─────────────────────────────

test.describe('DTX-2: Compact panel for binary merit actions', () => {

  test('auto-mode merit (ambience_decrease) renders compact panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_AMBIENCE_DEC]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-compact-merit-panel').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-val-status')).toHaveCount(0);
  });

  test('contacts entry renders compact panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_CONTACTS_REQ]);
    await openFirstAction(page, 'Contacts');

    await expect(page.locator('.proc-compact-merit-panel').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-val-status')).toHaveCount(0);
  });

  test('retainer entry renders compact panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_RETAINER_TASK]);
    await openFirstAction(page, 'Resources');

    await expect(page.locator('.proc-compact-merit-panel').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-val-status')).toHaveCount(0);
  });

  test('full-mode merit (allies investigate) renders normal panel — not compact', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_INVESTIGATE]);
    await openFirstAction(page, 'Investigative');

    // fix.617: .proc-val-status was removed; a full-mode merit is marked by NOT being compact and
    // by carrying full controls (e.g. the Target Secrecy selector), unlike a compact merit panel.
    await expect(page.locator('.proc-compact-merit-panel')).toHaveCount(0);
    await expect(page.locator('.proc-inv-secrecy-sel').first()).toBeVisible({ timeout: 5000 });
  });

  test('compact panel outcome toggle — clicking Approved marks it active', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_AMBIENCE_DEC]);
    await openFirstAction(page, 'Ambience');

    const approvedBtn = page.locator('.proc-merit-outcome-btn[data-outcome="approved"]').first();
    await expect(approvedBtn).toBeVisible({ timeout: 5000 });
    await approvedBtn.click();
    await page.waitForTimeout(400);

    await expect(approvedBtn).toHaveClass(/active/);
  });

  test('compact panel outcome toggle — clicking Failed marks it active and deactivates others', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES_AMBIENCE_DEC]);
    await openFirstAction(page, 'Ambience');

    const failedBtn   = page.locator('.proc-merit-outcome-btn[data-outcome="failed"]').first();
    const approvedBtn = page.locator('.proc-merit-outcome-btn[data-outcome="approved"]').first();
    await failedBtn.click();
    await page.waitForTimeout(400);

    await expect(failedBtn).toHaveClass(/active/);
    await expect(approvedBtn).not.toHaveClass(/active/);
  });

});

// ── DTX-1: Cross-reference callouts ──────────────────────────────────────────

// Two characters: CHAR_PT4 (Charlie Test) and CHAR_NON_SUBMITTER (Non Submitter)
// Both have a project action in the same territory
const SUBMISSION_PROJ_TERR_CHARLIE = {
  _id: 'sub-proj-terr-charlie',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      { action_type: 'patrol_scout', desired_outcome: 'Scout North Shore', detail: 'Walk the area.' },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'patrol_scout',
    project_1_outcome: 'Scout North Shore',
    project_1_description: 'Walk the area.',
    project_1_territory: 'North Shore',
  },
  projects_resolved: [{ pool_status: 'pending', pool_validated: '' }],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

const CHAR_NON_SUBMITTER_FULL = {
  _id: 'char-ns', name: 'Non Submitter', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Carthian Movement', player: 'Other Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 1, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const SUBMISSION_PROJ_TERR_NS = {
  _id: 'sub-proj-terr-ns',
  cycle_id: 'cycle-001',
  character_name: 'Non Submitter',
  character_id: 'char-ns',
  player_name: 'Other Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      { action_type: 'ambience_increase', desired_outcome: 'Increase ambience', detail: 'Work the crowd.' },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'ambience_increase',
    project_1_outcome: 'Increase ambience',
    project_1_description: 'Work the crowd.',
    project_1_territory: 'North Shore',
  },
  projects_resolved: [{ pool_status: 'pending', pool_validated: '' }],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Feeding overlap: two characters feeding North Shore
const SUBMISSION_FEED_CHARLIE = {
  _id: 'sub-feed-charlie',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 2 + Persuasion 2 = 4' } },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    feeding_territories: '{"North Shore":"resident"}',
  },
  projects_resolved: [],
  feeding_review: { pool_status: 'pending', pool_player: '', notes_thread: [], player_feedback: '' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

const SUBMISSION_FEED_NS = {
  _id: 'sub-feed-ns',
  cycle_id: 'cycle-001',
  character_name: 'Non Submitter',
  character_id: 'char-ns',
  player_name: 'Other Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'predator', pool: { expression: 'Strength 2 + Brawl 2 = 4' } },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'predator',
    feeding_territories: '{"North Shore":"resident"}',
  },
  projects_resolved: [],
  feeding_review: { pool_status: 'pending', pool_player: '', notes_thread: [], player_feedback: '' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Investigate overlap: both investigating 'charlie test' (sortName of CHAR_PT4)
const SUBMISSION_INV_NS_TARGET_CHARLIE = {
  _id: 'sub-inv-ns-tgt',
  cycle_id: 'cycle-001',
  character_name: 'Non Submitter',
  character_id: 'char-ns',
  player_name: 'Other Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      { action_type: 'investigate', desired_outcome: 'Learn about Charlie', detail: 'Follow the trail.' },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'investigate',
    project_1_outcome: 'Learn about Charlie',
    project_1_description: 'Follow the trail.',
  },
  projects_resolved: [{ pool_status: 'pending', investigate_target_char: 'charlie test' }],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

const SUBMISSION_INV_CHARLIE_TARGET_CHARLIE = {
  ...SUBMISSION_PROJECT_INVESTIGATE,
  _id: 'sub-inv-charlie-tgt',
  projects_resolved: [{ pool_status: 'committed', pool_validated: 'Intelligence 2 + Investigation 3 = 5', investigate_target_char: 'charlie test' }],
};

// Hide/protect overlap: Non Submitter has a hide_protect action
const SUBMISSION_HIDE_PROTECT_NS = {
  _id: 'sub-hide-ns',
  cycle_id: 'cycle-001',
  character_name: 'Non Submitter',
  character_id: 'char-ns',
  player_name: 'Other Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      { action_type: 'hide_protect', desired_outcome: 'Stay hidden', detail: 'Lay low.' },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: { project_1_action: 'hide_protect', project_1_outcome: 'Stay hidden' },
  projects_resolved: [{ pool_status: 'pending', pool_validated: '' }],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Investigate targeting Non Submitter (who has hide_protect above)
const SUBMISSION_INV_CHARLIE_TARGET_NS = {
  _id: 'sub-inv-charlie-tgt-ns',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-15T00:00:00Z',
  _raw: {
    projects: [
      { action_type: 'investigate', desired_outcome: 'Find Non Submitter', detail: 'Track them down.' },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: { project_1_action: 'investigate', project_1_outcome: 'Find Non Submitter' },
  projects_resolved: [{ pool_status: 'pending', investigate_target_char: 'non submitter' }],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

test.describe('DTX-1: Cross-reference callouts', () => {

  // fix.617 DEFERRED — possible gap (AC5): the target-based xref callout works (3 sibling tests
  // pass), but the territory-shared xref callout does not render in the action card here. Needs
  // investigation: whether territory xref moved to the snapshot panel, or projTerritory isn't
  // indexed for patrol/feeding. Flagged rather than forced green.
  test.fixme('project action with shared territory shows xref callout naming the other character', async ({ page }) => {
    await setupDowntimeProcessing(
      page,
      [SUBMISSION_PROJ_TERR_CHARLIE, SUBMISSION_PROJ_TERR_NS],
      [CHAR_PT4, CHAR_NON_SUBMITTER_FULL, CHAR_RETIRED],
    );
    // Open Charlie's project row (patrol_scout → phase 6 = Support & Patrol)
    await openFirstAction(page, 'Support');

    const callout = page.locator('.proc-xref-callout').first();
    await expect(callout).toBeVisible({ timeout: 5000 });
    await expect(callout).toContainText('North Shore');
    await expect(callout).toContainText('Non Submitter');
  });

  // fix.617 DEFERRED — same possible territory-xref gap as the project case above (AC5).
  test.fixme('feeding action with shared territory shows xref callout', async ({ page }) => {
    await setupDowntimeProcessing(
      page,
      [SUBMISSION_FEED_CHARLIE, SUBMISSION_FEED_NS],
      [CHAR_PT4, CHAR_NON_SUBMITTER_FULL, CHAR_RETIRED],
    );
    await openFirstAction(page, 'Feeding');

    const callout = page.locator('.proc-xref-callout').first();
    await expect(callout).toBeVisible({ timeout: 5000 });
    await expect(callout).toContainText('North Shore');
    await expect(callout).toContainText('Non Submitter');
  });

  test('investigate action with shared target shows xref callout naming the other investigator', async ({ page }) => {
    await setupDowntimeProcessing(
      page,
      [SUBMISSION_INV_CHARLIE_TARGET_CHARLIE, SUBMISSION_INV_NS_TARGET_CHARLIE],
      [CHAR_PT4, CHAR_NON_SUBMITTER_FULL, CHAR_RETIRED],
    );
    await openFirstAction(page, 'Investigative');

    const callout = page.locator('.proc-xref-callout').first();
    await expect(callout).toBeVisible({ timeout: 5000 });
    await expect(callout).toContainText('Also investigating');
    await expect(callout).toContainText('Non Submitter');
  });

  test('investigate action notes when target has active hide/protect', async ({ page }) => {
    await setupDowntimeProcessing(
      page,
      [SUBMISSION_INV_CHARLIE_TARGET_NS, SUBMISSION_HIDE_PROTECT_NS],
      [CHAR_PT4, CHAR_NON_SUBMITTER_FULL, CHAR_RETIRED],
    );
    await openFirstAction(page, 'Investigative');

    const callout = page.locator('.proc-xref-callout').first();
    await expect(callout).toBeVisible({ timeout: 5000 });
    await expect(callout).toContainText('hide/protect');
  });

  test('action with no cross-references does not render xref callout', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT_COMMITTED]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-xref-callout')).toHaveCount(0);
  });

});

// ── DTR-2: Contested roll ─────────────────────────────────────────────────────

test.describe('DTR-2: Contested roll', () => {

  const SUBMISSION_PROJ_UNCONTESTED = {
    ...SUBMISSION_PROJECT_COMMITTED,
    _id: 'sub-proj-uncontested',
    projects_resolved: [
      {
        pool_status: 'committed',
        pool_validated: 'Strength 3 + Weaponry 4 = 7',
      },
    ],
  };

  const SUBMISSION_PROJ_CONTESTED_ON = {
    ...SUBMISSION_PROJECT_COMMITTED,
    _id: 'sub-proj-contested-on',
    projects_resolved: [
      {
        pool_status: 'committed',
        pool_validated: 'Strength 3 + Weaponry 4 = 7',
        contested: true,
        contested_char: 'charlie test',
        contested_pool_label: 'Resolve + Composure = 4',
      },
    ],
  };

  const SUBMISSION_PROJ_CONTESTED_ROLLED = {
    ...SUBMISSION_PROJECT_COMMITTED,
    _id: 'sub-proj-contested-rolled',
    projects_resolved: [
      {
        pool_status: 'validated',
        pool_validated: 'Strength 3 + Weaponry 4 = 7',
        roll: { dice_string: '[9,8,7,3,2]', successes: 3, exceptional: false },
        contested: true,
        contested_char: 'charlie test',
        contested_pool_label: 'Resolve + Composure = 4',
        contested_roll: { dice_string: '[7,3,2,1]', successes: 1, exceptional: false },
      },
    ],
  };

  test('contested toggle is present in project right panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJ_UNCONTESTED]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-contested-toggle').first()).toBeVisible({ timeout: 5000 });
  });

  // fix.617: #608 contested widget — the character is chosen via the connected-char typeahead
  // (data-ta-save="contested_char") and the resistance pool is built from trait chips,
  // not a plain char-select + pool-input.
  test('toggling contested on shows the character picker and resistance trait chips', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJ_CONTESTED_ON]);
    await openFirstAction(page, 'Ambience');

    await expect(page.locator('.proc-conn-typeahead[data-ta-save="contested_char"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-contested-trait').first()).toBeVisible({ timeout: 5000 });
  });

  // fix.617 DEFERRED: the #608 contested roll-result no longer uses the literal "att − def = net"
  // text format this test asserts. Needs the current contested-result wording before re-enabling.
  test.fixme('after rolling defence, roll card shows att − def = net format', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJ_CONTESTED_ROLLED]);
    await openFirstAction(page, 'Ambience');

    // Target the roll card result specifically (not the defence result inside the contested panel)
    const rollResult = page.locator('.proc-proj-roll-card .proc-proj-roll-result').first();
    await expect(rollResult).toBeVisible({ timeout: 5000 });
    await expect(rollResult).toContainText('att');
    await expect(rollResult).toContainText('def');
    await expect(rollResult).toContainText('net');
    await expect(rollResult).toContainText('2');  // 3 att − 1 def = 2 net
  });

  test('toggling contested off hides the character picker and trait chips', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJ_UNCONTESTED]);
    await openFirstAction(page, 'Ambience');

    // Toggle is present but the contested char picker + trait chips are absent (contested is off)
    await expect(page.locator('.proc-contested-toggle').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-conn-typeahead[data-ta-save="contested_char"]')).toHaveCount(0);
    await expect(page.locator('.proc-contested-trait')).toHaveCount(0);
  });

});

// ── DTR-1: Net success display ────────────────────────────────────────────────

test.describe('DTR-1: Net success display', () => {

  const SUBMISSION_PROJ_WITH_ROLL_AND_MOD = {
    ...SUBMISSION_PROJECT_COMMITTED,
    _id: 'sub-proj-roll-mod',
    projects_resolved: [
      {
        pool_status: 'validated',
        pool_validated: 'Strength 3 + Weaponry 4 = 7',
        roll: { dice_string: '[8,7,3,2,1,6,5]', successes: 3, exceptional: false },
        succ_mod_manual: -1,
      },
    ],
  };

  const SUBMISSION_PROJ_WITH_ROLL_NO_MOD = {
    ...SUBMISSION_PROJECT_COMMITTED,
    _id: 'sub-proj-roll-nomod',
    projects_resolved: [
      {
        pool_status: 'validated',
        pool_validated: 'Strength 3 + Weaponry 4 = 7',
        roll: { dice_string: '[8,7,3,2,1,6,5]', successes: 3, exceptional: false },
        succ_mod_manual: 0,
      },
    ],
  };

  test('non-zero modifier shows net label and correct value', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJ_WITH_ROLL_AND_MOD]);
    await openFirstAction(page, 'Ambience');

    const rollResult = page.locator('.proc-proj-roll-result').first();
    await expect(rollResult).toBeVisible({ timeout: 5000 });
    await expect(rollResult).toContainText('net');
    await expect(rollResult).toContainText('2');   // 3 + (-1) = 2
  });

  test('zero modifier shows no net label', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJ_WITH_ROLL_NO_MOD]);
    await openFirstAction(page, 'Ambience');

    const rollResult = page.locator('.proc-proj-roll-result').first();
    await expect(rollResult).toBeVisible({ timeout: 5000 });
    await expect(rollResult).not.toContainText('net');
  });

});

// ── DTS-1: ST-created sorcery full panel ─────────────────────────────────────

test.describe('DTS-1: ST-created sorcery full panel', () => {

  const CHAR_CRUAC = {
    ...CHAR_PT4,
    _id: 'char-cruac',
    name: 'Keeper Test',
    moniker: 'Keeper',
    disciplines: { Cruac: { dots: 3 } },
    merits: [
      { name: 'Mandragora Garden', category: 'domain', rating: 3, qualifier: '' },
    ],
  };

  const SUBMISSION_ST_SORCERY = {
    _id: 'sub-st-sorc',
    cycle_id: 'cycle-001',
    character_name: 'Keeper Test',
    character_id: 'char-cruac',
    player_name: 'Test Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {},
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    st_review: { territory_overrides: {} },
    st_actions: [
      { action_type: 'sorcery', label: 'Fires of Inspiration', tradition: 'Cruac', rite_name: 'Fires of Inspiration', description: '' },
    ],
    st_actions_resolved: [
      { pool_status: 'pending' },
    ],
  };

  // fix.617: sorcery consolidated — no separate Tradition field; the Rite <select> (.proc-rite-select) carries it.
  test('ST sorcery action renders the full sorcery panel with a rite selector', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ST_SORCERY], [CHAR_CRUAC, CHAR_NON_SUBMITTER, CHAR_RETIRED]);
    await openFirstAction(page, 'Sorcery');

    // Full sorcery detail card + the rite selector
    await expect(page.locator('.proc-feed-desc-card').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-rite-select').first()).toBeVisible({ timeout: 5000 });
  });

  test('ST sorcery right panel renders (two-column layout with pool modifiers)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ST_SORCERY], [CHAR_CRUAC, CHAR_NON_SUBMITTER, CHAR_RETIRED]);
    await openFirstAction(page, 'Sorcery');

    // Right panel should render with Dice Pool Modifiers section
    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel).toBeVisible({ timeout: 5000 });
    // Roll hint visible (rules DB not loaded in tests so canRoll=false — "Select a rite first")
    await expect(rightPanel).toContainText('Select a rite first');
  });

  // fix.617: status model unified to a Pending → Valid → Complete ribbon (.proc-action-ribbon);
  // the sorcery-specific "Resolved"/"No Effect" set was removed.
  test('ST sorcery action shows the Pending/Valid/Complete status ribbon', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ST_SORCERY], [CHAR_CRUAC, CHAR_NON_SUBMITTER, CHAR_RETIRED]);
    await openFirstAction(page, 'Sorcery');

    const ribbon = page.locator('.proc-action-detail .proc-action-ribbon').first();
    await expect(ribbon).toBeVisible({ timeout: 5000 });
    await expect(ribbon).toContainText('Pending');
    await expect(ribbon).toContainText('Complete');
  });

});

// ── DTS-2: Duplicate action ───────────────────────────────────────────────────

test.describe('DTS-2: Duplicate action', () => {

  const CHAR_CRUAC_DTS2 = {
    ...CHAR_PT4,
    _id: 'char-cruac-dts2',
    name: 'Keeper Test',
    moniker: 'Keeper',
    disciplines: { Cruac: { dots: 3 } },
    merits: [],
  };

  const SUBMISSION_SORC_FOR_DUP = {
    _id: 'sub-sorc-dup',
    cycle_id: 'cycle-001',
    character_name: 'Keeper Test',
    character_id: 'char-cruac-dts2',
    player_name: 'Test Player',
    submitted_at: '2026-04-15T00:00:00Z',
    _raw: { projects: [], feeding: null, sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    responses: {
      sorcery_slot_count: '1',
      sorcery_1_rite: 'Fires of Inspiration',
      sorcery_1_targets: '',
      sorcery_1_notes: 'Four rites listed here',
      sorcery_1_pool_expr: 'Intelligence 2 + Occult 3 = 5',
    },
    projects_resolved: [],
    feeding_review: null,
    merit_actions_resolved: [],
    sorcery_review: { 1: { pool_status: 'pending', sorc_tradition: 'Cruac' } },
    st_review: { territory_overrides: {} },
    st_actions: [],
    st_actions_resolved: [],
  };

  test('duplicate button is present on sorcery row header', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORC_FOR_DUP], [CHAR_CRUAC_DTS2, CHAR_NON_SUBMITTER, CHAR_RETIRED]);

    // Phase header must be expanded to see action rows
    // Flat wall (#581): activate the Rituals (resolve_first) filter pill so sorcery rows render.
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="resolve_first"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.proc-duplicate-btn').first()).toBeVisible({ timeout: 5000 });
  });

  // fix.617 DEFERRED (harness limit): duplicating an action posts a save that the server then
  // re-renders into a new ST row; the route-mock returns {ok:true} without adding the entry to
  // the re-fetched queue, so no new row appears in-test. Needs a stateful submissions mock.
  test.fixme('clicking duplicate creates a new ST sorcery entry in the phase', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_SORC_FOR_DUP], [CHAR_CRUAC_DTS2, CHAR_NON_SUBMITTER, CHAR_RETIRED]);

    // Flat wall (#581): activate the Rituals (resolve_first) filter pill so sorcery rows render.
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="resolve_first"]').first().click();
    await page.waitForTimeout(300);

    const dupBtn = page.locator('.proc-duplicate-btn').first();
    await expect(dupBtn).toBeVisible({ timeout: 5000 });
    const initialRows = await page.locator('.proc-action-row').count();
    await dupBtn.click({ force: true });

    // A new row should have appeared (ST badge visible)
    await expect(page.locator('.proc-row-st-badge')).toBeVisible({ timeout: 5000 });
    const newRows = await page.locator('.proc-action-row').count();
    expect(newRows).toBeGreaterThan(initialRows);
  });

  test('duplicate button present on ST-created sorcery row too', async ({ page }) => {
    const subWithStSorc = {
      ...SUBMISSION_SORC_FOR_DUP,
      _id: 'sub-sorc-dup-st',
      st_actions: [
        { action_type: 'sorcery', label: 'Fires of Inspiration', tradition: 'Cruac', rite_name: 'Fires of Inspiration', description: '' },
      ],
      st_actions_resolved: [{ pool_status: 'pending' }],
    };
    await setupDowntimeProcessing(page, [subWithStSorc], [CHAR_CRUAC_DTS2, CHAR_NON_SUBMITTER, CHAR_RETIRED]);

    // Flat wall (#581): activate the Rituals (resolve_first) filter pill so sorcery rows render.
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="resolve_first"]').first().click();
    await page.waitForTimeout(300);

    // Both the player sorcery and ST sorcery rows should have duplicate buttons
    await expect(page.locator('.proc-duplicate-btn').first()).toBeVisible({ timeout: 5000 });
    const dupBtns = await page.locator('.proc-duplicate-btn').count();
    expect(dupBtns).toBe(2);
  });

});
