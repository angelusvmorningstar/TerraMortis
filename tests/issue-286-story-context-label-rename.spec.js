/**
 * Issue #286 — DT Processing: Story Context label + DB field rename
 *
 * Covers:
 *   - Story Context label shows "— Claude narrative constraint" sub-label
 *   - All three destination sub-labels present (Claude / Claude constraint / Player)
 *   - Save-on-blur sends `story_context` field, NOT `player_feedback`
 *   - Existing `story_context` value pre-populates the input
 *   - DT Story tab Feeding section shows "Story Context" (not "Player Feedback")
 *   - Player-facing story tab does NOT render story_context as an ST Note fallback
 */

const { test, expect } = require('@playwright/test');

// ── Shared identity ────────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const PLAYER_USER = {
  id: '999999999', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002', character_ids: ['char-t1'], is_dual_role: false,
};

// ── Shared character ───────────────────────────────────────────────────────────

const CHAR_TEST = {
  _id: 'char-t1', name: 'Test Character', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Majesty: { dots: 2 } },
  merits: [
    { name: 'Allies', category: 'influence', rating: 2, qualifier: 'Criminal' },
  ],
  powers: [], ordeals: [],
};

// status 'active' routes DTUX-1 ribbon to the 'projects' (processing) tab by default
const TEST_CYCLE = {
  _id: 'cycle-286', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// ── Submission: project action with existing story_context ─────────────────────

const SUBMISSION_WITH_STORY_CONTEXT = {
  _id: 'sub-286-ctx',
  cycle_id: 'cycle-286',
  character_name: 'Test Character',
  character_id: 'char-t1',
  player_name: 'Test Player',
  submitted_at: '2026-05-12T00:00:00Z',
  _raw: {
    projects: [
      {
        action_type: 'ambience_increase',
        desired_outcome: 'Increase ambience in Northside',
        detail: 'Work the streets.',
        primary_pool: { expression: 'Presence 3 + Athletics 2 = 5' },
      },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'ambience_increase',
    project_1_outcome: 'Increase ambience in Northside',
    project_1_description: 'Work the streets.',
    project_1_pool_expr: 'Presence 3 + Athletics 2 = 5',
  },
  projects_resolved: [
    {
      pool_status: 'pending',
      pool_player: 'Presence 3 + Athletics 2 = 5',
      pool_validated: '',
      notes_thread: [],
      story_context: 'She finds herself drawn to an old ally.',
      player_facing_note: '',
    },
  ],
  feeding_review: {
    pool_status: 'pending',
    pool_player: '',
    pool_validated: '',
    notes_thread: [],
    story_context: 'Feeding in familiar grounds.',
    player_facing_note: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// Submission with NO story_context — tests blank state
const SUBMISSION_NO_STORY_CONTEXT = {
  _id: 'sub-286-empty',
  cycle_id: 'cycle-286',
  character_name: 'Test Character',
  character_id: 'char-t1',
  player_name: 'Test Player',
  submitted_at: '2026-05-12T00:00:00Z',
  _raw: {
    projects: [
      {
        action_type: 'ambience_increase',
        desired_outcome: 'Boost area',
        detail: 'Walk the area.',
        primary_pool: { expression: 'Presence 3 + Athletics 2 = 5' },
      },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'ambience_increase',
    project_1_outcome: 'Boost area',
    project_1_description: 'Walk the area.',
    project_1_pool_expr: 'Presence 3 + Athletics 2 = 5',
  },
  projects_resolved: [
    {
      pool_status: 'pending',
      pool_player: 'Presence 3 + Athletics 2 = 5',
      pool_validated: '',
      notes_thread: [],
      story_context: '',
      player_facing_note: '',
    },
  ],
  feeding_review: null,
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// DT Story tab submission: feeding validated, story_context set on feeding_review
const SUBMISSION_FOR_STORY_TAB = {
  _id: 'sub-286-story',
  cycle_id: 'cycle-286',
  character_name: 'Test Character',
  character_id: 'char-t1',
  player_name: 'Test Player',
  submitted_at: '2026-05-12T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', territory: 'Northside' },
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    feeding_territory: 'Northside',
  },
  projects_resolved: [],
  feeding_review: {
    pool_status: 'validated',
    pool_player: 'Presence 3 + Athletics 2 = 5',
    pool_validated: 'Presence 3 + Athletics 2 = 5',
    notes_thread: [],
    story_context: 'She hunts near the old theatre.',
    player_facing_note: 'The hunt goes smoothly.',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
  st_narrative: { feeding_narrative: {} },
};

// Player-facing story tab: resolved project with player_facing_note (and NO story_context leakage)
const SUBMISSION_PLAYER_STORY = {
  _id: 'sub-286-player',
  cycle_id: 'cycle-286',
  character_name: 'Test Character',
  character_id: 'char-t1',
  player_name: 'Test Player',
  status: 'published',
  _raw: {
    projects: [
      {
        action_type: 'ambience_increase',
        desired_outcome: 'Boost area',
        detail: 'Walk the area.',
        primary_pool: { expression: 'Presence 3 + Athletics 2 = 5' },
      },
    ],
    feeding: null,
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    project_1_action: 'ambience_increase',
    project_1_outcome: 'Boost area',
    project_1_description: 'Walk the area.',
  },
  projects_resolved: [
    {
      pool_status: 'validated',
      pool_validated: 'Presence 3 + Athletics 2 = 5',
      story_context: 'SHOULD NOT APPEAR IN PLAYER VIEW',
      player_facing_note: 'Great work on the project.',
      roll: { successes: 3, exceptional: false, dice_string: '3,5,7,8,9' },
    },
  ],
  published_outcome: {
    projects: [
      {
        title: 'Ambience — Northside',
        response: 'She worked the area successfully.',
      },
    ],
  },
  feeding_review: null,
  merit_actions_resolved: [],
  st_narrative: {},
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setupProcessing(page, submissions, chars = [CHAR_TEST]) {
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
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  // DTUX-1: ribbon defaults to 'prep' for cycles without phase_signoff; navigate explicitly to processing
  const projectsTab = page.locator('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  if (await projectsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await projectsTab.click();
    await page.waitForTimeout(500);
  }
}

async function openFirstAction(page, phaseLabel) {
  await page.waitForSelector('.proc-phase-section', { timeout: 8000 });
  const phaseHeader = page.locator('.proc-phase-header').filter({ hasText: phaseLabel }).first();
  const toggle = phaseHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await phaseHeader.click();
  await page.waitForTimeout(200);
  const phase = page.locator('.proc-phase-section').filter({ hasText: phaseLabel }).first();
  await phase.locator('.proc-action-row').first().click();
  await page.waitForTimeout(400);
}

async function setupDtStory(page, submissions, chars = [CHAR_TEST]) {
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
    if (url.includes('/api/downtime_cycles'))      return ok([{ ...TEST_CYCLE, status: 'active' }]);
    if (url.includes('/api/characters/names'))     return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))           return ok(chars);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 8000 });
  await page.waitForTimeout(500);
}

// ── Label tests ────────────────────────────────────────────────────────────────

test.describe('Issue #286 — Story Context destination labels', () => {

  test('Story Context section label includes "Claude narrative constraint" sub-label', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_NO_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const panel = page.locator('.proc-action-detail').first();
    const feedbackSection = panel.locator('.proc-feedback-section');
    await expect(feedbackSection).toBeVisible({ timeout: 5000 });
    await expect(feedbackSection).toContainText('Claude narrative constraint');
  });

  test('Story Context section label reads "Story Context"', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_NO_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const panel = page.locator('.proc-action-detail').first();
    const label = panel.locator('.proc-feedback-section .proc-detail-label');
    await expect(label).toContainText('Story Context');
  });

  test('ST Notes section label still reads "visible to Claude"', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_NO_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const panel = page.locator('.proc-action-detail').first();
    const notesPanel = panel.locator('.proc-notes-primary');
    await expect(notesPanel).toContainText('visible to Claude');
  });

  test('Player Feedback section label still reads "sent to player"', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_NO_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const panel = page.locator('.proc-action-detail').first();
    const playerNoteSection = panel.locator('.proc-player-note-section');
    await expect(playerNoteSection).toContainText('sent to player');
  });

  test('Story Context label does NOT say "sent to player"', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_NO_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const feedbackSection = page.locator('.proc-feedback-section').first();
    await expect(feedbackSection).not.toContainText('sent to player');
  });

});

// ── Existing story_context value renders in the input ─────────────────────────

test.describe('Issue #286 — Existing story_context pre-populates input', () => {

  test('Story Context input shows pre-existing story_context value', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_WITH_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const input = page.locator('.proc-feedback-input').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await expect(input).toHaveValue('She finds herself drawn to an old ally.');
  });

  test('Story Context input is empty when story_context is blank', async ({ page }) => {
    await setupProcessing(page, [SUBMISSION_NO_STORY_CONTEXT]);
    await openFirstAction(page, 'Ambience');

    const input = page.locator('.proc-feedback-input').first();
    await expect(input).toHaveValue('');
  });

});

// ── Save-on-blur sends story_context, not player_feedback ─────────────────────

test.describe('Issue #286 — Save-on-blur field name', () => {

  test('blurring the Story Context input sends story_context in PATCH body', async ({ page }) => {
    let savedBody = null;

    await page.addInitScript(({ user }) => {
      localStorage.setItem('tm_auth_token', 'local-test-token');
      localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
      localStorage.setItem('tm_auth_user', JSON.stringify(user));
    }, { user: ST_USER });

    await page.route('http://localhost:3000/**', route => {
      const url = route.request().url();
      const method = route.request().method();
      const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if ((method === 'PATCH' || method === 'PUT') && url.includes('/api/downtime_submissions')) {
        savedBody = route.request().postData();
        return ok({ ok: true });
      }
      if (method === 'PUT' || method === 'PATCH' || method === 'POST') return ok({ ok: true });
      if (url.includes('/api/downtime_submissions')) return ok([SUBMISSION_NO_STORY_CONTEXT]);
      if (url.includes('/api/downtime_cycles'))      return ok([TEST_CYCLE]);
      if (url.includes('/api/characters/names'))     return ok([CHAR_TEST].map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
      if (url.includes('/api/characters'))           return ok([CHAR_TEST]);
      if (url.includes('/api/territories'))          return ok([]);
      if (url.includes('/api/game_sessions'))        return ok([]);
      if (url.includes('/api/session_logs'))         return ok([]);
      return ok([]);
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
    await page.click('[data-domain="downtime"]');
    await page.waitForTimeout(500);
    const projectsTab = page.locator('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
    if (await projectsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await projectsTab.click();
      await page.waitForTimeout(500);
    }
    await openFirstAction(page, 'Ambience');

    const input = page.locator('.proc-feedback-input').first();
    await input.click();
    await input.fill('Narrative constraint text');
    // Tab away to trigger focusout/blur save
    await input.press('Tab');
    await page.waitForTimeout(500);

    expect(savedBody).not.toBeNull();
    const parsed = JSON.parse(savedBody || '{}');

    // Must contain story_context, not player_feedback
    const bodyStr = JSON.stringify(parsed);
    expect(bodyStr).toContain('story_context');
    expect(bodyStr).not.toContain('player_feedback');
  });

});

// ── DT Story tab Feeding section label ────────────────────────────────────────

test.describe('Issue #286 — DT Story tab Feeding section label', () => {

  test('DT Story tab feeding section shows "Story Context" not "Player Feedback"', async ({ page }) => {
    await setupDtStory(page, [SUBMISSION_FOR_STORY_TAB]);

    await page.click(`.dt-story-pill[data-char-id="char-t1"]`);
    await page.waitForSelector('.dt-story-section', { timeout: 8000 });
    await page.waitForTimeout(300);

    const feedingSection = page.locator('.dt-story-section[data-section="feeding_validation"]');
    await expect(feedingSection).toBeVisible({ timeout: 5000 });
    await expect(feedingSection).toContainText('Story Context');
    await expect(feedingSection).not.toContainText('Player Feedback');
  });

  test('DT Story tab feeding section renders story_context value', async ({ page }) => {
    await setupDtStory(page, [SUBMISSION_FOR_STORY_TAB]);

    await page.click(`.dt-story-pill[data-char-id="char-t1"]`);
    await page.waitForSelector('.dt-story-section', { timeout: 8000 });
    await page.waitForTimeout(300);

    const feedingSection = page.locator('.dt-story-section[data-section="feeding_validation"]');
    await expect(feedingSection).toContainText('She hunts near the old theatre.');
  });

  test('DT Story tab feeding section does NOT show story_context as Player Feedback', async ({ page }) => {
    await setupDtStory(page, [SUBMISSION_FOR_STORY_TAB]);

    await page.click(`.dt-story-pill[data-char-id="char-t1"]`);
    await page.waitForSelector('.dt-story-section', { timeout: 8000 });
    await page.waitForTimeout(300);

    // The old mislabelled "Player Feedback" row is gone — replaced by "Story Context"
    const feedingSection = page.locator('.dt-story-section[data-section="feeding_validation"]');
    await expect(feedingSection).not.toContainText('Player Feedback');
  });

});

// ── Player-facing story tab: story_context must NOT appear ────────────────────

test.describe('Issue #286 — Player story tab does not leak story_context', () => {

  // story-tab.js builds project cards from projects_resolved[i].
  // AC: `|| rev.player_feedback` fallback removed — story_context is Claude-only,
  // must never surface to players.
  // Verified by fetching the source file and confirming player_feedback is absent.

  test('story-tab.js source: player_feedback fallback is absent', async ({ page }) => {
    const response = await page.request.get('http://localhost:8080/js/tabs/story-tab.js');
    expect(response.status()).toBe(200);
    const src = await response.text();
    expect(src).not.toContain('player_feedback');
  });

});
