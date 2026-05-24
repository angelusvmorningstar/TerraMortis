/**
 * fix-470: DT player report — Territory Pulse renders under Feeding heading as raw text.
 *
 * compilePushOutcome now uses "## Territory Pulse — <name>" (double-hash) so
 * parseOutcomeSections treats each pulse as its own named section. The Feeding
 * block is pushed separately — only when narrativeText exists — so no empty
 * Feeding heading appears when a player has territory pulses but no feeding narrative.
 *
 * AC1: Distinct heading rendered for Territory Pulse, separated from Feeding.
 * AC2: "###" characters do not appear as visible text.
 * AC3: Feeding section unaffected when both feeding narrative and pulse exist.
 * AC4: No Territory Pulse heading when no pulse exists (no-change regression).
 */

const { test, expect } = require('@playwright/test');

// ── Shared identity ─────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '470000001', username: 'test_player_470', global_name: 'Test Player 470',
  avatar: null, role: 'player', player_id: 'p-470',
  character_ids: ['char-470'], is_dual_role: false,
};

const CHAR_470 = {
  _id: 'char-470', name: 'Anichka Test', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Circle of the Crone', player: 'Test Player 470',
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
  skills: {}, disciplines: { Auspex: { dots: 2 } },
  merits: [], powers: [], ordeals: [],
};

const CYCLE_470 = {
  _id: 'cycle-470', label: 'Downtime 3', cycle_number: 3, status: 'closed',
  game_number: 3, confirmed_ambience: {}, narrative_notes: '',
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

// AC1 + AC2 + AC3: published_outcome has both a Feeding section and a Territory Pulse section.
// The "### " raw text must NOT appear; Territory Pulse must be its own section.
const SUB_FEEDING_AND_PULSE = {
  _id: 'sub-470-feed-and-pulse',
  character_id: 'char-470',
  cycle_id: 'cycle-470',
  published_outcome: [
    '## Feeding\n\nShe moved through the North Shore with practised ease, finding the blood warm and willing.',
    '## Territory Pulse — The North Shore\n\nThe North Shore is well looked after this cycle and the blood comes accordingly.',
  ].join('\n\n'),
  st_narrative: {},
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC4 regression: no Territory Pulse block — "Territory Pulse" heading must not appear.
const SUB_FEEDING_ONLY = {
  _id: 'sub-470-feed-only',
  character_id: 'char-470',
  cycle_id: 'cycle-470',
  published_outcome: '## Feeding\n\nShe moved through the North Shore with practised ease.',
  st_narrative: {},
  responses: {},
  projects_resolved: [],
  merit_actions_resolved: [],
  section_flags: [],
};

// AC1 edge case: Territory Pulse present but NO feeding narrative — no empty Feeding heading.
const SUB_PULSE_ONLY = {
  _id: 'sub-470-pulse-only',
  character_id: 'char-470',
  cycle_id: 'cycle-470',
  published_outcome: '## Territory Pulse — The North Shore\n\nThe North Shore is well looked after this cycle.',
  st_narrative: {},
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
    if (url.includes('/api/downtime_cycles'))      return ok([CYCLE_470]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/archive_documents'))    return ok([]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_470._id, name: CHAR_470.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_470]);
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

test.describe('fix-470: Territory Pulse renders as its own section', () => {

  test('AC1: "Territory Pulse — The North Shore" section heading is present', async ({ page }) => {
    await setup(page, [SUB_FEEDING_AND_PULSE]);
    await openFirstDtItem(page);

    const pulseHead = page.locator('.story-section-head', { hasText: 'Territory Pulse — The North Shore' });
    await expect(pulseHead).toBeVisible();
  });

  test('AC2: "###" characters do not appear as visible text', async ({ page }) => {
    await setup(page, [SUB_FEEDING_AND_PULSE]);
    await openFirstDtItem(page);

    await expect(page.locator('.story-narrative')).not.toContainText('###');
  });

  test('AC3: Feeding section heading and body text are unaffected', async ({ page }) => {
    await setup(page, [SUB_FEEDING_AND_PULSE]);
    await openFirstDtItem(page);

    const feedingSection = page.locator('.story-section', {
      has: page.locator('.story-section-head', { hasText: 'Feeding' }),
    });
    await expect(feedingSection.locator('.story-section-body')).toContainText('practised ease');
    await expect(feedingSection.locator('.story-section-body')).not.toContainText('North Shore is well looked after');
  });

  test('AC3: Territory Pulse body text appears in its own section, not in Feeding', async ({ page }) => {
    await setup(page, [SUB_FEEDING_AND_PULSE]);
    await openFirstDtItem(page);

    const pulseSection = page.locator('.story-section', {
      has: page.locator('.story-section-head', { hasText: 'Territory Pulse' }),
    });
    await expect(pulseSection.locator('.story-section-body')).toContainText('well looked after');
  });

  test('AC4 regression: no Territory Pulse heading when no pulse in published_outcome', async ({ page }) => {
    await setup(page, [SUB_FEEDING_ONLY]);
    await openFirstDtItem(page);

    const pulseHead = page.locator('.story-section-head', { hasText: 'Territory Pulse' });
    await expect(pulseHead).toHaveCount(0);
  });

  test('AC1 edge case: pulse-only — Territory Pulse heading present, no empty Feeding heading', async ({ page }) => {
    await setup(page, [SUB_PULSE_ONLY]);
    await openFirstDtItem(page);

    const pulseHead = page.locator('.story-section-head', { hasText: 'Territory Pulse — The North Shore' });
    await expect(pulseHead).toBeVisible();

    const feedingHead = page.locator('.story-section-head', { hasText: /^Feeding$/ });
    await expect(feedingHead).toHaveCount(0);
  });

});
