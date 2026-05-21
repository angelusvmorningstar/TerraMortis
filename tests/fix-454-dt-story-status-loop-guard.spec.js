/**
 * Regression tests for fix #454 — status loop phantom slot guard + MCI category fix.
 *
 * Root cause A: buildMeritActions status loop (downtime-story.js:2136–2145) was missing
 *   the actionVal guard added to the sphere loop in fix #452. When a player sets
 *   status_N_merit but leaves status_N_action empty ("No Action Taken"), the loop
 *   pushed a phantom action with action_type:'misc' that rendered as "No outcome recorded".
 *
 * Root cause B: deriveMeritCategory regex /mystery cult initiate/ does not match the
 *   real stored label "Mystery Cult Initiation" (strings diverge at position 8 —
 *   "initiate" vs "initiation"). MCI actions fell through to 'misc' and rendered
 *   under INFLUENCE instead of STATUS.
 *
 * Fix A: extract actionVal from status_N_action; guard if (!mt || !actionVal) continue;
 *   use actionVal directly (drop || 'misc' fallback).
 * Fix B: change /mystery cult initiate/ to /mystery cult initiat/ — stem matches both
 *   "Initiate" and "Initiation".
 *
 * AC-1: status merit with empty action → phantom row suppressed; real actions unaffected
 * AC-2: MCI with a real action → row present and not suppressed
 * AC-3: active Status merit routes correctly; outcome present in merit summary
 * AC-4: submission with no status-loop fields → sphere-path actions unaffected (regression guard)
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000454', username: 'test_st_454', global_name: 'Test ST 454',
  avatar: null, role: 'st', player_id: 'p-454', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-454', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-454',
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
    { name: 'Allies',                 category: 'general', dots: 2 },
    { name: 'Mystery Cult Initiation', category: 'standing', dots: 5 },
    { name: 'Status',                 category: 'status',  dots: 2 },
  ],
  powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-454',
    character_id: 'char-454',
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

// AC-1: one active Allies sphere action + one phantom MCI status slot (action empty).
// Allies row must render; MCI phantom must not.
const SUB_STATUS_PHANTOM = {
  ...baseSub('sub-454-phantom'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police allies active this cycle',
    status_1_merit:   'Mystery Cult Initiation ●●●●●',
    status_1_action:  '',   // player changed mind — no action taken
  },
  _raw: {
    sphere_actions:    [{ action_type: 'misc', desired_outcome: 'Police allies' }],
    contact_actions:   { requests: [] },
    retainer_actions:  { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies active this cycle' },
  ],
};

// AC-2: MCI with a real action set — must render (not suppressed by the guard).
const SUB_MCI_ACTIVE = {
  ...baseSub('sub-454-mci-active'),
  responses: {
    status_1_merit:   'Mystery Cult Initiation ●●●●●',
    status_1_action:  'misc',
    status_1_outcome: 'Deepened ties within the Walcott Foundation',
  },
  _raw: {
    sphere_actions:   [],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Cult ties reinforced' },
  ],
};

// AC-3: Status merit with a real action — must render and route correctly.
const SUB_STATUS_ACTIVE = {
  ...baseSub('sub-454-status-active'),
  responses: {
    status_1_merit:   'Status 2 (Invictus)',
    status_1_action:  'misc',
    status_1_outcome: 'Maintain standing in the Invictus',
  },
  _raw: {
    sphere_actions:   [],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Maintained Invictus standing' },
  ],
};

// AC-4: No status-loop fields at all — pure sphere path; regression guard.
const SUB_NO_STATUS = {
  ...baseSub('sub-454-no-status'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police allies active this cycle',
  },
  _raw: {
    sphere_actions:   [{ action_type: 'misc', desired_outcome: 'Police allies' }],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies active this cycle' },
  ],
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
  await page.route('**/api/downtime_cycles*', route =>
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
  await page.waitForSelector('button[data-phase="story"]', { state: 'visible', timeout: 10000 });
  await page.click('button[data-phase="story"]');
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

test.describe('fix.454: status loop guard + MCI category fix', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: phantom status slot (empty action) suppressed; active sphere row unaffected', async ({ page }) => {
    await setup(page, [SUB_STATUS_PHANTOM]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // Active allies outcome must appear.
    expect(html).toContain('Police allies active this cycle');
    // Phantom MCI merit label must not appear.
    expect(html).not.toContain('Mystery Cult Initiation');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: MCI with real action renders in merit summary (not suppressed)', async ({ page }) => {
    await setup(page, [SUB_MCI_ACTIVE]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // MCI outcome must appear — guard must not suppress an action that has actionVal set.
    expect(html).toContain('Cult ties reinforced');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: active Status merit renders in merit summary', async ({ page }) => {
    await setup(page, [SUB_STATUS_ACTIVE]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    expect(html).toContain('Maintained Invictus standing');
  });

  // AC-4 (regression) ─────────────────────────────────────────────────────────

  test('AC-4: submission with no status-loop fields — sphere path unaffected', async ({ page }) => {
    await setup(page, [SUB_NO_STATUS]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    expect(html).toContain('Police allies active this cycle');
  });

});
