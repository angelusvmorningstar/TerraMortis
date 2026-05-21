/**
 * Tests for feat #458 — merit summary dismiss/override.
 *
 * Feature: When the merit summary section has incomplete outcomes, each
 * blocking action is now listed by name and reason. An ST can Dismiss
 * individual actions to override the block. When all blocks are dismissed,
 * an amber "Overridden (N dismissed)" badge replaces the pending note and
 * the section dot turns green.
 *
 * AC-1: Blocking action name + reason listed below count message
 * AC-2: Dismiss button present on each blocking item
 * AC-3: Two blocking actions → "2 outcomes still to record"; both names visible
 * AC-4: Pre-dismissed submission → "Overridden (1 dismissed)" badge, dot green
 * AC-5: Clicking Undismiss fires PUT to /api/downtime_submissions/:id;
 *        re-render shows pending note + Dismiss button
 * AC-6: All outcomes genuinely present → green check badge, no blocking list
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000458', username: 'test_st_458', global_name: 'Test ST 458',
  avatar: null, role: 'st', player_id: 'p-458', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-458', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-458',
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
    { name: 'Allies',   category: 'general', dots: 2 },
    { name: 'Contacts', category: 'general', dots: 2 },
  ],
  powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-458',
    character_id: 'char-458',
    character_name: 'Test Kindred',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    st_review: {},
    st_narrative: { story_moment: { status: 'complete' } },
    feeding_review: { pool_status: 'no_feed' },
  };
}

// AC-1 + AC-2: one Allies sphere action with no outcome_summary → one blocking item.
// Uses flat-response path: buildMeritActions reads sphere_1_merit + sphere_1_action keys
// when _raw.sphere_actions is empty.
const SUB_ONE_MISSING = {
  ...baseSub('sub-458-one'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police network maintained',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: '' },
  ],
};

// AC-3: two sphere actions, both missing outcome_summary.
const SUB_TWO_MISSING = {
  ...baseSub('sub-458-two'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police help',
    sphere_2_merit:   'Contacts (Church)',
    sphere_2_action:  'misc',
    sphere_2_outcome: 'Church info',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: '' },
    { pool_status: 'confirmed', outcome_summary: '' },
  ],
};

// AC-4: one Allies action, no outcome, already dismissed via overrides.
// meritSummaryComplete returns true → dot green; footer shows overridden badge.
const SUB_DISMISSED = {
  ...baseSub('sub-458-dismissed'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police network',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: '' },
  ],
  st_narrative: {
    story_moment: { status: 'complete' },
    merit_summary_overrides: [0],
  },
};

// AC-6: all outcomes genuinely present → green check, no blocking list.
const SUB_COMPLETE = {
  ...baseSub('sub-458-complete'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police network maintained',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police network maintained.' },
  ],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup(page, submissions, { interceptPut } = {}) {
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
  await page.route('**/api/downtime_cycles*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  // Route covers both ?query-param GETs and /id PUT/PATCH paths
  await page.route(/\/api\/downtime_submissions/, route => {
    const method = route.request().method();
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
      if (interceptPut) interceptPut(route.request());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
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
  await page.waitForSelector('button[data-phase="story"]', { state: 'visible', timeout: 10000 });
  await page.click('button[data-phase="story"]');
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 10000 });
  await page.click('.dt-story-pill');
  await page.waitForSelector('.dt-story-char-content', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMeritSectionHtml(page, sectionKey) {
  return page.evaluate((key) => {
    const el = document.querySelector(`.dt-story-section[data-section="${key}"]`);
    return el ? el.innerHTML : null;
  }, sectionKey);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.458: merit summary dismiss/override', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: blocking action name and reason visible below count message', async ({ page }) => {
    await setup(page, [SUB_ONE_MISSING]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // Pending note still present
    expect(html).toContain('still to record in DT Processing');
    // Action name (from getMeritDetails on 'Allies 2 (Police)' → label 'Allies', qualifier 'Police')
    expect(html).toContain('Allies (Police)');
    // Reason
    expect(html).toContain('outcome not yet recorded');
    // No overridden badge
    expect(html).not.toContain('Overridden');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: Dismiss button present on blocking item', async ({ page }) => {
    await setup(page, [SUB_ONE_MISSING]);
    const dismissBtn = page.locator('.dt-merit-dismiss-btn').first();
    await expect(dismissBtn).toBeVisible();
    await expect(dismissBtn).toHaveText('Dismiss');
    // Must not have active styling yet
    await expect(dismissBtn).not.toHaveClass(/dt-merit-dismiss-btn--active/);
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: two blocking actions → count says "2 outcomes", both names visible', async ({ page }) => {
    await setup(page, [SUB_TWO_MISSING]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    expect(html).toContain('2 outcomes still to record in DT Processing');
    // Both action names visible
    expect(html).toContain('Allies (Police)');
    expect(html).toContain('Contacts (Church)');
    // Two Dismiss buttons
    const dismissBtns = page.locator('.dt-merit-dismiss-btn');
    await expect(dismissBtns).toHaveCount(2);
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: pre-dismissed submission → overridden badge visible, dot green', async ({ page }) => {
    await setup(page, [SUB_DISMISSED]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // Overridden badge shown (not the green check)
    expect(html).toContain('Overridden (1 dismissed)');
    expect(html).not.toContain('All outcomes recorded');
    expect(html).not.toContain('still to record in DT Processing');
    // Dot is green (meritSummaryComplete returns true when all overridden)
    const dot = page.locator('[data-section="merit_summary"] .dt-story-completion-dot');
    await expect(dot).toHaveClass(/dt-story-dot-complete/);
    // Undismiss button present
    const undismissBtn = page.locator('.dt-merit-dismiss-btn--active');
    await expect(undismissBtn).toBeVisible();
    await expect(undismissBtn).toHaveText('Undismiss');
  });

  // AC-5 ──────────────────────────────────────────────────────────────────────

  test('AC-5: clicking Undismiss fires PUT and re-renders with pending note', async ({ page }) => {
    // Capture PUT bodies for assertion
    const putBodies = [];
    await setup(page, [SUB_DISMISSED], {
      interceptPut: (req) => { try { putBodies.push(req.postData()); } catch (_) {} },
    });

    // Initial state: overridden badge + Undismiss button
    await expect(page.locator('.dt-merit-dismiss-btn--active')).toBeVisible();

    // Wait for PUT request to be made first
    const putPromise = page.waitForRequest(
      req => req.url().includes('/api/downtime_submissions/') && req.method() === 'PUT',
      { timeout: 5000 }
    );

    // Click Undismiss
    await page.locator('.dt-merit-dismiss-btn--active').click();

    // Assert PUT fired with empty overrides array
    const putRequest = await putPromise;
    const body = JSON.parse(putRequest.postData());
    // Key contains a literal dot — use bracket notation, not toHaveProperty (which splits on '.')
    expect(body['st_narrative.merit_summary_overrides']).toEqual([]);

    // Give the async handler time to complete the re-render
    await page.waitForTimeout(1000);

    // After re-render: pending note shown, no overridden badge
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).toContain('still to record in DT Processing');
    expect(html).not.toContain('Overridden');

    // Dismiss button (not active/Undismiss) is shown for the re-blocked item
    await expect(page.locator('.dt-merit-dismiss-btn').first()).toHaveText('Dismiss');
  });

  // QA-1 ─────────────────────────────────────────────────────────────────────

  test('QA-1: clicking Dismiss fires PUT with index in overrides and re-renders overridden badge', async ({ page }) => {
    await setup(page, [SUB_ONE_MISSING]);

    // Initial state: Dismiss button (not active)
    const dismissBtn = page.locator('.dt-merit-dismiss-btn').first();
    await expect(dismissBtn).toBeVisible();
    await expect(dismissBtn).toHaveText('Dismiss');

    const putPromise = page.waitForRequest(
      req => req.url().includes('/api/downtime_submissions/') && req.method() === 'PUT',
      { timeout: 5000 }
    );

    await dismissBtn.click();

    const putRequest = await putPromise;
    const body = JSON.parse(putRequest.postData());
    expect(body['st_narrative.merit_summary_overrides']).toEqual([0]);

    await page.waitForTimeout(1000);

    // After re-render: overridden badge shown, no pending note
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).toContain('Overridden (1 dismissed)');
    expect(html).not.toContain('still to record in DT Processing');

    // Dot turns green
    const dot = page.locator('[data-section="merit_summary"] .dt-story-completion-dot');
    await expect(dot).toHaveClass(/dt-story-dot-complete/);

    // Button flips to Undismiss
    await expect(page.locator('.dt-merit-dismiss-btn--active')).toHaveText('Undismiss');
  });

  // QA-2 ─────────────────────────────────────────────────────────────────────

  test('QA-2: partial dismiss (2 items, dismiss 1) — dot stays pending, one Dismiss one Undismiss', async ({ page }) => {
    await setup(page, [SUB_TWO_MISSING]);

    // Both Dismiss buttons present; click the first (Allies, idx=0)
    const btns = page.locator('.dt-merit-dismiss-btn');
    await expect(btns).toHaveCount(2);

    const putPromise = page.waitForRequest(
      req => req.url().includes('/api/downtime_submissions/') && req.method() === 'PUT',
      { timeout: 5000 }
    );

    await btns.first().click();

    const putRequest = await putPromise;
    const body = JSON.parse(putRequest.postData());
    expect(body['st_narrative.merit_summary_overrides']).toEqual([0]);

    await page.waitForTimeout(1000);

    // Still one remaining block → "1 outcome still to record"
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).toContain('1 outcome still to record in DT Processing');
    expect(html).not.toContain('Overridden');

    // Dot stays pending because one un-dismissed block remains
    const dot = page.locator('[data-section="merit_summary"] .dt-story-completion-dot');
    await expect(dot).toHaveClass(/dt-story-dot-pending/);

    // One Dismiss (remaining) + one Undismiss (dismissed) visible
    await expect(page.locator('.dt-merit-dismiss-btn')).toHaveCount(2);
    await expect(page.locator('.dt-merit-dismiss-btn--active')).toHaveCount(1);
    await expect(page.locator('.dt-merit-dismiss-btn--active')).toHaveText('Undismiss');
  });

  // AC-6 ──────────────────────────────────────────────────────────────────────

  test('AC-6: all outcomes present → green check badge, no blocking list', async ({ page }) => {
    await setup(page, [SUB_COMPLETE]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    expect(html).toContain('All outcomes recorded');
    expect(html).not.toContain('Overridden');
    expect(html).not.toContain('still to record in DT Processing');
    // No blocking list rendered
    const blockingList = page.locator('.dt-merit-blocking-list');
    await expect(blockingList).toHaveCount(0);
    // No dismiss buttons
    const dismissBtns = page.locator('.dt-merit-dismiss-btn');
    await expect(dismissBtns).toHaveCount(0);
  });

});
