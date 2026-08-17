/**
 * Fix #814 — DT territory context: resolveTerrId misused on slug / display-name values.
 *
 * resolveTerrId is ObjectId-string only. Three DT-context sites fed it the wrong format and
 * silently got null. This spec exercises the three fix directions through the DOM:
 *
 *   AC1 (Bug A) — discipline_profile is _id-keyed; was read with the slug terrId → always
 *                 "None detected". Fix reads with terrOidStr. (clipboard via project Copy Context)
 *   AC2 (Bug B) — ST per-project ambience territory override is a slug; was passed to
 *                 resolveTerrId → null → override ignored. Fix uses TERRITORY_SLUG_MAP first.
 *                 (City / Ambience table)
 *   AC4 (Bug C) — char.home_territory is a display-name; was passed to resolveTerrId → null →
 *                 home-territory activity scan always empty. Fix uses TERRITORY_SLUG_MAP first.
 *                 (DT Story home_report section)
 *
 * AC3 (getTerritoryOverlap / buildActionContext territory) and AC5 (regression) are the same
 * one-line override-resolution pattern as AC2; the confirmed_ambience regression guard is folded
 * into the AC2 table tests (5 rows still render, confirmed path untouched).
 */

const { test, expect } = require('@playwright/test');

// ════════════════════════════════════════════════════════════════════════════
// PART 1 — AC2: ambience territory override resolves (City / Ambience table)
// ════════════════════════════════════════════════════════════════════════════

const ST_USER = {
  id: '123000814', username: 'test_st_814', global_name: 'Test ST 814',
  avatar: null, role: 'st', player_id: 'p-814', character_ids: [], is_dual_role: false,
};

const CYCLE_AMB = { _id: 'cycle-814', cycle_number: 3, status: 'active', confirmed_ambience: {}, narrative_notes: '' };

const CHAR_PROJ = {
  _id: 'char-814-proj', name: 'Override Test', moniker: null, honorific: null,
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

// ambience_change "up", player target = academy, but ST override = harbour (slug).
// 3 successes -> contrib 2. The delta must land on HARBOUR (override), not ACADEMY (submitted).
const SUB_AMB_OVERRIDE = {
  _id: 'sub-814-ovr',
  chapter_id: 'cycle-814',
  character_name: 'Override Test',
  character_id: 'char-814-proj',
  player_name: 'Player Proj',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [{ action_type: 'ambience_change', desired_outcome: 'Improve the Academy', detail: '' }],
    feeding: { method: 'predatory_aura', pool: { expression: 'Presence 2 = 2' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    _feed_method: 'predatory_aura',
    project_1_action_type: 'ambience_change',
    project_1_ambience_direction: 'up',
    project_1_ambience_target: 'academy',   // player submitted academy (slug)
  },
  projects_resolved: [{ roll: { successes: 3 } }],
  feeding_review: { pool_player: 'Presence 2 = 2', pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' },
  merit_actions_resolved: [],
  st_review: { territory_overrides: { '0': 'harbour' } },  // ST override to harbour (slug)
};

async function setupAmbience(page, submissions, chars = [CHAR_PROJ]) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/chapters'))      return ok([CYCLE_AMB]);
    if (url.includes('/api/characters/names'))     return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(chars);
    if (url.includes('/api/territories'))          return ok([]);  // use TERRITORY_DATA fallback (slugs)
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
}

// Navigate to City tab + expand Ambience (carries the #809 harness gotchas).
async function openAmbienceTable(page) {
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForSelector('.proc-action-row', { state: 'visible', timeout: 10000 });
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="city"]');
  await page.waitForSelector('[data-toggle="city-ambience"]', { state: 'visible', timeout: 8000 });
  await page.click('[data-toggle="city-ambience"] .proc-amb-toggle');
  await page.waitForSelector('.proc-amb-table', { state: 'visible', timeout: 5000 });
}

function ambRow(page, name) {
  return page.locator('.proc-amb-table tbody tr').filter({
    has: page.locator('td.proc-amb-terr', { hasText: name }),
  });
}

test.describe('#814 AC2 — ambience territory override resolves (Bug B)', () => {

  test('AC2: override territory (Harbour) receives the +2 Projects delta', async ({ page }) => {
    await setupAmbience(page, [SUB_AMB_OVERRIDE]);
    await openAmbienceTable(page);
    // Projects column = td index 5 (Terr, Starting, Entropy, Overfeeding, Influence, Projects)
    const projCell = ambRow(page, 'Harbour').locator('td').nth(5);
    await expect(projCell).toBeVisible({ timeout: 5000 });
    await expect(projCell).toContainText('+2');
  });

  test('AC2: submitted territory (Academy) does NOT receive the delta (override won)', async ({ page }) => {
    await setupAmbience(page, [SUB_AMB_OVERRIDE]);
    await openAmbienceTable(page);
    const projCell = ambRow(page, 'Academy').locator('td').nth(5);
    await expect(projCell).toBeVisible({ timeout: 5000 });
    await expect(projCell).toContainText('±0');  // +-0, no delta
  });

  test('AC5 (regression): all 5 territory rows still render; no crash', async ({ page }) => {
    await setupAmbience(page, [SUB_AMB_OVERRIDE]);
    await openAmbienceTable(page);
    await expect(page.locator('.proc-amb-table tbody tr')).toHaveCount(5);
    await expect(page.locator('#admin-app')).toBeVisible();
  });

});

// ════════════════════════════════════════════════════════════════════════════
// PART 2 — AC1 + AC4: DT Story context (discipline profile + home report)
// ════════════════════════════════════════════════════════════════════════════

const OID_ACADEMY = '69d5dc6a00815d47150397c6';  // 24-hex; resolveTerrId resolves this to 'academy'
const TERR_ACADEMY = { _id: OID_ACADEMY, slug: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: 3 };

// Home char: home_territory is a DISPLAY NAME (the bug input). Another char acts in academy.
const CHAR_HOME = {
  _id: 'char-814-home', name: 'Home Body', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Player Home',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: 'The Academy', retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const CHAR_ACTOR = {
  ...CHAR_HOME, _id: 'char-814-actor', name: 'Academy Actor', player: 'Player Actor',
  home_territory: null,
};

const CYCLE_STORY = {
  _id: 'cycle-814s', cycle_number: 3, status: 'active', phase_signoff: {}, confirmed_ambience: {},
  // discipline_profile is _id-keyed (ADR-002) — the key is the academy OID.
  discipline_profile: { [OID_ACADEMY]: { Vigour: 2 } },
};

function storySub(overrides = {}) {
  return {
    _id: 'sub-814s', chapter_id: 'cycle-814s',
    character_id: 'char-814-home', character_name: 'Home Body', player_name: 'Player Home',
    status: 'submitted', responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [], merit_actions_resolved: [], acquisitions_resolved: [],
    st_review: {}, st_narrative: { story_moment: { status: 'complete' } },
    feeding_review: { pool_status: 'no_feed' },
    ...overrides,
  };
}

// Home char's own submission (the one we view). A patrol_scout project resolving to academy by
// OID so Copy Context routes to buildPatrolContext (which emits the "Discipline activity:" line —
// the site the #814 fix touches at downtime-story.js:1037). terrRaw is OID so resolveTerrId works.
const SUB_HOME = storySub({
  responses: {
    project_1_action: 'patrol_scout',
    project_1_target_terr: OID_ACADEMY,   // buildPatrolContext reads _target_terr (OID)
  },
  projects_resolved: [{ action_type: 'patrol_scout', pool_status: 'validated', roll: { successes: 3 } }],
});

// Another character's submission acting in academy (by OID), so _homeTerrActivity matches it.
const SUB_ACTOR = storySub({
  _id: 'sub-814s-actor', character_id: 'char-814-actor', character_name: 'Academy Actor', player_name: 'Player Actor',
  responses: { project_1_territory: OID_ACADEMY },
  projects_resolved: [{ action_type: 'patrol_scout', pool_status: 'validated', roll: { successes: 2 } }],
});

async function setupStory(page, submissions, chars, viewName = 'Home Body') {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: ST_USER });

  const ok = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/auth/me', r => ok(r, ST_USER));
  await page.route(/\/api\/characters$/, r => ok(r, chars));
  await page.route('**/api/characters/names', r => ok(r, chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific }))));
  await page.route('**/api/chapters*', r => ok(r, [CYCLE_STORY]));
  await page.route('**/api/downtime_submissions*', r => {
    if (['PATCH', 'PUT', 'POST'].includes(r.request().method())) return ok(r, { ok: true });
    return ok(r, submissions);
  });
  await page.route('**/api/territories*', r => ok(r, [TERR_ACADEMY]));
  await page.route('**/api/game_sessions*', r => ok(r, []));
  await page.route('**/api/session_logs*', r => ok(r, []));
  await page.route('**/api/st_mods*', r => ok(r, []));

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForSelector('button[data-phase="story"]', { state: 'visible', timeout: 10000 });
  await page.click('button[data-phase="story"]');
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 10000 });
  // Select the requested character (first pill matching the name).
  await page.locator('.dt-story-pill', { hasText: viewName }).first().click();
  await page.waitForSelector('.dt-story-char-content', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// #886: the Home Report section was removed from the DT Story tab (superseded by
// Territory Pulse, and it was never published). The original AC4 tests asserted the
// admin `home_report` section rendered home-territory activity; that section no longer
// exists, so AC4 now locks in its removal. The #814 home-territory resolveTerrId fix
// it guarded is moot for a section that does not render.
test.describe('#814 AC4 — home-territory activity (section removed by #886)', () => {

  test('AC4 (post-#886): home_report section no longer renders in the DT Story tab', async ({ page }) => {
    await setupStory(page, [SUB_HOME, SUB_ACTOR], [CHAR_HOME, CHAR_ACTOR]);
    const homeExists = await page.evaluate(() =>
      !!document.querySelector('.dt-story-section[data-section="home_report"]'));
    expect(homeExists).toBe(false);
  });

});

// AC3 NOTE (QA): getTerritoryOverlap (downtime-story.js:2487/2497) and buildActionContext
// territory (:2578) are reached only by renderActionCard / the per-category merit-action card
// sections (allies_actions, status_actions, …). Those sections are NOT in getApplicableSections
// (downtime-story.js:1150-1176) — Story 1.13 consolidated all merit categories into the single
// `merit_summary` ledger — so the merit-action cards (and their "Territory Overlap" chips) do not
// render in the current DT Story UI. The #814 fix at those sites is correct and defensive but is
// not reachable through the live UI and therefore cannot be E2E-verified here. It shares the exact
// one-line pattern (TERRITORY_SLUG_MAP[x] ?? resolveTerrId(x)) that AC2 mutation-verifies on the
// same st_review.territory_overrides field. See story QA Results.

test.describe('#814 AC1 — discipline profile reads OID key (Bug A)', () => {

  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('AC1: project Copy Context shows discipline activity, not "None detected"', async ({ page }) => {
    await setupStory(page, [SUB_HOME, SUB_ACTOR], [CHAR_HOME, CHAR_ACTOR]);

    // Click the project card's Copy Context button -> buildProjectContext -> clipboard.
    const copyBtn = page.locator('.dt-story-proj-card .dt-story-copy-ctx-btn').first();
    await expect(copyBtn).toBeVisible({ timeout: 5000 });
    await copyBtn.click();

    await expect.poll(async () => {
      return page.evaluate(() => navigator.clipboard.readText());
    }, { timeout: 5000 }).toContain('Vigour');

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).not.toContain('None detected');
  });

});
