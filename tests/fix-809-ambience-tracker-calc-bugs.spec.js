/**
 * Fix #809 — Ambience tracker calculation bugs
 *
 * Three bugs in the City tab Ambience panel, all in downtime-views.js:
 *
 * Bug 1 — Overfeeding column showed 0 feeders for every territory.
 *   Root cause: _computeMatrixFeederCounts called resolveTerrId(csvKey) where csvKey is a
 *   display-name string like 'The Academy'. resolveTerrId is OID-only, always returned null,
 *   so byTerrId stayed {}. Fix: use TERRITORY_SLUG_MAP[csvKey] instead.
 *
 * Bug 3 — Projects column showed ±0 for every ambience_change project.
 *   Root cause: _ambienceDirection checked for 'improve'/'degrade' but the DT form stores
 *   'up'/'down'. Every project was silently skipped. Fix: added 'up' and 'down' aliases.
 *
 * Bug 2 (Harbour influence) — data discrepancy only; code not changed; no test added.
 *
 * AC coverage:
 *   AC1 — overfeeding cell shows actual feeder count, not 0
 *   AC2 — ambience_change project with direction "up" produces non-zero Projects delta
 *   AC3 — ambience_change project with direction "down" also works
 *   AC4 (regression) — all 5 territory rows still render; no crash
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const TEST_CYCLE = {
  _id: 'cycle-809', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// Character who fed in The Academy
const CHAR_FEEDER = {
  _id: 'char-809-feeder', name: 'Feeder Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Player Feed',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 1, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// Character running an ambience project
const CHAR_PROJ = {
  _id: 'char-809-proj', name: 'Project Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Crone', player: 'Player Proj',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 1, Invictus: 0, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

// ── Submission: one character fed in The Academy (new form slug-key format)
// The Academy has ambience 'Curated' → feeding tolerance cap = 7.
// With 1 feeder: overfeeding cell should show "1/7", not "0/7".
const SUBMISSION_FEED_ACADEMY = {
  _id: 'sub-809-feed',
  cycle_id: 'cycle-809',
  character_name: 'Feeder Test',
  character_id: 'char-809-feeder',
  player_name: 'Player Feed',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    _feed_method: 'seduction',
    // New DT form format: JSON-encoded slug → status object
    feeding_territories: JSON.stringify({ academy: 'feeding_here' }),
  },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5', pool_validated: '',
    pool_status: 'pending', notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Submission: ambience_change project, direction "up" (new DT form format)
// Target: academy slug. Resolved with 3 successes → contrib = 2 (1–4 successes = ±2).
// Before fix: _ambienceDirection returned null for "up" → project silently skipped → ±0.
// After fix: "up" maps to 'increase' → proj_pos.academy = 2 → Projects shows "+2".
const SUBMISSION_PROJ_UP = {
  _id: 'sub-809-proj-up',
  cycle_id: 'cycle-809',
  character_name: 'Project Test',
  character_id: 'char-809-proj',
  player_name: 'Player Proj',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'ambience_change', desired_outcome: 'Improve The Academy', detail: '' }],
    feeding: { method: 'predatory_aura', pool: { expression: 'Presence 2 = 2' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    _feed_method: 'predatory_aura',
    project_1_action_type: 'ambience_change',
    project_1_ambience_direction: 'up',    // DT form stores "up", not "improve"
    project_1_ambience_target: 'academy',  // slug format
  },
  projects_resolved: [{ roll: { successes: 3 } }],  // resolved; 3 successes → contrib 2
  feeding_review: {
    pool_player: 'Presence 2 = 2', pool_validated: '',
    pool_status: 'pending', notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// ── Submission: same but direction "down" → proj_neg.academy = 2 → Projects shows "-2"
const SUBMISSION_PROJ_DOWN = {
  ...SUBMISSION_PROJ_UP,
  _id: 'sub-809-proj-down',
  responses: {
    ...SUBMISSION_PROJ_UP.responses,
    project_1_ambience_direction: 'down',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setup(page, submissions, chars = [CHAR_FEEDER, CHAR_PROJ]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
    if (url.includes('/api/characters/names'))     return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(chars);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
}

/** Navigate to the City tab and expand the Ambience section.
 *
 * renderCityOverview() runs once on first city-tab visit and uses the module-level
 * `submissions` array. If submissions haven't loaded yet it renders a placeholder with
 * no toggle element. Fix: visit Projects tab first (wait for an action row there to
 * confirm submissions are loaded), then switch to City.
 */
async function openAmbienceTable(page) {
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  // Projects tab ensures submissions are loaded before city tab triggers renderCityOverview
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForSelector('.proc-action-row', { state: 'visible', timeout: 10000 });
  // Now switch to City — renderCityOverview() runs with populated submissions
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForSelector('[data-toggle="city-ambience"]', { state: 'visible', timeout: 8000 });
  // Expand the Ambience section (collapsed by default). The header carries the click
  // listener but also contains a centred "Recalculate Territories" button, so click the
  // toggle span specifically — clicking the header centre would hit the button instead.
  await page.click('[data-toggle="city-ambience"] .proc-amb-toggle');
  await page.waitForSelector('.proc-amb-table', { state: 'visible', timeout: 5000 });
}

/** Locator for the academy row in the ambience table. */
function academyRow(page) {
  return page.locator('.proc-amb-table tbody tr').filter({
    has: page.locator('td.proc-amb-terr', { hasText: 'Academy' }),
  });
}

// ── AC1: Overfeeding column shows actual feeder count ─────────────────────────
//
// Before fix: _computeMatrixFeederCounts called resolveTerrId(csvKey) where csvKey
// is a display-name string like 'The Academy'. resolveTerrId is OID-only → always null
// → byTerrId stayed {} → all territories showed 0 feeders.
//
// After fix: TERRITORY_SLUG_MAP['The Academy'] = 'academy' resolves correctly.

test.describe('#809 — Bug 1: Overfeeding feeder count', () => {

  test('AC1: Academy shows 1/7 when one character fed there (not 0/7)', async ({ page }) => {
    await setup(page, [SUBMISSION_FEED_ACADEMY]);
    await openAmbienceTable(page);

    // td:nth-child(4) = Overfeeding column (1=Territory, 2=Starting, 3=Entropy, 4=Overfeeding)
    const overfeedCell = academyRow(page).locator('td').nth(3);
    await expect(overfeedCell).toBeVisible({ timeout: 5000 });
    await expect(overfeedCell).toContainText('1/7');
  });

  test('AC1: Academy overfeeding does not show 0/7 when feeder count is 1', async ({ page }) => {
    await setup(page, [SUBMISSION_FEED_ACADEMY]);
    await openAmbienceTable(page);

    const overfeedCell = academyRow(page).locator('td').nth(3);
    await expect(overfeedCell).not.toContainText('0/7');
  });

  test('AC1: Harbour still shows 0 feeders — Academy feeder does not bleed into other territories', async ({ page }) => {
    await setup(page, [SUBMISSION_FEED_ACADEMY]);
    await openAmbienceTable(page);

    const harbourRow = page.locator('.proc-amb-table tbody tr').filter({
      has: page.locator('td.proc-amb-terr', { hasText: 'Harbour' }),
    });
    // Harbour cap = 5 (ambience 'Untended'); 0 feeders should show 0/5
    const harbourCell = harbourRow.locator('td').nth(3);
    await expect(harbourCell).toContainText('0/5');
  });

});

// ── AC2/AC3: Projects column shows non-zero delta for ambience_change ─────────
//
// Before fix: _ambienceDirection checked for 'improve'/'degrade' only. The DT form
// stores 'up'/'down'. Every ambience_change project returned null direction and was
// skipped → Projects showed ±0 for all territories.
//
// After fix: 'up' → 'increase'; 'down' → 'decrease'.

test.describe('#809 — Bug 3: ambience_change direction "up"/"down" Projects delta', () => {

  test('AC2: direction "up" produces +2 in Academy Projects (3 successes = contrib 2)', async ({ page }) => {
    await setup(page, [SUBMISSION_PROJ_UP]);
    await openAmbienceTable(page);

    // td index 5 = Projects column (0-indexed: 0=Terr, 1=Start, 2=Entropy, 3=Over, 4=Influence, 5=Projects)
    const projCell = academyRow(page).locator('td').nth(5);
    await expect(projCell).toBeVisible({ timeout: 5000 });
    // proj_pos=2 → display: "+2 | -0 | +2"; net span contains "+2"
    await expect(projCell).toContainText('+2');
  });

  test('AC2: direction "up" Projects cell net is not ±0 (was broken before fix)', async ({ page }) => {
    await setup(page, [SUBMISSION_PROJ_UP]);
    await openAmbienceTable(page);

    const projCell = academyRow(page).locator('td').nth(5);
    // ±0 = U+00B10 — present when project was silently skipped (pre-fix)
    await expect(projCell).not.toContainText('±0');
  });

  test('AC3: direction "down" produces -2 in Academy Projects (3 successes = contrib 2)', async ({ page }) => {
    await setup(page, [SUBMISSION_PROJ_DOWN]);
    await openAmbienceTable(page);

    const projCell = academyRow(page).locator('td').nth(5);
    await expect(projCell).toBeVisible({ timeout: 5000 });
    // proj_neg=2 → display: "+0 | -2 | -2"; net span contains "-2"
    await expect(projCell).toContainText('-2');
  });

  test('AC3: direction "down" Projects cell net is not ±0', async ({ page }) => {
    await setup(page, [SUBMISSION_PROJ_DOWN]);
    await openAmbienceTable(page);

    const projCell = academyRow(page).locator('td').nth(5);
    await expect(projCell).not.toContainText('±0');
  });

});

// ── AC4 (regression): All territory rows render; table structure intact ───────

test.describe('#809 — Regression: Ambience table structure', () => {

  test('AC4: All 5 territories render as rows in the ambience table', async ({ page }) => {
    await setup(page, [SUBMISSION_FEED_ACADEMY]);
    await openAmbienceTable(page);

    const rows = page.locator('.proc-amb-table tbody tr');
    await expect(rows).toHaveCount(5);
  });

  test('AC4: Academy, Harbour, Dockyards, Second City, North Shore all present', async ({ page }) => {
    await setup(page, [SUBMISSION_FEED_ACADEMY]);
    await openAmbienceTable(page);

    const terrCells = page.locator('.proc-amb-table td.proc-amb-terr');
    const texts = await terrCells.allTextContents();
    expect(texts.some(t => t.includes('Academy'))).toBe(true);
    expect(texts.some(t => t.includes('Harbour'))).toBe(true);
    expect(texts.some(t => t.includes('Dockyards'))).toBe(true);
    expect(texts.some(t => t.includes('Second City'))).toBe(true);
    expect(texts.some(t => t.includes('Shore'))).toBe(true);
  });

  test('AC4: No crash when navigating to City tab with submissions present', async ({ page }) => {
    await setup(page, [SUBMISSION_FEED_ACADEMY, SUBMISSION_PROJ_UP]);
    await openAmbienceTable(page);
    await expect(page.locator('.proc-amb-table')).toBeVisible();
    await expect(page.locator('#admin-app')).toBeVisible();
  });

});
