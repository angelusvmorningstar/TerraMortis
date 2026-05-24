/**
 * fix-468: DT player report — ST Notes rendered under last project heading.
 *
 * compilePushOutcome in downtime-story.js now prepends "## ST Notes and Extra Story\n\n"
 * to general_notes before pushing to parts[]. parseOutcomeSections splits on "## " lines,
 * so the notes now become their own named section in renderOutcomeWithCards output.
 *
 * AC1: A submission with st_narrative.general_notes set renders a distinct
 *      "ST Notes and Extra Story" .story-section-head heading, separated from projects.
 * AC2: A submission with no general_notes (or empty string) renders no such heading.
 * AC3: Project sections are unaffected — their headings and body text render as before.
 */

const { test, expect } = require('@playwright/test');

// ── Shared identity ─────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '468000001', username: 'test_player_468', global_name: 'Test Player 468',
  avatar: null, role: 'player', player_id: 'p-468',
  character_ids: ['char-468'], is_dual_role: false,
};

const CHAR_468 = {
  _id: 'char-468', name: 'Keeper Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player 468',
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
  skills: {}, disciplines: { Cruac: { dots: 3 } },
  merits: [], powers: [], ordeals: [],
};

const CYCLE_468 = {
  _id: 'cycle-468', label: 'Downtime 3', cycle_number: 3, status: 'closed',
  game_number: 3, confirmed_ambience: {}, narrative_notes: '',
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

// AC1 + AC3: published_outcome has two project sections plus general_notes.
// The general_notes text should appear under its own "ST Notes and Extra Story" heading,
// NOT merged into the body of "MUSIC ON THE WIND".
const SUB_WITH_GENERAL_NOTES = {
  _id: 'sub-468-with-notes',
  character_id: 'char-468',
  cycle_id: 'cycle-468',
  published_outcome: [
    '## Music on the Wind\n\nShe heard the old melody carried through the night air.',
    '## ST Notes and Extra Story\n\nThe Cruac rite you attempted resonated with the ley lines beneath the city.',
  ].join('\n\n'),
  st_narrative: {
    general_notes: 'The Cruac rite you attempted resonated with the ley lines beneath the city.',
    project_responses: [
      { response: 'You found what you were looking for.', status: 'complete' },
    ],
  },
  responses: {
    project_1_title: 'Music on the Wind',
    project_1_action: 'investigate',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC2: no general_notes — "ST Notes and Extra Story" heading must not appear.
const SUB_WITHOUT_GENERAL_NOTES = {
  _id: 'sub-468-no-notes',
  character_id: 'char-468',
  cycle_id: 'cycle-468',
  published_outcome: '## Music on the Wind\n\nShe heard the old melody carried through the night air.',
  st_narrative: {
    project_responses: [
      { response: 'You found what you were looking for.', status: 'complete' },
    ],
  },
  responses: {
    project_1_title: 'Music on the Wind',
    project_1_action: 'investigate',
  },
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
    if (url.includes('/api/downtime_cycles'))      return ok([CYCLE_468]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/archive_documents'))    return ok([]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_468._id, name: CHAR_468.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_468]);
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

test.describe('fix-468: ST Notes rendered under its own heading', () => {

  test('AC1: "ST Notes and Extra Story" section heading is present when general_notes is set', async ({ page }) => {
    await setup(page, [SUB_WITH_GENERAL_NOTES]);
    await openFirstDtItem(page);

    const stNotesHead = page.locator('.story-section-head', { hasText: 'ST Notes and Extra Story' });
    await expect(stNotesHead).toBeVisible();
  });

  test('AC1: general_notes text appears inside the ST Notes section body', async ({ page }) => {
    await setup(page, [SUB_WITH_GENERAL_NOTES]);
    await openFirstDtItem(page);

    const stNotesSection = page.locator('.story-section', {
      has: page.locator('.story-section-head', { hasText: 'ST Notes and Extra Story' }),
    });
    await expect(stNotesSection.locator('.story-section-body')).toContainText('Cruac rite');
  });

  test('AC2: no "ST Notes and Extra Story" heading when general_notes is absent', async ({ page }) => {
    await setup(page, [SUB_WITHOUT_GENERAL_NOTES]);
    await openFirstDtItem(page);

    const stNotesHead = page.locator('.story-section-head', { hasText: 'ST Notes and Extra Story' });
    await expect(stNotesHead).toHaveCount(0);
  });

  test('AC3: project section heading is unaffected — "Music on the Wind" still renders', async ({ page }) => {
    await setup(page, [SUB_WITH_GENERAL_NOTES]);
    await openFirstDtItem(page);

    const projHead = page.locator('.story-section-head', { hasText: 'Music on the Wind' });
    await expect(projHead).toBeVisible();
  });

  test('AC3: project body text is not contaminated by general_notes content', async ({ page }) => {
    await setup(page, [SUB_WITH_GENERAL_NOTES]);
    await openFirstDtItem(page);

    const projSection = page.locator('.story-section', {
      has: page.locator('.story-section-head', { hasText: 'Music on the Wind' }),
    });
    await expect(projSection.locator('.story-section-body')).not.toContainText('Cruac rite');
    await expect(projSection.locator('.story-section-body')).toContainText('old melody');
  });

});
