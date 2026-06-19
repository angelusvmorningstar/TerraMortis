/**
 * E2E tests for feat #907 — player Allies & Asset Summary shows submitted
 * description before ST outcome.
 *
 * `buildPlayerMeritActions` now returns a `description` field per action type:
 *   - Contacts: contact_${n}_request
 *   - Spheres (Allies/Status): sphere_${n}_outcome / status_${n}_outcome
 *   - Retainers: retainer_${n}_task
 *   - Skill Acquisitions: skill_acquisitions blob
 *
 * `renderMeritSummarySection` emits <span class="merit-summary-description">
 * inside .merit-summary-text (before the ST outcome text) when description exists.
 *
 * AC-1: Contacts request appears as description
 * AC-2: Sphere desired outcome appears as description
 * AC-3: Retainer task appears as description
 * AC-4: Skill Acquisition blob appears as description
 * AC-5: Empty description → no .merit-summary-description element
 * AC-6: No ST outcome → row absent (existing exclusion gate, regression guard)
 * AC-7: Description span has no inline style= attribute (tokens only)
 */

const { test, expect } = require('@playwright/test');

// ── Shared user fixtures ───────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '987000907', username: 'test_player_907', global_name: 'Test Player 907',
  avatar: null, role: 'player', player_id: 'p-907',
  character_ids: ['char-907'], is_dual_role: false,
};

const CLOSED_CYCLE = {
  _id: 'cycle-907', cycle_number: 4, status: 'closed',
  deadline: new Date(Date.now() - 86400000).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR = {
  _id: 'char-907',
  name: 'Description Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player 907',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  home_territory: null, retired: false,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength:     { dots: 2, bonus: 0 }, Dexterity:    { dots: 2, bonus: 0 }, Stamina:       { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits:         { dots: 2, bonus: 0 }, Resolve:       { dots: 2, bonus: 0 },
    Presence:     { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure:     { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, powers: [], ordeals: [],
  merits: [
    { name: 'Contacts', category: 'influence', rating: 2, qualifier: 'Street' },
    { name: 'Allies',   category: 'influence', rating: 2, qualifier: 'Dockers' },
    { name: 'Retainer', category: 'influence', rating: 2 },
  ],
};

function baseSub(id) {
  return {
    _id: id,
    cycle_id: 'cycle-907',
    character_id: 'char-907',
    character_name: 'Description Test',
    player_name: 'Test Player 907',
    status: 'submitted',
    responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    st_review: { outcome_text: '## Story Moment\n\nA quiet night.', outcome_visibility: 'published' },
    published_outcome: '## Story Moment\n\nA quiet night.',
    feeding_review: { pool_status: 'no_feed' },
    st_narrative: { story_moment: { status: 'complete' } },
  };
}

// ── Test submission fixtures ───────────────────────────────────────────────────

// AC-1: Contacts — request text shown as description
const SUB_CONTACTS = {
  ...baseSub('sub-907-contacts'),
  responses: {
    contact_1_merit:   'Contacts (Street)',
    contact_1_request: 'Who controls the docks?',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Mick Sullivan controls Pier 7.', outcome_confirmed: true },
  ],
};

// AC-2: Sphere (Allies) — desired outcome shown as description
const SUB_SPHERE = {
  ...baseSub('sub-907-sphere'),
  responses: {
    sphere_1_merit:    'Allies (Dockers)',
    sphere_1_action:   'misc',
    sphere_1_outcome:  'Send someone to watch the harbour entrance.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Your allies deployed as requested.', outcome_confirmed: true },
  ],
};

// AC-2b: Status — desired outcome shown as description
const SUB_STATUS = {
  ...baseSub('sub-907-status'),
  responses: {
    status_1_merit:   'Status (Invictus)',
    status_1_action:  'misc',
    status_1_outcome: 'Attend the Elysium and make an impression.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Your attendance was noted by several Priscii.', outcome_confirmed: true },
  ],
};

// AC-3: Retainer — task text shown as description
const SUB_RETAINER = {
  ...baseSub('sub-907-retainer'),
  responses: {
    retainer_1_merit: 'Retainer',
    retainer_1_task:  'Follow the red-haired man in the Elysium district.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Your retainer tailed him to a warehouse on Cork Street.', outcome_confirmed: true },
  ],
};

// AC-4: Skill Acquisition — blob text shown as description
const SUB_SKILL = {
  ...baseSub('sub-907-skill'),
  responses: {
    skill_acquisitions: 'Athletics 3',
  },
  merit_actions_resolved: [],
  acquisitions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Approved.' },
  ],
};

// AC-5: No description (sphere_1_outcome empty) — no .merit-summary-description
const SUB_NO_DESC = {
  ...baseSub('sub-907-no-desc'),
  responses: {
    sphere_1_merit:   'Allies (Dockers)',
    sphere_1_action:  'misc',
    sphere_1_outcome: '',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome: 'Outcome with no description.', outcome_confirmed: true },
  ],
};

// AC-6: No ST outcome — row excluded entirely (regression guard)
const SUB_NO_OUTCOME = {
  ...baseSub('sub-907-no-outcome'),
  responses: {
    contact_1_merit:   'Contacts (Street)',
    contact_1_request: 'Some request.',
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed' },
  ],
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setupPlayerStory(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url    = route.request().url();
    const method = route.request().method();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true });
    if (url.includes('/api/auth/me'))             return ok(PLAYER_USER);
    if (url.includes('/api/downtime_cycles'))      return ok([CLOSED_CYCLE]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR._id, name: CHAR.name, moniker: CHAR.moniker, honorific: CHAR.honorific }]);
    if (url.includes('/api/characters'))           return ok([CHAR]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    if (url.includes('/api/ordeal-responses'))     return ok([]);
    if (url.includes('/api/st_mods'))              return ok([]);
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('feat.907: player merit summary shows submitted description', () => {

  test('AC-1: Contacts — request text shown as description before ST outcome', async ({ page }) => {
    await setupPlayerStory(page, [SUB_CONTACTS]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    const desc = meritSection.locator('.merit-summary-description').first();
    await expect(desc).toBeVisible();
    await expect(desc).toContainText('Who controls the docks?');
    await expect(meritSection).toContainText('Mick Sullivan controls Pier 7.');
  });

  test('AC-2: Sphere (Allies) — desired outcome shown as description before ST outcome', async ({ page }) => {
    await setupPlayerStory(page, [SUB_SPHERE]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    const desc = meritSection.locator('.merit-summary-description').first();
    await expect(desc).toBeVisible();
    await expect(desc).toContainText('Send someone to watch the harbour entrance.');
    await expect(meritSection).toContainText('Your allies deployed as requested.');
  });

  test('AC-2b: Status — desired outcome shown as description before ST outcome', async ({ page }) => {
    await setupPlayerStory(page, [SUB_STATUS]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    const desc = meritSection.locator('.merit-summary-description').first();
    await expect(desc).toBeVisible();
    await expect(desc).toContainText('Attend the Elysium');
    await expect(meritSection).toContainText('attendance was noted');
  });

  test('AC-3: Retainer — task description shown before ST outcome', async ({ page }) => {
    await setupPlayerStory(page, [SUB_RETAINER]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    const desc = meritSection.locator('.merit-summary-description').first();
    await expect(desc).toBeVisible();
    await expect(desc).toContainText('Follow the red-haired man');
    await expect(meritSection).toContainText('tailed him to a warehouse');
  });

  test('AC-4: Skill Acquisition — blob text shown as description before outcome', async ({ page }) => {
    await setupPlayerStory(page, [SUB_SKILL]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    const desc = meritSection.locator('.merit-summary-description').first();
    await expect(desc).toBeVisible();
    await expect(desc).toContainText('Athletics 3');
    await expect(meritSection).toContainText('Approved.');
  });

  test('AC-5: Empty description → no .merit-summary-description element in row', async ({ page }) => {
    await setupPlayerStory(page, [SUB_NO_DESC]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    await expect(meritSection).toContainText('Outcome with no description.');
    const descEls = meritSection.locator('.merit-summary-description');
    await expect(descEls).toHaveCount(0);
  });

  test('AC-6: No ST outcome → row absent from summary (existing gate regression)', async ({ page }) => {
    await setupPlayerStory(page, [SUB_NO_OUTCOME]);
    await expandPastOutcome(page);
    // Without an ST outcome the section may not render at all, or renders empty
    const meritSection = page.locator('.merit-summary-section');
    const isVisible = await meritSection.isVisible().catch(() => false);
    if (isVisible) {
      // If section renders, the specific row with no outcome must not appear
      await expect(meritSection).not.toContainText('Some request.');
    }
  });

  test('AC-7: Description span has no inline style= attribute (design-system tokens only)', async ({ page }) => {
    await setupPlayerStory(page, [SUB_CONTACTS]);
    await expandPastOutcome(page);
    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    const desc = meritSection.locator('.merit-summary-description').first();
    await expect(desc).toBeVisible();
    const styleAttr = await desc.getAttribute('style');
    expect(styleAttr).toBeNull();
  });

});
