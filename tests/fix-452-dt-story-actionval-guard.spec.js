/**
 * Regression tests for fix #452 — buildMeritActions must skip phantom sphere slots.
 *
 * Root cause: the flat-response sphere loop in buildMeritActions (downtime-story.js)
 * only checked that sphere_N_merit was non-empty. When sphere_N_action was empty
 * (player never toggled the slot), the slot was pushed as action_type:'misc' — a
 * phantom entry that appeared in the Allies & Asset Summary.
 *
 * Fix: extract actionVal = resp[`sphere_${n}_action`] and skip the slot when either
 * merit name or actionVal is falsy. Mirrors the guard already present in
 * downtime-views.js:3154-3159.
 *
 * All fixtures use the flat-response path: _raw.sphere_actions is empty so
 * buildMeritActions falls through to the sphere_N_* key loop.
 *
 * AC-1: 5 merits pre-populated, 2 with action set → only 2 rows in merit_summary
 * AC-2: slot with merit name but empty action → silently excluded from output
 * AC-3: _raw.sphere_actions path unaffected (DT2+ submissions with raw array)
 * AC-4: all 5 sphere slots with action set → all 5 rows rendered (regression guard)
 * QA-1: AC-1 content check — activated merit names present, phantom names absent
 * QA-2: non-contiguous activation (slot 2 active, slots 1 and 3 phantom) → 1 row
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000452', username: 'test_st_452', global_name: 'Test ST 452',
  avatar: null, role: 'st', player_id: 'p-452', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-452', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

// Character with 5 Allies merits of different qualifiers
const CHAR = {
  _id: 'char-452',
  name: 'Phantom Test', moniker: null, honorific: null,
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
    { name: 'Allies', category: 'general', dots: 2, qualifier: 'Police' },
    { name: 'Allies', category: 'general', dots: 2, qualifier: 'Media' },
    { name: 'Allies', category: 'general', dots: 1, qualifier: 'Legal' },
    { name: 'Allies', category: 'general', dots: 1, qualifier: 'Medical' },
    { name: 'Allies', category: 'general', dots: 1, qualifier: 'Academic' },
  ],
  powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

// All fixtures use _raw.sphere_actions: [] to force the flat-response path.
// Only slots with sphere_N_action set are "activated" by the player.

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-452',
    character_id: 'char-452',
    character_name: 'Phantom Test',
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

// 5 merits pre-populated; only slots 1 and 2 have sphere_N_action set.
// Slots 3, 4, 5 are phantom (merit name present, action empty).
const SUB_TWO_ACTIVATED = {
  ...baseSub('sub-452-two-activated'),
  responses: {
    sphere_1_merit:  'Allies (Police)',
    sphere_1_action: 'investigate',
    sphere_1_outcome: 'Map police patrol routes',
    sphere_2_merit:  'Allies (Media)',
    sphere_2_action: 'protect',
    sphere_2_outcome: 'Suppress story leak',
    sphere_3_merit:  'Allies (Legal)',
    sphere_3_action: '',
    sphere_4_merit:  'Allies (Medical)',
    sphere_4_action: '',
    sphere_5_merit:  'Allies (Academic)',
    // sphere_5_action intentionally absent (undefined)
  },
  merit_actions_resolved: [
    { pool_status: 'pending' },
    { pool_status: 'pending' },
  ],
};

// Single slot: merit name set, action empty — pure phantom.
const SUB_PHANTOM_ONLY = {
  ...baseSub('sub-452-phantom-only'),
  responses: {
    sphere_1_merit:  'Allies (Police)',
    sphere_1_action: '',
  },
};

// DT2+ submission: _raw.sphere_actions has 2 entries — the raw path should be used,
// bypassing the flat-response loop entirely.
const SUB_RAW_PATH = {
  ...baseSub('sub-452-raw-path'),
  responses: {
    sphere_1_merit: 'Allies (Police)',
    // sphere_1_action absent — would be phantom on flat path
  },
  _raw: {
    sphere_actions: [
      { action_type: 'investigate', desired_outcome: 'Network patrol routes' },
      { action_type: 'protect',     desired_outcome: 'Suppress story leak'  },
    ],
    contact_actions:  { requests: [] },
    retainer_actions: { actions:  [] },
  },
  merit_actions_resolved: [
    { pool_status: 'pending' },
    { pool_status: 'pending' },
  ],
};

// Slot 2 activated, slots 1 and 3 phantom — non-contiguous index verification.
const SUB_NONCONTIGUOUS = {
  ...baseSub('sub-452-noncontiguous'),
  responses: {
    sphere_1_merit:  'Allies (Police)',
    sphere_1_action: '',
    sphere_2_merit:  'Allies (Media)',
    sphere_2_action: 'investigate',
    sphere_2_outcome: 'Track media narrative',
    sphere_3_merit:  'Allies (Legal)',
    sphere_3_action: '',
  },
  merit_actions_resolved: [
    { pool_status: 'pending' },
  ],
};

// All 5 slots activated — regression guard that no legitimate rows are dropped.
const SUB_ALL_ACTIVATED = {
  ...baseSub('sub-452-all-activated'),
  responses: {
    sphere_1_merit:  'Allies (Police)',   sphere_1_action: 'investigate',
    sphere_2_merit:  'Allies (Media)',    sphere_2_action: 'protect',
    sphere_3_merit:  'Allies (Legal)',    sphere_3_action: 'gather',
    sphere_4_merit:  'Allies (Medical)',  sphere_4_action: 'misc',
    sphere_5_merit:  'Allies (Academic)', sphere_5_action: 'misc',
  },
  merit_actions_resolved: [
    { pool_status: 'pending' },
    { pool_status: 'pending' },
    { pool_status: 'pending' },
    { pool_status: 'pending' },
    { pool_status: 'pending' },
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

async function getMeritSummaryHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    return el ? el.innerHTML : null;
  });
}

async function getMeritRowCount(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('.dt-merit-summary-row');
    return rows.length;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.452: buildMeritActions skips phantom sphere slots', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: 5 merits pre-populated, 2 with action set → only 2 rows in merit_summary', async ({ page }) => {
    await setup(page, [SUB_TWO_ACTIVATED]);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    const rowCount = await getMeritRowCount(page);
    expect(rowCount).toBe(2);
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: phantom slot (merit set, action empty) → merit_summary section not rendered', async ({ page }) => {
    await setup(page, [SUB_PHANTOM_ONLY]);
    const html = await getMeritSummaryHtml(page);
    expect(html).toBeNull();
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: DT2+ _raw.sphere_actions path → merit_summary renders both raw entries', async ({ page }) => {
    await setup(page, [SUB_RAW_PATH]);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    const rowCount = await getMeritRowCount(page);
    expect(rowCount).toBe(2);
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: all 5 sphere slots activated → all 5 rows rendered (regression guard)', async ({ page }) => {
    await setup(page, [SUB_ALL_ACTIVATED]);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    const rowCount = await getMeritRowCount(page);
    expect(rowCount).toBe(5);
  });

  // QA-1 ──────────────────────────────────────────────────────────────────────

  test('QA-1: activated slot outcomes present; phantom slot outcomes absent', async ({ page }) => {
    await setup(page, [SUB_TWO_ACTIVATED]);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    // Activated slot desired_outcomes must appear.
    expect(html).toContain('Map police patrol routes');
    expect(html).toContain('Suppress story leak');
    // The phantom slots have no outcome text and no sphere_N_action — the
    // merit names (Legal/Medical/Academic) are not rendered at all.
    expect(html).not.toContain('Legal');
    expect(html).not.toContain('Medical');
    expect(html).not.toContain('Academic');
  });

  // QA-2 ──────────────────────────────────────────────────────────────────────

  test('QA-2: non-contiguous activation (slot 2 active, slots 1+3 phantom) → 1 row', async ({ page }) => {
    await setup(page, [SUB_NONCONTIGUOUS]);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    const rowCount = await getMeritRowCount(page);
    expect(rowCount).toBe(1);
    // Activated slot outcome must appear.
    expect(html).toContain('Track media narrative');
    // Phantom slot names have no rendered content — confirm absence via their
    // fixture-unique outcome text which was never set.
    expect(html).not.toContain('Police');
    expect(html).not.toContain('Legal');
  });

});
