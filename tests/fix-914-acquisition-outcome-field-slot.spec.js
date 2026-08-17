/**
 * Regression tests for fix #914 — Resources/Skill Acquisition outcomes not surfacing.
 *
 * Follow-up to #904 (which fixed the outcome_summary-vs-outcome read mismatch for
 * merit actions). This story extends the same read-side fallback to the acquisition
 * paths and corrects the acquisition slot index.
 *
 * Write-side contract (downtime-views.js):
 *   - Resources Acquisitions queue entry -> actionIdx 0 -> acquisitions_resolved[0]   (line 3578)
 *   - Skill Acquisitions     queue entry -> actionIdx 1 -> acquisitions_resolved[1]   (line 3599)
 *   - Confirm-outcome button writes `.outcome`; compact input writes `.outcome_summary`.
 *
 * Root causes fixed:
 *   1. Acquisition reads only looked at `.outcome_summary`, never `.outcome` — so the
 *      textarea-confirmed outcomes that live data actually has were invisible.
 *   2. Skill Acquisition rows read acquisitions_resolved[0] but skill outcomes are
 *      written to [1] — wrong slot.
 *   3. Resources completion/blocking gate keyed on pool_status only — a confirmed
 *      no-roll acquisition (pool_status still 'pending') stayed flagged pending.
 *
 * AC-1: Resources acq with `.outcome` only (no outcome_summary), pool_status pending
 *       -> Resources group shows the outcome text, not the placeholder (field fallback)
 * AC-2: same submission -> "All outcomes recorded" badge despite pool_status 'pending'
 *       (gate counts a confirmed outcome as resolved)
 * AC-3: Skill acq with `.outcome` at acquisitions_resolved[1] -> outcome shown; the
 *       reader does NOT cross-read slot [0]
 * AC-4: Brandy DT4 shape — resources `.outcome` at [0] + skill `.outcome_summary` at [1]
 *       -> both outcomes appear, each from its own slot (no cross-wiring)
 * AC-5: outcome_summary takes precedence over outcome (preservation invariant from #904)
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000914', username: 'test_st_914', global_name: 'Test ST 914',
  avatar: null, role: 'st', player_id: 'p-914', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-914', cycle_number: 4, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CHAR = {
  _id: 'char-914',
  name: 'Acq Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Intimidation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
  merits: [
    { name: 'Resources', category: 'general', dots: 3 },
  ],
  powers: [], ordeals: [],
};

function baseSub(id) {
  return {
    _id: id,
    chapter_id: 'cycle-914',
    character_id: 'char-914',
    character_name: 'Acq Test',
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

// AC-1/AC-2: Resources acq, outcome in `.outcome` only, pool_status still 'pending'.
// Mirrors the live DT4 Xavier/Anichka shape (ST confirmed via the Outcome textarea).
const SUB_RES_OUTCOME_FIELD = {
  ...baseSub('sub-914-res-field'),
  responses: { resources_acquisitions: 'Secure apartment for Juliette' },
  _raw: {
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'Secure apartment for Juliette' },
  },
  acquisitions_resolved: [
    { pool_status: 'pending', outcome: 'Both are delivered to the drop box.', outcome_confirmed: true },
  ],
  merit_actions_resolved: [],
};

// AC-3: Skill acq, outcome in `.outcome` at slot [1] ([0] null-padded as the write side leaves it).
const SUB_SKILL_OUTCOME_FIELD = {
  ...baseSub('sub-914-skill-field'),
  responses: { skill_acquisitions: 'Air of Menace' },
  _raw: {
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    acquisitions: { skill_acquisitions: 'Air of Menace' },
  },
  acquisitions_resolved: [
    null,
    { pool_status: 'pending', outcome: 'The intimidating stance is yours now.', outcome_confirmed: true },
  ],
  merit_actions_resolved: [],
};

// AC-4: Brandy DT4 shape — resources `.outcome` at [0], skill `.outcome_summary` at [1].
const SUB_RES_AND_SKILL = {
  ...baseSub('sub-914-res-and-skill'),
  responses: {
    resources_acquisitions: 'Money for the family',
    skill_acquisitions: 'A worshipped fetish',
  },
  _raw: {
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    acquisitions: {
      resource_acquisitions: 'Money for the family',
      skill_acquisitions: 'A worshipped fetish',
    },
  },
  acquisitions_resolved: [
    { pool_status: 'pending', outcome: 'Money goes out, things come in.', outcome_confirmed: true },
    { pool_status: 'validated', outcome_summary: 'You find a fetish well-worn and worshipped.', outcome: 'You find a fetish well-worn and worshipped.' },
  ],
  merit_actions_resolved: [],
};

// AC-5: both fields present on the resources slot — outcome_summary must win.
const SUB_SUMMARY_PRECEDENCE = {
  ...baseSub('sub-914-precedence'),
  responses: { resources_acquisitions: 'A rare clock' },
  _raw: {
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'A rare clock' },
  },
  acquisitions_resolved: [
    { pool_status: 'validated', outcome_summary: 'SUMMARY WINS', outcome: 'OUTCOME LOSES' },
  ],
  merit_actions_resolved: [],
};

// AC-6: multi-row Resources (Xavier DT4 shape) — buildMeritActions splits acq_resource_rows
// into 'Resources (Row 1)'/'Resources (Row 2)'. Both rows share the single slot [0] outcome.
const SUB_MULTI_ROW_RES = {
  ...baseSub('sub-914-multirow'),
  responses: {
    acq_resource_rows: JSON.stringify([
      { description: 'Secure apartment', merits: ['Resources'] },
      { description: 'Audio equipment',  merits: ['Resources'] },
    ]),
  },
  _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] }, acquisitions: {} },
  acquisitions_resolved: [
    { pool_status: 'pending', outcome: 'Both are delivered to the drop box.', outcome_confirmed: true },
  ],
  merit_actions_resolved: [],
};

// AC-7: cross-wiring sentinel — resources slot [0] has an outcome, skill slot [1] is EMPTY.
// The skill row must show the placeholder, NOT the resources outcome (the #460 hazard:
// skill must never fall back to slot [0]).
const SUB_SKILL_EMPTY_SLOT = {
  ...baseSub('sub-914-skill-empty'),
  responses: {
    resources_acquisitions: 'A car',
    skill_acquisitions: 'A new talent',
  },
  _raw: {
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'A car', skill_acquisitions: 'A new talent' },
  },
  acquisitions_resolved: [
    { pool_status: 'pending', outcome: 'RESOURCES_SLOT_ZERO_TEXT', outcome_confirmed: true },
    // slot [1] intentionally absent — skill has no recorded outcome
  ],
  merit_actions_resolved: [],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('**/api/auth/me', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ST_USER) }));
  await page.route(/\/api\/characters$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CHAR]) }));
  await page.route('**/api/characters/names', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]) }));
  await page.route('**/api/chapters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
  await page.route('**/api/downtime_submissions*', route => {
    if (['PATCH', 'PUT', 'POST'].includes(route.request().method()))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submissions) });
  });
  await page.route('**/api/territories*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/game_sessions*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/session_logs*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/st_mods*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));

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
      if (g.querySelector('.dt-merit-summary-group-label')?.textContent?.trim() === lbl) return g.innerHTML;
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

test.describe('fix.914: acquisition outcome field + slot', () => {

  test('AC-1: resources acq with .outcome only -> outcome shown, not placeholder', async ({ page }) => {
    await setup(page, [SUB_RES_OUTCOME_FIELD]);
    const html = await getMeritGroupHtml(page, 'Resources');
    expect(html).not.toBeNull();
    expect(html).toContain('Both are delivered to the drop box.');
    expect(html).not.toContain('Outcome not yet recorded');
  });

  test('AC-2: confirmed outcome with pool_status pending -> section complete', async ({ page }) => {
    await setup(page, [SUB_RES_OUTCOME_FIELD]);
    const html = await getMeritSummaryHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('All outcomes recorded');
    expect(html).not.toContain('still to record');
  });

  test('AC-3: skill acq reads slot [1], not [0]', async ({ page }) => {
    await setup(page, [SUB_SKILL_OUTCOME_FIELD]);
    const html = await getMeritGroupHtml(page, 'Resources');
    expect(html).not.toBeNull();
    expect(html).toContain('The intimidating stance is yours now.');
    expect(html).not.toContain('Outcome not yet recorded');
  });

  test('AC-4: resources [0] + skill [1] both surface from their own slots', async ({ page }) => {
    await setup(page, [SUB_RES_AND_SKILL]);
    const html = await getMeritGroupHtml(page, 'Resources');
    expect(html).not.toBeNull();
    expect(html).toContain('Money goes out, things come in.');            // resources slot [0]
    expect(html).toContain('You find a fetish well-worn and worshipped.'); // skill slot [1]
    expect(html).not.toContain('Outcome not yet recorded');
  });

  test('AC-5: outcome_summary takes precedence over outcome', async ({ page }) => {
    await setup(page, [SUB_SUMMARY_PRECEDENCE]);
    const html = await getMeritGroupHtml(page, 'Resources');
    expect(html).not.toBeNull();
    expect(html).toContain('SUMMARY WINS');
    expect(html).not.toContain('OUTCOME LOSES');
  });

  test('AC-6: multi-row Resources both share slot [0] outcome', async ({ page }) => {
    await setup(page, [SUB_MULTI_ROW_RES]);
    const html = await getMeritGroupHtml(page, 'Resources');
    expect(html).not.toBeNull();
    // Both rows render and both show the single [0] outcome.
    expect(html).toContain('Resources (Row 1)');
    expect(html).toContain('Resources (Row 2)');
    const occurrences = (html.match(/Both are delivered to the drop box\./g) || []).length;
    expect(occurrences).toBe(2);
    expect(html).not.toContain('Outcome not yet recorded');
  });

  test('AC-7: empty skill slot does NOT cross-read the resources [0] outcome', async ({ page }) => {
    await setup(page, [SUB_SKILL_EMPTY_SLOT]);
    const html = await getMeritGroupHtml(page, 'Resources');
    expect(html).not.toBeNull();
    // The resources outcome appears exactly once (its own row only) — never duplicated
    // onto the skill row.
    const occurrences = (html.match(/RESOURCES_SLOT_ZERO_TEXT/g) || []).length;
    expect(occurrences).toBe(1);
    // The skill row shows the placeholder.
    expect(html).toContain('Outcome not yet recorded');
  });

});
