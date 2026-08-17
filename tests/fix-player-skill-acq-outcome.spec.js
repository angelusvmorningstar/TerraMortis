/**
 * Regression tests for the player-side counterpart of fix #491 / #493.
 *
 * Context: The ST processing panel saves skill acquisition outcomes to
 * acquisitions_resolved[0].outcome_summary. PR #492 / #494 fixed the ST-side
 * DT Story preview to surface those. The PLAYER-side renderer
 * (renderMeritSummarySection in story-tab.js) was not updated and still
 * read only merit_actions_resolved, so players never saw the outcome.
 *
 * This spec verifies the player-side fix:
 *   AC-1: Skill acquisition with acquisitions_resolved[0].outcome_summary →
 *         narrative appears in the player's Allies & Asset Summary, under Resources
 *   AC-2: Skill acquisition with NO outcome → not shown (no false placeholder)
 *   AC-3: Allies merit outcome from merit_actions_resolved unaffected (regression guard)
 *
 * The merit summary is live-rendered, so no backfill is needed — as soon as
 * the saved data is correct, the player sees it on next view.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987000901', username: 'test_player_skillacq', global_name: 'Test Player SkillAcq',
  avatar: null, role: 'player', player_id: 'p-skillacq',
  character_ids: ['char-skillacq'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-skillacq', cycle_number: 3, status: 'closed',
  deadline: new Date(Date.now() - 86400000).toISOString(),
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR = {
  _id: 'char-skillacq', name: 'Test Acquirer', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player SkillAcq',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false, regent_territory: null,
  status: { city: 1, clan: 1, covenant: { Invictus: 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Intimidation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: {}, merits: [], powers: [], ordeals: [],
};

function publishedSub(id, extras = {}) {
  return {
    _id: id,
    chapter_id: 'cycle-skillacq',
    character_id: 'char-skillacq',
    character_name: 'Test Acquirer',
    player_name: 'Test Player SkillAcq',
    status: 'submitted',
    responses: {},
    _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
    projects_resolved: [],
    merit_actions_resolved: [],
    acquisitions_resolved: [],
    feeding_review: { pool_status: 'no_feed' },
    st_review: { outcome_text: '', outcome_visibility: 'published' },
    st_narrative: {},
    published_outcome: '',
    ...extras,
  };
}

async function setup(page, submissions) {
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
    if (url.includes('/api/chapters'))      return ok([ACTIVE_CYCLE]);
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
  // renderPastOutcomes is wired to the Info tab (app.js:427), targeting #misc-past-outcomes
  await page.evaluate(() => window.goTab('info'));
  await page.waitForTimeout(800);
}

async function expandPastOutcome(page) {
  // renderPastOutcomes builds <details class="dt-history-row"> rows inside #misc-past-outcomes.
  await page.waitForSelector('#misc-past-outcomes .dt-history-row', { timeout: 5000 });
  await page.evaluate(() => {
    const row = document.querySelector('#misc-past-outcomes .dt-history-row');
    if (row) row.open = true;
  });
  await page.waitForTimeout(200);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Player merit summary: skill acquisition outcome surfaces', () => {

  test('AC-1: skill acquisition outcome_summary appears in player Resources group', async ({ page }) => {
    const sub = publishedSub('sub-skillacq-with-outcome', {
      responses: { skill_acquisitions: 'Air of Menace' },
      acquisitions_resolved: [
        { pool_status: 'resolved', outcome_summary: 'You acquired Air of Menace; victims hesitate.' },
      ],
      // Ensure published_outcome is non-empty so the past outcome row renders
      published_outcome: '## Story Moment\n\nA tense night.',
      st_review: { outcome_text: '## Story Moment\n\nA tense night.', outcome_visibility: 'published' },
    });
    await setup(page, [sub]);
    await expandPastOutcome(page);

    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    await expect(meritSection).toContainText('Resources');
    await expect(meritSection).toContainText('Skill Acquisition');
    await expect(meritSection).toContainText('You acquired Air of Menace; victims hesitate.');
  });

  test('AC-2: skill acquisition with no outcome_summary is not shown', async ({ page }) => {
    const sub = publishedSub('sub-skillacq-no-outcome', {
      responses: { skill_acquisitions: 'Air of Menace' },
      acquisitions_resolved: [], // no outcome saved yet
      published_outcome: '## Story Moment\n\nA quiet cycle.',
      st_review: { outcome_text: '## Story Moment\n\nA quiet cycle.', outcome_visibility: 'published' },
    });
    await setup(page, [sub]);
    await expandPastOutcome(page);

    // No merit-summary-section at all (nothing to show — falls back to renderMeritActionCards
    // which only outputs for actions with action_type, but skill acquisitions in legacy
    // cards path aren't surfaced either). Either way: no "Skill Acquisition" text leaks.
    const body = page.locator('.dt-narrative-panel').first();
    await expect(body).not.toContainText('You acquired');
  });

  test('AC-3: Allies merit outcome from merit_actions_resolved unaffected', async ({ page }) => {
    const sub = publishedSub('sub-allies-regression', {
      responses: {
        sphere_1_merit: 'Allies ●● (Police)',
        sphere_1_action: 'patrol_scout',
      },
      _raw: {
        sphere_actions: [{ action_type: 'patrol_scout' }],
        contact_actions: { requests: [] },
        retainer_actions: { actions: [] },
      },
      merit_actions_resolved: [
        { pool_status: 'confirmed', outcome_summary: 'Police allies reported a quiet harbour.' },
      ],
      acquisitions_resolved: [],
      published_outcome: '## Story Moment\n\nThe docks were calm.',
      st_review: { outcome_text: '## Story Moment\n\nThe docks were calm.', outcome_visibility: 'published' },
    });
    await setup(page, [sub]);
    await expandPastOutcome(page);

    const meritSection = page.locator('.merit-summary-section');
    await expect(meritSection).toBeVisible({ timeout: 5000 });
    await expect(meritSection).toContainText('Allies');
    await expect(meritSection).toContainText('Police allies reported a quiet harbour.');
  });

});
