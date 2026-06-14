/**
 * feat.727 — DT form: Connected Characters typeahead multi-select
 *
 * Acceptance criteria:
 *   AC1: Focusing the input shows a filtered character dropdown
 *   AC2: Clicking a dropdown item adds a chip; input clears
 *   AC3: A second character can be added (both chips present)
 *   AC4: Already-chipped characters are absent from the dropdown (dedup)
 *   AC5: Clicking chip × removes the chip
 *   AC6: Legacy single-char submission renders the chip correctly (backwards compat)
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt727', status: 'active', label: 'Test Cycle DT727',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-06-14T00:00:00.000Z',
};

function buildChar() {
  return {
    _id: 'char-001', name: 'Test Subject', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
  };
}

const NAMES = [
  { _id: 'char-001', name: 'Test Subject', moniker: null, player: 'Test Player' },
  { _id: 'char-002', name: 'Ally One',     moniker: null, player: 'P2' },
  { _id: 'char-003', name: 'Ally Two',     moniker: null, player: 'P3' },
];

function priorSub(responses) {
  return { _id: 'sub-dt727', cycle_id: ACTIVE_CYCLE._id, character_id: 'char-001', status: 'draft', responses };
}

async function setupSuite(page, char, sub) {
  await page.addInitScript((u) => {
    localStorage.removeItem('tm-mode');
    localStorage.setItem('tm_auth_token', 'fake-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 36000000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, PLAYER_USER);

  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER_USER) }));
  await page.route(/\/api\/characters\/char-001$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(char) }));
  await page.route(/\/api\/characters$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([char]) }));
  await page.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NAMES) }));
  await page.route('**/api/downtime_cycles', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
  await page.route(/\/api\/downtime_submissions($|\?)/, r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sub ? [sub] : []) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-dt727', status: 'draft', responses: {} }) });
  });
  await page.route(/\/api\/downtime_submissions\/sub-dt727/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-dt727', status: 'draft' }) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1208;z-index:99999;overflow:auto;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  const projTitle = page.locator('#dt-sandbox .qf-section[data-section-key="projects"] .qf-section-title');
  await projTitle.waitFor({ state: 'attached', timeout: 10000 });
  await projTitle.click();
  await page.waitForSelector('#dt-sandbox #dt-project_1_action', { state: 'visible', timeout: 10000 });
}

const connZone = (page) => page.locator('#dt-sandbox .dt-connected-zone').first();
const connInput = (page) => page.locator('#dt-sandbox .dt-conn-input[data-conn-slot="1"]');
const ddItems   = (page) => page.locator('#dt-sandbox .dt-conn-dd-item');

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('feat.727 — Connected Characters typeahead multi-select', () => {

  test('AC1: focusing the input shows a character dropdown', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);

    await connInput(page).focus();
    await expect(ddItems(page).first()).toBeVisible({ timeout: 3000 });
    // Self is excluded; only Ally One and Ally Two in dropdown
    const texts = await ddItems(page).allTextContents();
    expect(texts).not.toContain('Test Subject');
    expect(texts).toContain('Ally One');
    expect(texts).toContain('Ally Two');
  });

  test('AC2: clicking a dropdown item adds a chip and clears the input', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);

    await connInput(page).fill('Ally');
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    await ddItems(page).filter({ hasText: 'Ally One' }).click();

    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);
    await expect(connZone(page).locator('.dt-conn-chip')).toContainText('Ally One');
    await expect(connInput(page)).toHaveValue('');
    await expect(page.locator('#dt-sandbox .dt-conn-dropdown').first()).toBeHidden();
  });

  test('AC3: a second character can be added (both chips present)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);

    // Add first
    await connInput(page).fill('Ally One');
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    await ddItems(page).filter({ hasText: 'Ally One' }).click();
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);

    // Add second
    await connInput(page).fill('Ally Two');
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    await ddItems(page).filter({ hasText: 'Ally Two' }).click();
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(2);
    await expect(connZone(page)).toContainText('Ally One');
    await expect(connZone(page)).toContainText('Ally Two');
  });

  test('AC4: already-chipped character is absent from dropdown (dedup)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);

    // Add Ally One
    await connInput(page).fill('Ally One');
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    await ddItems(page).filter({ hasText: 'Ally One' }).click();

    // Re-open dropdown — Ally One must not appear
    await connInput(page).focus();
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    const texts = await ddItems(page).allTextContents();
    expect(texts).not.toContain('Ally One');
    expect(texts).toContain('Ally Two');
  });

  test('AC5: clicking chip × removes the chip', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate', project_1_connected_chars: '["char-002"]' }));
    await openForm(page, char);

    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);
    await connZone(page).locator('.dt-conn-remove[data-conn-id="char-002"]').click();
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(0);
  });

  test('AC6: legacy single-char submission renders chip correctly', async ({ page }) => {
    const char = buildChar();
    // Legacy shape: JSON string of one ID
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate', project_1_connected_chars: '["char-003"]' }));
    await openForm(page, char);

    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);
    await expect(connZone(page).locator('.dt-conn-chip')).toContainText('Ally Two');
  });

});
