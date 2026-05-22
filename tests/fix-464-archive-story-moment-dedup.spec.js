/**
 * fix-464: Archive tab — Story Moment section renders twice when published_outcome
 * also contains a ## Story Moment heading.
 *
 * Root cause: renderOutcomeWithCards called renderStoryMoment() (reads structured
 * st_narrative.story_moment) AND the sections loop parsed ## Story Moment from
 * published_outcome text, producing a duplicate block. Fixed by tracking which
 * section keys the dedicated renderers have already handled and skipping matching
 * headings in the loop.
 *
 * Tests:
 *   AC1: structured story_moment + published_outcome heading → exactly 1 Story Moment
 *   AC2: no structured fields, published_outcome heading only → exactly 1 Story Moment
 *   AC3: structured home_report + published_outcome heading → exactly 1 Home Report
 *   AC4: legacy letter_from_home only (no published_outcome) → exactly 1 Story Moment
 */

const { test, expect } = require('@playwright/test');

// ── Shared identity ─────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '464000001', username: 'test_player_464', global_name: 'Test Player 464',
  avatar: null, role: 'player', player_id: 'p-464',
  character_ids: ['char-464'], is_dual_role: false,
};

const CHAR_464 = {
  _id: 'char-464', name: 'Archive Test Char', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Test Player 464',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: null, retired: false,
  status: {
    city: 1, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 1 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: { Auspex: { dots: 2 } }, merits: [], powers: [], ordeals: [],
};

const CYCLE_464 = {
  _id: 'cycle-464', label: 'Downtime 3', cycle_number: 3, status: 'closed',
  game_number: 3, confirmed_ambience: {}, narrative_notes: '',
};

// AC1: structured story_moment + ## Story Moment in published_outcome
// Bug: without the fix, Story Moment appears twice.
const SUB_AC1 = {
  _id: 'sub-464-ac1',
  character_id: 'char-464',
  cycle_id: 'cycle-464',
  published_outcome: '## Story Moment\n\nThe narrative moment written by the ST in the push text.',
  st_narrative: {
    story_moment: { response: 'The structured story moment text from admin tool.', status: 'complete' },
  },
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC2: no structured fields at all — published_outcome heading is the only source.
// The heading must still render (not be swallowed).
const SUB_AC2 = {
  _id: 'sub-464-ac2',
  character_id: 'char-464',
  cycle_id: 'cycle-464',
  published_outcome: '## Story Moment\n\nContent from push text only — no structured field.',
  st_narrative: {},
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC3: structured home_report + ## Home Report in published_outcome.
const SUB_AC3 = {
  _id: 'sub-464-ac3',
  character_id: 'char-464',
  cycle_id: 'cycle-464',
  published_outcome: '## Home Report\n\nThe home report in push text.',
  st_narrative: {
    home_report: { response: 'The structured home report from admin tool.', status: 'complete' },
  },
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC4: legacy letter_from_home only — published_outcome has NO Story Moment heading.
// The archive tab requires a truthy published_outcome to list the submission.
// renderStoryMoment's legacy path handles this; must produce exactly 1 block.
const SUB_AC4 = {
  _id: 'sub-464-ac4',
  character_id: 'char-464',
  cycle_id: 'cycle-464',
  published_outcome: 'Some general narrative text with no section headings.',
  st_narrative: {
    letter_from_home: { response: 'Dear Alice,\n\nLegacy letter content here.', status: 'complete' },
  },
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// ── Setup helper ────────────────────────────────────────────────────────────────

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
    if (url.includes('/api/auth/me'))              return ok(PLAYER_USER);
    if (url.includes('/api/downtime_cycles'))      return ok([CYCLE_464]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/archive_documents'))    return ok([]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_464._id, name: CHAR_464.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_464]);
    if (url.includes('/api/territories'))          return ok([]);
    if (url.includes('/api/game_sessions'))        return ok([]);
    if (url.includes('/api/session_logs'))         return ok([]);
    if (url.includes('/api/st_mods'))              return ok([]);
    if (url.includes('/api/ordeal-responses'))     return ok([]);
    return ok([]);
  });

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => typeof window.goTab === 'function', { timeout: 8000 });
  await page.evaluate(() => window.goTab('archive'));
  await page.waitForTimeout(800);
}

async function openFirstDtItem(page) {
  // Wait for archive list to populate with a downtime entry.
  await page.waitForSelector('.arc-doc-item[data-sub-id]', { timeout: 8000 });
  await page.click('.arc-doc-item[data-sub-id]');
  // Wait for the detail view to render with story-narrative.
  await page.waitForSelector('.story-narrative', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// ── Tests ────────────────────────────────────────────────────────────────────────

test.describe('fix-464: Archive tab Story Moment deduplication', () => {

  test('AC1: structured story_moment + published_outcome heading → exactly one Story Moment block', async ({ page }) => {
    await setup(page, [SUB_AC1]);
    await openFirstDtItem(page);

    const heads = page.locator('.story-section-head');
    const storyMomentHeads = heads.filter({ hasText: 'Story Moment' });
    await expect(storyMomentHeads).toHaveCount(1);
  });

  test('AC2: no structured fields, published_outcome heading only → exactly one Story Moment block', async ({ page }) => {
    await setup(page, [SUB_AC2]);
    await openFirstDtItem(page);

    const heads = page.locator('.story-section-head');
    const storyMomentHeads = heads.filter({ hasText: 'Story Moment' });
    await expect(storyMomentHeads).toHaveCount(1);
  });

  test('AC3: structured home_report + published_outcome heading → exactly one Home Report block', async ({ page }) => {
    await setup(page, [SUB_AC3]);
    await openFirstDtItem(page);

    const heads = page.locator('.story-section-head');
    const homeReportHeads = heads.filter({ hasText: 'Home Report' });
    await expect(homeReportHeads).toHaveCount(1);
  });

  test('AC4: legacy letter_from_home only → exactly one Story Moment block (no regression)', async ({ page }) => {
    await setup(page, [SUB_AC4]);
    await openFirstDtItem(page);

    const heads = page.locator('.story-section-head');
    const storyMomentHeads = heads.filter({ hasText: 'Story Moment' });
    await expect(storyMomentHeads).toHaveCount(1);
  });

  test('AC1 content integrity: structured story_moment text is what renders', async ({ page }) => {
    await setup(page, [SUB_AC1]);
    await openFirstDtItem(page);

    // The structured field should be preferred over the published_outcome text.
    const narrative = page.locator('.story-narrative');
    await expect(narrative).toContainText('The structured story moment text from admin tool.');
  });

});
