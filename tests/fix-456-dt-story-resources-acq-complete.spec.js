/**
 * Regression tests for fix #456 — Resources acquisition completion check.
 *
 * Root cause: meritSummaryComplete (downtime-story.js:2241-2244) checked
 *   acquisitions_resolved[0]?.pool_status for resources category actions.
 *   DT Processing writes to merit_actions_resolved[i].pool_status only —
 *   acquisitions_resolved is empty for most submissions. So the resources
 *   check always failed (pool_status = '') even when the acquisition was
 *   Validated in DT Processing.
 *
 * Fix A (T1): meritSummaryComplete now checks merit_actions_resolved[i].pool_status
 *   first; acquisitions_resolved[0] is kept as a legacy fallback.
 * Fix B (T2): renderMeritSummary missing count filter mirrors T1 logic.
 * Fix C (T3): renderMeritSummary row display pulls notes_thread text for
 *   resources rows instead of outcome_summary (which is never set for acqs).
 *
 * AC-1: validated acquisition (merit_actions_resolved[0].pool_status='validated') →
 *       merit_summary complete, pill green
 * AC-2: pending acquisition (pool_status='pending') → pill NOT green
 * AC-3: validated acquisition → row shows notes_thread text as outcome
 * AC-4: mixed (validated acquisition + resolved sphere merit) → pill green
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000456', username: 'test_st_456', global_name: 'Test ST 456',
  avatar: null, role: 'st', player_id: 'p-456', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-456', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-456',
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
    { name: 'Resources', category: 'general', dots: 3 },
    { name: 'Allies',    category: 'general', dots: 2 },
  ],
  powers: [], ordeals: [],
};

// ── Submission builders ───────────────────────────────────────────────────────

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-456',
    character_id: 'char-456',
    character_name: 'Test Kindred',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],   // intentionally empty — mirrors real Carver data
    acquisitions_resolved: [],
    st_review: {},
    st_narrative: { story_moment: { status: 'complete' } },
    feeding_review: { pool_status: 'no_feed' },
  };
}

// AC-1 + AC-3: validated acquisition; acquisitions_resolved intentionally empty.
// buildMeritActions reads _raw.acquisitions.resource_acquisitions (blob path)
// and pushes one action with merit_type:'Resources', action_type:'acquisition'.
// That action is merit_actions[0] → merit_actions_resolved[0].
const SUB_VALIDATED_ACQ = {
  ...baseSub('sub-456-validated'),
  responses: {
    resources_acquisitions: 'Older audio equipment for the studio',
  },
  _raw: {
    sphere_actions:   [],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: {
      resource_acquisitions: 'Older audio equipment for the studio',
    },
  },
  merit_actions_resolved: [
    {
      pool_status:  'validated',
      notes_thread: [{ author_name: 'Von Vagabond', text: 'Nicole finds stunning audiophile equipment.' }],
    },
  ],
  acquisitions_resolved: [],
};

// AC-2: pending acquisition — not yet validated.
const SUB_PENDING_ACQ = {
  ...baseSub('sub-456-pending'),
  responses: {
    resources_acquisitions: 'Rare antique clock',
  },
  _raw: {
    sphere_actions:   [],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'Rare antique clock' },
  },
  merit_actions_resolved: [
    { pool_status: 'pending' },
  ],
  acquisitions_resolved: [],
};

// AC-4: validated acquisition (index 1) alongside resolved sphere merit (index 0).
// buildMeritActions appends acquisitions AFTER sphere actions, so:
//   merit_actions[0] = Allies sphere action → merit_actions_resolved[0]
//   merit_actions[1] = Resources acquisition → merit_actions_resolved[1]
const SUB_MIXED = {
  ...baseSub('sub-456-mixed'),
  responses: {
    sphere_1_merit:          'Allies 2 (Police)',
    sphere_1_action:         'misc',
    sphere_1_outcome:        'Police allies maintained',
    resources_acquisitions:  'Studio amplifier',
  },
  _raw: {
    sphere_actions:   [{ action_type: 'misc', desired_outcome: 'Police network' }],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'Studio amplifier' },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies maintained' },
    { pool_status: 'validated', notes_thread: [{ author_name: 'ST', text: 'Amplifier acquired without complications.' }] },
  ],
  acquisitions_resolved: [],
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

test.describe('fix.456: Resources acquisition completion check', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: validated acquisition (merit_actions_resolved pool_status) → section complete, pill green', async ({ page }) => {
    await setup(page, [SUB_VALIDATED_ACQ]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // meritSummaryComplete should return true → badge present.
    expect(html).toContain('All outcomes recorded');
    // Pill must be green — story_moment complete + no_feed + validated acq = all done.
    const pillGreen = await page.evaluate(() => !!document.querySelector('.dt-story-pill.green'));
    expect(pillGreen).toBe(true);
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: pending acquisition → merit_summary incomplete, pill not green', async ({ page }) => {
    await setup(page, [SUB_PENDING_ACQ]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    expect(html).not.toContain('All outcomes recorded');
    const pillGreen = await page.evaluate(() => !!document.querySelector('.dt-story-pill.green'));
    expect(pillGreen).toBe(false);
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: validated acquisition → row shows notes_thread text as outcome', async ({ page }) => {
    await setup(page, [SUB_VALIDATED_ACQ]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // The ST note from notes_thread must appear in the row.
    expect(html).toContain('Nicole finds stunning audiophile equipment.');
    // Must NOT show the "not yet recorded" placeholder.
    expect(html).not.toContain('Outcome not yet recorded');
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: mixed (validated acquisition + resolved sphere merit) → pill green', async ({ page }) => {
    await setup(page, [SUB_MIXED]);
    const html = await getMeritSectionHtml(page, 'merit_summary');
    expect(html).not.toBeNull();
    // Both actions complete.
    expect(html).toContain('All outcomes recorded');
    // Sphere outcome present.
    expect(html).toContain('Police allies maintained');
    // Acquisition ST note present.
    expect(html).toContain('Amplifier acquired without complications.');
    const pillGreen = await page.evaluate(() => !!document.querySelector('.dt-story-pill.green'));
    expect(pillGreen).toBe(true);
  });

});
