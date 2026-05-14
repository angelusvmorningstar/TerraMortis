/**
 * Issue #285 — DT Processing Step 3: pool builder + territory pills pre-populate
 * from player's form submission data.
 *
 * AC coverage:
 *   AC1 — no pool_validated: pool builder pre-selects from player's feeding method
 *   AC2 — pool_validated set: builder restores from saved value (no regression)
 *   AC3 — feeding territories pre-highlight matching pills when no ST override
 *   AC4 — pool total updates correctly after pre-population
 *   AC5 — 'other' method: custom attr/skill/disc used when no pool_validated
 */

const { test, expect } = require('@playwright/test');

// ── Shared mock data ──────────────────────────────────────────────────────────

const ST_USER = {
  id: '123456789', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

// Character with Presence 3 (best for seduction), Persuasion 2, Dominate 2
const CHAR_285 = {
  _id: 'char-285', name: 'Feed Test', moniker: null, honorific: null,
  clan: 'Daeva', covenant: 'Invictus', player: 'Test Player',
  blood_potency: 1, humanity: 6, humanity_base: 7, court_title: null,
  retired: false,
  status: { city: 1, clan: 1, covenant: { Carthian: 0, Crone: 0, Invictus: 1, Lancea: 0, OD: 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {
    Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false },
    Weaponry:   { dots: 1, bonus: 0, specs: [], nine_again: false },
  },
  disciplines: { Dominate: { dots: 2 } },
  merits: [], powers: [], ordeals: [],
};

// seduction method → best attr: Presence 3, best skill: Persuasion 2, best disc: Dominate 2
// Expected pre-population: preAttr='Presence', preSkill='Persuasion', preDisc='Dominate'

// Cycle with status 'active' so DTUX-1 routes to DT Processing panel
const TEST_CYCLE = {
  _id: 'cycle-285', cycle_number: 3, status: 'active',
  confirmed_ambience: {}, narrative_notes: '',
};

// AC1/AC3/AC4: no pool_validated, no ST territory override
const SUBMISSION_NO_POOL = {
  _id: 'sub-285-npool',
  cycle_id: 'cycle-285',
  character_name: 'Feed Test',
  character_id: 'char-285',
  player_name: 'Test Player',
  submitted_at: '2026-05-01T00:00:00Z',
  _raw: {
    projects: [],
    feeding: { method: 'seduction', pool: { expression: 'Presence 3 + Persuasion 2 = 5' } },
    sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] },
  },
  responses: {
    _feed_method: 'seduction',
    feeding_territories: JSON.stringify({ harbour: 'resident', dockyards: 'poaching' }),
  },
  projects_resolved: [],
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5',
    pool_validated: '',
    pool_status: 'pending',
    nine_again: false, eight_again: false,
    pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  merit_actions_resolved: [],
  st_review: { territory_overrides: {} },
};

// AC2: pool_validated already set by ST — should NOT be overwritten
const SUBMISSION_WITH_POOL = {
  ...SUBMISSION_NO_POOL,
  _id: 'sub-285-wpool',
  responses: { _feed_method: 'seduction' },
  feeding_review: {
    pool_player: 'Presence 3 + Persuasion 2 = 5',
    pool_validated: 'Wits 2 + Stealth 3 = 5',
    pool_status: 'validated',
    nine_again: false, eight_again: false,
    pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
  st_review: { territory_overrides: {} },
};

// AC3 regression: ST has territory override — pills should use override not player data
const SUBMISSION_WITH_TERR_OVERRIDE = {
  ...SUBMISSION_NO_POOL,
  _id: 'sub-285-terrover',
  st_review: {
    territory_overrides: { feeding: ['academy'] },
  },
};

// AC5: 'other' method — custom attr/skill/disc used
const SUBMISSION_OTHER_METHOD = {
  ...SUBMISSION_NO_POOL,
  _id: 'sub-285-other',
  responses: {
    _feed_method: 'other',
    _feed_custom_attr:  'Resolve',
    _feed_custom_skill: 'Occult',
    _feed_custom_disc:  '',
    feeding_territories: JSON.stringify({}),
  },
  feeding_review: {
    pool_player: 'Resolve + Occult',
    pool_validated: '',
    pool_status: 'pending',
    nine_again: false, eight_again: false,
    pool_mod_equipment: 0,
    notes_thread: [], player_feedback: '',
  },
};

// ── Setup helpers ──────────────────────────────────────────────────────────────

async function setup(page, submissions, chars = [CHAR_285]) {
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
  // Navigate to DT Processing (projects tab) via DTUX-1 ribbon
  await page.click('#dt-phase-ribbon .pr-tab[data-phase="projects"]');
  await page.waitForTimeout(300);
}

async function openFeedingAction(page) {
  await page.waitForSelector('.proc-phase-section', { state: 'visible', timeout: 8000 });
  const feedHeader = page.locator('.proc-phase-header').filter({ hasText: 'Feeding' }).first();
  const toggle = feedHeader.locator('.proc-phase-toggle');
  const toggleText = await toggle.textContent().catch(() => '');
  if (toggleText.includes('Show')) await feedHeader.click();
  await page.waitForTimeout(200);
  const feedPhase = page.locator('.proc-phase-section').filter({ hasText: 'Feeding' }).first();
  await feedPhase.locator('.proc-action-row').first().click();
  await page.waitForTimeout(400);
}

// ── AC1: Pool builder pre-populates from player method ─────────────────────────

test.describe('Issue #285 — Pool builder pre-population from player method', () => {

  test('AC1: Attribute dropdown pre-selects player method best attr (Presence)', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const attrSel = page.locator('.proc-pool-attr').first();
    await expect(attrSel).toBeVisible({ timeout: 5000 });
    await expect(attrSel).toHaveValue('Presence');
  });

  test('AC1: Skill dropdown pre-selects player method best skill (Persuasion)', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const skillSel = page.locator('.proc-pool-skill').first();
    await expect(skillSel).toHaveValue('Persuasion');
  });

  test('AC1: Discipline dropdown pre-selects player method best disc (Dominate)', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const discSel = page.locator('.proc-pool-disc').first();
    await expect(discSel).toHaveValue('Dominate');
  });

});

// ── AC2: Regression — pool_validated is preserved ────────────────────────────

test.describe('Issue #285 — pool_validated regression', () => {

  test('AC2: Attribute dropdown shows saved pool_validated value, not player method', async ({ page }) => {
    await setup(page, [SUBMISSION_WITH_POOL]);
    await openFeedingAction(page);
    const attrSel = page.locator('.proc-pool-attr').first();
    await expect(attrSel).toBeVisible({ timeout: 5000 });
    // pool_validated = 'Wits 2 + Stealth 3 = 5' → attr should be Wits (not Presence from player method)
    await expect(attrSel).toHaveValue('Wits');
  });

  test('AC2: Skill dropdown shows saved pool_validated value (Stealth, not Persuasion)', async ({ page }) => {
    await setup(page, [SUBMISSION_WITH_POOL]);
    await openFeedingAction(page);
    const skillSel = page.locator('.proc-pool-skill').first();
    await expect(skillSel).toHaveValue('Stealth');
  });

});

// ── AC3: Territory pills pre-select from player territories ─────────────────

test.describe('Issue #285 — Territory pill pre-selection', () => {

  test('AC3: Harbour pill is active when player submitted harbour (no ST override)', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const harbourPill = page.locator('.proc-terr-pill[data-terr-id="harbour"]').first();
    await expect(harbourPill).toBeVisible({ timeout: 5000 });
    await expect(harbourPill).toHaveClass(/active/);
  });

  test('AC3: Dockyards pill is active when player submitted dockyards (no ST override)', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const docksPill = page.locator('.proc-terr-pill[data-terr-id="dockyards"]').first();
    await expect(docksPill).toHaveClass(/active/);
  });

  test('AC3: Em-dash (clear) pill is NOT active when player has submitted territories', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const clearPill = page.locator('.proc-terr-pill[data-terr-id=""]').first();
    await expect(clearPill).not.toHaveClass(/active/);
  });

  test('AC3 regression: ST territory override takes precedence over player data', async ({ page }) => {
    await setup(page, [SUBMISSION_WITH_TERR_OVERRIDE]);
    await openFeedingAction(page);
    // ST override has only ['academy'] — harbour and dockyards should NOT be active
    const academyPill  = page.locator('.proc-terr-pill[data-terr-id="academy"]').first();
    const harbourPill  = page.locator('.proc-terr-pill[data-terr-id="harbour"]').first();
    await expect(academyPill).toHaveClass(/active/);
    await expect(harbourPill).not.toHaveClass(/active/);
  });

});

// ── AC4: Pool total is non-zero after pre-population ─────────────────────────

test.describe('Issue #285 — Pool total display after pre-population', () => {

  test('AC4: Pool total string does not show placeholder "— + — = 0" after pre-population', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const poolDetail = page.locator('.proc-action-detail').first();
    await expect(poolDetail).toBeVisible({ timeout: 5000 });
    // A valid pre-populated pool should show a real expression, not the blank placeholder
    await expect(poolDetail).not.toContainText('— + — = 0');
  });

  test('AC4: Pool total string contains the attr and skill names', async ({ page }) => {
    await setup(page, [SUBMISSION_NO_POOL]);
    await openFeedingAction(page);
    const poolDetail = page.locator('.proc-pool-total').first();
    await expect(poolDetail).toBeVisible({ timeout: 5000 });
    const text = await poolDetail.textContent();
    expect(text).toMatch(/Presence|Persuasion/);
  });

});

// ── AC5: 'other' method uses custom attr/skill ────────────────────────────────

test.describe('Issue #285 — Other method pre-population', () => {

  test('AC5: Attribute dropdown uses _feed_custom_attr for other method', async ({ page }) => {
    await setup(page, [SUBMISSION_OTHER_METHOD]);
    await openFeedingAction(page);
    const attrSel = page.locator('.proc-pool-attr').first();
    await expect(attrSel).toBeVisible({ timeout: 5000 });
    await expect(attrSel).toHaveValue('Resolve');
  });

  test('AC5: Skill dropdown uses _feed_custom_skill for other method', async ({ page }) => {
    await setup(page, [SUBMISSION_OTHER_METHOD]);
    await openFeedingAction(page);
    const skillSel = page.locator('.proc-pool-skill').first();
    await expect(skillSel).toHaveValue('Occult');
  });

});
