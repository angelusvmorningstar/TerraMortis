/**
 * Regression tests for fix #904 — DT Story merit action outcomes not displayed.
 *
 * Root cause: The DT Processing Confirm button writes `rev.outcome` but the
 * admin DT Story renderer (downtime-story.js) and player story tab (story-tab.js)
 * both read `rev.outcome_summary`. Confirmed outcomes never surfaced in either view.
 *
 * Fix: Read-side fallback `outcome_summary?.trim() || outcome?.trim()` added at
 * five sites across two files:
 *   A. downtime-story.js:2245 — meritSummaryComplete gate
 *   B. downtime-story.js:2272 — renderMeritSummary display
 *   C. downtime-story.js:2336 — completion tracker blocking-items check
 *   D. story-tab.js:548       — hasOutcomeSummaries guard
 *   E. story-tab.js:562       — per-action summary read
 *
 * Admin-side tests (admin.html DT Story panel):
 *   AC-1: outcome set (no outcome_summary) → outcome text shown in merit table
 *   AC-2: outcome set (no outcome_summary) → action not listed in completion tracker
 *   AC-3: outcome set (no outcome_summary) → completion dot turns green
 *   AC-5a: outcome_summary only → still shown (regression guard, existing data safe)
 *   AC-5b: both fields set → outcome_summary wins (priority invariant)
 *
 * Player-side tests (index.html story tab):
 *   AC-4: outcome set (no outcome_summary) → outcome shown in player merit summary
 *   AC-4b: outcome_summary only → still shown in player merit summary (regression guard)
 */

const { test, expect } = require('@playwright/test');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123000904', username: 'test_st_904', global_name: 'Test ST 904',
  avatar: null, role: 'st', player_id: 'p-904', character_ids: [], is_dual_role: false,
};

const PLAYER_USER = {
  id: '987000904', username: 'test_player_904', global_name: 'Test Player 904',
  avatar: null, role: 'player', player_id: 'p-904',
  character_ids: ['char-904'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-904', cycle_number: 4, status: 'active',
  phase_signoff: {}, confirmed_ambience: {},
};

const CLOSED_CYCLE = {
  _id: 'cycle-904', cycle_number: 4, status: 'closed',
  deadline: new Date(Date.now() - 86400000).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR = {
  _id: 'char-904',
  name: 'Outcome Field Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player 904',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength:     { dots: 2, bonus: 0 }, Dexterity:    { dots: 2, bonus: 0 }, Stamina:       { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits:         { dots: 2, bonus: 0 }, Resolve:       { dots: 2, bonus: 0 },
    Presence:     { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure:     { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [
    { name: 'Contacts', category: 'influence', rating: 2, qualifier: 'Street' },
  ],
  powers: [], ordeals: [],
};

function baseSub(id, cycleId = 'cycle-904') {
  return {
    _id: id,
    chapter_id: cycleId,
    character_id: 'char-904',
    character_name: 'Outcome Field Test',
    player_name: 'Test Player 904',
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

// ── Admin-side submission fixtures ─────────────────────────────────────────────

// Main bug case: outcome confirmed via Confirm button (writes `outcome`, not `outcome_summary`).
const SUB_OUTCOME_ONLY = {
  ...baseSub('sub-904-outcome-only'),
  responses: {
    sphere_1_merit:       'Contacts (Street)',
    sphere_1_action:      'misc',
    sphere_1_outcome:     'Keep an eye out on the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Street contacts report three unfamiliar faces near Pier 7.', outcome_confirmed: true },
  ],
};

// Regression guard: outcome_summary set (old compact-panel path) — must still display.
const SUB_OUTCOME_SUMMARY_ONLY = {
  ...baseSub('sub-904-summary-only'),
  responses: {
    sphere_1_merit:       'Contacts (Street)',
    sphere_1_action:      'misc',
    sphere_1_outcome:     'Keep an eye out on the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Old one-liner outcome text.' },
  ],
};

// Priority invariant: both fields set — outcome_summary must win.
const SUB_BOTH_FIELDS = {
  ...baseSub('sub-904-both'),
  responses: {
    sphere_1_merit:       'Contacts (Street)',
    sphere_1_action:      'misc',
    sphere_1_outcome:     'Keep an eye out on the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Summary wins.', outcome: 'Full outcome text.' },
  ],
};

// ── Player-side submission fixtures ───────────────────────────────────────────

function playerSub(id, extras = {}) {
  return {
    ...baseSub(id),
    st_review: { outcome_text: '## Story Moment\n\nA quiet night.', outcome_visibility: 'published' },
    published_outcome: '## Story Moment\n\nA quiet night.',
    ...extras,
  };
}

// AC-4: outcome confirmed via Confirm button — must surface in player view.
const PLAYER_SUB_OUTCOME_ONLY = playerSub('sub-904-player-outcome', {
  responses: {
    sphere_1_merit:   'Contacts (Street)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Watch the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Your contacts report three unfamiliar faces near Pier 7.', outcome_confirmed: true },
  ],
});

// AC-4b: outcome_summary only — must still surface in player view (regression guard).
const PLAYER_SUB_SUMMARY_ONLY = playerSub('sub-904-player-summary', {
  responses: {
    sphere_1_merit:   'Contacts (Street)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Watch the docks.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Contacts summary (old path) still visible.' },
  ],
});

// ── Admin setup helper ─────────────────────────────────────────────────────────

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
  await page.route('**/api/chapters*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route(/\/api\/downtime_submissions/, route => {
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

async function getMeritSectionHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dt-story-section[data-section="merit_summary"]');
    return el ? el.innerHTML : null;
  });
}

// ── Player setup helper ────────────────────────────────────────────────────────

async function setupPlayerStory(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/chapters'))      return ok([CLOSED_CYCLE]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    if (url.includes('/api/ordeal-responses'))     return ok([]);
    return ok([]);
  });

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
  await page.evaluate(() => window.goTab('info'));
  await page.waitForTimeout(800);
}

async function expandPastOutcome(page) {
  await page.waitForSelector('#misc-past-outcomes .dt-history-row', { timeout: 5000 });
  await page.evaluate(() => {
    const row = document.querySelector('#misc-past-outcomes .dt-history-row');
    if (row) row.open = true;
  });
  await page.waitForTimeout(200);
}

// ── Admin-side tests ───────────────────────────────────────────────────────────

test.describe('fix.904 (admin): merit outcome field fallback — downtime-story.js', () => {

  test('AC-1: outcome set (no outcome_summary) → outcome text shown in merit table', async ({ page }) => {
    await setupStoryPanel(page, [SUB_OUTCOME_ONLY]);
    const html = await getMeritSectionHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Street contacts report three unfamiliar faces near Pier 7.');
    expect(html).not.toContain('Outcome not yet recorded');
  });

  test('AC-2: outcome set (no outcome_summary) → action not listed in completion tracker', async ({ page }) => {
    await setupStoryPanel(page, [SUB_OUTCOME_ONLY]);
    const html = await getMeritSectionHtml(page);
    expect(html).not.toBeNull();
    // Completion tracker must NOT list this action as pending
    expect(html).not.toContain('still to record in DT Processing');
  });

  test('AC-3: outcome set (no outcome_summary) → completion dot is green', async ({ page }) => {
    await setupStoryPanel(page, [SUB_OUTCOME_ONLY]);
    const dot = page.locator('[data-section="merit_summary"] .dt-story-completion-dot');
    await expect(dot).toHaveClass(/dt-story-dot-complete/);
    // Green check badge present
    const html = await getMeritSectionHtml(page);
    expect(html).toContain('All outcomes recorded');
  });

  test('AC-5a: outcome_summary only → still shown (regression guard — existing data safe)', async ({ page }) => {
    await setupStoryPanel(page, [SUB_OUTCOME_SUMMARY_ONLY]);
    const html = await getMeritSectionHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Old one-liner outcome text.');
    expect(html).not.toContain('Outcome not yet recorded');
    expect(html).toContain('All outcomes recorded');
  });

  test('AC-5b: both fields set → outcome_summary wins (priority invariant)', async ({ page }) => {
    await setupStoryPanel(page, [SUB_BOTH_FIELDS]);
    const html = await getMeritSectionHtml(page);
    expect(html).not.toBeNull();
    expect(html).toContain('Summary wins.');
    expect(html).not.toContain('Full outcome text.');
  });

});

// ── Player-side tests ──────────────────────────────────────────────────────────

test.describe('fix.904 (player): merit outcome field fallback — story-tab.js', () => {

  test('AC-4: outcome set (no outcome_summary) → shown in player merit summary', async ({ page }) => {
    await setupPlayerStory(page, [PLAYER_SUB_OUTCOME_ONLY]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    await expect(meritSection).toContainText('Contacts');
    await expect(meritSection).toContainText('Your contacts report three unfamiliar faces near Pier 7.');
  });

  test('AC-4b: outcome_summary only → still shown in player view (regression guard)', async ({ page }) => {
    await setupPlayerStory(page, [PLAYER_SUB_SUMMARY_ONLY]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    await expect(meritSection).toContainText('Contacts summary (old path) still visible.');
  });

});
