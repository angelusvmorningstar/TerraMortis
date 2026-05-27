/**
 * fix-466: DT player report rendering bugs —
 *   Bug 1: ST notes missing heading (proj-card-feedback-label invisible / not heading)
 *   Bug 2: Line breaks not rendering (split /\n{2,}/ ignored single \n)
 *   Bug 3: Player feedback text not italicised
 *
 * All three bugs were in public/js/tabs/story-tab.js (renderOutcomeWithCards,
 * _storyNarrSection) and public/css/{components,suite}.css.
 *
 * Tests use the Archive tab on the player portal (player.html at /),
 * stubbing API responses — same pattern as fix-464.
 *
 * AC1: h4.proj-card-feedback-label renders and contains "ST Note"
 * AC2: Single \n line breaks produce distinct <p> elements in story section body
 * AC3: player_facing_note text is wrapped in <em>
 * AC4: Double \n\n paragraph breaks still produce distinct <p> elements (regression)
 */

const { test, expect } = require('@playwright/test');

// ── Shared identity ─────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '466000001', username: 'test_player_466', global_name: 'Test Player 466',
  avatar: null, role: 'player', player_id: 'p-466',
  character_ids: ['char-466'], is_dual_role: false,
};

const CHAR_466 = {
  _id: 'char-466', name: 'Anichka Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player 466',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: null, retired: false,
  status: {
    city: 1, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 1, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 1, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 3, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: { Auspex: { dots: 2 }, Cruac: { dots: 3 } },
  merits: [], powers: [], ordeals: [],
};

const CYCLE_466 = {
  _id: 'cycle-466', label: 'Downtime 3', cycle_number: 3, status: 'closed',
  game_number: 3, confirmed_ambience: {}, narrative_notes: '',
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

// AC1 + AC3: project card with player_facing_note.
// Needs:
//   - published_outcome with ## heading matching project_1_title so card is injected
//   - st_narrative.project_responses[0].response truthy (or card is "withheld" and note skipped)
//   - projects_resolved[0].player_facing_note = feedback text
const SUB_PROJCARD = {
  _id: 'sub-466-projcard',
  character_id: 'char-466',
  cycle_id: 'cycle-466',
  published_outcome: '## Research the Barrens\n\nShe searched the edges of the Barrens night after night.',
  st_narrative: {
    project_responses: [
      { response: 'You found what you were looking for in the shadows.', status: 'complete' },
    ],
  },
  responses: {
    project_1_title: 'Research the Barrens',
    project_1_action: 'investigate',
  },
  projects_resolved: [
    {
      action_type: 'investigate',
      player_facing_note: 'Switched your Disc pool to Cruac as it felt more appropriate with the magical glyphs.',
      pool: { expression: 'Intelligence + Occult', total: 5 },
      roll: { successes: 2, exceptional: false, dice_string: '2, 5, 6, 7, 9' },
      no_roll: false,
    },
  ],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC2: story moment with single \n between paragraphs.
// Bug: split(/\n{2,}/) collapses all into one <p>. Fix: split(/\n/) produces 3 <p>.
const SUB_SINGLE_NEWLINES = {
  _id: 'sub-466-single-nl',
  character_id: 'char-466',
  cycle_id: 'cycle-466',
  published_outcome: 'Some general outcome text.',
  st_narrative: {
    story_moment: {
      response: 'A dream\nYou are walking a road that is not a road.\nThe country opens around you.',
      status: 'complete',
    },
  },
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC4 regression: story moment with double \n\n paragraph breaks.
// Must still produce distinct <p> elements after the split(/\n/) change.
const SUB_DOUBLE_NEWLINES = {
  _id: 'sub-466-double-nl',
  character_id: 'char-466',
  cycle_id: 'cycle-466',
  published_outcome: 'Some general outcome text.',
  st_narrative: {
    story_moment: {
      response: 'First paragraph of the dream sequence.\n\nSecond paragraph continues here.',
      status: 'complete',
    },
  },
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// ── Setup ────────────────────────────────────────────────────────────────────

async function setup(page, submissions) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
  }, { user: PLAYER_USER });

  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    const ok = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return ok({ ok: true });
    if (url.includes('/api/auth/me'))              return ok(PLAYER_USER);
    if (url.includes('/api/downtime_cycles'))      return ok([CYCLE_466]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/archive_documents'))    return ok([]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_466._id, name: CHAR_466.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_466]);
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
  await page.waitForSelector('.arc-doc-item[data-sub-id]', { timeout: 8000 });
  await page.click('.arc-doc-item[data-sub-id]');
  await page.waitForSelector('.story-narrative', { timeout: 5000 });
  await page.waitForTimeout(300);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix-466: DT player report rendering bugs', () => {

  test('AC1: proj-card-feedback-label is rendered as h4 with text "ST Note"', async ({ page }) => {
    await setup(page, [SUB_PROJCARD]);
    await openFirstDtItem(page);

    const label = page.locator('h4.proj-card-feedback-label');
    await expect(label).toBeVisible();
    await expect(label).toContainText('ST Note');
  });

  test('AC2: single \\n line breaks produce distinct <p> elements in story moment', async ({ page }) => {
    await setup(page, [SUB_SINGLE_NEWLINES]);
    await openFirstDtItem(page);

    // Story Moment section body should have one <p> per line (3 lines → 3 <p>)
    const storySection = page.locator('.story-section', {
      has: page.locator('.story-section-head', { hasText: 'Story Moment' }),
    });
    const paragraphs = storySection.locator('.story-section-body p');
    await expect(paragraphs).toHaveCount(3);
    await expect(paragraphs.nth(0)).toContainText('A dream');
    await expect(paragraphs.nth(1)).toContainText('You are walking a road');
    await expect(paragraphs.nth(2)).toContainText('The country opens');
  });

  test('AC3: player_facing_note is wrapped in <em> (italic)', async ({ page }) => {
    await setup(page, [SUB_PROJCARD]);
    await openFirstDtItem(page);

    const noteEm = page.locator('.proj-card-feedback em');
    await expect(noteEm).toBeVisible();
    await expect(noteEm).toContainText('Switched your Disc pool to Cruac');
  });

  test('AC4 regression: double \\n\\n paragraph breaks still produce distinct <p> elements', async ({ page }) => {
    await setup(page, [SUB_DOUBLE_NEWLINES]);
    await openFirstDtItem(page);

    const storySection = page.locator('.story-section', {
      has: page.locator('.story-section-head', { hasText: 'Story Moment' }),
    });
    const paragraphs = storySection.locator('.story-section-body p');
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.nth(0)).toContainText('First paragraph');
    await expect(paragraphs.nth(1)).toContainText('Second paragraph');
  });

  test('AC1+AC3 combined: label heading and italic text both present in same proj-card', async ({ page }) => {
    await setup(page, [SUB_PROJCARD]);
    await openFirstDtItem(page);

    const card = page.locator('.proj-card-feedback');
    await expect(card.locator('h4.proj-card-feedback-label')).toContainText('ST Note');
    await expect(card.locator('em')).toContainText('Switched your Disc pool to Cruac');
  });

});
