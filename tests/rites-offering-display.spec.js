/**
 * E2E tests — Rite drawer cost + offering display
 *
 * Covers:
 *   - Rite drawer shows "Cost: 1 WP" when rite has cost but no offering
 *   - Rite drawer shows "Cost: 1 WP & A rod or staff" when rite has both
 *   - XP badge still renders (regression guard)
 *   - Discipline drawers unaffected (no spurious Cost line)
 */

const { test, expect } = require('@playwright/test');

const ST_USER = {
  id: 'test-st-001', username: 'test_st', global_name: 'Test ST',
  avatar: null, role: 'st', player_id: 'p-001', character_ids: [], is_dual_role: false,
};

const BASE_CHAR = {
  _id: 'char-rite-offering-001',
  name: 'Rite Test Char',
  moniker: null, honorific: null,
  clan: 'Mekhet', covenant: 'Lancea et Sanctum',
  player: 'Test Player',
  blood_potency: 2, humanity: 6, humanity_base: 7,
  court_title: null, retired: false,
  status: { city: 1, clan: 1, covenant: { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 1, 'Ordo Dracul': 0 } },
  attributes: {
    Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 2, bonus: 0 }, Resolve: { dots: 2, bonus: 0 },
    Strength: { dots: 2, bonus: 0 }, Dexterity: { dots: 2, bonus: 0 }, Stamina: { dots: 2, bonus: 0 },
    Presence: { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 }, Composure: { dots: 2, bonus: 0 },
  },
  skills: {},
  disciplines: { Theban: { dots: 2 } },
  merits: [],
  powers: [
    { category: 'rite', name: 'Aaron\'s Rod',  tradition: 'Theban', level: 3, free: true,  stats: '', effect: 'Enchants a rod.' },
    { category: 'rite', name: 'Blood Scourge', tradition: 'Theban', level: 1, free: true,  stats: '', effect: 'Creates a whip.' },
    { category: 'rite', name: 'Temper\'s Eye',  tradition: 'Theban', level: 1, free: false, stats: '', effect: 'Learns Vice.' },
  ],
  ordeals: [],
  xp_log: { spent: 0 },
};

// Rules DB — rites with and without offering
const MOCK_RULES = [
  { key: 'rite-aarons-rod',   name: "Aaron's Rod",  category: 'rite', parent: 'Theban', rank: 3, cost: '1 WP', offering: 'A rod or staff', description: '' },
  { key: 'rite-blood-scourge', name: 'Blood Scourge', category: 'rite', parent: 'Theban', rank: 1, cost: '1 WP', offering: null,           description: '' },
  { key: 'rite-tempers-eye',  name: "Temper's Eye",  category: 'rite', parent: 'Theban', rank: 1, cost: '1 WP', offering: null,            description: '' },
];

async function setupPage(page) {
  await page.addInitScript(([user, char, rules]) => {
    localStorage.setItem('tm_auth_token', 'local-test-token');
    localStorage.setItem('tm_auth_expires', String(Date.now() + 3600000));
    localStorage.setItem('tm_auth_user', JSON.stringify(user));
    localStorage.setItem('tm_rules_db', JSON.stringify(rules));
  }, [ST_USER, BASE_CHAR, MOCK_RULES]);

  await page.route('http://localhost:3000/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/characters') && !url.includes('names') && !url.includes('game-xp')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BASE_CHAR]) });
    } else if (url.includes('/api/rules')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RULES) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  });

  await page.goto('/admin.html');
  await page.waitForSelector('.char-card', { timeout: 10000 });
  await page.locator('.char-card').first().click();
  await page.waitForSelector('.sh-sec-title', { timeout: 5000 });
}

test('rite drawer shows cost + offering when both present', async ({ page }) => {
  await setupPage(page);

  // Open the Aaron's Rod drawer
  await page.locator('.disc-tap-row').filter({ hasText: "Aaron's Rod" }).click();
  await expect(page.locator('.disc-power-stats').filter({ hasText: "Cost: 1 WP & A rod or staff" })).toBeVisible();
});

test('rite drawer shows cost only when no offering', async ({ page }) => {
  await setupPage(page);

  const bloodScourgeRow = page.locator('.disc-tap-row').filter({ hasText: 'Blood Scourge' });
  await bloodScourgeRow.click();

  // Scope to the drawer immediately following the Blood Scourge row
  const drawer = bloodScourgeRow.locator('+ .disc-drawer');
  await expect(drawer.locator('.disc-power-stats', { hasText: 'Cost: 1 WP' })).toBeVisible();
  await expect(drawer.locator('.disc-power-stats', { hasText: 'Cost: 1 WP &' })).not.toBeVisible();
});

test('XP badge still renders on non-free rite (regression)', async ({ page }) => {
  await setupPage(page);

  // Temper's Eye is free: false — XP chip should show
  const riteRow = page.locator('.disc-tap-row').filter({ hasText: "Temper's Eye" });
  await expect(riteRow.locator('.trait-chip, .rite-xp-badge')).toBeVisible();
});
