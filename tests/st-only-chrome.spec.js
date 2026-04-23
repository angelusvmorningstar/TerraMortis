/**
 * E2E — game.11 ST-only chrome on phone
 *
 * Covers:
 *   - Dice tab NOT in bottom nav for players
 *   - Dice tab IS in bottom nav for STs
 *   - #hdr-nav hidden for players
 *   - #hdr-nav visible for STs
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: 'test-st-001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-st-001', character_ids: [], is_dual_role: false,
};
const PLAYER_USER = {
  id: 'test-player-001', username: 'test_player', global_name: 'Test Player',
  avatar: null, role: 'player', player_id: 'p-player-001', character_ids: ['char-1'], is_dual_role: false,
};
const MINIMAL_CHAR = {
  _id: 'char-1', name: 'Test Char', retired: false,
  clan: 'Mekhet', covenant: 'Invictus', blood_potency: 2, humanity: 7, humanity_base: 7,
  status: { city: 0, clan: 0, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 } },
  attributes: {
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Intelligence: { dots: 2, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
};

async function setup(page, user) {
  await page.addInitScript((u) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(u));
  }, user);
  await page.route('http://localhost:3000/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/characters') && !url.includes('names')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MINIMAL_CHAR]) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  });
  await page.setViewportSize({ width: 400, height: 800 }); // phablet
  await page.goto('/');
  await page.waitForSelector('#bnav', { timeout: 10000 });
}

test('ST sees Dice tab in bottom nav', async ({ page }) => {
  await setup(page, ST_USER);
  await expect(page.locator('#n-dice')).toBeVisible();
});

test('Player does NOT see Dice tab in bottom nav', async ({ page }) => {
  await setup(page, PLAYER_USER);
  await expect(page.locator('#n-dice')).toHaveCount(0);
});

test('ST sees header nav (#hdr-nav)', async ({ page }) => {
  await setup(page, ST_USER);
  // Header nav is display:flex for STs
  const display = await page.locator('#hdr-nav').evaluate(el => getComputedStyle(el).display);
  expect(display).not.toBe('none');
});

test('Player does NOT see header nav (#hdr-nav)', async ({ page }) => {
  await setup(page, PLAYER_USER);
  const display = await page.locator('#hdr-nav').evaluate(el => getComputedStyle(el).display);
  expect(display).toBe('none');
});
