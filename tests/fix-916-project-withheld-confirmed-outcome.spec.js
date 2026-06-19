/**
 * Regression tests for fix #916 — confirmed project outcomes render "Project withheld".
 *
 * Third in the #904/#914 field-mismatch family. renderOutcomeWithCards
 * (public/js/tabs/story-tab.js) gated each project card's withheld state on
 * st_narrative.project_responses[i].response, but DT Processing's Confirm button
 * writes the approved outcome to projects_resolved[i].outcome (+ outcome_confirmed:true).
 * That legacy project_responses field is empty across all 29 DT4 submissions, so every
 * approved project rendered "Project withheld — see your Storytellers." as a spurious
 * card beneath the already-published narrative section.
 *
 * Fix: the withheld gate falls back to a CONFIRMED projects_resolved[i].outcome, while
 * an existing response still takes precedence and unapproved drafts stay withheld.
 *
 * Harness: player portal Archive tab (player.html at /), stubbing API — same as fix-466.
 * renderOutcomeWithCards renders into .story-narrative; the withheld card is
 * .proj-card-withheld containing "Project withheld — see your Storytellers."
 *
 * AC1: confirmed outcome + empty project_responses -> project shows its card, NOT withheld
 * AC2: same -> the "Project withheld" text / .proj-card-withheld is absent
 * AC3: outcome present but outcome_confirmed:false -> still withheld (unapproved draft)
 * AC4: no outcome at all -> still withheld (genuine)
 * AC5: st_narrative.project_responses[i].response present -> card renders (precedence, no regression)
 */

const { test, expect } = require('@playwright/test');

// ── Shared identity ─────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '916000001', username: 'test_player_916', global_name: 'Test Player 916',
  avatar: null, role: 'player', player_id: 'p-916',
  character_ids: ['char-916'], is_dual_role: false,
};

const CHAR_916 = {
  _id: 'char-916', name: 'Yusuf Test', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Invictus', player: 'Test Player 916',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  regent_territory: null, retired: false,
  status: {
    city: 1, clan: 0,
    covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 },
  },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

const CYCLE_916 = {
  _id: 'cycle-916', label: 'Downtime 4', cycle_number: 4, status: 'closed',
  game_number: 4, confirmed_ambience: {}, narrative_notes: '',
};

const NECRO_PROSE = 'You go down into the Necropolis first and alone, and you give yourself over to it.';

function baseSub(id) {
  return {
    _id: id,
    character_id: 'char-916',
    cycle_id: 'cycle-916',
    // published_outcome carries the compiled project narrative (as a push would produce),
    // with a heading matching the project title so the card is injected next to it.
    published_outcome: `## Moving Blood over old Ground\n\n${NECRO_PROSE}`,
    responses: { project_1_title: 'Moving Blood over old Ground', project_1_action: 'misc' },
    st_narrative: {},        // project_responses intentionally empty (real DT4 shape)
    projects_resolved: [],
    merit_actions_resolved: [],
    section_flags: [],
  };
}

// AC1/AC2: approved project — outcome confirmed in projects_resolved, project_responses empty.
const SUB_CONFIRMED = {
  ...baseSub('sub-916-confirmed'),
  projects_resolved: [
    { action_type: 'misc', outcome: NECRO_PROSE, outcome_confirmed: true, pool_status: 'no_roll' },
  ],
};

// AC3: drafted but NOT approved — outcome present, outcome_confirmed falsy → stays withheld.
const SUB_UNCONFIRMED = {
  ...baseSub('sub-916-unconfirmed'),
  projects_resolved: [
    { action_type: 'misc', outcome: NECRO_PROSE, outcome_confirmed: false, pool_status: 'pending' },
  ],
};

// AC4: nothing recorded — no outcome at all → genuine withheld.
const SUB_EMPTY = {
  ...baseSub('sub-916-empty'),
  projects_resolved: [
    { action_type: 'misc', pool_status: 'pending' },
  ],
};

// AC5: legacy path — st_narrative.project_responses[0].response present → card renders (precedence).
const SUB_LEGACY_RESPONSE = {
  ...baseSub('sub-916-legacy'),
  st_narrative: {
    project_responses: [
      { response: 'The restless dead take you in.', status: 'complete' },
    ],
  },
  projects_resolved: [
    { action_type: 'misc', pool_status: 'no_roll' },
  ],
};

// AC6: realistic DT4 multi-project shape — project 1 confirmed, project 2 a draft (unconfirmed).
// Each slot must gate independently from its own projects_resolved[i] (no cross-wiring).
const SUB_MIXED = {
  _id: 'sub-916-mixed',
  character_id: 'char-916',
  cycle_id: 'cycle-916',
  published_outcome: `## Moving Blood over old Ground\n\n${NECRO_PROSE}\n\n## Follow the Money\n\nThe trail runs cold.`,
  responses: {
    project_1_title: 'Moving Blood over old Ground', project_1_action: 'misc',
    project_2_title: 'Follow the Money',              project_2_action: 'hide_protect',
  },
  st_narrative: {},
  projects_resolved: [
    { action_type: 'misc',         outcome: NECRO_PROSE, outcome_confirmed: true,  pool_status: 'no_roll' },
    { action_type: 'hide_protect', outcome: 'Draft only', outcome_confirmed: false, pool_status: 'pending' },
  ],
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
    if (url.includes('/api/downtime_cycles'))      return ok([CYCLE_916]);
    if (url.includes('/api/downtime_submissions')) return ok(submissions);
    if (url.includes('/api/archive_documents'))    return ok([]);
    if (url.includes('/api/characters/names'))     return ok([{ _id: CHAR_916._id, name: CHAR_916.name, moniker: null, honorific: null }]);
    if (url.includes('/api/characters'))           return ok([CHAR_916]);
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

async function narrativeHtml(page) {
  return page.evaluate(() => document.querySelector('.story-narrative')?.innerHTML || '');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('fix-916: confirmed project outcomes are not withheld', () => {

  test('AC1/AC2: confirmed outcome + empty project_responses -> proper card, no withheld', async ({ page }) => {
    await setup(page, [SUB_CONFIRMED]);
    await openFirstDtItem(page);

    const html = await narrativeHtml(page);
    // The published narrative still renders.
    expect(html).toContain('You go down into the Necropolis');
    // No spurious withheld card...
    await expect(page.locator('.proj-card-withheld')).toHaveCount(0);
    expect(html).not.toContain('Project withheld');
    // ...and the project DOES render its proper (non-withheld) card (guards against the
    // fix dropping the card entirely).
    await expect(page.locator('.proj-card:not(.proj-card-withheld)')).toHaveCount(1);
  });

  test('AC6: multi-project sub gates each slot independently (confirmed card + draft withheld)', async ({ page }) => {
    await setup(page, [SUB_MIXED]);
    await openFirstDtItem(page);

    // Exactly one withheld card — the unconfirmed draft (project 2).
    await expect(page.locator('.proj-card-withheld')).toHaveCount(1);
    const withheld = page.locator('.proj-card-withheld');
    await expect(withheld).toContainText('Follow the Money');
    await expect(withheld).not.toContainText('Moving Blood over old Ground');
    // The confirmed project (1) renders its proper card and its narrative.
    const html = await narrativeHtml(page);
    expect(html).toContain('You go down into the Necropolis');
    await expect(page.locator('.proj-card:not(.proj-card-withheld)')).toHaveCount(1);
  });

  test('AC3: drafted but unconfirmed outcome -> still withheld', async ({ page }) => {
    await setup(page, [SUB_UNCONFIRMED]);
    await openFirstDtItem(page);

    await expect(page.locator('.proj-card-withheld')).toHaveCount(1);
    const html = await narrativeHtml(page);
    expect(html).toContain('Project withheld');
  });

  test('AC4: no outcome at all -> genuine withheld', async ({ page }) => {
    await setup(page, [SUB_EMPTY]);
    await openFirstDtItem(page);

    await expect(page.locator('.proj-card-withheld')).toHaveCount(1);
    const html = await narrativeHtml(page);
    expect(html).toContain('Project withheld');
  });

  test('AC5: existing project_responses[i].response still renders a card (precedence)', async ({ page }) => {
    await setup(page, [SUB_LEGACY_RESPONSE]);
    await openFirstDtItem(page);

    await expect(page.locator('.proj-card-withheld')).toHaveCount(0);
    const html = await narrativeHtml(page);
    expect(html).not.toContain('Project withheld');
  });

});
