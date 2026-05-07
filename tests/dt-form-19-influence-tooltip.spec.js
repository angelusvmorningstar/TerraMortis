/**
 * E2E tests for dt-form.19 — City Influence breakdown tooltip (GH #77)
 *
 * Verifies that:
 * 1. The "N Influence remaining" label has a title attribute containing the breakdown.
 * 2. The breakdown lists non-zero influence sources from influenceBreakdown(c).
 * 3. A character with no influence sources gets "No influence sources" tooltip.
 * 4. The label has the dt-influence-budget-label class (CSS hook for dotted underline).
 */

const { test, expect } = require('@playwright/test');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_USER = {
  id: '111222333', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-dt19',
  character_ids: ['char-dt19-infl', 'char-dt19-none'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt19', status: 'active', label: 'Test Cycle DT19',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildInfluenceChar(overrides = {}) {
  return {
    _id: 'char-dt19-infl', name: 'Influence Tester', moniker: null, honorific: null,
    clan: 'Ventrue', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 2, clan: 1, covenant: { Invictus: 2 } },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 3, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false } },
    disciplines: { Dominate: { dots: 1 } },
    merits: [
      { name: 'Allies', category: 'influence', area: 'City Hall', dots: 2, bonus: 0 },
    ],
    ordeals: [], powers: [],
    ...overrides,
  };
}

function buildNoInfluenceChar() {
  return {
    _id: 'char-dt19-none', name: 'No Influence', moniker: null, honorific: null,
    clan: 'Nosferatu', covenant: 'Unaligned', player: 'Test Player',
    blood_potency: 1, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 0, clan: 0, covenant: {} },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 1, bonus: 0 }, Manipulation: { dots: 1, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {},
    disciplines: {},
    merits: [], ordeals: [], powers: [],
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupSuite(page, char) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/auth/me', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) })
  );
  await page.route(new RegExp(`/api/characters/${char._id}$`), r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) })
  );
  await page.route(/\/api\/characters$/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) })
  );
  await page.route('**/api/characters/names', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: char._id, name: char.name }]) })
  );
  await page.route('**/api/downtime_cycles', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) })
  );
  await page.route(/\/api\/downtime_submissions/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openDowntimeForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox #dt-btn-submit', { timeout: 10000 });
}

async function switchToAdvanced(page) {
  await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  await page.waitForSelector('#dt-sandbox #dt-btn-submit-final', { timeout: 5000 });
}

async function expandCitySection(page) {
  await page.locator('#dt-sandbox .qf-section[data-section-key="territory"] .qf-section-title').click();
  await page.waitForSelector('#dt-sandbox #dt-influence-budget', { state: 'visible', timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('dt-form.19: Influence breakdown tooltip', () => {

  test('influence label has dt-influence-budget-label class and non-empty title', async ({ page }) => {
    const char = buildInfluenceChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandCitySection(page);

    const label = page.locator('#dt-sandbox .dt-influence-budget-label');
    await expect(label).toBeVisible({ timeout: 3000 });

    const title = await label.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('tooltip title contains influence source breakdown for character with status and merits', async ({ page }) => {
    const char = buildInfluenceChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandCitySection(page);

    const label = page.locator('#dt-sandbox .dt-influence-budget-label');
    const title = await label.getAttribute('title');

    // influenceBreakdown uses 'Clan Status' for st.clan (not city status)
    expect(title).toContain('Clan Status');
    // character has Invictus covenant status 2 — should appear
    expect(title).toContain('Covenant Status');
  });

  test('character with no influence sources gets "No influence sources" tooltip', async ({ page }) => {
    const char = buildNoInfluenceChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandCitySection(page);

    const label = page.locator('#dt-sandbox .dt-influence-budget-label');
    await expect(label).toBeVisible({ timeout: 3000 });

    const title = await label.getAttribute('title');
    expect(title).toBe('No influence sources');
  });

  test('influence budget label text shows the budget number', async ({ page }) => {
    const char = buildInfluenceChar();
    await setupSuite(page, char);
    await openDowntimeForm(page, char);
    await switchToAdvanced(page);
    await expandCitySection(page);

    const label = page.locator('#dt-sandbox .dt-influence-budget-label');
    const text = await label.textContent();
    // Text should be something like "7 Influence remaining"
    expect(text).toMatch(/\d+ Influence remaining/);
  });

});
