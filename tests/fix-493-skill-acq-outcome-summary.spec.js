/**
 * Regression tests for fix #493 — Skill acquisition outcome surfaces in Allies & Asset Summary.
 *
 * Root causes fixed:
 *   A. dt-proto-boot.js — PATCH shim didn't persist mutations to the in-memory submissions array,
 *      so the story panel always read stale static data. (prototype-only; not testable via admin.html)
 *   B. downtime-story.js:2291 — meritSummaryComplete rejected pool_status 'resolved' for skill
 *      acquisitions (only accepted 'validated' / 'skipped'), so the Outcome card's save never
 *      registered as complete.
 *   C. downtime-story.js:2380 — blocking items check same issue: 'resolved' was not in the
 *      accepted set, so a resolved skill acquisition still appeared as "still to record".
 *
 * Fix B+C: Added 'resolved' to the accepted pool_status set at both sites.
 *
 * Test coverage (admin.html, story panel — covers Bugs B and C):
 *   AC-1: pool_status 'resolved' + outcome_summary → outcome text shown AND "All outcomes recorded"
 *   AC-2: pool_status 'resolved' + no outcome_summary → badge shows (decision recorded), row shows placeholder
 *   AC-3: pool_status 'validated' still accepted (regression guard)
 *   AC-4: merit actions (Allies) unaffected (regression guard)
 *
 * NOTE: The shim persistence fix (Bug A) is verified manually in dt-proto.html.
 * It cannot be exercised via this test suite because admin.html routes to the real API (shimmed
 * by Playwright route handlers which are stateless), not the dt-proto fetch shim.
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000493', username: 'test_st_493', global_name: 'Test ST 493',
  avatar: null, role: 'st', player_id: 'p-493', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-493', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-493',
  name: 'Outcome Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player 493',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength:     { dots: 2, bonus: 0 }, Dexterity:    { dots: 2, bonus: 0 }, Stamina:       { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits:         { dots: 2, bonus: 0 }, Resolve:       { dots: 2, bonus: 0 },
    Presence:     { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure:     { dots: 2, bonus: 0 },
  },
  skills: { Intimidation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
  merits: [
    { name: 'Allies',    category: 'influence', rating: 2, qualifier: 'Police' },
  ],
  powers: [], ordeals: [],
};

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-493',
    character_id: 'char-493',
    character_name: 'Outcome Test',
    player_name: 'Test Player 493',
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

// AC-1: pool_status 'resolved' (Outcome card path) + outcome_summary present.
// meritSummaryComplete and blockingItems must accept 'resolved' → "All outcomes recorded".
const SUB_RESOLVED_WITH_OUTCOME = {
  ...baseSub('sub-493-resolved-outcome'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [
    { pool_status: 'resolved', merit_outcome: 'approved', outcome_summary: 'The deed is done — menace acquired.' },
  ],
  merit_actions_resolved: [],
};

// AC-2: pool_status 'resolved' but NO outcome_summary.
// Decision recorded → badge still shows. Row shows placeholder because outcome_summary is empty.
const SUB_RESOLVED_NO_OUTCOME = {
  ...baseSub('sub-493-resolved-no-outcome'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [
    { pool_status: 'resolved', merit_outcome: 'approved' },
  ],
  merit_actions_resolved: [],
};

// AC-5 edge case: pool_status 'skipped' — ST skipped the acquisition row.
// Badge should show (skipped = resolved state), row may show placeholder (no outcome_summary).
const SUB_SKIPPED = {
  ...baseSub('sub-493-skipped'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [
    { pool_status: 'skipped' },
  ],
  merit_actions_resolved: [],
};

// AC-3 regression: pool_status 'validated' (old path) still accepted.
const SUB_VALIDATED_WITH_OUTCOME = {
  ...baseSub('sub-493-validated-outcome'),
  responses: { skill_acquisitions: 'Air of Menace' },
  acquisitions_resolved: [
    { pool_status: 'validated', outcome_summary: 'Validated path outcome text.' },
  ],
  merit_actions_resolved: [],
};

// AC-4 regression: Allies outcome reads from merit_actions_resolved (not acquisitions_resolved).
const SUB_ALLIES_RESOLVED = {
  ...baseSub('sub-493-allies'),
  responses: {
    sphere_1_merit:       'Allies ●● (Police)',
    sphere_1_action:      'patrol_scout',
    sphere_1_outcome:     'Scout the harbour',
    sphere_1_description: 'Watch the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies found nothing unusual.' },
  ],
  acquisitions_resolved: [],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupStoryPanel(page, submissions) {
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

async function getMeritGroupHtml(page, label) {
  return page.evaluate((lbl) => {
    const groups = document.querySelectorAll('.dt-merit-summary-group');
    for (const g of groups) {
      if (g.querySelector('.dt-merit-summary-group-label')?.textContent?.trim() === lbl) {
        return g.innerHTML;
      }
    }
    return null;
  }, label);
}

async function getMeritSummaryHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    return el ? el.innerHTML : null;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.493: skill acquisition outcome surfaces in Allies & Asset Summary', () => {

  test('AC-1: pool_status resolved + outcome_summary → outcome shown and "All outcomes recorded" badge', async ({ page }) => {
    await setupStoryPanel(page, [SUB_RESOLVED_WITH_OUTCOME]);

    const resourcesHtml = await getMeritGroupHtml(page, 'Resources');
    expect(resourcesHtml).not.toBeNull();
    expect(resourcesHtml).toContain('The deed is done — menace acquired.');
    expect(resourcesHtml).not.toContain('Outcome not yet recorded');

    const summaryHtml = await getMeritSummaryHtml(page);
    expect(summaryHtml).toContain('All outcomes recorded');
  });

  test('AC-2: pool_status resolved + no outcome_summary → badge shows, row shows placeholder', async ({ page }) => {
    await setupStoryPanel(page, [SUB_RESOLVED_NO_OUTCOME]);

    // Decision (Approved) is recorded → badge shows
    const summaryHtml = await getMeritSummaryHtml(page);
    expect(summaryHtml).toContain('All outcomes recorded');

    // But no narrative was typed → placeholder in the row
    const resourcesHtml = await getMeritGroupHtml(page, 'Resources');
    expect(resourcesHtml).not.toBeNull();
    expect(resourcesHtml).toContain('Outcome not yet recorded');
  });

  test('AC-3: pool_status validated still accepted — regression guard', async ({ page }) => {
    await setupStoryPanel(page, [SUB_VALIDATED_WITH_OUTCOME]);

    const summaryHtml = await getMeritSummaryHtml(page);
    expect(summaryHtml).toContain('All outcomes recorded');

    const resourcesHtml = await getMeritGroupHtml(page, 'Resources');
    expect(resourcesHtml).toContain('Validated path outcome text.');
  });

  test('AC-5: pool_status skipped → badge shows (decision recorded, no narrative required)', async ({ page }) => {
    await setupStoryPanel(page, [SUB_SKIPPED]);

    const summaryHtml = await getMeritSummaryHtml(page);
    expect(summaryHtml).toContain('All outcomes recorded');
  });

  test('AC-4: Allies outcome reads from merit_actions_resolved — unaffected by skill acq changes', async ({ page }) => {
    await setupStoryPanel(page, [SUB_ALLIES_RESOLVED]);

    const alliesHtml = await getMeritGroupHtml(page, 'Allies');
    expect(alliesHtml).not.toBeNull();
    expect(alliesHtml).toContain('Police allies found nothing unusual.');
    expect(alliesHtml).not.toContain('Outcome not yet recorded');
  });

});
