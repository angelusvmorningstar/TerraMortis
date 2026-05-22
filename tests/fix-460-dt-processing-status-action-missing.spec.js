/**
 * Regression tests for fix #460 — buildMeritActions Status/MCI flat-index ordering.
 *
 * Root cause: buildMeritActions (downtime-story.js) appended Status/MCI actions AFTER
 * acquisitions, but buildProcessingQueue (downtime-views.js) wrote merit_actions_resolved
 * entries with Status merged into the spheres array (before contacts). This index
 * mismatch caused two visible bugs:
 *   A. Status section read from wrong resolved-outcome slot → "— Outcome not yet recorded —"
 *   B. Contact group displayed the Status outcome instead of the contact outcome
 *
 * Fix: Move Status/MCI loop immediately after spheres (before contacts). New order in
 * buildMeritActions: spheres → Status/MCI → contacts → retainers → acquisitions.
 *
 * NOTE: Individual section nodes (status_actions, contact_requests, allies_actions) are
 * NOT standalone DOM elements — all merit actions are consolidated into a single
 * merit_summary section (Story 1.13) under .dt-merit-summary-group elements keyed by
 * category label ("Allies", "Status", "Contacts"). Tests check group-level HTML.
 *
 * AC-1: sphere + Status → Status group shows resolved outcome (no "not yet recorded")
 * AC-2: sphere + Status + Contact → each group shows its own resolved outcome
 * AC-3: 3 Status actions → each reads its own distinct resolved outcome by flat index
 * AC-4: sphere-only submission → Allies group unaffected, no Status group (regression guard)
 * QA-1: Reed DT3 pattern — 1 sphere + 3 Status + 1 Contact → all outcomes correct, no cross-wiring
 * QA-2: Status group never shows contact outcome text (cross-wiring sentinel)
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000460', username: 'test_st_460', global_name: 'Test ST 460',
  avatar: null, role: 'st', player_id: 'p-460', character_ids: [], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-460', cycle_number: 3, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

// Character with Allies, Status (x3), and Contacts merits — covers all fixture shapes.
const CHAR = {
  _id: 'char-460',
  name: 'Status Order Test', moniker: null, honorific: null,
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
    { name: 'Allies',   category: 'general', dots: 2, qualifier: 'Police' },
    { name: 'Status',   category: 'general', dots: 3, qualifier: 'Finance' },
    { name: 'Status',   category: 'general', dots: 3, qualifier: 'High Society' },
    { name: 'Status',   category: 'general', dots: 3, qualifier: 'Underworld' },
    { name: 'Contacts', category: 'general', dots: 1, qualifier: 'Media' },
  ],
  powers: [], ordeals: [],
};

// ── Submission builder ────────────────────────────────────────────────────────
//
// All fixtures use _raw.sphere_actions: [] to force the flat-response key path,
// matching DT3+ form-shape submissions (the path where status_N_* keys are present).
// merit_actions is NOT pre-populated — the client calls buildMeritActions(sub) at
// load time (downtime-story.js:172), so tests exercise the real code path.

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-460',
    character_id: 'char-460',
    character_name: 'Status Order Test',
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

// AC-1: 1 sphere (Allies Police) + 1 Status (Finance grow).
// Fixed flat order: sphere[0] → Status[1].
// merit_actions_resolved[1] = Finance outcome → Status group must show it.
const SUB_SPHERE_STATUS = {
  ...baseSub('sub-460-sphere-status'),
  responses: {
    sphere_1_merit:   'Allies ●● (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police allies patrol task',
    status_1_merit:   'Status ●●● (Finance)',
    status_1_action:  'grow',
    status_1_outcome: 'Improve Finance standing',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Allies Police mobilised AC1' },    // [0] sphere
    { pool_status: 'confirmed', outcome_summary: 'Finance status growth approved AC1' }, // [1] Status
  ],
};

// AC-2 + QA-2: 1 sphere + 1 Status (Finance) + 1 Contact (Media).
// Fixed flat order: sphere[0] → Status[1] → Contact[2].
// Old broken order: sphere[0] → Contact[1] → Status[3]
// → Contact group read [1] = Finance outcome (cross-wired); Status group read [3] = missing.
const SUB_SPHERE_STATUS_CONTACT = {
  ...baseSub('sub-460-sphere-status-contact'),
  responses: {
    sphere_1_merit:    'Allies ●● (Police)',
    sphere_1_action:   'misc',
    sphere_1_outcome:  'Police patrol coverage',
    status_1_merit:    'Status ●●● (Finance)',
    status_1_action:   'grow',
    status_1_outcome:  'Grow Finance standing',
    contact_1_merit:   'Contacts ● (Media)',
    contact_1_request: 'Who is influential in the harbour finance scene?',
    contact_1_info:    'Media contacts queried on finance',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Sphere allies patrol confirmed AC2' },       // [0]
    { pool_status: 'confirmed', outcome_summary: 'Finance status grow approved AC2' },         // [1] Status
    { pool_status: 'confirmed', outcome_summary: 'Media contacts delivered harbour intel AC2' }, // [2] Contact
  ],
};

// AC-3: 3 Status merits only, no sphere, no contact.
// Fixed flat order: Finance[0] → High Society[1] → Underworld[2].
// All three distinct outcomes must appear in the Status group.
const SUB_THREE_STATUS = {
  ...baseSub('sub-460-three-status'),
  responses: {
    status_1_merit:   'Status ●●● (Finance)',
    status_1_action:  'grow',
    status_1_outcome: 'Grow Finance standing',
    status_2_merit:   'Status ●●● (High Society)',
    status_2_action:  'grow',
    status_2_outcome: 'Grow High Society standing',
    status_3_merit:   'Status ●●● (Underworld)',
    status_3_action:  'investigate',
    status_3_outcome: 'Investigate Underworld contacts',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Finance standing increased AC3' },        // [0]
    { pool_status: 'confirmed', outcome_summary: 'High Society standing improved AC3' },    // [1]
    { pool_status: 'confirmed', outcome_summary: 'Underworld investigation complete AC3' }, // [2]
  ],
};

// AC-4: Sphere only, no Status, no Contact.
// Regression guard — the Status/MCI block reorder must not disturb sphere-only submissions.
const SUB_SPHERE_ONLY = {
  ...baseSub('sub-460-sphere-only'),
  responses: {
    sphere_1_merit:   'Allies ●● (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police allies patrol harbour',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Allies Police task completed AC4' },
  ],
};

// QA-1: Reed DT3 pattern — 1 sphere (Allies Police) + 3 Status (Finance, HS, Underworld)
// + 1 Contact (Media). Exact submission shape that triggered #460.
// Fixed flat order: sphere[0] → Finance[1] → HS[2] → Underworld[3] → Contact[4].
// Old broken order: sphere[0] → Contact[1] → (Underworld at [5]) → "not yet recorded".
const SUB_REED_SCENARIO = {
  ...baseSub('sub-460-reed-scenario'),
  responses: {
    sphere_1_merit:    'Allies ●● (Police)',
    sphere_1_action:   'misc',
    sphere_1_outcome:  'Police allies task',
    status_1_merit:    'Status ●●● (Finance)',
    status_1_action:   'grow',
    status_1_outcome:  'Grow Finance',
    status_2_merit:    'Status ●●● (High Society)',
    status_2_action:   'grow',
    status_2_outcome:  'Grow High Society',
    status_3_merit:    'Status ●●● (Underworld)',
    status_3_action:   'investigate',
    status_3_outcome:  'Investigate Underworld contacts',
    contact_1_merit:   'Contacts ● (Media)',
    contact_1_request: 'Who is active in the harbour finance scene?',
    contact_1_info:    'Media contacts queried',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Reed allies police confirmed QA1' },           // [0]
    { pool_status: 'confirmed', outcome_summary: 'Reed finance status grew QA1' },               // [1]
    { pool_status: 'confirmed', outcome_summary: 'Reed high society standing improved QA1' },    // [2]
    { pool_status: 'confirmed', outcome_summary: 'Reed underworld investigation delivered QA1' }, // [3]
    { pool_status: 'confirmed', outcome_summary: 'Reed media contacts reported findings QA1' },  // [4]
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the innerHTML of the named category group (label = 'Allies', 'Status', 'Contacts' etc.)
// within the consolidated merit_summary section. Returns null if the group is absent.
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

// Returns the full innerHTML of the merit_summary section.
async function getMeritSummaryHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    return el ? el.innerHTML : null;
  });
}

// Returns the count of .dt-merit-summary-row elements in the named group.
async function getMeritGroupRowCount(page, label) {
  return page.evaluate((lbl) => {
    const groups = document.querySelectorAll('.dt-merit-summary-group');
    for (const g of groups) {
      if (g.querySelector('.dt-merit-summary-group-label')?.textContent?.trim() === lbl) {
        return g.querySelectorAll('.dt-merit-summary-row').length;
      }
    }
    return 0;
  }, label);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix.460: buildMeritActions Status flat-index ordering', () => {

  // AC-1 ──────────────────────────────────────────────────────────────────────

  test('AC-1: sphere + Status → Status group shows resolved outcome (no "not yet recorded")', async ({ page }) => {
    await setup(page, [SUB_SPHERE_STATUS]);
    const statusHtml = await getMeritGroupHtml(page, 'Status');
    expect(statusHtml).not.toBeNull();
    // Resolved Finance outcome must appear.
    expect(statusHtml).toContain('Finance status growth approved AC1');
    // Pre-fix Bug A symptom must be absent.
    expect(statusHtml).not.toContain('not yet recorded');
  });

  // AC-2 ──────────────────────────────────────────────────────────────────────

  test('AC-2: sphere + Status + Contact → each group shows its own resolved outcome', async ({ page }) => {
    await setup(page, [SUB_SPHERE_STATUS_CONTACT]);

    const statusHtml  = await getMeritGroupHtml(page, 'Status');
    const contactHtml = await getMeritGroupHtml(page, 'Contacts');

    expect(statusHtml).not.toBeNull();
    expect(contactHtml).not.toBeNull();

    // Status group must show the Finance outcome.
    expect(statusHtml).toContain('Finance status grow approved AC2');
    // Pre-fix Bug A: Status group must not show "not yet recorded".
    expect(statusHtml).not.toContain('not yet recorded');

    // Contacts group must show the contact outcome.
    expect(contactHtml).toContain('Media contacts delivered harbour intel AC2');
    // Pre-fix Bug B: Contacts group must not show the Finance outcome (cross-wiring check).
    expect(contactHtml).not.toContain('Finance status grow approved AC2');
  });

  // AC-3 ──────────────────────────────────────────────────────────────────────

  test('AC-3: 3 Status actions → Status group has 3 rows, each with its own distinct outcome', async ({ page }) => {
    await setup(page, [SUB_THREE_STATUS]);
    const statusHtml = await getMeritGroupHtml(page, 'Status');
    expect(statusHtml).not.toBeNull();

    const rowCount = await getMeritGroupRowCount(page, 'Status');
    expect(rowCount).toBe(3);

    // All three distinct outcomes must appear.
    expect(statusHtml).toContain('Finance standing increased AC3');
    expect(statusHtml).toContain('High Society standing improved AC3');
    expect(statusHtml).toContain('Underworld investigation complete AC3');
    expect(statusHtml).not.toContain('not yet recorded');
  });

  // AC-4 ──────────────────────────────────────────────────────────────────────

  test('AC-4: sphere-only submission → Allies group correct; Status group absent (regression guard)', async ({ page }) => {
    await setup(page, [SUB_SPHERE_ONLY]);

    const alliesHtml = await getMeritGroupHtml(page, 'Allies');
    const statusHtml = await getMeritGroupHtml(page, 'Status');

    // Allies group must render with correct outcome.
    expect(alliesHtml).not.toBeNull();
    expect(alliesHtml).toContain('Allies Police task completed AC4');
    // No Status actions → Status group must be absent.
    expect(statusHtml).toBeNull();
  });

  // QA-1 ──────────────────────────────────────────────────────────────────────

  test('QA-1: Reed DT3 pattern — 1 sphere + 3 Status + 1 Contact → all outcomes correct', async ({ page }) => {
    await setup(page, [SUB_REED_SCENARIO]);

    const statusHtml  = await getMeritGroupHtml(page, 'Status');
    const contactHtml = await getMeritGroupHtml(page, 'Contacts');

    expect(statusHtml).not.toBeNull();
    expect(contactHtml).not.toBeNull();

    // Status group must show all 3 Status outcomes.
    expect(statusHtml).toContain('Reed finance status grew QA1');
    expect(statusHtml).toContain('Reed high society standing improved QA1');
    // Underworld — this is the specific row that showed "not yet recorded" in #460.
    expect(statusHtml).toContain('Reed underworld investigation delivered QA1');
    expect(statusHtml).not.toContain('not yet recorded');

    // Contacts group must show the contact outcome only.
    expect(contactHtml).toContain('Reed media contacts reported findings QA1');
    // Contacts group must not show any Status outcome (cross-wiring check).
    expect(contactHtml).not.toContain('Reed finance status grew QA1');
    expect(contactHtml).not.toContain('Reed high society standing improved QA1');
    expect(contactHtml).not.toContain('Reed underworld investigation delivered QA1');
  });

  // QA-2 ──────────────────────────────────────────────────────────────────────

  test('QA-2: Status group never shows contact outcome text (cross-wiring sentinel)', async ({ page }) => {
    await setup(page, [SUB_SPHERE_STATUS_CONTACT]);
    const statusHtml = await getMeritGroupHtml(page, 'Status');
    expect(statusHtml).not.toBeNull();
    // Contact outcome must not appear in the Status group (pre-fix Bug B was exactly this).
    expect(statusHtml).not.toContain('Media contacts delivered harbour intel AC2');
    // Status outcome must be present and correctly indexed.
    expect(statusHtml).toContain('Finance status grow approved AC2');
  });

});
