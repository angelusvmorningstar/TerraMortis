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
  status: { city: 1, clan: 1, covenant: 1 },
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
  ordeals: {},
  // Simulated computed Sets (normally set by applyDerivedMerits in browser)
  _pt_dot4_bonus_skills_arr: ['Weaponry'],
};

const CHAR_OTHER = {
  _id: 'char-other', name: 'Eve Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Carthian Movement', player: 'Other Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: 1 },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
};

const TEST_CYCLE = {
  _id: 'cycle-001', cycle_number: 2, status: 'open',
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
  // Seed auth tokens before page load — same pattern as loginAsST in admin.spec.js
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR_PT4, CHAR_OTHER]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([CHAR_PT4, CHAR_OTHER].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TEST_CYCLE]) })
  );
  await page.route('**/api/downtime_submissions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submissions) })
  );
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  // Intercept saves — return success without hitting real API
  await page.route('**/api/downtime_submissions/**', route => {
    if (route.request().method() === 'PATCH' || route.request().method() === 'PUT') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else {
      route.continue();
    }
  });

  await page.goto('/admin.html');
  // Wait for auth to resolve and app to show (mirrors admin.spec.js pattern)
  await page.waitForSelector('#admin-app:not([style*="display: none"])', { timeout: 10000 });
  // Navigate to Downtime domain
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(600);
}

async function openFirstAction(page, phaseLabel) {
  // Wait for queue to render
  await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
  // Expand the phase section if collapsed
  const phaseHeader = page.locator('.proc-phase-header').filter({ hasText: phaseLabel }).first();
  const toggle = phaseHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await phaseHeader.click();
  await page.waitForTimeout(200);
  // Click first action row in that phase to expand it
  const phase = page.locator('.proc-phase-section').filter({ hasText: phaseLabel }).first();
  const firstRow = phase.locator('.proc-action-row').first();
  await firstRow.click();
  await page.waitForTimeout(400);
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

  test('allies action with ambience_increase appears in Ambience step not Allies & Status', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES]);
    await page.waitForTimeout(500);

    // The ambience phase should contain the allies entry
    const ambiencePhase = page.locator('.proc-phase-section').filter({ hasText: 'Ambience' });
    await expect(ambiencePhase).toBeVisible({ timeout: 5000 });
    await expect(ambiencePhase).toContainText('Allies');
  });

  test('allies action does NOT appear in the Allies & Status phase when action type maps to a step', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_ALLIES]);
    await page.waitForTimeout(500);

    // Allies & Status phase (phase 9) should be absent or empty for this submission
    const alliesPhase = page.locator('.proc-phase-section').filter({ hasText: 'Allies & Status' });
    // Either not rendered, or rendered but not containing Charlie's Allies entry
    const count = await alliesPhase.count();
    if (count > 0) {
      await expect(alliesPhase).not.toContainText('Allies 3 (Criminal)');
    }
  });

});

test.describe('Downtime Processing — Feeding right panel toggles', () => {

  test('feeding right panel has Rote, 9-Again and 8-Again checkboxes', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    const rightPanel = page.locator('.proc-feed-right').first();
    await expect(rightPanel.locator('input[type="checkbox"]').filter({ hasText: '' }).nth(0)).toBeVisible({ timeout: 5000 });

    // Check labels exist
    await expect(rightPanel).toContainText('Rote Action');
    await expect(rightPanel).toContainText('9-Again');
    await expect(rightPanel).toContainText('8-Again');
  });

  test('feeding 9-Again checkbox class is proc-proj-9a (same as project)', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    const nineAgainCb = page.locator('.proc-feed-right .proc-proj-9a').first();
    await expect(nineAgainCb).toBeVisible({ timeout: 5000 });
  });

  test('feeding 8-Again checkbox class is proc-proj-8a', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    const eightAgainCb = page.locator('.proc-feed-right .proc-proj-8a').first();
    await expect(eightAgainCb).toBeVisible({ timeout: 5000 });
  });

  test('9-Again checkbox reflects saved rev.nine_again state', async ({ page }) => {
    // Submission with nine_again: true already saved
    const subWithNineA = {
      ...SUBMISSION_FEEDING,
      feeding_review: { ...SUBMISSION_FEEDING.feeding_review, nine_again: true },
    };
    await setupDowntimeProcessing(page, [subWithNineA]);
    await openFirstAction(page, 'Feeding');

    const nineAgainCb = page.locator('.proc-feed-right .proc-proj-9a').first();
    await expect(nineAgainCb).toBeChecked({ timeout: 5000 });
  });

  test('9-Again not in pool builder meta for feeding entries', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    // dt-feed-9a-toggle should not exist anywhere in the panel
    await expect(page.locator('.dt-feed-9a-toggle')).toHaveCount(0);
  });

});

test.describe('Downtime Processing — Clear Pool button', () => {

  test('Clear Pool button appears on feeding panel when pool is validated', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    const clearBtn = page.locator('.proc-pool-clear-btn').first();
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await expect(clearBtn).toContainText('Clear Pool');
  });

  test('Clear Pool button is absent when pool_validated is empty', async ({ page }) => {
    const subNoClearPool = {
      ...SUBMISSION_FEEDING,
      feeding_review: { ...SUBMISSION_FEEDING.feeding_review, pool_validated: '' },
    };
    await setupDowntimeProcessing(page, [subNoClearPool]);
    await openFirstAction(page, 'Feeding');

    await expect(page.locator('.proc-pool-clear-btn')).toHaveCount(0);
  });

  test('Clear Pool button triggers a PATCH save', async ({ page }) => {
    let patchCalled = false;
    await page.route('**/api/downtime_submissions/**', route => {
      if (route.request().method() === 'PATCH') {
        patchCalled = true;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        route.continue();
      }
    });

    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    const clearBtn = page.locator('.proc-pool-clear-btn').first();
    await clearBtn.click();
    await page.waitForTimeout(400);
    expect(patchCalled).toBe(true);
  });

});

test.describe('Downtime Processing — Spec names in committed pool', () => {

  test('committed pool string shows spec name not generic "specs N"', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_FEEDING]);
    await openFirstAction(page, 'Feeding');

    const committedPool = page.locator('.proc-feed-committed-pool').first();
    await expect(committedPool).toBeVisible({ timeout: 5000 });

    // Should NOT contain "specs 2" — should contain the actual spec name
    await expect(committedPool).not.toContainText('specs 2');
    await expect(committedPool).toContainText('Coward Punch (Stealth)');
  });

});

test.describe('Downtime Processing — Connected Characters position', () => {

  test('Connected Characters section exists inside the action panel left column', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT]);
    await openFirstAction(page, 'Ambience');

    // Connected Characters should be inside proc-action-detail > proc-feed-left, not after proc-feed-layout
    const connectedInLeft = page.locator('.proc-feed-left .proc-connected-section');
    await expect(connectedInLeft).toBeVisible({ timeout: 5000 });
  });

  test('Connected Characters appears above the pool builder', async ({ page }) => {
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT]);
    await openFirstAction(page, 'Ambience');

    const leftCol = page.locator('.proc-feed-left').first();
    const connectedSection = leftCol.locator('.proc-connected-section');
    const poolBuilder = leftCol.locator('.proc-pool-builder');

    await expect(connectedSection).toBeVisible({ timeout: 5000 });
    await expect(poolBuilder).toBeVisible({ timeout: 5000 });

    // Connected Characters bounding box top should be above pool builder top
    const connectedBox = await connectedSection.boundingBox();
    const poolBox = await poolBuilder.boundingBox();
    expect(connectedBox.y).toBeLessThan(poolBox.y);
  });

  test('Connected Characters lists other submitting characters', async ({ page }) => {
    // Add a second submission from another character
    const subOther = {
      ...SUBMISSION_FEEDING,
      _id: 'sub-other-001',
      character_name: 'Eve Test',
      character_id: 'char-other',
    };
    await setupDowntimeProcessing(page, [SUBMISSION_PROJECT, subOther]);
    await openFirstAction(page, 'Ambience');

    const connectedSection = page.locator('.proc-connected-section').first();
    await expect(connectedSection).toContainText('Eve Test');
  });

});
