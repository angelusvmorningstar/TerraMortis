/**
 * Regression tests for fix #429 — DT Story tab must skip deleted actions.
 *
 * Root cause: downtime-story.js had zero awareness of deleted actions stored
 * in sub.st_review.deleted_action_keys. Three code paths were affected:
 *   - getApplicableSections: hasCategory predicate and project gate
 *   - meritSummaryComplete: loop iterated deleted actions as incomplete
 *   - renderMeritSummary: deleted actions appeared in published ledger
 *
 * Fix adds helpers _isDeletedMeritAction / _isDeletedProjectAction and guards
 * at all five affected call sites.
 *
 * AC-1: deleted merit action → merit_summary section not rendered
 * AC-2: deleted merit (no outcome_summary) + active merit (outcome set) → section complete
 * AC-3: all merit actions deleted → merit_summary section not rendered
 * AC-4: mixed (deleted ally + active status) → only status row shown in ledger
 * AC-5: deleted project → project_responses section not shown
 * AC-6: deleted merit action label absent from published merit summary ledger
 * AC-7: non-deleted submission → merit_summary renders normally (regression guard)
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000429', username: 'test_st_429', global_name: 'Test ST 429',
  avatar: null, role: 'st', player_id: 'p-429', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-429', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-429',
  name: 'Test Kindred', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {},
  merits: [
    { name: 'Allies',  category: 'general', dots: 2 },
    { name: 'Status',  category: 'status',  dots: 2 },
  ],
  powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

// buildMeritActions in downtime-story.js reads _raw.sphere_actions + responses.sphere_N_merit
// to build the merit_actions array it stores in-memory. Setting these fields directly on the
// mocked submission shapes the merit_actions the Story tab will see — bypassing any pre-built
// merit_actions field (which the module overwrites at load time).

function baseSub(id) {
  return {
    _id: id,
    chapter_id: 'cycle-429',
    character_id: 'char-429',
    character_name: 'Test Kindred',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    st_review: {},
    // story_moment complete + no_feed so these sections don't block sign-off in fixtures that
    // need all non-merit sections done (AC-2).
    st_narrative: { story_moment: { status: 'complete' } },
    feeding_review: { pool_status: 'no_feed' },
  };
}

// One allies action at index 0, player-deleted via 'merit:0'.
const SUB_DELETED_MERIT = {
  ...baseSub('sub-429-deleted-merit'),
  responses: { sphere_1_merit: 'Allies 2 (Police)' },
  _raw: {
    sphere_actions: [{ action_type: 'misc', desired_outcome: 'Grow police network' }],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [],
  st_review: { deleted_action_keys: ['merit:0'] },
};

// Two actions: index 0 allies deleted (no outcome_summary), index 1 status active (outcome set).
// Used by AC-2, AC-4, AC-6.
const SUB_ACTIVE_AND_DELETED = {
  ...baseSub('sub-429-mixed'),
  responses: { sphere_1_merit: 'Allies 2 (Police)', sphere_2_merit: 'Status 2 (Invictus)' },
  _raw: {
    sphere_actions: [
      { action_type: 'misc', desired_outcome: 'Grow police network' },
      { action_type: 'misc', desired_outcome: 'Maintain status' },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    {},
    { pool_status: 'confirmed', outcome_summary: 'Kept influence over Invictus hierarchy' },
  ],
  st_review: { deleted_action_keys: ['merit:0'] },
};

// Two actions, both deleted.
const SUB_ALL_DELETED = {
  ...baseSub('sub-429-all-deleted'),
  responses: { sphere_1_merit: 'Allies 2 (Police)', sphere_2_merit: 'Status 2 (Invictus)' },
  _raw: {
    sphere_actions: [
      { action_type: 'misc', desired_outcome: 'Grow police network' },
      { action_type: 'misc', desired_outcome: 'Maintain status' },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [],
  st_review: { deleted_action_keys: ['merit:0', 'merit:1'] },
};

// One project at index 0, player-deleted via 'proj:0'.
const SUB_DELETED_PROJECT = {
  ...baseSub('sub-429-deleted-proj'),
  projects_resolved: [{ pool_status: 'pending' }],
  st_review: { deleted_action_keys: ['proj:0'] },
};

// proj[0] deleted, proj[1] active and completed at project_responses[1].
// Exercises the T7 index-alignment fix: old code checked responses[0] (null → false);
// fixed code checks responses[idx=1] (complete → true).
const SUB_PROJ0_DELETED_PROJ1_COMPLETE = {
  ...baseSub('sub-429-proj-idx-align'),
  projects_resolved: [
    { pool_status: 'pending' },
    { pool_status: 'validated' },
  ],
  st_review: { deleted_action_keys: ['proj:0'] },
  st_narrative: {
    story_moment: { status: 'complete' },
    project_responses: [null, { status: 'complete', response: 'Second project completed' }],
  },
};

// One allies action, no deletions — regression guard.
const SUB_NO_DELETIONS = {
  ...baseSub('sub-429-no-del'),
  responses: { sphere_1_merit: 'Allies 2 (Police)' },
  _raw: {
    sphere_actions: [{ action_type: 'misc', desired_outcome: 'Grow police network' }],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [{ pool_status: 'confirmed', outcome_summary: 'Police allies active this cycle' }],
  st_review: {},
};

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) })
  );
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR]) })
  );
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]) })
  );
  await page.route('**/api/chapters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route('**/api/downtime_submissions*', route => {
    if (['PATCH', 'PUT', 'POST'].includes(route.request().method()))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submissions) });
  });
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  // Wait for the phase ribbon to render; 'story' tab button confirms all five tabs are present.
  await page.waitForSelector('button[data-phase="story"]', { state: 'visible', timeout: 10000 });
  await page.click('button[data-phase="story"]');
  // Wait for Story tab to finish its async init and show the character nav rail.
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 10000 });
  await page.click('.dt-story-pill');
  await page.waitForSelector('.dt-story-char-content', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function getMeritSectionHtml(page, sectionKey) {
  return page.evaluate((key) => {
    const el = document.querySelector(`.dt-story-section[data-section="${key}"]`);
    return el ? el.innerHTML : null;
  }, sectionKey);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.429: DT Story tab skips deleted actions', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: deleted merit action → merit_summary section not rendered', async ({ page }) => {
    await setup(page, [SUB_DELETED_MERIT]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).toBeNull();
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: deleted merit (no outcome) + active merit (outcome set) → section shows complete', async ({ page }) => {
    await setup(page, [SUB_ACTIVE_AND_DELETED]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // meritSummaryComplete skipped the deleted action and found all remaining resolved →
    // "All outcomes recorded" badge must appear.
    expect(html).toContain('All outcomes recorded');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: all merit actions deleted → merit_summary section not rendered, sign-off not blocked', async ({ page }) => {
    await setup(page, [SUB_ALL_DELETED]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).toBeNull();
    // story_moment + feeding both complete, no merit section → all sections done → pill green.
    const pillGreen = await page.evaluate(() => !!document.querySelector('.dt-story-pill.green'));
    expect(pillGreen).toBe(true);
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: mixed (deleted ally + active status) → section present, only status row shown', async ({ page }) => {
    await setup(page, [SUB_ACTIVE_AND_DELETED]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // Active status action outcome must appear.
    expect(html).toContain('Kept influence over Invictus hierarchy');
    // Deleted allies desired_outcome must not appear.
    expect(html).not.toContain('Grow police network');
  });

  // AC-5 ──────────────────────────────────────────────────────────────────────

  test('AC-5: deleted project → project_responses section not shown, sign-off not blocked', async ({ page }) => {
    await setup(page, [SUB_DELETED_PROJECT]);
    const projectHtml = await getMeritSectionHtml(page, 'project_responses');
    expect(projectHtml).toBeNull();
    // story_moment + feeding both complete, no project_responses → all sections done → pill green.
    const pillGreen = await page.evaluate(() => !!document.querySelector('.dt-story-pill.green'));
    expect(pillGreen).toBe(true);
  });

  // AC-6 ──────────────────────────────────────────────────────────────────────

  test('AC-6: deleted merit action label absent from published merit summary ledger', async ({ page }) => {
    await setup(page, [SUB_ACTIVE_AND_DELETED]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // Deleted allies entry: desired_outcome and outcome must not appear in ledger rows.
    expect(html).not.toContain('Grow police network');
    // Active status entry must be present to confirm ledger rendered at all.
    expect(html).toContain('Invictus hierarchy');
  });

  // T7 index alignment ────────────────────────────────────────────────────────

  test('T7: projectResponsesComplete uses original index when earlier project deleted', async ({ page }) => {
    await setup(page, [SUB_PROJ0_DELETED_PROJ1_COMPLETE]);
    // project_responses section is added (proj[1] is not deleted).
    const projectHtml = await getMeritSectionHtml(page, 'project_responses');
    expect(projectHtml).not.toBeNull();
    // proj[1] at original index 1 is complete → all active projects complete → pill green.
    // Old code checked responses[0] (null) instead of responses[1] → would return false.
    const pillGreen = await page.evaluate(() => !!document.querySelector('.dt-story-pill.green'));
    expect(pillGreen).toBe(true);
  });

  // AC-7 (regression) ─────────────────────────────────────────────────────────

  test('AC-7: non-deleted submission → merit_summary renders normally (regression guard)', async ({ page }) => {
    await setup(page, [SUB_NO_DELETIONS]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    expect(html).toContain('Police allies active this cycle');
  });

});
