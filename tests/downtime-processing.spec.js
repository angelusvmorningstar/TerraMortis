/**
 * Downtime Processing Queue — E2E tests
 * Covers changes from 2026-04-14:
 *   - skTotal effective skill values in pool builder dropdown
 *   - Allies/Status actions route by action type
 *   - Feeding right panel: 9-Again + 8-Again checkboxes
 *   - Clear Pool button on feeding and project panels
 *   - Spec names in committed pool string
 *   - Connected Characters position (below description card)
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
    {
      name: 'Professional Training', category: 'standing', rating: 4,
      role: 'Operative', asset_skills: ['Weaponry', 'Stealth'], dot4_skill: 'Weaponry',
    },
    { name: 'Allies', category: 'influence', rating: 3, qualifier: 'Criminal' },
  ],
  powers: [],
  ordeals: [],
  // Simulated computed Sets (normally set by applyDerivedMerits in browser)
  _pt_dot4_bonus_skills_arr: ['Weaponry'],
};

const CHAR_OTHER = {
  _id: 'char-other', name: 'Eve Test', moniker: null, honorific: null,
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

const SUBMISSION_PROJECT = {
  _id: 'sub-proj-001',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-14T00:00:00Z',
  _raw: {
    projects: [
      {
        action_type: 'ambience_increase',
        desired_outcome: 'Increase ambience in Dockyards',
        detail: 'Patrol the district looking for riff-raff.',
        primary_pool: { expression: 'Strength 3 + Weaponry 4 + Obfuscate 5 = 12' },
      },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'ambience_increase',
    project_1_outcome: 'Increase ambience in Dockyards',
    project_1_description: 'Patrol the district looking for riff-raff.',
    project_1_pool_expr: 'Strength 3 + Weaponry 4 + Obfuscate 5 = 12',
  },
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

const SUBMISSION_ALLIES = {
  _id: 'sub-allies-001',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-14T00:00:00Z',
  _raw: {
    projects: [],
    feeding: null,
    sphere_actions: [
      {
        merit_type: 'Allies 3 (Criminal)',
        action_type: 'ambience_increase',
        description: 'Criminal network spreads influence.',
        desired_outcome: 'Raise Dockyards ambience',
        primary_pool: { expression: '' },
      },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {},
  projects_resolved: [],
  feeding_review: null,
  merit_actions_resolved: [null],
  st_review: { territory_overrides: {} },
};

const SUBMISSION_FEEDING = {
  _id: 'sub-feed-001',
  cycle_id: 'cycle-001',
  character_name: 'Charlie Test',
  character_id: 'char-pt4',
  player_name: 'Test Player',
  submitted_at: '2026-04-14T00:00:00Z',
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
    active_feed_specs: ['Coward Punch (Stealth)'],
    pool_mod_spec: 2,
    pool_mod_equipment: 0,
    notes_thread: [],
    player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setupDowntimeProcessing(page, submissions) {
  await page.addInitScript(({ user }) => {
    // 'local-test-token' triggers the localhost bypass in validateToken()
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  // Single string-glob handler for all API calls on localhost:3000
  // RegExp patterns do NOT reliably intercept these cross-port requests in Playwright
  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });

    if (url.includes('/api/downtime_submissions'))    return ok(submissions);
    if (url.includes('/api/downtime_cycles'))         return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))        return ok([CHAR_PT4, CHAR_OTHER].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))              return ok([CHAR_PT4, CHAR_OTHER]);
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

// Flat card wall (#581 / #585): the main queue no longer uses phase accordions
// (.proc-phase-section / .proc-phase-header / .proc-phase-toggle). Phase navigation
// moved to the filter bar. Activate the phase's filter pill (which re-renders and
// drops every other phase from the DOM), then open the first remaining action row.
// phaseKey is a PHASE_LABELS key, e.g. 'feeding', 'ambience'.
async function openActionInPhase(page, phaseKey) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator(`.proc-filter-pill[data-filter-dim="phases"][data-filter-val="${phaseKey}"]`).first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Downtime Processing — Pool Builder', () => {

  test('processing queue renders without crash when merit_actions_resolved has null entries', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES]);
    // If the null guard is working, the page should not show an error
    const errorEl = page.locator('.dt-error, .error-banner');
    await expect(errorEl).toHaveCount(0);
    // At least the submission checklist should be visible
    const checklist = page.locator('.proc-submission-checklist, .dt-checklist, #dt-submissions');
    await expect(checklist.first()).toBeVisible({ timeout: 5000 });
  });

  test('processing queue renders for a project action submission', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT]);
    // A phase section should appear
    await expect(page.locator('.proc-phase-section').first()).toBeVisible({ timeout: 5000 });
  });

});

test.describe('Downtime Processing — Allies/Status phase routing', () => {

  // Flat card wall (#585): phases are no longer DOM sections — routing is asserted
  // via the filter-bar phase pills. An Allies merit action with action_type
  // ambience_increase must route to the Ambience phase (5), not a separate one.
  test('allies action with ambience_increase routes to the Ambience phase', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    // Filter to Ambience; the allies entry routes here, so it stays visible.
    await page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="ambience"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.proc-action-row', { hasText: 'Allies' })).toHaveCount(1);
  });

  test('allies ambience action is NOT grouped under a dedicated Allies/Status phase', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES]);
    await page.waitForSelector('.proc-action-row', { timeout: 8000 });

    // The only phase pills offered are the phases the submission actually uses
    // (ambience, plus the auto feeding row). There is no standalone allies/status
    // phase, so the action cannot be grouped there.
    const phasePills = page.locator('.proc-filter-pill[data-filter-dim="phases"]');
    const vals = await phasePills.evaluateAll(els => els.map(e => e.getAttribute('data-filter-val')));
    expect(vals).toContain('ambience');
    expect(vals.every(v => ['ambience', 'ambience_change', 'feeding'].includes(v))).toBe(true);
  });

});

test.describe('Downtime Processing — Feeding right panel toggles', () => {

  // Flat wall (#585): proto replaced the checkbox toggles with chip-buttons in the
  // pool builder (.proc-rote-chip / .proc-again-opt[data-again]). The legacy
  // .proc-proj-9a/-8a checkboxes still exist as hidden state-holders (see test below
  // that reads their checked state), but the VISIBLE control is the chip-button.
  test('feeding right panel has Rote, 9-Again and 8-Again toggles', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openActionInPhase(page, 'feeding');

    const detail = page.locator('.proc-action-detail').first();
    await expect(detail.locator('.proc-rote-chip')).toBeVisible({ timeout: 5000 });
    await expect(detail.locator('.proc-again-opt[data-again="9"]')).toBeVisible();
    await expect(detail.locator('.proc-again-opt[data-again="8"]')).toBeVisible();
    await expect(detail).toContainText('Rote');
    await expect(detail).toContainText('9-Again');
    await expect(detail).toContainText('8-Again');
  });

  test('feeding 9-Again toggle is the shared .proc-again-opt chip (same as project)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openActionInPhase(page, 'feeding');

    await expect(page.locator('.proc-action-detail .proc-again-opt[data-again="9"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('feeding 8-Again toggle is the shared .proc-again-opt chip', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openActionInPhase(page, 'feeding');

    await expect(page.locator('.proc-action-detail .proc-again-opt[data-again="8"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('9-Again checkbox reflects saved rev.nine_again state', async ({ page }) => {
    // Submission with nine_again: true already saved
    const subWithNineA = {
      ...SUBMISSION_FEEDING,
      feeding_review: { ...SUBMISSION_FEEDING.feeding_review, nine_again: true },
    };
    await setupDowntimeProcessing(page, [subWithNineA]);
    await openActionInPhase(page, 'feeding');

    const nineAgainCb = page.locator('.proc-feed-right .proc-proj-9a').first();
    await expect(nineAgainCb).toBeChecked({ timeout: 5000 });
  });

  test('9-Again not in pool builder meta for feeding entries', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openActionInPhase(page, 'feeding');

    // dt-feed-9a-toggle should not exist anywhere in the panel
    await expect(page.locator('.dt-feed-9a-toggle')).toHaveCount(0);
  });

});

// REMOVED (#585): the "Clear Pool" button was retired in the flat-card redesign
// (#581) — clearing a validated pool is now redundant, confirmed by Angelus. There
// is no .proc-pool-clear-btn render site any more, so these 3 tests covered a
// deliberately-removed feature and have been deleted rather than re-targeted.

test.describe('Downtime Processing — committed pool display', () => {

  // Flat wall (#585): the old .proc-feed-committed-pool string (which expanded
  // specialisation names) was replaced by the pool builder's confirmed state
  // (.proc-pool-committed + [Confirmed] badge + a "Player's Pool" row). The
  // request to spell out the specialisation in the confirmed pool for clarity is
  // tracked as a separate enhancement issue; this test asserts the current display.
  test('feeding pool builder shows the player pool with its expression', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openActionInPhase(page, 'feeding');

    const builder = page.locator('.proc-action-detail .proc-pool-builder').first();
    await expect(builder).toBeVisible({ timeout: 5000 });
    await expect(builder).toContainText("Player's Pool");
    await expect(builder).toContainText('Strength 3 + Weaponry 4 = 7');
  });

});

test.describe('Downtime Processing — Connected Characters position', () => {

  // Flat wall (#585): Connected Characters moved from .proc-feed-left into the
  // action-type / targeting row rendered above the two-column layout.
  test('Connected Characters section exists in the action panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT]);
    await openActionInPhase(page, 'ambience');

    await expect(page.locator('.proc-action-detail .proc-connected-section')).toBeVisible({ timeout: 5000 });
  });

  // Flat wall (#585): the redesign moved Connected Characters BELOW the pool builder
  // (the old layout had it above). The strict ordering was tied to the old layout, so
  // this now just asserts both the Connected Characters section and the pool builder
  // render in the action panel.
  test('Connected Characters and the pool builder both render in the action panel', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT]);
    await openActionInPhase(page, 'ambience');

    await expect(page.locator('.proc-action-detail .proc-connected-section').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.proc-action-detail .proc-pool-builder').first()).toBeVisible({ timeout: 5000 });
  });

  // RETIRED auto-list assertion (#585): the old Connected Characters auto-listed other
  // submitters; the proto redesign made it a manual ST typeahead (selected chips only).
  // The desired behaviour — player-selected connections flowing to the ST side with ST
  // override, mirroring #586 targeting — is NOT built yet and is tracked as a separate
  // feature issue. This test now asserts the current manual typeahead control exists.
  test('Connected Characters is a manual typeahead control', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT]);
    await openActionInPhase(page, 'ambience');

    const connected = page.locator('.proc-action-detail .proc-connected-section').first();
    await expect(connected).toContainText('Connected Characters');
    await expect(connected.locator('.proc-conn-input')).toBeVisible({ timeout: 5000 });
  });

});
