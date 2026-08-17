/**
 * Fix #609 (player side) — the DT form Vitae Projection Herd total must include the
 * Secret Society Junkie (SSJ) bonus, matching the ST (domMeritContrib).
 * effectiveDomainDots excluded it; #609 adds ssjHerdBonus(c) to the total (silently —
 * no "(SSJ)" label).
 *
 * Mounts the DT form in a sandbox (same pattern as dt-form-599-flock-herd.spec.js).
 */

const { test, expect } = require('@playwright/test');

const PLAYER_USER = {
  id: '987654321', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-002',
  character_ids: ['char-001'], is_dual_role: false,
};

const ACTIVE_CYCLE = {
  _id: 'cycle-dt609', status: 'active', label: 'Test Cycle DT609',
  feeding_rights_confirmed: true, is_chapter_finale: false,
  created_at: '2026-05-07T00:00:00.000Z',
};

function buildChar(merits) {
  return {
    _id: 'char-001', name: 'SSJ Haver', moniker: null, honorific: null,
    clan: 'Mekhet', covenant: 'Invictus', player: 'Test Player',
    blood_potency: 2, humanity: 7, humanity_base: 7, court_title: null, retired: false,
    status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 1, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
      Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
      Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
    },
    skills: { Investigation: { dots: 3, bonus: 0, specs: [], nine_again: false } },
    disciplines: {}, merits, powers: [], ordeals: [],
  };
}

const HERD  = { category: 'domain', name: 'Herd', rating: 2, cp: 2, dots: 2 };
const SSJ   = { category: 'general', name: 'Secret Society Junkie', rating: 1, cp: 1, dots: 1 };
const MCI3  = { category: 'standing', name: 'Mystery Cult Initiation', rating: 3, cp: 3, dots: 3 };

const PRIOR = { _id: 'sub-dt609', chapter_id: ACTIVE_CYCLE._id, character_id: 'char-001', status: 'draft', responses: { _feed_method: 'predator', feed_violence: 'kiss' } };

async function setupSuite(page, char) {
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
  await page.route('**/api/characters/names', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: char._id, name: char.name }]) }));
  await page.route('**/api/chapters', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ACTIVE_CYCLE]) }));
  await page.route(/\/api\/downtime_submissions($|\?)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PRIOR]) }));

  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
}

async function openForm(page, char) {
  await page.evaluate(async (c) => {
    const sandbox = document.createElement('div');
    sandbox.id = 'dt-sandbox';
    sandbox.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#1a1208;z-index:99999;';
    document.body.appendChild(sandbox);
    const mod = await import('/js/tabs/downtime-form.js');
    await mod.renderDowntimeTab(sandbox, c, []);
  }, char);
  await page.waitForSelector('#dt-sandbox [data-dt-mode="advanced"]', { timeout: 10000 });
  await page.locator('#dt-sandbox [data-dt-mode="advanced"]').click();
  await page.waitForSelector('#dt-sandbox .dt-vitae-row', { state: 'attached', timeout: 10000 });
}

const herdRow = (page) => page.locator('#dt-sandbox .dt-vitae-row', { hasText: 'Herd' }).first();

test.describe('dt-form #609: SSJ bonus in the player Herd total', () => {

  test('SSJ + MCI character: Herd total includes the SSJ bonus', async ({ page }) => {
    // Herd 2 + SSJ(MCI 3) = 5.
    const char = buildChar([HERD, SSJ, MCI3]);
    await setupSuite(page, char);
    await openForm(page, char);
    await expect(herdRow(page)).toContainText('+5');
    await expect(herdRow(page)).not.toContainText('(SSJ)');  // silent inclusion
  });

  test('character without SSJ is unchanged', async ({ page }) => {
    // Herd 2, no SSJ → 2.
    const char = buildChar([HERD]);
    await setupSuite(page, char);
    await openForm(page, char);
    await expect(herdRow(page)).toContainText('+2');
  });

});
