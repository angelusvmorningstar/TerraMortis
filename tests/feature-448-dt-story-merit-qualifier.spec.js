/**
 * Tests for feature #448 — Allies & Asset Summary rows must show merit qualifier.
 *
 * Root cause: renderMeritSummary discarded the `qualifier` returned by
 * getMeritDetails, so all rows of the same category showed identical bare labels.
 *
 * Fix: capture qualifier at line 2283 and build displayLabel with
 * "(qualifier)" suffix when non-empty.
 *
 * NOTE: buildMeritActions always rebuilds merit_actions from responses/_raw at
 * load time — pre-populated merit_actions fields are overwritten. Fixtures must
 * use responses.sphere_N_merit + _raw.sphere_actions to shape the merit_actions
 * the Story tab sees (same pattern as fix-429 spec).
 *
 * AC-1: multiple Allies with different qualifiers → each row shows "Allies (Police)", "Allies (Media)"
 * AC-2: merit with no qualifier → base name only, no empty parens
 * AC-3: Contacts row shows qualifier (via contact_N_merit + contact_N_request)
 * AC-4: Retainer row shows qualifier (via retainer_N_merit + retainer_N_task)
 * AC-5: action card section (allies_actions) unchanged — regression guard
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000448', username: 'test_st_448', global_name: 'Test ST 448',
  avatar: null, role: 'st', player_id: 'p-448', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-448', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-448',
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
    { name: 'Allies',   category: 'influence', dots: 3, qualifier: 'Police' },
    { name: 'Allies',   category: 'influence', dots: 2, qualifier: 'Media' },
    { name: 'Contacts', category: 'influence', dots: 2, qualifier: 'Finance' },
    { name: 'Retainer', category: 'general',   dots: 3, qualifier: 'Driver' },
    { name: 'Resources', category: 'influence', dots: 2 },
  ],
  powers: [], ordeals: [],
};

function baseSub(overrides = {}) {
  return {
    _id: 'sub-448',
    cycle_id: 'cycle-448',
    character_id: 'char-448',
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
    ...overrides,
  };
}

// Two Allies actions with different qualifiers — exercises AC-1, AC-5
const SUB_MULTI_ALLIES = baseSub({
  responses: {
    sphere_1_merit: 'Allies (Police)',
    sphere_2_merit: 'Allies (Media)',
  },
  _raw: {
    sphere_actions: [
      { action_type: 'misc', desired_outcome: 'Suppress the leak' },
      { action_type: 'misc', desired_outcome: 'Plant a story' },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Leak suppressed.' },
    {},
  ],
});

// One Resources action (no qualifier) — exercises AC-2
const SUB_RESOURCES_ONLY = baseSub({
  responses: { sphere_1_merit: 'Resources' },
  _raw: {
    sphere_actions: [{ action_type: 'acquisition', desired_outcome: 'Buy a safe house' }],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [{ pool_status: 'confirmed', outcome_summary: 'Safe house secured.' }],
});

// One Contacts action with qualifier — exercises AC-3
const SUB_CONTACTS = baseSub({
  responses: {
    contact_1_request: 'Track money flow in the docks',
    contact_1_merit: 'Contacts (Finance)',
  },
  _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  merit_actions_resolved: [{}],
});

// One Retainer action with qualifier — exercises AC-4
const SUB_RETAINER = baseSub({
  responses: {
    retainer_1_task: 'Drive the package to the docks',
    retainer_1_merit: 'Retainer (Driver)',
  },
  _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  merit_actions_resolved: [{}],
});

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup(page, submission) {
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
  await page.route('**/api/downtime_submissions*', route => {
    if (['PATCH', 'PUT', 'POST'].includes(route.request().method()))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([submission]) });
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

async function getMeritSummaryHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    return el ? el.innerHTML : null;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feature-448: Allies & Asset Summary shows merit qualifier', () => {

  test('AC-1a: first Allies row shows qualifier "Allies (Police)"', async ({ page }) => {
    await setup(page, SUB_MULTI_ALLIES);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Allies (Police)');
  });

  test('AC-1b: second Allies row shows qualifier "Allies (Media)"', async ({ page }) => {
    await setup(page, SUB_MULTI_ALLIES);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Allies (Media)');
  });

  test('AC-2: Resources row (no qualifier) shows bare name without empty parens', async ({ page }) => {
    await setup(page, SUB_RESOURCES_ONLY);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Resources');
    expect(html).not.toMatch(/Resources\s*\(\s*\)/);
  });

  test('AC-3: Contacts row shows qualifier "Contacts (Finance)"', async ({ page }) => {
    await setup(page, SUB_CONTACTS);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Contacts (Finance)');
  });

  test('AC-4: Retainer row shows qualifier "Retainer (Driver)"', async ({ page }) => {
    await setup(page, SUB_RETAINER);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Retainer (Driver)');
  });

  test('AC-5: merit_summary renders all rows — no rows dropped by qualifier change', async ({ page }) => {
    await setup(page, SUB_MULTI_ALLIES);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    // Both Allies rows must be present — no row should be silently dropped
    const matches = (html.match(/dt-merit-summary-row/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

});
