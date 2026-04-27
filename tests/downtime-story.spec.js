/**
 * Downtime Story tab — E2E tests
 * Covers DTQ-2: merit_actions population from response fields
 *   - Sphere actions → Allies / Status / Resources sections
 *   - Contact actions → Contact Requests section
 *   - Retainer actions → Retainer Actions section
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ───────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

// initDtStory looks for a cycle with status === 'active'
const ACTIVE_CYCLE = {
  _id: 'cycle-dtq2', cycle_number: 2, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

const CHAR_BRANDY = {
  _id: 'char-brandy', name: 'Brandy LaRoux', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 3, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 2, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 2, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 3, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: { Persuasion: { dots: 3, bonus: 0, specs: [], nine_again: false } },
  disciplines: { Majesty: { dots: 3 } },
  merits: [
    { name: 'Allies', category: 'influence', rating: 3, qualifier: 'Police' },
    { name: 'Allies', category: 'influence', rating: 2, qualifier: 'Underworld' },
    { name: 'Allies', category: 'influence', rating: 2, qualifier: 'Media' },
  ],
  powers: [],
  ordeals: [],
};

const CHAR_ANICHKA = {
  _id: 'char-anichka', name: 'Anichka', moniker: null, honorific: null,
  clan: 'Nosferatu', covenant: 'Unaligned', player: 'Other Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 3, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: {},
  merits: [
    { name: 'Retainer', category: 'general', rating: 3, qualifier: 'Family' },
  ],
  powers: [],
  ordeals: [],
};

const CHAR_CONRAD = {
  _id: 'char-conrad', name: 'Conrad Sondergaard', moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Ordo Dracul', player: 'Third Player',
  blood_potency: 2, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 1 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: { Auspex: { dots: 3 } },
  merits: [
    { name: 'Contacts', category: 'influence', rating: 2, qualifier: 'Police' },
    { name: 'Contacts', category: 'influence', rating: 2, qualifier: 'Criminal' },
  ],
  powers: [],
  ordeals: [],
};

// ── Submission fixtures ───────────────────────────────────────────────────────

// DT1 CSV format — sphere actions in responses
const SUB_BRANDY_ALLIES = {
  _id: 'sub-brandy',
  cycle_id: 'cycle-dtq2',
  character_id: 'char-brandy',
  character_name: 'Brandy LaRoux',
  player_name: 'Test Player',
  status: 'submitted',
  responses: {
    feeding_method: 'seduction',
    sphere_1_merit: 'Allies (Police)',
    sphere_1_action: 'hide_protect',
    sphere_1_outcome: "Make Einar's misstep go away",
    sphere_1_description: 'Use police allies to wipe records.',
    sphere_2_merit: 'Allies (Underworld)',
    sphere_2_action: 'patrol_scout',
    sphere_2_outcome: 'Increase security of North Shore',
    sphere_2_description: 'Watch for suspicious activity.',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_narrative: {},
};

// Submission with contact actions
const SUB_CONRAD_CONTACTS = {
  _id: 'sub-conrad',
  cycle_id: 'cycle-dtq2',
  character_id: 'char-conrad',
  character_name: 'Conrad Sondergaard',
  player_name: 'Third Player',
  status: 'submitted',
  responses: {
    feeding_method: 'stalking',
    contact_1_request: 'Contact Type: Police\nRequest: Any info on Charles Mercer Willows?',
    contact_2_request: 'Contact Type: Criminal\nRequest: Any dealings with Mercer Willows or his cult?',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_narrative: {},
};

// Submission with retainer action
const SUB_ANICHKA_RETAINER = {
  _id: 'sub-anichka',
  cycle_id: 'cycle-dtq2',
  character_id: 'char-anichka',
  character_name: 'Anichka',
  player_name: 'Other Player',
  status: 'submitted',
  responses: {
    feeding_method: 'stalking',
    retainer_1_task: 'Continue establishing community ties. Attend Orthodox Easter.',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_narrative: {},
};

// DT2+ format — sphere actions in _raw, should use existing merit_actions if present
const SUB_DT2_FORMAT = {
  _id: 'sub-dt2',
  cycle_id: 'cycle-dtq2',
  character_id: 'char-brandy',
  character_name: 'Brandy LaRoux',
  player_name: 'Test Player',
  status: 'submitted',
  _raw: {
    sphere_actions: [
      { action_type: 'misc', desired_outcome: 'Do a thing', detail: 'Details here.' },
    ],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  responses: {
    feeding_method: 'seduction',
    sphere_1_merit: 'Allies (Media)',
    sphere_1_action: 'misc',
    sphere_1_outcome: 'Do a thing',
    sphere_1_description: 'Details here.',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_narrative: {},
};

// Submission with pre-populated merit_actions (should not be re-processed)
const SUB_PREPOPULATED = {
  _id: 'sub-prepop',
  cycle_id: 'cycle-dtq2',
  character_id: 'char-brandy',
  character_name: 'Brandy LaRoux',
  player_name: 'Test Player',
  status: 'submitted',
  merit_actions: [
    { merit_type: 'Allies (High Society)', action_type: 'misc', desired_outcome: 'Pre-set', description: 'Pre-set desc' },
  ],
  responses: {
    // These sphere fields should be IGNORED because merit_actions is already populated
    sphere_1_merit: 'Allies (Police)',
    sphere_1_action: 'hide_protect',
    sphere_1_outcome: 'This should not appear',
    sphere_1_description: 'This should not appear',
  },
  projects_resolved: [],
  merit_actions_resolved: [],
  st_narrative: {},
};

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setupDtStory(page, submissions, chars) {
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

    if (url.includes('/api/downtime_submissions'))  return ok(submissions);
    if (url.includes('/api/downtime_cycles'))       return ok([ACTIVE_CYCLE]);
    if (url.includes('/api/characters/names'))      return ok(chars.map(c => ({ _id: c._id, name: c.name, moniker: c.moniker, honorific: c.honorific })));
    if (url.includes('/api/characters'))            return ok(chars);
    if (url.includes('/api/territories'))           return ok([]);
    if (url.includes('/api/game_sessions'))         return ok([]);
    if (url.includes('/api/session_logs'))          return ok([]);
    return ok([]);
  });

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-app', { state: 'visible', timeout: 10000 });
  await page.click('[data-domain="downtime"]');
  await page.waitForTimeout(500);

  // DTUX-1: nav is now the phase ribbon. Click the DT Story tab.
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="story"]');
  await page.waitForSelector('#dt-story-nav-rail', { timeout: 8000 });
  await page.waitForTimeout(500);
}

async function openCharacter(page, charId) {
  await page.click(`.dt-story-pill[data-char-id="${charId}"]`);
  await page.waitForSelector('.dt-story-section', { timeout: 8000 });
  await page.waitForTimeout(300);
}

// ── DTQ-2: Merit actions population ──────────────────────────────────────────

test.describe('DTQ-2: DT Story merit sections from response fields', () => {

  test('character with sphere Allies actions shows Allies Actions section', async ({ page }) => {
    await setupDtStory(page, [SUB_BRANDY_ALLIES], [CHAR_BRANDY]);
    await openCharacter(page, 'char-brandy');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('Allies Actions');
  });

  test('Allies Actions section shows action description from sphere_N_description', async ({ page }) => {
    await setupDtStory(page, [SUB_BRANDY_ALLIES], [CHAR_BRANDY]);
    await openCharacter(page, 'char-brandy');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('wipe records');
  });

  test('multiple sphere actions of same category each render a card', async ({ page }) => {
    await setupDtStory(page, [SUB_BRANDY_ALLIES], [CHAR_BRANDY]);
    await openCharacter(page, 'char-brandy');

    // Two Allies actions → two action cards in the Allies section
    const alliesSection = page.locator('.dt-story-section[data-section="allies_actions"]');
    await expect(alliesSection).toBeVisible({ timeout: 5000 });
    // Each action card should be a renderActionCard output — check for at least 2 story cards
    const cards = alliesSection.locator('.dt-story-action-card, .dt-story-merit-action-card, [data-action-idx]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('character with contact actions shows Contact Requests section', async ({ page }) => {
    await setupDtStory(page, [SUB_CONRAD_CONTACTS], [CHAR_CONRAD]);
    await openCharacter(page, 'char-conrad');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('Contact Requests');
  });

  test('Contact Requests section shows contact_N_request text', async ({ page }) => {
    await setupDtStory(page, [SUB_CONRAD_CONTACTS], [CHAR_CONRAD]);
    await openCharacter(page, 'char-conrad');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('Charles Mercer Willows');
  });

  test('character with retainer action shows Retainer Actions section', async ({ page }) => {
    await setupDtStory(page, [SUB_ANICHKA_RETAINER], [CHAR_ANICHKA]);
    await openCharacter(page, 'char-anichka');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('Retainer Actions');
  });

  test('Retainer Actions section shows retainer_N_task text', async ({ page }) => {
    await setupDtStory(page, [SUB_ANICHKA_RETAINER], [CHAR_ANICHKA]);
    await openCharacter(page, 'char-anichka');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('Orthodox Easter');
  });

  test('DT2 format: sphere actions from _raw also populate Allies section', async ({ page }) => {
    await setupDtStory(page, [SUB_DT2_FORMAT], [CHAR_BRANDY]);
    await openCharacter(page, 'char-brandy');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).toContainText('Allies Actions');
  });

  test('pre-populated merit_actions is not overwritten by response fields', async ({ page }) => {
    await setupDtStory(page, [SUB_PREPOPULATED], [CHAR_BRANDY]);
    await openCharacter(page, 'char-brandy');

    const charView = page.locator('#dt-story-char-view');
    // Should show 'Pre-set' (from merit_actions) not 'This should not appear'
    await expect(charView).toContainText('Allies Actions');
    await expect(charView).not.toContainText('This should not appear');
  });

  test('character with no merit actions shows no Allies or Contact sections', async ({ page }) => {
    const subNoMerits = {
      _id: 'sub-no-merits',
      cycle_id: 'cycle-dtq2',
      character_id: 'char-brandy',
      character_name: 'Brandy LaRoux',
      player_name: 'Test Player',
      status: 'submitted',
      responses: { feeding_method: 'seduction' },
      projects_resolved: [],
      merit_actions_resolved: [],
      st_narrative: {},
    };
    await setupDtStory(page, [subNoMerits], [CHAR_BRANDY]);
    await openCharacter(page, 'char-brandy');

    const charView = page.locator('#dt-story-char-view');
    await expect(charView).not.toContainText('Allies Actions');
    await expect(charView).not.toContainText('Contact Requests');
    await expect(charView).not.toContainText('Retainer Actions');
  });

});
