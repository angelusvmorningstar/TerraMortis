/**
 * Feature #589 (player capture half) — Connected Characters selector on a Project
 * action persists to responses.project_N_connected_chars (JSON array of _ids).
 *
 * Mounts the DT form in a sandbox overlay (same pattern as
 * dt-form-35-feed-violence-default.spec.js). Covers: pre-seeded value renders a
 * chip (round-trip), add via typeahead, remove via chip ✕.
 *
 * Updated for issue #727: .dt-conn-add select replaced by .dt-conn-typeahead.
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt589', status: 'active', label: 'Test Cycle DT589',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
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
    skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: { Auspex: { dots: 2 } }, merits: [], powers: [], ordeals: [],
  };
}

// /api/characters/names — self + two others so the connected dropdown has options.
const NAMES = [
  { _id: 'char-001', name: 'Test Subject', moniker: null, player: 'Test Player' },
  { _id: 'char-002', name: 'Ally One', moniker: null, player: 'P2' },
  { _id: 'char-003', name: 'Ally Two', moniker: null, player: 'P3' },
];

function priorSub(responses) {
  return { _id: 'sub-dt589', chapter_id: ACTIVE_CYCLE._id, character_id: 'char-001', status: 'draft', responses };
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
  await page.route('**/api/chapters', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
  await page.route(/\/api\/downtime_submissions($|\?)/, r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sub ? [sub] : []) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-dt589', chapter_id: ACTIVE_CYCLE._id, character_id: 'char-001', status: 'draft', responses: {} }) });
  });
  await page.route(/\/api\/downtime_submissions\/sub-dt589/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _id: 'sub-dt589', status: 'draft' }) }));

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
  // The "Projects: Personal Actions" section starts collapsed — expand it.
  const projTitle = page.locator('#dt-sandbox .qf-section[data-section-key="projects"] .qf-section-title');
  await projTitle.waitFor({ state: 'attached', timeout: 10000 });
  await projTitle.click();
  await page.waitForSelector('#dt-sandbox #dt-project_1_action', { state: 'visible', timeout: 10000 });
}

const connZone = (page) => page.locator('#dt-sandbox .dt-connected-zone').first();

test.describe('dt-form #589: connected characters capture on project actions', () => {

  test('connected zone renders for an investigate project action', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);
    await expect(connZone(page)).toBeVisible({ timeout: 5000 });
    await expect(connZone(page).locator('.dt-conn-input')).toHaveCount(1);
  });

  test('pre-seeded connected character renders as a chip (round-trip)', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate', project_1_connected_chars: '["char-002"]' }));
    await openForm(page, char);
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);
    await expect(connZone(page).locator('.dt-conn-chip')).toContainText('Ally One');
  });

  test('adding via the typeahead creates a chip', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(0);
    const input = page.locator('#dt-sandbox .dt-conn-input[data-conn-slot="1"]');
    await input.fill('Ally Two');
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    await page.locator('#dt-sandbox .dt-conn-dd-item').filter({ hasText: 'Ally Two' }).click();
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);
    await expect(connZone(page).locator('.dt-conn-chip')).toContainText('Ally Two');
  });

  test('removing a chip clears it', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate', project_1_connected_chars: '["char-002"]' }));
    await openForm(page, char);
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(1);
    await page.locator('#dt-sandbox .dt-conn-remove[data-conn-id="char-002"]').click();
    await page.waitForTimeout(400);
    await expect(connZone(page).locator('.dt-conn-chip')).toHaveCount(0);
  });

  // QA top-up: the acting character must NOT be a connect option (no self-connect).
  test('the acting character is not an option in the typeahead dropdown', async ({ page }) => {
    const char = buildChar();
    await setupSuite(page, char, priorSub({ project_1_action: 'investigate' }));
    await openForm(page, char);
    const input = page.locator('#dt-sandbox .dt-conn-input[data-conn-slot="1"]');
    await input.focus();
    await page.waitForSelector('#dt-sandbox .dt-conn-dd-item', { timeout: 3000 });
    const items = await page.locator('#dt-sandbox .dt-conn-dd-item').allTextContents();
    expect(items).not.toContain('Test Subject');   // self excluded
    expect(items).toContain('Ally One');            // others present
  });

});
